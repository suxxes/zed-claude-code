import type { AddressInfo } from 'node:net';
import type { Options } from '@anthropic-ai/claude-code';
import type { CancelNotification, ClientCapabilities, NewSessionRequest } from '@zed-industries/agent-client-protocol';
import { v7 as uuidv7 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpAgent } from '../core/acp-agent';
import { Streamable } from '../streams/streamable';
import { McpServerManager } from './mcp-server-manager';
import { SessionsManager } from './sessions-manager';

// Mock external dependencies
vi.mock('@anthropic-ai/claude-code', () => ({
	query: vi.fn(() => ({
		next: vi.fn(),
		interrupt: vi.fn(),
	})),
}));

vi.mock('uuid', () => ({
	v7: vi.fn(),
}));

vi.mock('../utils/logger', () => {
	return {
		Logger: class MockLogger {
			debug = vi.fn();
			info = vi.fn();
			warn = vi.fn();
			error = vi.fn();
		},
	};
});

vi.mock('./mcp-server-manager', () => ({
	McpServerManager: vi.fn(),
}));

vi.mock('../streams/streamable', () => ({
	Streamable: vi.fn(),
}));

describe('SessionsManager', () => {
	let sessionsManager: SessionsManager;
	let mockStreamableInstance: any;
	let mockServer: any;
	let mockAcpAgent: AcpAgent;
	let mockMcpServerManagerInstance: any;
	const MockedMcpServerManagerInstance = vi.mocked(McpServerManager).prototype;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Setup mock streamable instance
		mockStreamableInstance = {
			push: vi.fn(),
			end: vi.fn(),
			error: vi.fn(),
		};

		// Setup mock server with address
		mockServer = {
			address: vi.fn().mockReturnValue({
				port: 3000,
			} as AddressInfo),
		};

		// Setup mock MCP server manager instance
		mockMcpServerManagerInstance = {
			start: vi.fn().mockResolvedValue(mockServer),
			close: vi.fn().mockResolvedValue(undefined),
		};

		// Setup mock ACP agent
		mockAcpAgent = {} as AcpAgent;

		// Configure mocks
		vi.mocked(uuidv7).mockReturnValue('test-session-id-123');
		vi.mocked(Streamable).mockReturnValue(mockStreamableInstance);
		vi.mocked(McpServerManager).mockReturnValue(mockMcpServerManagerInstance);

		// Create new instance for each test
		sessionsManager = new SessionsManager();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('constructor', () => {
		it('should create a new SessionsManager instance', () => {
			expect(sessionsManager).toBeInstanceOf(SessionsManager);
		});

		it('should initialize with empty sessions map', () => {
			expect(sessionsManager.getSession('non-existent')).toBeUndefined();
		});
	});

	describe('createSession', () => {
		const basicParams: NewSessionRequest = {
			cwd: '/test/directory',
			mcpServers: [],
		};

		it('should create a session with basic parameters', async () => {
			const result = await sessionsManager.createSession(basicParams);

			expect(result).toEqual({
				sessionId: 'test-session-id-123',
			});
			expect(uuidv7).toHaveBeenCalledOnce();
			expect(Streamable).toHaveBeenCalledWith();
		});

		it('should create a session with MCP servers configuration', async () => {
			const paramsWithMcp: NewSessionRequest = {
				cwd: '/test/directory',
				mcpServers: [
					{
						name: 'test-server',
						command: 'node',
						args: ['server.js'],
						env: [
							{ name: 'NODE_ENV', value: 'development' },
							{ name: 'PORT', value: '3000' },
						],
					},
				],
			};

			const result = await sessionsManager.createSession(paramsWithMcp);

			expect(result).toEqual({
				sessionId: 'test-session-id-123',
			});

			// Verify session was stored
			const session = sessionsManager.getSession('test-session-id-123');
			expect(session).toBeDefined();
			expect(session?.options?.cwd).toBe('/test/directory');
			expect(session?.options?.mcpServers).toEqual({
				'test-server': {
					type: 'stdio',
					command: 'node',
					args: ['server.js'],
					env: {
						NODE_ENV: 'development',
						PORT: '3000',
					},
				},
			});
		});

		it('should create a session with ACP agent integration', async () => {
			const clientCapabilities: ClientCapabilities = {
				fs: {
					readTextFile: true,
					writeTextFile: true,
				},
			};

			await sessionsManager.createSession(basicParams, clientCapabilities, mockAcpAgent);

			expect(McpServerManager).toHaveBeenCalledWith(
				mockAcpAgent,
				'test-session-id-123',
				clientCapabilities,
				'/test/directory',
			);
			expect(mockMcpServerManagerInstance.start).toHaveBeenCalledOnce();

			// Verify session was created and stored
			const session = sessionsManager.getSession('test-session-id-123');
			expect(session).toBeDefined();
			expect(session?.options?.mcpServers?.zcc).toEqual({
				type: 'http',
				url: 'http://127.0.0.1:3000/mcp',
				headers: {
					'x-acp-proxy-session-id': 'test-session-id-123',
				},
			});
		});

		it('should configure tools based on client capabilities', async () => {
			const clientCapabilities: ClientCapabilities = {
				fs: {
					readTextFile: true,
					writeTextFile: true,
				},
			};

			await sessionsManager.createSession(basicParams, clientCapabilities, mockAcpAgent);

			const session = sessionsManager.getSession('test-session-id-123');
			const options = session?.options;

			expect(options?.allowedTools).toContain('mcp__zcc__read_file');
			expect(options?.allowedTools).toContain('mcp__zcc__edit_file');
			expect(options?.allowedTools).toContain('mcp__zcc__write_file');
			expect(options?.allowedTools).toContain('mcp__zcc__multi_edit');
			expect(options?.disallowedTools).toContain('Read');
			expect(options?.disallowedTools).toContain('Write');
			expect(options?.disallowedTools).toContain('Edit');
			expect(options?.disallowedTools).toContain('MultiEdit');
		});

		it('should handle MCP server creation failure', async () => {
			mockMcpServerManagerInstance.start.mockRejectedValue(new Error('Failed to start MCP server'));

			await expect(sessionsManager.createSession(basicParams, undefined, mockAcpAgent)).rejects.toThrow(
				'Failed to start MCP server',
			);
		});

		it('should handle session creation internal failure', async () => {
			// Simulate failure during session creation by making Streamable throw
			vi.mocked(Streamable).mockImplementation(() => {
				throw new Error('Failed to create streamable');
			});

			await expect(sessionsManager.createSession(basicParams)).rejects.toThrow('Failed to create streamable');
		});

		it('should use default cwd when not provided', async () => {
			const paramsWithoutCwd: NewSessionRequest = {
				mcpServers: [],
			};

			const result = await sessionsManager.createSession(paramsWithoutCwd);
			const session = sessionsManager.getSession(result.sessionId);

			expect(session?.options?.cwd).toBe(process.cwd());
		});

		it('should handle empty MCP servers array', async () => {
			const paramsWithEmptyMcp: NewSessionRequest = {
				cwd: '/test/directory',
				mcpServers: [],
			};

			const result = await sessionsManager.createSession(paramsWithEmptyMcp);
			const session = sessionsManager.getSession(result.sessionId);

			expect(session?.options?.mcpServers).toEqual({});
		});

		it('should store session in sessions map', async () => {
			const result = await sessionsManager.createSession(basicParams);

			const session = sessionsManager.getSession(result.sessionId);
			expect(session).toBeDefined();
			expect(session?.input).toBe(mockStreamableInstance);
			expect(session?.abortController).toBeUndefined();
		});

		it('should handle multiple MCP servers', async () => {
			const paramsWithMultipleMcp: NewSessionRequest = {
				cwd: '/test/directory',
				mcpServers: [
					{
						name: 'server1',
						command: 'node',
						args: ['server1.js'],
					},
					{
						name: 'server2',
						command: 'python',
						args: ['server2.py'],
						env: [{ name: 'DEBUG', value: 'true' }],
					},
				],
			};

			const result = await sessionsManager.createSession(paramsWithMultipleMcp);
			const session = sessionsManager.getSession(result.sessionId);

			expect(session?.options?.mcpServers).toEqual({
				server1: {
					type: 'stdio',
					command: 'node',
					args: ['server1.js'],
					env: undefined,
				},
				server2: {
					type: 'stdio',
					command: 'python',
					args: ['server2.py'],
					env: { DEBUG: 'true' },
				},
			});
		});
	});

	describe('getSession', () => {
		it('should return undefined for non-existent session', () => {
			const result = sessionsManager.getSession('non-existent-id');
			expect(result).toBeUndefined();
		});

		it('should return existing session', async () => {
			const createResult = await sessionsManager.createSession({
				cwd: '/test',
				mcpServers: [],
			});

			const session = sessionsManager.getSession(createResult.sessionId);
			expect(session).toBeDefined();
			expect(session?.input).toBe(mockStreamableInstance);
			expect(session?.abortController).toBeUndefined();
		});

		it('should return correct session for multiple sessions', async () => {
			vi.mocked(uuidv7).mockReturnValueOnce('session-1').mockReturnValueOnce('session-2');

			const result1 = await sessionsManager.createSession({ mcpServers: [] });
			const result2 = await sessionsManager.createSession({ mcpServers: [] });

			const session1 = sessionsManager.getSession(result1.sessionId);
			const session2 = sessionsManager.getSession(result2.sessionId);

			expect(session1).toBeDefined();
		});
	});

	describe('cancelSession', () => {
		it('should cancel existing session', async () => {
			const createResult = await sessionsManager.createSession({
				mcpServers: [],
			});

			// Set up an abort controller to simulate an active session
			const session = sessionsManager.getSession(createResult.sessionId);
			const mockAbortController = {
				abort: vi.fn(),
				signal: { aborted: false },
			};
			if (session) {
				session.abortController = mockAbortController as any;
			}

			const cancelParams: CancelNotification = {
				sessionId: createResult.sessionId,
			};

			await sessionsManager.cancelSession(cancelParams);

			expect(mockAbortController.abort).toHaveBeenCalledOnce();
		});

		it('should throw error for non-existent session', async () => {
			const cancelParams: CancelNotification = {
				sessionId: 'non-existent-id',
			};

			await expect(sessionsManager.cancelSession(cancelParams)).rejects.toThrow('Session not found');
		});

		it('should handle session without abort controller', async () => {
			const createResult = await sessionsManager.createSession({
				mcpServers: [],
			});

			const cancelParams: CancelNotification = {
				sessionId: createResult.sessionId,
			};

			// Should not throw even if no abort controller is present
			await expect(sessionsManager.cancelSession(cancelParams)).resolves.toBeUndefined();
		});

		it('should not affect other sessions when cancelling one', async () => {
			vi.mocked(uuidv7).mockReturnValueOnce('session-1').mockReturnValueOnce('session-2');

			const result1 = await sessionsManager.createSession({ mcpServers: [] });
			const result2 = await sessionsManager.createSession({ mcpServers: [] });

			// Set up abort controllers for both sessions
			const session1 = sessionsManager.getSession(result1.sessionId);
			const session2 = sessionsManager.getSession(result2.sessionId);

			const mockAbortController1 = {
				abort: vi.fn(),
				signal: { aborted: false },
			};
			const mockAbortController2 = {
				abort: vi.fn(),
				signal: { aborted: false },
			};

			if (session1) session1.abortController = mockAbortController1 as any;
			if (session2) session2.abortController = mockAbortController2 as any;

			await sessionsManager.cancelSession({ sessionId: result1.sessionId });

			expect(mockAbortController1.abort).toHaveBeenCalledOnce();
			expect(mockAbortController2.abort).not.toHaveBeenCalled();
		});
	});

	describe('error handling scenarios', () => {
		it('should handle streamable creation errors', async () => {
			vi.mocked(Streamable).mockImplementation(() => {
				throw new Error('Streamable creation failed');
			});

			await expect(sessionsManager.createSession({ mcpServers: [] })).rejects.toThrow('Streamable creation failed');
		});

		it('should handle UUID generation failure', async () => {
			vi.mocked(uuidv7).mockImplementation(() => {
				throw new Error('UUID generation failed');
			});

			await expect(sessionsManager.createSession({ mcpServers: [] })).rejects.toThrow('UUID generation failed');
		});
	});

	describe('session state management', () => {
		it('should maintain session state correctly', async () => {
			const result = await sessionsManager.createSession({ mcpServers: [] });

			const session = sessionsManager.getSession(result.sessionId);
			expect(session?.abortController).toBeUndefined();
			expect(session?.input).toBe(mockStreamableInstance);

			// Set up abort controller to simulate active session
			const mockAbortController = {
				abort: vi.fn(),
				signal: { aborted: false },
			};
			if (session) {
				session.abortController = mockAbortController as any;
			}

			// Cancel session and verify abort was called
			await sessionsManager.cancelSession({ sessionId: result.sessionId });

			expect(mockAbortController.abort).toHaveBeenCalledOnce();

			// Session should still exist with same properties
			const updatedSession = sessionsManager.getSession(result.sessionId);
			expect(updatedSession?.input).toBe(mockStreamableInstance);
		});
	});
});
