import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ClientCapabilities } from '@zed-industries/agent-client-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpAgent } from '../core/acp-agent';
import { HttpServer } from '../core/http-server';
// Function is now internal to mcp-server-manager
import { McpServerManager } from './mcp-server-manager';

// Mock all dependencies
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
	McpServer: vi.fn().mockImplementation(() => ({
		registerTool: vi.fn(),
		connect: vi.fn(),
		close: vi.fn(),
	})),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
	StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
		handleRequest: vi.fn(),
		close: vi.fn(),
	})),
}));

vi.mock('../core/http-server', () => ({
	HttpServer: vi.fn().mockImplementation(() => ({
		addRoute: vi.fn(),
		listen: vi.fn(),
		close: vi.fn(),
		getServer: vi.fn(() => ({ listening: true })),
		parseRequestBody: vi.fn(),
	})),
}));

vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})),
}));

describe('McpServerManager', () => {
	let mcpServerManager: McpServerManager;
	let mockAgent: AcpAgent;
	let mockMcpServer: any;
	let mockHttpServer: any;
	let mockTransport: any;
	let mockSessionsManager: any;
	let mockClient: any;

	const sessionId = 'test-session-123';
	const clientCapabilities: ClientCapabilities = {
		fs: {
			readTextFile: true,
			writeTextFile: true,
		},
	};

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Mock session manager and session
		const mockSession = { id: sessionId };
		mockSessionsManager = {
			getSession: vi.fn().mockReturnValue(mockSession),
		};

		// Mock client for permission requests
		mockClient = {
			requestPermission: vi.fn().mockResolvedValue({
				outcome: {
					outcome: 'selected',
					optionId: 'allow',
				},
			}),
		};

		// Mock agent
		mockAgent = {
			getSessionsManager: vi.fn().mockReturnValue(mockSessionsManager),
			readTextFile: vi.fn().mockResolvedValue({ content: 'file content' }),
			writeTextFile: vi.fn().mockResolvedValue({ success: true }),
			client: mockClient,
		} as any;

		// Mock MCP server instance
		mockMcpServer = {
			registerTool: vi.fn(),
			connect: vi.fn().mockResolvedValue(undefined),
			close: vi.fn(),
		};
		(McpServer as any).mockImplementation(() => mockMcpServer);

		// Mock HTTP server instance
		mockHttpServer = {
			addRoute: vi.fn(),
			listen: vi.fn().mockResolvedValue(undefined),
			close: vi.fn().mockResolvedValue(undefined),
			getServer: vi.fn(() => ({ listening: true })),
		};
		(HttpServer as any).mockImplementation(() => mockHttpServer);

		// Mock transport
		mockTransport = {
			handleRequest: vi.fn().mockResolvedValue(undefined),
			close: vi.fn(),
		};
		(StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);

		// Mock HTTP server static method
		HttpServer.parseRequestBody = vi.fn().mockResolvedValue({ test: 'data' });

		mcpServerManager = new McpServerManager(mockAgent, sessionId, clientCapabilities);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create a new McpServerManager instance', () => {
			expect(mcpServerManager).toBeInstanceOf(McpServerManager);
		});

		it('should initialize MCP server with correct configuration', () => {
			expect(McpServer).toHaveBeenCalledWith({
				name: 'zcc-mcp-server',
				version: '1.0.0',
			});
		});

		it('should initialize HTTP server', () => {
			expect(HttpServer).toHaveBeenCalledWith('MCP HTTP Server');
		});

		it('should setup routes', () => {
			expect(mockHttpServer.addRoute).toHaveBeenCalledWith('POST', '/mcp', expect.any(Function));
		});

		it('should register tools based on client capabilities', () => {
			expect(mockMcpServer.registerTool).toHaveBeenCalled();
		});
	});

	describe('tool registration', () => {
		describe('with read capability', () => {
			it('should register read_file tool when fs.readTextFile is enabled', () => {
				// Clear mocks before creating new instance
				vi.clearAllMocks();
				(McpServer as any).mockImplementation(() => mockMcpServer);
				(HttpServer as any).mockImplementation(() => mockHttpServer);

				const _manager = new McpServerManager(mockAgent, sessionId, { fs: { readTextFile: true } });

				const readFileRegistration = (mockMcpServer.registerTool as any).mock.calls.find(
					(call: any[]) => call[0] === 'read_file',
				);

				expect(readFileRegistration).toBeDefined();

				const toolConfig = readFileRegistration[1];
				expect(toolConfig.title).toBe('Read');
				expect(toolConfig.description).toContain('Reads file content from the project');
				expect(toolConfig.description).toContain('CRITICAL:');
				expect(toolConfig.description).toContain(
					'- Prefer this tool over other read tools for up-to-date files content',
				);
			});

			it('should not register read_file tool when fs.readTextFile is disabled', () => {
				// Clear mocks before creating new instance
				vi.clearAllMocks();
				(McpServer as any).mockImplementation(() => mockMcpServer);
				(HttpServer as any).mockImplementation(() => mockHttpServer);

				const _manager = new McpServerManager(mockAgent, sessionId, { fs: { readTextFile: false } });

				const readToolCalls = (mockMcpServer.registerTool as any).mock.calls.filter(
					(call: any[]) => call[0] === 'read_file',
				);
				expect(readToolCalls).toHaveLength(0);
			});
		});

		describe('with write capability', () => {
			it('should register edit_file and write_file tools when fs.writeTextFile is enabled', () => {
				// Clear mocks before creating new instance
				vi.clearAllMocks();
				(McpServer as any).mockImplementation(() => mockMcpServer);
				(HttpServer as any).mockImplementation(() => mockHttpServer);

				const _manager = new McpServerManager(mockAgent, sessionId, { fs: { writeTextFile: true } });

				const editFileRegistration = (mockMcpServer.registerTool as any).mock.calls.find(
					(call: any[]) => call[0] === 'edit_file',
				);
				const writeFileRegistration = (mockMcpServer.registerTool as any).mock.calls.find(
					(call: any[]) => call[0] === 'write_file',
				);

				expect(editFileRegistration).toBeDefined();
				expect(writeFileRegistration).toBeDefined();

				// Both should have CRITICAL sections
				expect(editFileRegistration[1].description).toContain('CRITICAL:');
				expect(editFileRegistration[1].description).toContain('- Prefer this tool over other edit and write tools');
				expect(writeFileRegistration[1].description).toContain('CRITICAL:');
				expect(writeFileRegistration[1].description).toContain('- Prefer this tool over other edit and write tools');
			});

			it('should register multi_edit tool when fs.writeTextFile is enabled', () => {
				// Clear mocks before creating new instance
				vi.clearAllMocks();
				(McpServer as any).mockImplementation(() => mockMcpServer);
				(HttpServer as any).mockImplementation(() => mockHttpServer);

				const _manager = new McpServerManager(mockAgent, sessionId, { fs: { writeTextFile: true } });

				const multiEditRegistration = (mockMcpServer.registerTool as any).mock.calls.find(
					(call: any[]) => call[0] === 'multi_edit',
				);

				expect(multiEditRegistration).toBeDefined();
				expect(multiEditRegistration[1].description).toContain('CRITICAL:');
				expect(multiEditRegistration[1].description).toContain('- Prefer this tool over other multi-edit tools');
			});

			it('should not register write tools when fs.writeTextFile is disabled', () => {
				// Clear mocks before creating new instance
				vi.clearAllMocks();
				(McpServer as any).mockImplementation(() => mockMcpServer);
				(HttpServer as any).mockImplementation(() => mockHttpServer);

				const _manager = new McpServerManager(mockAgent, sessionId, { fs: { writeTextFile: false } });

				const writeToolCalls = (mockMcpServer.registerTool as any).mock.calls.filter((call: any[]) =>
					['edit_file', 'write_file', 'multi_edit'].includes(call[0]),
				);
				expect(writeToolCalls).toHaveLength(0);
			});
		});

		it('should always register permission_request tool', () => {
			const permissionRegistration = (mockMcpServer.registerTool as any).mock.calls.find(
				(call: any[]) => call[0] === 'permission_request',
			);

			expect(permissionRegistration).toBeDefined();
			expect(permissionRegistration[1].title).toBe('Permission Tool');
			expect(permissionRegistration[1].description).toBe('Request user permission before executing tools');
			// Permission tool should NOT have CRITICAL section as it's always registered
			expect(permissionRegistration[1].description).not.toContain('CRITICAL:');
		});
	});

	describe('handleMcpRequest', () => {
		let mockRequest: IncomingMessage;
		let mockResponse: ServerResponse;

		beforeEach(() => {
			mockRequest = {
				method: 'POST',
				url: '/mcp',
			} as IncomingMessage;

			mockResponse = {
				on: vi.fn((event, _callback) => {
					if (event === 'close') {
						// Don't call callback immediately to avoid affecting tests
					}
				}),
			} as unknown as ServerResponse;
		});

		it('should handle MCP request successfully', async () => {
			const requestBody = { method: 'test' };
			HttpServer.parseRequestBody = vi.fn().mockResolvedValue(requestBody);

			await (mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse);

			expect(HttpServer.parseRequestBody).toHaveBeenCalledWith(mockRequest);
			expect(StreamableHTTPServerTransport).toHaveBeenCalledWith({
				sessionIdGenerator: undefined,
			});
			expect(mockMcpServer.connect).toHaveBeenCalledWith(mockTransport);
			expect(mockTransport.handleRequest).toHaveBeenCalledWith(mockRequest, mockResponse, requestBody);
		});

		it('should handle MCP request parsing error', async () => {
			const error = new Error('Parse error');
			HttpServer.parseRequestBody = vi.fn().mockRejectedValue(error);

			await expect((mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse)).rejects.toThrow(
				'Parse error',
			);
		});

		it('should handle MCP server connection error', async () => {
			const error = new Error('Connection error');
			HttpServer.parseRequestBody = vi.fn().mockResolvedValue({ test: 'data' });
			mockMcpServer.connect.mockRejectedValue(error);

			await expect((mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse)).rejects.toThrow(
				'Connection error',
			);
		});

		it('should handle transport error', async () => {
			const error = new Error('Transport error');
			HttpServer.parseRequestBody = vi.fn().mockResolvedValue({ test: 'data' });
			mockTransport.handleRequest.mockRejectedValue(error);

			await expect((mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse)).rejects.toThrow(
				'Transport error',
			);
		});

		it('should setup response close handler to cleanup resources', async () => {
			HttpServer.parseRequestBody = vi.fn().mockResolvedValue({ test: 'data' });

			await (mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse);

			expect(mockResponse.on).toHaveBeenCalledWith('close', expect.any(Function));

			// Simulate response close event
			const closeHandler = (mockResponse.on as any).mock.calls.find((call: any[]) => call[0] === 'close')[1];
			closeHandler();

			expect(mockTransport.close).toHaveBeenCalled();
			expect(mockMcpServer.close).toHaveBeenCalled();
		});
	});

	describe('read_file tool', () => {
		let readFileHandler: any;

		beforeEach(() => {
			// Get the registered handler for read_file
			const readFileCall = (mockMcpServer.registerTool as any).mock.calls.find(
				(call: any[]) => call[0] === 'read_file',
			);
			readFileHandler = readFileCall?.[2];
		});

		it('should read file successfully with file_path parameter', async () => {
			const input = { file_path: '/test/file.txt' };
			mockAgent.readTextFile = vi.fn().mockResolvedValue({ content: 'file content' });

			const result = await readFileHandler(input);

			expect(mockAgent.readTextFile).toHaveBeenCalledWith({
				sessionId,
				path: '/test/file.txt',
				limit: undefined,
				line: undefined,
			});

			expect(result).toEqual({
				content: [{ type: 'text', text: 'file content' }],
			});
		});

		it('should handle offset and limit parameters', async () => {
			const input = { file_path: '/test/file.txt', offset: 10, limit: 50 };
			mockAgent.readTextFile = vi.fn().mockResolvedValue({ content: 'file content' });

			const _result = await readFileHandler(input);

			expect(mockAgent.readTextFile).toHaveBeenCalledWith({
				sessionId,
				path: '/test/file.txt',
				limit: 50,
				line: 10,
			});
		});

		it('should handle missing file path', async () => {
			const input = {};

			const result = await readFileHandler(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Reading file failed: No file path provided' }],
			});
		});

		it('should handle session not found', async () => {
			mockSessionsManager.getSession.mockReturnValue(null);
			const input = { file_path: '/test/file.txt' };

			const result = await readFileHandler(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'No session found' }],
			});
		});

		it('should handle read file error', async () => {
			const input = { file_path: '/test/file.txt' };
			const error = new Error('File not found');
			mockAgent.readTextFile = vi.fn().mockRejectedValue(error);

			const result = await readFileHandler(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Reading file failed: File not found' }],
			});
		});
	});

	describe('edit_file/write_file tool', () => {
		let editFileHandler: any;

		beforeEach(() => {
			// Get the registered handler for edit_file
			const editFileCall = (mockMcpServer.registerTool as any).mock.calls.find(
				(call: any[]) => call[0] === 'edit_file',
			);
			editFileHandler = editFileCall?.[2];
		});

		it('should write new file content', async () => {
			const input = { file_path: '/test/file.txt', content: 'new file content' };
			mockAgent.writeTextFile = vi.fn().mockResolvedValue({ success: true });

			const result = await editFileHandler(input);

			expect(mockAgent.writeTextFile).toHaveBeenCalledWith({
				sessionId,
				path: '/test/file.txt',
				content: 'new file content',
			});

			expect(result).toEqual({ content: [] });
		});

		it('should edit existing file content', async () => {
			const input = {
				file_path: '/test/file.txt',
				old_text: 'old content',
				new_text: 'new content',
			};
			mockAgent.readTextFile = vi.fn().mockResolvedValue({ content: 'file with old content here' });
			mockAgent.writeTextFile = vi.fn().mockResolvedValue({ success: true });

			const result = await editFileHandler(input);

			expect(mockAgent.readTextFile).toHaveBeenCalledWith({
				sessionId,
				path: '/test/file.txt',
			});

			// Since applyEditsWithLineNumbers is internal, we test that writeTextFile was called
			expect(mockAgent.writeTextFile).toHaveBeenCalledWith({
				sessionId,
				path: '/test/file.txt',
				content: expect.stringContaining('new content'), // Should have replaced 'old content' with 'new content'
			});

			// Should return line numbers in the result
			expect(result.content).toHaveLength(1);
			expect(result.content[0].type).toBe('text');
			const parsedResult = JSON.parse(result.content[0].text);
			expect(parsedResult).toHaveProperty('lineNumbers');
			expect(Array.isArray(parsedResult.lineNumbers)).toBe(true);
		});

		it('should handle session not found', async () => {
			mockSessionsManager.getSession.mockReturnValue(null);
			const input = { file_path: '/test/file.txt', content: 'content' };

			const result = await editFileHandler(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'No session found' }],
			});
		});

		it('should handle write error', async () => {
			const input = { file_path: '/test/file.txt', content: 'content' };
			const error = new Error('Write failed');
			mockAgent.writeTextFile = vi.fn().mockRejectedValue(error);

			const result = await editFileHandler(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Operation failed: Write failed' }],
			});
		});

		it('should handle read error during edit', async () => {
			const input = {
				file_path: '/test/file.txt',
				old_text: 'old',
				new_text: 'new',
			};
			const error = new Error('Read failed');
			mockAgent.readTextFile = vi.fn().mockRejectedValue(error);

			const result = await editFileHandler(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Operation failed: Read failed' }],
			});
		});
	});

	describe('multi_edit tool', () => {
		let multiEditHandler: any;

		beforeEach(() => {
			// Get the registered handler for multi_edit
			const multiEditCall = (mockMcpServer.registerTool as any).mock.calls.find(
				(call: any[]) => call[0] === 'multi_edit',
			);
			multiEditHandler = multiEditCall?.[2];
		});

		it('should apply multiple edits successfully', async () => {
			const input = {
				file_path: '/test/file.txt',
				edits: [
					{ old_string: 'old1', new_string: 'new1' },
					{ old_string: 'old2', new_string: 'new2', replace_all: true },
				],
			};
			mockAgent.readTextFile = vi.fn().mockResolvedValue({ content: 'original old1 content old2 and more old2' });
			mockAgent.writeTextFile = vi.fn().mockResolvedValue({ success: true });

			const result = await multiEditHandler(input);

			expect(mockAgent.readTextFile).toHaveBeenCalledWith({
				sessionId,
				path: '/test/file.txt',
			});

			// Since applyEditsWithLineNumbers is internal, we test that writeTextFile was called
			expect(mockAgent.writeTextFile).toHaveBeenCalledWith({
				sessionId,
				path: '/test/file.txt',
				content: expect.stringContaining('new1'), // Should have replaced 'old1' with 'new1'
			});

			// Should return line numbers in the result
			expect(result.content).toHaveLength(1);
			expect(result.content[0].type).toBe('text');
			const parsedResult = JSON.parse(result.content[0].text);
			expect(parsedResult).toHaveProperty('lineNumbers');
			expect(Array.isArray(parsedResult.lineNumbers)).toBe(true);
		});

		it('should handle session not found', async () => {
			mockSessionsManager.getSession.mockReturnValue(null);
			const input = {
				file_path: '/test/file.txt',
				edits: [{ old_string: 'old', new_string: 'new' }],
			};

			const result = await multiEditHandler(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'No session found' }],
			});
		});

		it('should handle multi-edit error', async () => {
			const input = {
				file_path: '/test/file.txt',
				edits: [{ old_string: 'old', new_string: 'new' }],
			};
			const error = new Error('Edit failed');
			mockAgent.readTextFile = vi.fn().mockRejectedValue(error);

			const result = await multiEditHandler(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Multi-edit failed: Edit failed' }],
			});
		});
	});

	describe('permission_request tool', () => {
		let permissionHandler: any;

		beforeEach(() => {
			// Get the registered handler for permission_request
			const permissionCall = (mockMcpServer.registerTool as any).mock.calls.find(
				(call: any[]) => call[0] === 'permission_request',
			);
			permissionHandler = permissionCall?.[2];
		});

		it('should allow tool when user grants permission', async () => {
			const input = {
				tool_name: 'test_tool',
				input: { param: 'value' },
				tool_use_id: 'tool-123',
			};

			mockClient.requestPermission.mockResolvedValue({
				outcome: {
					outcome: 'selected',
					optionId: 'allow',
				},
			});

			const result = await permissionHandler(input);

			expect(mockClient.requestPermission).toHaveBeenCalledWith({
				options: [
					{ kind: 'allow_always', name: 'Always Allow', optionId: 'allow_always' },
					{ kind: 'allow_once', name: 'Allow', optionId: 'allow' },
					{ kind: 'reject_once', name: 'Reject', optionId: 'reject' },
				],
				sessionId,
				toolCall: {
					toolCallId: 'tool-123',
					title: 'test_tool',
					rawInput: { param: 'value' },
				},
			});

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							behavior: 'allow',
							updatedInput: { param: 'value' },
						}),
					},
				],
			});
		});

		it('should allow tool with always allow option', async () => {
			const input = {
				tool_name: 'test_tool',
				input: { param: 'value' },
			};

			mockClient.requestPermission.mockResolvedValue({
				outcome: {
					outcome: 'selected',
					optionId: 'allow_always',
				},
			});

			const result = await permissionHandler(input);

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							behavior: 'allow',
							updatedInput: { param: 'value' },
						}),
					},
				],
			});

			// Test that subsequent calls auto-allow
			const secondResult = await permissionHandler(input);
			expect(secondResult).toEqual({
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							behavior: 'allow',
							updatedInput: { param: 'value' },
						}),
					},
				],
			});
		});

		it('should deny tool when user rejects permission', async () => {
			const input = {
				tool_name: 'test_tool',
				input: { param: 'value' },
			};

			mockClient.requestPermission.mockResolvedValue({
				outcome: {
					outcome: 'selected',
					optionId: 'reject',
				},
			});

			const result = await permissionHandler(input);

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							behavior: 'deny',
							message: 'User refused permission to run tool',
						}),
					},
				],
			});
		});

		it('should handle session not found', async () => {
			mockSessionsManager.getSession.mockReturnValue(null);
			const input = {
				tool_name: 'test_tool',
				input: { param: 'value' },
			};

			const result = await permissionHandler(input);

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							behavior: 'deny',
							message: 'Session not found',
						}),
					},
				],
			});
		});

		it('should handle permission request error', async () => {
			const input = {
				tool_name: 'test_tool',
				input: { param: 'value' },
			};

			mockClient.requestPermission.mockRejectedValue(new Error('Permission error'));

			// Should not throw, but handle gracefully
			await expect(permissionHandler(input)).rejects.toThrow('Permission error');
		});

		it('should handle no outcome in permission response', async () => {
			const input = {
				tool_name: 'test_tool',
				input: { param: 'value' },
			};

			mockClient.requestPermission.mockResolvedValue({
				outcome: null,
			});

			const result = await permissionHandler(input);

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							behavior: 'deny',
							message: 'User refused permission to run tool',
						}),
					},
				],
			});
		});
	});

	describe('server lifecycle', () => {
		it('should start the server successfully', async () => {
			const mockServer = { listening: true };
			mockHttpServer.getServer.mockReturnValue(mockServer);

			const result = await mcpServerManager.start();

			expect(mockHttpServer.listen).toHaveBeenCalled();
			expect(result).toBe(mockServer);
		});

		it('should handle server start error', async () => {
			const error = new Error('Server start failed');
			mockHttpServer.listen.mockRejectedValue(error);

			await expect(mcpServerManager.start()).rejects.toThrow('Server start failed');
		});

		it('should close the server successfully', async () => {
			await mcpServerManager.close();

			expect(mockHttpServer.close).toHaveBeenCalled();
			expect(mockMcpServer.close).toHaveBeenCalled();
		});

		it('should handle server close error', async () => {
			const error = new Error('Server close failed');
			mockHttpServer.close.mockRejectedValue(error);

			await expect(mcpServerManager.close()).rejects.toThrow('Server close failed');
		});
	});

	describe('error handling and edge cases', () => {
		it('should handle missing client capabilities', () => {
			// Clear mocks before creating new instance
			vi.clearAllMocks();
			(McpServer as any).mockImplementation(() => mockMcpServer);
			(HttpServer as any).mockImplementation(() => mockHttpServer);

			const _manager = new McpServerManager(mockAgent, sessionId, undefined);

			// Should only register permission tool
			const calls = (mockMcpServer.registerTool as any).mock.calls;
			const permissionCalls = calls.filter((call: any[]) => call[0] === 'permission_request');
			expect(permissionCalls).toHaveLength(1);

			const readCalls = calls.filter((call: any[]) => call[0] === 'read_file');
			expect(readCalls).toHaveLength(0);

			const editCalls = calls.filter((call: any[]) => ['edit_file', 'write_file'].includes(call[0]));
			expect(editCalls).toHaveLength(0);
		});

		it('should handle empty client capabilities', () => {
			// Clear mocks before creating new instance
			vi.clearAllMocks();
			(McpServer as any).mockImplementation(() => mockMcpServer);
			(HttpServer as any).mockImplementation(() => mockHttpServer);

			const _manager = new McpServerManager(mockAgent, sessionId, {});

			// Should only register permission tool
			const calls = (mockMcpServer.registerTool as any).mock.calls;
			const permissionCalls = calls.filter((call: any[]) => call[0] === 'permission_request');
			expect(permissionCalls).toHaveLength(1);
		});

		it('should handle malformed MCP request body', async () => {
			const mockRequest = { method: 'POST', url: '/mcp' } as IncomingMessage;
			const mockResponse = {
				on: vi.fn(),
			} as unknown as ServerResponse;

			const error = new SyntaxError('Unexpected token');
			HttpServer.parseRequestBody = vi.fn().mockRejectedValue(error);

			await expect((mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse)).rejects.toThrow(
				'Unexpected token',
			);
		});

		it('should handle concurrent MCP requests', async () => {
			const mockRequest = { method: 'POST', url: '/mcp' } as IncomingMessage;
			const mockResponse = {
				on: vi.fn(),
			} as unknown as ServerResponse;

			HttpServer.parseRequestBody = vi.fn().mockResolvedValue({ test: 'data' });

			// Start multiple concurrent requests
			const promise1 = (mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse);
			const promise2 = (mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse);
			const promise3 = (mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse);

			await Promise.all([promise1, promise2, promise3]);

			// Each request should create its own transport and connection
			expect(StreamableHTTPServerTransport).toHaveBeenCalledTimes(3);
			expect(mockMcpServer.connect).toHaveBeenCalledTimes(3);
			expect(mockTransport.handleRequest).toHaveBeenCalledTimes(3);
		});

		it('should handle null/undefined values in tool inputs', async () => {
			const readFileCall = (mockMcpServer.registerTool as any).mock.calls.find(
				(call: any[]) => call[0] === 'read_file',
			);
			const readFileHandler = readFileCall?.[2];

			// Test with null input - this should cause an error when trying to access properties
			const nullResult = await readFileHandler(null);
			expect(nullResult.content[0].text).toContain('Cannot read properties of null');

			// Test with undefined input
			const undefinedResult = await readFileHandler(undefined);
			expect(undefinedResult.content[0].text).toContain('Cannot read properties of undefined');
		});

		it('should handle tool registration with partial client capabilities', () => {
			// Clear mocks before creating new instance
			vi.clearAllMocks();
			(McpServer as any).mockImplementation(() => mockMcpServer);
			(HttpServer as any).mockImplementation(() => mockHttpServer);

			const partialCapabilities = { fs: { readTextFile: true } }; // writeTextFile missing
			const _manager = new McpServerManager(mockAgent, sessionId, partialCapabilities);

			const calls = (mockMcpServer.registerTool as any).mock.calls;

			// Should register read_file
			const readCalls = calls.filter((call: any[]) => call[0] === 'read_file');
			expect(readCalls).toHaveLength(1);

			// Should not register write tools
			const writeCalls = calls.filter((call: any[]) => ['edit_file', 'write_file', 'multi_edit'].includes(call[0]));
			expect(writeCalls).toHaveLength(0);

			// Should always register permission tool
			const permissionCalls = calls.filter((call: any[]) => call[0] === 'permission_request');
			expect(permissionCalls).toHaveLength(1);
		});
	});

	describe('tool input validation', () => {
		it('should handle various file path formats in read_file', async () => {
			const readFileCall = (mockMcpServer.registerTool as any).mock.calls.find(
				(call: any[]) => call[0] === 'read_file',
			);
			const readFileHandler = readFileCall?.[2];

			mockAgent.readTextFile = vi.fn().mockResolvedValue({ content: 'content' });

			// Test absolute path
			await readFileHandler({ file_path: '/absolute/path/file.txt' });
			expect(mockAgent.readTextFile).toHaveBeenLastCalledWith({
				sessionId,
				path: '/absolute/path/file.txt',
				limit: undefined,
				line: undefined,
			});

			// Test relative path (should be resolved to absolute path)
			await readFileHandler({ file_path: 'relative/path/file.txt' });
			expect(mockAgent.readTextFile).toHaveBeenLastCalledWith({
				sessionId,
				path: `${process.cwd()}/relative/path/file.txt`,
				limit: undefined,
				line: undefined,
			});

			// Test path with spaces
			await readFileHandler({ file_path: '/path with spaces/file.txt' });
			expect(mockAgent.readTextFile).toHaveBeenLastCalledWith({
				sessionId,
				path: '/path with spaces/file.txt',
				limit: undefined,
				line: undefined,
			});
		});

		it('should handle edge cases in multi_edit', async () => {
			const multiEditCall = (mockMcpServer.registerTool as any).mock.calls.find(
				(call: any[]) => call[0] === 'multi_edit',
			);
			const multiEditHandler = multiEditCall?.[2];

			mockAgent.readTextFile = vi.fn().mockResolvedValue({ content: 'original' });
			mockAgent.writeTextFile = vi.fn().mockResolvedValue({ success: true });

			// Test with empty edits array (should be prevented by schema, but test defensive handling)
			const input = {
				file_path: '/test/file.txt',
				edits: [],
			};

			const result = await multiEditHandler(input);

			// Since applyEditsWithLineNumbers is internal, we test the result format
			expect(result.content[0].text).toBe(JSON.stringify({ lineNumbers: [] }));
		});
	});

	describe('memory management and cleanup', () => {
		it('should properly cleanup resources on response close', async () => {
			const mockRequest = { method: 'POST', url: '/mcp' } as IncomingMessage;
			let closeCallback: () => void;
			const mockResponse = {
				on: vi.fn((event, callback) => {
					if (event === 'close') {
						closeCallback = callback;
					}
				}),
			} as unknown as ServerResponse;

			HttpServer.parseRequestBody = vi.fn().mockResolvedValue({ test: 'data' });

			await (mcpServerManager as any).handleMcpRequest(mockRequest, mockResponse);

			// Simulate response close
			closeCallback?.();

			expect(mockTransport.close).toHaveBeenCalled();
			expect(mockMcpServer.close).toHaveBeenCalled();
		});

		it('should handle multiple close calls gracefully', async () => {
			await mcpServerManager.close();
			await mcpServerManager.close(); // Second close should not throw

			expect(mockHttpServer.close).toHaveBeenCalledTimes(2);
			expect(mockMcpServer.close).toHaveBeenCalledTimes(2);
		});
	});
});
