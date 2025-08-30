import {
	type Agent,
	type AuthenticateRequest,
	type CancelNotification,
	type Client,
	type ClientCapabilities,
	type InitializeRequest,
	type InitializeResponse,
	type NewSessionRequest,
	type NewSessionResponse,
	type PromptRequest,
	type PromptResponse,
	type ReadTextFileRequest,
	type ReadTextFileResponse,
	RequestError,
	type WriteTextFileRequest,
	type WriteTextFileResponse,
} from '@zed-industries/agent-client-protocol';
import { CacheManager } from '../managers/cache-manager';
import { SessionsManager } from '../managers/sessions-manager';
import { ToolsManager } from '../managers/tools-manager';
import { AcpToClaudeTransformer } from '../transformers/acp-to-claude-transformer';
import { ClaudeToAcpTransformer } from '../transformers/claude-to-acp-transformer';
import { Logger } from '../utils/logger';

/**
 * ACP Agent implementation that bridges Claude SDK with Agent Client Protocol.
 * Coordinates between sessions manager, cache manager, and tools manager.
 */
export class AcpAgent implements Agent {
	/** ACP client for communicating with the host application */
	client: Client;
	clientCapabilities?: ClientCapabilities;
	/** Sessions manager for session lifecycle management */
	protected sessionsManager: SessionsManager;
	/** Cache manager for tool use and file content caching */
	protected cacheManager: CacheManager;
	/** Tools manager for tool metadata and UI integration */
	protected toolsManager: ToolsManager;
	/** Message transformers for bidirectional ACP ↔ Claude SDK conversion */
	protected acpToClaudeTransformer: AcpToClaudeTransformer;
	protected claudeToAcpTransformer: ClaudeToAcpTransformer;
	protected logger: Logger;

	constructor(client: Client) {
		this.client = client;
		this.sessionsManager = new SessionsManager();
		this.cacheManager = new CacheManager();
		this.toolsManager = new ToolsManager();
		this.acpToClaudeTransformer = new AcpToClaudeTransformer();
		this.claudeToAcpTransformer = new ClaudeToAcpTransformer();
		this.logger = new Logger({ component: 'ACP Agent' });
	}

	/**
	 * Get sessions manager (for external access if needed)
	 */
	getSessionsManager(): SessionsManager {
		return this.sessionsManager;
	}

	/**
	 * Initialize the ACP agent with client capabilities.
	 * This is the first method called in the ACP handshake.
	 */
	async initialize(request: InitializeRequest): Promise<InitializeResponse> {
		// Store client capabilities to determine available tools
		this.clientCapabilities = request.clientCapabilities;

		this.logger.info(`Initialized with protocol version ${request.protocolVersion}`);
		this.logger.debug(`Client capabilities: ${JSON.stringify(request.clientCapabilities)}`);

		// Return our agent capabilities and authentication methods
		return {
			protocolVersion: 1,
			// Declare what our agent can handle
			agentCapabilities: {
				promptCapabilities: { image: true, embeddedContext: true },
			},
			// Available authentication methods for Claude access
			authMethods: [
				{
					description: 'Run `claude /login` in the terminal',
					name: 'Login with Claude Code CLI',
					id: 'claude-login',
				},
				{
					description: 'Anthropic API KEY',
					name: 'Use Anthropic API key',
					id: 'anthropic-api-key',
				},
			],
		};
	}

	/**
	 * Create a new Claude SDK session with MCP server integration.
	 * Delegates to sessions manager for session creation.
	 */
	async authenticate(_params: AuthenticateRequest): Promise<void> {
		throw new Error('Method not implemented.');
	}

	async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
		try {
			this.logger.debug(`Creating new session with params: ${JSON.stringify(params)}`);

			return await this.sessionsManager.createSession(params, this.clientCapabilities, this);
		} catch (error) {
			this.logger.error(`Session creation failed: ${error instanceof Error ? error.message : String(error)}`);
			this.logger.error(`Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);

			throw error;
		}
	}

	/**
	 * Process a prompt request from the ACP client.
	 * Sends the prompt to Claude and streams back the response.
	 */
	async prompt(params: PromptRequest): Promise<PromptResponse> {
		const session = this.sessionsManager.getSession(params.sessionId);

		if (!session) {
			this.logger.error(`Session not found: ${params.sessionId}`);
			throw new Error('Session not found');
		}

		this.logger.debug(`Processing prompt for session: ${params.sessionId}`);

		// Interrupt any ongoing session activity
		session.abortController?.abort();
		session.abortController = new AbortController();

		// Convert ACP prompt to Claude SDK format and send to Claude
		const userMessage = this.acpToClaudeTransformer.transform(params);
		session.input.push(userMessage);

		// Stream Claude's response back to ACP client
		while (true) {
			const { value: message, done } = await session.query.next();

			if (done || !message) {
				if (session.abortController?.signal.aborted) {
					return { stopReason: 'cancelled' };
				}

				break;
			}

			this.logger.debug(`Processing message type: ${message.type}`);

			switch (message.type) {
				case 'system':
					// System messages are internal, no action needed
					this.logger.debug('System message received - no action needed');
					break;

				case 'result': {
					// Final result from Claude - conversation complete
					if (session.abortController?.signal.aborted) {
						return { stopReason: 'cancelled' };
					}

					switch (message.subtype) {
						case 'success': {
							// Check for authentication requirement
							if (message.result.includes('Please run /login')) {
								throw RequestError.authRequired();
							}

							return { stopReason: 'end_turn' };
						}

						case 'error_during_execution':
							return { stopReason: 'refusal' };

						case 'error_max_turns':
							return { stopReason: 'max_turn_requests' };

						default:
							return { stopReason: 'refusal' };
					}
				}

				case 'user':
				case 'assistant': {
					if (session.abortController?.signal.aborted) {
						return { stopReason: 'cancelled' };
					}

					// Check for synthetic authentication error messages
					if (
						message.message.model === '<synthetic>' &&
						message.message.content?.[0]?.text?.includes('Please run /login')
					) {
						throw RequestError.authRequired();
					}

					// Check for "Prompt is too long" error and handle context compacting
					if (message.message.content?.[0]?.text?.includes('Prompt is too long')) {
						this.logger.info(`Prompt too long detected for session ${params.sessionId}, attempting context compacting`);

						// TODO: add compacting handling
					}

					// Convert Claude message to ACP notifications and send to client
					for (const notification of this.claudeToAcpTransformer.transform({
						message,
						sessionId: params.sessionId,
						toolsManager: this.toolsManager,
						cacheManager: this.cacheManager,
					})) {
						await this.client.sessionUpdate(notification);
					}

					break;
				}

				default:
					throw new Error(`Unreachable code reached with value: ${JSON.stringify(message)}`);
			}
		}

		throw new Error('Session did not end in result');
	}

	async cancel(params: CancelNotification): Promise<void> {
		await this.sessionsManager.cancelSession(params);
	}

	async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
		this.logger.debug(`ACP readTextFile: ${params.path} (limit: ${params.limit}, line: ${params.line})`);

		const response = await this.client.readTextFile(params);

		this.logger.info(`ACP readTextFile: Read ${response.content.length} characters from ${params.path}`);

		// Cache full file content for optimization (when reading entire file)
		if (!params.limit && !params.line) {
			this.cacheManager.setFileContent(params.path, response.content);
		}

		return response;
	}

	async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
		try {
			this.logger.debug(`ACP writeTextFile: ${params.path} (${params.content.length} characters)`);
			this.logger.debug(`ACP writeTextFile params: ${JSON.stringify(params)}`);

			const response = await this.client.writeTextFile(params);

			this.logger.info(`ACP writeTextFile: Successfully wrote ${params.content.length} characters to ${params.path}`);
			this.logger.debug(`ACP writeTextFile response: ${JSON.stringify(response)}`);

			// Update cache with new file content and start watching for changes
			this.cacheManager.setFileContent(params.path, params.content, true);

			return response;
		} catch (error) {
			this.logger.error(
				`ACP writeTextFile failed for ${params.path}: ${error instanceof Error ? error.message : String(error)}`,
			);

			if (error instanceof Error) {
				this.logger.error(`ACP writeTextFile stack trace: ${error.stack}`);
			}

			throw error;
		}
	}
}
