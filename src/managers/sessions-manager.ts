import type { AddressInfo } from 'node:net';
import { type McpServerConfig, type Options, type Query, query, type SDKUserMessage } from '@anthropic-ai/claude-code';
import type {
	CancelNotification,
	ClientCapabilities,
	NewSessionRequest,
	NewSessionResponse,
} from '@zed-industries/agent-client-protocol';
import { v7 as uuidv7 } from 'uuid';
import type { AcpAgent } from '../core/acp-agent';
import { Streamable } from '../streams/streamable';
import { Logger } from '../utils/logger';
import { dependencyManager } from './dependency-manager';
import { McpServerManager } from './mcp-server-manager';

/**
 * Session data structure
 */
export type Session = {
	query: Query;
	input: Streamable<SDKUserMessage>;
	abortController?: AbortController;
	messageHistory: SDKUserMessage[];
	options?: Options;
	sessionParams?: NewSessionRequest;
	clientCapabilities?: ClientCapabilities;
	acpAgent?: AcpAgent;
};

/**
 * Sessions manager handles session lifecycle and management
 */
export class SessionsManager {
	/** Map of active sessions indexed by session ID for O(1) lookup */
	protected sessions: Map<string, Session>;
	protected logger: Logger;

	constructor() {
		this.sessions = new Map();
		this.logger = new Logger({ component: 'Sessions Manager' });
	}

	/**
	 * Create a new Claude SDK session with MCP server integration
	 */
	async createSession(
		params: NewSessionRequest,
		clientCapabilities?: ClientCapabilities,
		acpAgent?: AcpAgent, // Reference to ACP agent for MCP server creation
	): Promise<NewSessionResponse> {
		try {
			// Generate unique session identifier
			const sessionId = uuidv7();
			// Create streamable for sending user messages to Claude
			const input = new Streamable<SDKUserMessage>();

			this.logger.info(`Creating new session: ${sessionId}`);
			this.logger.debug(`Session params: ${JSON.stringify({ cwd: params.cwd, mcpServers: params.mcpServers })}`);

			// Configure MCP servers from request parameters
			const mcpServers: Record<string, McpServerConfig> = {};

			// Convert ACP MCP server configs to Claude SDK format
			if (Array.isArray(params.mcpServers)) {
				for (const server of params.mcpServers) {
					mcpServers[server.name] = {
						type: 'stdio',
						command: server.command,
						args: server.args,
						// Convert environment variables array to object
						env: server.env ? Object.fromEntries(server.env.map((e) => [e.name, e.value])) : undefined,
					};
				}
			}

			// Create and start MCP server for ACP tool bridging if ACP agent provided
			if (acpAgent) {
				const mcpServerManager = new McpServerManager(
					acpAgent,
					sessionId,
					clientCapabilities,
					params.cwd || process.cwd(),
				);
				const server = await mcpServerManager.start();
				const address = server.address() as AddressInfo;

				// Add our ZCC-MCP bridge server to the configuration
				mcpServers.zcc = {
					type: 'http',
					url: `http://127.0.0.1:${address.port}/mcp`,
					headers: {
						// Session ID for routing requests to correct session
						'x-acp-proxy-session-id': sessionId,
					},
				};
			}

			// Configure Claude SDK query options
			const options: Options = {
				cwd: params.cwd || process.cwd(),
				mcpServers,
				disallowedTools: [],
				// Route permission requests through our ACP bridge
				permissionPromptToolName: 'mcp__zcc__permission_request',
				// Log Claude CLI errors
				stderr: (err) => this.logger.error(`Claude CLI stderr: ${err}`),
				// Specify the Claude CLI executable path
				pathToClaudeCodeExecutable: dependencyManager.ensureClaudeExecutable(),
				// Configure token limits to prevent max_tokens < thinking.budget_tokens error
				maxThinkingTokens: 16000, // Set thinking budget within reasonable limits
			};

			// Configure tool access based on client capabilities
			if (clientCapabilities?.fs?.readTextFile) {
				options.disallowedTools?.push('Read');

				// Use our ACP-bridged read tool instead of Claude's built-in
				options.allowedTools = ['mcp__zcc__read_file'];
			}

			if (clientCapabilities?.fs?.writeTextFile) {
				// Disable Claude's built-in file modification tools
				options.disallowedTools?.push('Write', 'Edit', 'MultiEdit');

				// Use our ACP-bridged read tool instead of Claude's built-in
				options.allowedTools = [
					'mcp__zcc__read_file',
					'mcp__zcc__edit_file',
					'mcp__zcc__write_file',
					'mcp__zcc__multi_edit',
				];
			}

			// Store session in Map for O(1) access
			this.sessions.set(sessionId, {
				query: query({ prompt: input, options }),
				input: input,
				messageHistory: [],
				options,
				sessionParams: params,
				clientCapabilities,
				acpAgent,
			});

			this.logger.info(`Session ${sessionId} created successfully`);

			return {
				sessionId,
			};
		} catch (error) {
			this.logger.error(`Session creation failed: ${error instanceof Error ? error.message : String(error)}`);
			this.logger.error(`Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
			throw error;
		}
	}

	/**
	 * Get a session by ID
	 */
	getSession(sessionId: string): Session | undefined {
		return this.sessions.get(sessionId);
	}

	/**
	 * Cancel a session
	 */
	async cancelSession(params: CancelNotification): Promise<void> {
		const session = this.sessions.get(params.sessionId);

		if (!session) {
			this.logger.error(`Cancel requested for unknown session: ${params.sessionId}`);
			throw new Error('Session not found');
		}

		this.logger.info(`Cancelling session: ${params.sessionId}`);

		// Interrupt any ongoing session activity
		session.abortController?.abort();
		session.query.interrupt();
	}
}
