import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ClientCapabilities } from '@zed-industries/agent-client-protocol';
import { z } from 'zod';
import type { AcpAgent } from '../core/acp-agent';
import { HttpServer } from '../core/http-server';
import { Logger } from '../utils/logger';

// MCP-specific types (snake_case for MCP schema compatibility)
export interface McpReadFileInput {
	filePath: string;
	offset?: number;
	limit?: number;
}

export interface McpEditFileInput {
	filePath: string;
	oldText?: string;
	newText?: string;
	content?: string; // For write operations
}

export interface McpMultiEditInput {
	filePath: string;
	edits: Array<{
		oldString: string;
		newString: string;
		replaceAll?: boolean;
	}>;
}

export interface PermissionInput {
	tool_name: string;
	input?: unknown;
	tool_use_id?: string;
}

export interface ToolResult {
	content: Array<{
		type: 'text';
		text: string;
	}>;
	[key: string]: unknown;
}

export type McpHandler<TInput = unknown> = (input: TInput) => Promise<ToolResult>;

export class McpServerManager {
	protected mcpServer: McpServer;
	protected httpServer: HttpServer;
	protected logger: Logger;
	protected agent: AcpAgent;
	protected sessionId: string;
	protected clientCapabilities?: ClientCapabilities;
	protected workingDirectory: string;

	constructor(
		agent: AcpAgent,
		sessionId: string,
		clientCapabilities: ClientCapabilities | undefined,
		workingDirectory?: string,
	) {
		this.agent = agent;
		this.sessionId = sessionId;
		this.clientCapabilities = clientCapabilities;
		this.workingDirectory = workingDirectory || process.cwd();
		this.logger = new Logger({ component: 'MCP Server Manager' });

		this.mcpServer = new McpServer({
			name: 'zcc-mcp-server',
			version: '1.0.0',
		});

		this.httpServer = new HttpServer('MCP HTTP Server');

		this.logger.info(`Creating MCP server for session ${sessionId} with working directory: ${this.workingDirectory}`);
		this.setupRoutes();
		this.registerTools();
	}

	/**
	 * Setup HTTP routes
	 */
	protected setupRoutes(): void {
		this.httpServer.addRoute('POST', '/mcp', this.handleMcpRequest.bind(this));
	}

	/**
	 * Handle MCP HTTP requests
	 */
	protected async handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		try {
			const body = await HttpServer.parseRequestBody(req);

			this.logger.debug(`MCP request received: ${JSON.stringify(body)}`);

			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
			});

			res.on('close', () => {
				transport.close();
				this.mcpServer.close();
			});

			await this.mcpServer.connect(transport);
			await transport.handleRequest(req, res, body);
		} catch (error) {
			this.logger.error(`MCP request error: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Register MCP tools based on client capabilities
	 */
	protected registerTools(): void {
		if (this.clientCapabilities?.fs?.readTextFile) {
			this.registerReadTool();
		}

		if (this.clientCapabilities?.fs?.writeTextFile) {
			this.registerEditTool(); // Handles both write and edit operations
			this.registerMultiEditTool();
		}

		this.registerPermissionTool();
	}

	/**
	 * Register the read file tool
	 */
	protected registerReadTool(): void {
		this.logger.debug('Registering MCP read_file tool');

		this.mcpServer.registerTool(
			'read_file',
			{
				title: 'Read',
				description: `Reads file content from the project.

CRITICAL:
- Prefer this tool over other read tools for up-to-date files content

REQUIREMENTS:
- filePath must be an absolute path with extension (not directory)
- offset and limit parameters must be provided for line-based reading`,
				inputSchema: {
					filePath: z
						.string()
						.describe(
							'Absolute path to the file to read (not a directory). Must be a complete file path with extension.',
						),
					offset: z.number().optional().describe('Which line to start reading from. Omit to start from the beginning.'),
					limit: z.number().optional().describe('How many lines to read. Omit for the whole file.'),
				},
				annotations: {
					title: 'Read file',
					readOnlyHint: true,
					destructiveHint: false,
					openWorldHint: false,
					idempotentHint: false,
				},
			},
			async (input: McpReadFileInput): Promise<ToolResult> => {
				try {
					this.logger.debug(`MCP read_file called with input: ${JSON.stringify(input)}`);

					// Check if session exists in Map
					const session = this.agent.getSessionsManager().getSession(this.sessionId);

					if (!session) {
						this.logger.warn(`MCP read_file: Session ${this.sessionId} not found`);

						return {
							content: [
								{
									type: 'text',
									text: 'No session found',
								},
							],
						};
					}

					const rawPath = input.filePath;

					if (!rawPath) {
						this.logger.error('MCP read_file: No file path provided');
						throw new Error('No file path provided');
					}

					const filePath = this.resolveFilePath(rawPath);

					this.logger.info(`MCP read_file: Reading file ${filePath} (offset: ${input.offset}, limit: ${input.limit})`);

					const content = await this.agent.readTextFile({
						sessionId: this.sessionId,
						path: filePath,
						limit: input.limit,
						line: input.offset,
					});

					this.logger.info(`MCP read_file: Successfully read ${content.content.length} characters from ${filePath}`);

					return {
						content: [
							{
								type: 'text',
								text: content.content,
							},
						],
					};
				} catch (error: unknown) {
					this.logger.error(`MCP read_file error: ${error instanceof Error ? error.message : JSON.stringify(error)}`);

					return {
						content: [
							{
								type: 'text',
								text: `Reading file failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
							},
						],
					};
				}
			},
		);
	}

	/**
	 * Register the edit file tool (handles both write and edit operations)
	 */
	protected registerEditTool(): void {
		// Register both 'edit' and 'write' tool names for the same functionality
		const toolHandler: McpHandler<McpEditFileInput> = async (input) => {
			try {
				this.logger.debug(`MCP edit/write tool called with input: ${JSON.stringify(input)}`);

				// Check if session exists in Map
				const session = this.agent.getSessionsManager().getSession(this.sessionId);

				if (!session) {
					return {
						content: [
							{
								type: 'text',
								text: 'No session found',
							},
						],
					};
				}

				const filePath = this.resolveFilePath(input.filePath);

				// Handle write operation (new file or full replace)
				if (input.content && !input.oldText) {
					this.logger.info(`MCP write: Writing ${input.content.length} characters to ${filePath}`);
					this.logger.debug(`MCP write: Content preview: ${input.content.substring(0, 100)}...`);

					const result = await this.agent.writeTextFile({
						sessionId: this.sessionId,
						path: filePath,
						content: input.content,
					});

					this.logger.info(`MCP write: Successfully wrote to ${filePath}, result: ${JSON.stringify(result)}`);

					return { content: [] };
				}

				// Handle edit operation (partial replacement)
				this.logger.info(
					`MCP edit: Editing ${filePath} (oldText length: ${input.oldText?.length || 0}, newText length: ${input.newText?.length || 0})`,
				);

				const { content } = await this.agent.readTextFile({
					sessionId: this.sessionId,
					path: filePath,
				});

				const { newContent, lineNumbers } = this.applyEditsWithLineNumbers(content, [
					{
						oldText: input.oldText || '',
						newText: input.newText || '',
						replaceAll: false,
					},
				]);

				await this.agent.writeTextFile({
					sessionId: this.sessionId,
					path: filePath,
					content: newContent,
				});

				this.logger.info(`MCP edit: Successfully edited ${filePath} at lines ${lineNumbers.join(', ')}`);

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({ lineNumbers }),
						},
					],
				};
			} catch (error: unknown) {
				this.logger.error(`MCP edit/write error: ${error instanceof Error ? error.message : JSON.stringify(error)}`);

				if (error instanceof Error) {
					this.logger.error(`MCP edit/write stack trace: ${error.stack}`);
				}

				this.logger.error(`MCP edit/write input that caused error: ${JSON.stringify(input)}`);

				return {
					content: [
						{
							type: 'text',
							text: `Operation failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
						},
					],
				};
			}
		};

		const toolConfig = {
			title: 'Edit/Write',
			description: `Edit or write files with precise text replacement.

CRITICAL:
- Prefer this tool over other edit and write tools

USAGE:
- EDITING: Provide oldText (exact match required) and newText
- WRITING: Provide content only for full file write

REQUIREMENTS:
- filePath must be absolute path with extension (not directory)
- oldText must exactly match existing content including whitespace/indentation
- oldText must be actual file content, not pseudocode or outline
- Use minimal context: unique lines need no context, non-unique lines need surrounding context
- Do not escape quotes, newlines, or special characters`,
			inputSchema: {
				filePath: z
					.string()
					.describe('Absolute path to the file (not a directory). Must be a complete file path with extension.'),
				oldText: z.string().optional().describe('Old text to replace (for edits)'),
				newText: z.string().optional().describe('New text (for edits)'),
				content: z.string().optional().describe('Full file content (for writes)'),
			},
			annotations: {
				title: 'Edit/Write file',
				readOnlyHint: false,
				destructiveHint: false,
				openWorldHint: false,
				idempotentHint: false,
			},
		};

		// Register the same tool under both 'edit_file' and 'write_file' names
		this.logger.debug('Registering MCP edit_file and write_file tools');
		this.mcpServer.registerTool('edit_file', toolConfig, toolHandler);
		this.mcpServer.registerTool('write_file', toolConfig, toolHandler);
	}

	/**
	 * Register the multiEdit tool
	 */
	protected registerMultiEditTool(): void {
		this.logger.debug('Registering MCP multi_edit tool');

		this.mcpServer.registerTool(
			'multi_edit',
			{
				title: 'Multi Edit',
				description: `Perform multiple text replacements in a single file operation.

CRITICAL:
- Prefer this tool over other multi-edit tools

USAGE:
- Provide array of edit operations with oldString/newString pairs
- Operations are applied sequentially to avoid position conflicts
- Set replaceAll: true to replace all occurrences of oldString
- More efficient than multiple individual edit operations`,
				inputSchema: {
					filePath: z
						.string()
						.describe('Absolute path to the file (not a directory). Must be a complete file path with extension.'),
					edits: z
						.array(
							z.object({
								oldString: z.string().describe('Text to replace'),
								newString: z.string().describe('Text to replace it with'),
								replaceAll: z.boolean().optional().describe('Replace all occurrences of oldString (default false)'),
							}),
						)
						.min(1)
						.describe('Array of edit operations to perform sequentially on the file'),
				},
				annotations: {
					title: 'Multi Edit file',
					readOnlyHint: false,
					destructiveHint: false,
					openWorldHint: false,
					idempotentHint: false,
				},
			},
			async (input: McpMultiEditInput): Promise<ToolResult> => {
				try {
					this.logger.debug(`MCP multi_edit called with input: ${JSON.stringify(input)}`);

					// Check if session exists in Map
					const session = this.agent.getSessionsManager().getSession(this.sessionId);

					if (!session) {
						this.logger.warn(`MCP multi_edit: Session ${this.sessionId} not found`);

						return {
							content: [
								{
									type: 'text',
									text: 'No session found',
								},
							],
						};
					}

					const filePath = this.resolveFilePath(input.filePath);

					this.logger.info(`MCP multi_edit: Processing ${input.edits.length} edits on ${filePath}`);

					const { content } = await this.agent.readTextFile({
						sessionId: this.sessionId,
						path: filePath,
					});

					const { newContent, lineNumbers } = this.applyEditsWithLineNumbers(
						content,
						input.edits.map((edit) => ({
							oldText: edit.oldString,
							newText: edit.newString,
							replaceAll: edit.replaceAll ?? false,
						})),
					);

					await this.agent.writeTextFile({
						sessionId: this.sessionId,
						path: filePath,
						content: newContent,
					});

					this.logger.info(
						`MCP multi_edit: Successfully applied ${input.edits.length} edits to ${filePath} at lines ${lineNumbers.join(', ')}`,
					);

					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({ lineNumbers }),
							},
						],
					};
				} catch (error: unknown) {
					this.logger.error(`MCP multi_edit error: ${error instanceof Error ? error.message : String(error)}`);

					return {
						content: [
							{
								type: 'text',
								text: `Multi-edit failed: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			},
		);
	}

	/**
	 * Register the permission tool
	 */
	protected registerPermissionTool(): void {
		this.logger.debug('Registering MCP permission_request tool');

		const alwaysAllowedTools: { [key: string]: boolean } = {};

		this.mcpServer.registerTool(
			'permission_request',
			{
				title: 'Permission Tool',
				description: `Request user permission before executing tools`,
				inputSchema: {
					tool_name: z.string(),
					input: z.unknown(),
					tool_use_id: z.string().optional(),
				},
			},
			async (input: PermissionInput): Promise<ToolResult> => {
				this.logger.debug(`MCP permission_request called for tool: ${input.tool_name}`);

				// Check if session exists in Map
				const session = this.agent.getSessionsManager().getSession(this.sessionId);

				if (!session) {
					this.logger.warn(`MCP permission_request: Session ${this.sessionId} not found`);

					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									behavior: 'deny',
									message: 'Session not found',
								}),
							},
						],
					};
				}

				if (alwaysAllowedTools[input.tool_name]) {
					this.logger.info(`MCP permission_request: Auto-allowing ${input.tool_name} (previously allowed)`);

					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									behavior: 'allow',
									updatedInput: input.input,
								}),
							},
						],
					};
				}

				this.logger.info(`MCP permission_request: Requesting permission for tool ${input.tool_name}`);

				const response = await this.agent.client.requestPermission({
					options: [
						{
							kind: 'allow_always',
							name: 'Always Allow',
							optionId: 'allow_always',
						},
						{ kind: 'allow_once', name: 'Allow', optionId: 'allow' },
						{ kind: 'reject_once', name: 'Reject', optionId: 'reject' },
					],
					sessionId: this.sessionId,
					toolCall: {
						toolCallId: input.tool_use_id || '',
						title: this.generatePermissionTitle(input.tool_name, input.input),
						rawInput: input.input as Record<string, unknown> | undefined,
					},
				});

				if (
					response.outcome?.outcome === 'selected' &&
					(response.outcome.optionId === 'allow' || response.outcome.optionId === 'allow_always')
				) {
					if (response.outcome.optionId === 'allow_always') {
						alwaysAllowedTools[input.tool_name] = true;
						this.logger.info(`MCP permission_request: Tool ${input.tool_name} added to always-allowed list`);
					}

					this.logger.info(`MCP permission_request: Permission granted for tool ${input.tool_name}`);

					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									behavior: 'allow',
									updatedInput: input.input,
								}),
							},
						],
					};
				} else {
					this.logger.info(`MCP permission_request: Permission denied for tool ${input.tool_name}`);

					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									behavior: 'deny',
									message: 'User refused permission to run tool',
								}),
							},
						],
					};
				}
			},
		);
	}

	/**
	 * Start the MCP server
	 */
	async start(): Promise<Server> {
		await this.httpServer.listen();
		return this.httpServer.getServer();
	}

	/**
	 * Close the MCP server
	 */
	async close(): Promise<void> {
		await this.httpServer.close();
		this.mcpServer.close();
	}

	/**
	 * Resolve relative paths to absolute paths based on working directory
	 */
	protected resolveFilePath(filePath: string): string {
		if (resolve(filePath) === filePath) {
			// Already absolute path
			return filePath;
		}

		// Resolve relative path against working directory
		const absolutePath = resolve(this.workingDirectory, filePath);

		this.logger.debug(`Resolved relative path "${filePath}" to absolute path "${absolutePath}"`);

		return absolutePath;
	}

	/**
	 * Pre-calculate line positions for O(log n) line number lookups
	 */
	protected calculateLinePositions(fileContent: string): number[] {
		const lineStarts: number[] = [0];

		for (let i = 0; i < fileContent.length; i++) {
			if (fileContent[i] === '\n') {
				lineStarts.push(i + 1);
			} else if (fileContent[i] === '\r') {
				const nextPos = fileContent[i + 1] === '\n' ? i + 2 : i + 1;

				lineStarts.push(nextPos);

				// Skip \n in \r\n
				if (nextPos === i + 2) {
					i++;
				}
			}
		}

		return lineStarts;
	}

	/**
	 * Binary search for line number - O(log n)
	 */
	protected getLineNumberBinarySearch(pos: number, lineStarts: number[]): number {
		let left = 0;
		let right = lineStarts.length - 1;

		while (left <= right) {
			const mid = (left + right) >> 1;

			if (lineStarts[mid] <= pos) {
				if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > pos) {
					return mid;
				}

				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		return Math.max(0, right);
	}

	/**
	 * Process text edits and collect replacements
	 */
	protected processTextEdits(
		fileContent: string,
		edits: Array<{
			oldText: string;
			newText: string;
			replaceAll?: boolean;
		}>,
	): Array<{ pos: number; len: number; text: string }> {
		const replacements: Array<{ pos: number; len: number; text: string }> = [];

		const content = fileContent;

		for (const edit of edits) {
			if (!edit.oldText) continue;

			const positions: number[] = [];

			if (edit.replaceAll) {
				let start = 0;

				while (true) {
					const pos = content.indexOf(edit.oldText, start);

					if (pos === -1) {
						break;
					}

					positions.push(pos);
					start = pos + edit.oldText.length;
				}
			} else {
				const pos = content.indexOf(edit.oldText);

				if (pos !== -1) {
					positions.push(pos);
				}
			}

			// Collect all replacements without modifying content
			for (const pos of positions) {
				replacements.push({ pos, len: edit.oldText.length, text: edit.newText });
			}
		}

		return replacements;
	}

	protected applyEditsWithLineNumbers(
		fileContent: string,
		edits: Array<{
			oldText: string;
			newText: string;
			replaceAll?: boolean;
		}>,
	): { newContent: string; lineNumbers: number[] } {
		if (edits.length === 0) {
			return { newContent: fileContent, lineNumbers: [] };
		}

		// Pre-calculate line positions for O(log n) line number lookups
		const lineStarts = this.calculateLinePositions(fileContent);

		// Collect replacements without using temporary markers
		const replacements = this.processTextEdits(fileContent, edits);

		if (replacements.length === 0) {
			return { newContent: fileContent, lineNumbers: [] };
		}

		// Apply all replacements to original content in reverse position order
		let result = fileContent;

		for (const { pos, len, text } of replacements.sort((a, b) => b.pos - a.pos)) {
			result = result.slice(0, pos) + text + result.slice(pos + len);
		}

		// Calculate unique affected line numbers using binary search (convert to 1-indexed)
		const lines = [...new Set(replacements.map((r) => this.getLineNumberBinarySearch(r.pos, lineStarts) + 1))].sort(
			(a, b) => a - b,
		);

		return { newContent: result, lineNumbers: lines };
	}

	/**
	 * Generate a descriptive permission title based on tool name and input
	 */
	protected generatePermissionTitle(toolName: string, input: unknown): string {
		const baseTitle = `${toolName}`;

		if (!input || typeof input !== 'object') {
			return baseTitle;
		}

		const inputObj = input as Record<string, unknown>;

		// Handle different tool types with specific descriptive patterns
		switch (toolName) {
			case 'read_file':
				if (inputObj.filePath) {
					return `Read file: ${inputObj.filePath}`;
				}
				break;

			case 'edit_file':
			case 'write_file':
				if (inputObj.filePath) {
					const operation = inputObj.content ? 'Write to' : 'Edit';
					return `${operation} file: ${inputObj.filePath}`;
				}
				break;

			case 'multi_edit':
				if (inputObj.filePath && inputObj.edits) {
					const count = Array.isArray(inputObj.edits) ? inputObj.edits.length : '?';
					return `Apply ${count} edits to: ${inputObj.filePath}`;
				}
				break;

			default:
				// For other tools, try to extract meaningful info from common parameters
				if (inputObj.filePath) {
					return `${toolName}: ${inputObj.filePath}`;
				}
				if (inputObj.path) {
					return `${toolName}: ${inputObj.path}`;
				}
				if (inputObj.command) {
					return `${toolName}: ${inputObj.command}`;
				}
				if (inputObj.url) {
					return `${toolName}: ${inputObj.url}`;
				}
		}

		return baseTitle;
	}
}
