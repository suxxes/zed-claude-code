import type {
	AuthenticateRequest,
	CancelNotification,
	Client,
	ClientCapabilities,
	InitializeRequest,
	NewSessionRequest,
	PromptRequest,
	ReadTextFileRequest,
	ReadTextFileResponse,
	WriteTextFileRequest,
	WriteTextFileResponse,
} from '@zed-industries/agent-client-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheManager } from '../managers/cache-manager';
import type { SessionsManager } from '../managers/sessions-manager';
import type { ToolsManager } from '../managers/tools-manager';
import type { AcpToClaudeTransformer } from '../transformers/acp-to-claude-transformer';
import type { ClaudeToAcpTransformer } from '../transformers/claude-to-acp-transformer';

import { AcpAgent } from './acp-agent';

// Mock all dependencies
vi.mock('@zed-industries/agent-client-protocol', () => ({
	RequestError: {
		authRequired: vi.fn(() => ({ code: -32001, message: 'Authentication required' })),
	},
}));

vi.mock('../managers/sessions-manager', () => ({
	SessionsManager: vi.fn().mockImplementation(() => ({
		createSession: vi.fn(),
		getSession: vi.fn(),
		cancelSession: vi.fn(),
	})),
}));

vi.mock('../managers/cache-manager', () => ({
	CacheManager: vi.fn().mockImplementation(() => ({
		setFileContent: vi.fn(),
		getFileContent: vi.fn(),
		clearCache: vi.fn(),
	})),
}));

vi.mock('../managers/tools-manager', () => ({
	ToolsManager: vi.fn().mockImplementation(() => ({
		getAvailableTools: vi.fn(),
		executeTool: vi.fn(),
	})),
}));

vi.mock('../transformers/acp-to-claude-transformer', () => ({
	AcpToClaudeTransformer: vi.fn().mockImplementation(() => ({
		transform: vi.fn(),
	})),
}));

vi.mock('../transformers/claude-to-acp-transformer', () => ({
	ClaudeToAcpTransformer: vi.fn().mockImplementation(() => ({
		transform: vi.fn(),
	})),
}));

vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	})),
}));

describe('AcpAgent', () => {
	let agent: AcpAgent;
	let mockClient: Client;
	let mockSessionsManager: SessionsManager;
	let mockCacheManager: CacheManager;
	let mockToolsManager: ToolsManager;
	let mockAcpToClaudeTransformer: AcpToClaudeTransformer;
	let mockClaudeToAcpTransformer: ClaudeToAcpTransformer;

	beforeEach(() => {
		mockClient = {
			sessionUpdate: vi.fn(),
			readTextFile: vi.fn(),
			writeTextFile: vi.fn(),
		} as unknown as Client;

		agent = new AcpAgent(mockClient);

		// Get references to mocked instances
		mockSessionsManager = agent.sessionsManager;
		mockCacheManager = agent.cacheManager;
		mockToolsManager = agent.toolsManager;
		mockAcpToClaudeTransformer = agent.acpToClaudeTransformer;
		mockClaudeToAcpTransformer = agent.claudeToAcpTransformer;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create a new AcpAgent instance', () => {
			expect(agent).toBeInstanceOf(AcpAgent);
		});

		it('should store the client reference', () => {
			expect(agent.client).toBe(mockClient);
		});

		it('should initialize all managers and transformers', () => {
			expect(agent.sessionsManager).toBeDefined();
			expect(agent.cacheManager).toBeDefined();
			expect(agent.toolsManager).toBeDefined();
			expect(agent.acpToClaudeTransformer).toBeDefined();
			expect(agent.claudeToAcpTransformer).toBeDefined();
		});

		it('should not have client capabilities initially', () => {
			expect(agent.clientCapabilities).toBeUndefined();
		});
	});

	describe('getSessionsManager', () => {
		it('should return the sessions manager instance', () => {
			const sessionsManager = agent.getSessionsManager();
			expect(sessionsManager).toBe(mockSessionsManager);
		});
	});

	describe('initialize', () => {
		const mockInitializeRequest: InitializeRequest = {
			protocolVersion: 1,
			clientCapabilities: {
				notification: {
					progress: true,
				},
				experimental: {},
			},
		};

		it('should store client capabilities', async () => {
			await agent.initialize(mockInitializeRequest);

			expect(agent.clientCapabilities).toBe(mockInitializeRequest.clientCapabilities);
		});

		it('should return correct agent capabilities and auth methods', async () => {
			const response = await agent.initialize(mockInitializeRequest);

			expect(response).toEqual({
				protocolVersion: 1,
				agentCapabilities: {
					promptCapabilities: { image: true, embeddedContext: true },
				},
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
			});
		});

		it('should handle requests with different protocol versions', async () => {
			const request = { ...mockInitializeRequest, protocolVersion: 2 };
			const response = await agent.initialize(request);

			expect(response.protocolVersion).toBe(1);
		});

		it('should handle requests without client capabilities', async () => {
			const request = { protocolVersion: 1 } as InitializeRequest;
			const response = await agent.initialize(request);

			expect(agent.clientCapabilities).toBeUndefined();
			expect(response.protocolVersion).toBe(1);
		});
	});

	describe('authenticate', () => {
		it('should throw not implemented error', async () => {
			const mockAuthRequest: AuthenticateRequest = {
				authMethod: 'claude-login',
				authData: {},
			};

			await expect(agent.authenticate(mockAuthRequest)).rejects.toThrow('Method not implemented.');
		});
	});

	describe('newSession', () => {
		const mockNewSessionRequest: NewSessionRequest = {
			context: { contextPaths: [] },
		};

		it('should delegate to sessions manager', async () => {
			const mockResponse = { sessionId: 'test-session-id' };
			vi.mocked(mockSessionsManager.createSession).mockResolvedValue(mockResponse);

			const response = await agent.newSession(mockNewSessionRequest);

			expect(mockSessionsManager.createSession).toHaveBeenCalledWith(
				mockNewSessionRequest,
				agent.clientCapabilities,
				agent,
			);
			expect(response).toBe(mockResponse);
		});

		it('should handle session creation errors', async () => {
			const error = new Error('Session creation failed');
			vi.mocked(mockSessionsManager.createSession).mockRejectedValue(error);

			await expect(agent.newSession(mockNewSessionRequest)).rejects.toThrow('Session creation failed');
		});

		it('should pass client capabilities to session creation', async () => {
			const clientCapabilities: ClientCapabilities = {
				notification: { progress: true },
				experimental: {},
			};
			agent.clientCapabilities = clientCapabilities;

			const mockResponse = { sessionId: 'test-session-id' };
			vi.mocked(mockSessionsManager.createSession).mockResolvedValue(mockResponse);

			await agent.newSession(mockNewSessionRequest);

			expect(mockSessionsManager.createSession).toHaveBeenCalledWith(mockNewSessionRequest, clientCapabilities, agent);
		});
	});

	describe('prompt', () => {
		const mockPromptRequest: PromptRequest = {
			sessionId: 'test-session-id',
			prompt: [{ type: 'text', text: 'Hello Claude' }],
		};

		describe('session validation', () => {
			it('should throw error if session not found', async () => {
				vi.mocked(mockSessionsManager.getSession).mockReturnValue(null);

				await expect(agent.prompt(mockPromptRequest)).rejects.toThrow('Session not found');
			});

			it('should reset abort controller signal', async () => {
				const mockSessionQuery = {
					next: vi.fn().mockResolvedValue({ done: true }),
					interrupt: vi.fn(),
				};
				const mockSession = {
					abortController: {
						signal: { aborted: true },
						abort: vi.fn(),
					},
					input: { push: vi.fn() },
					options: {},
					query: mockSessionQuery,
				};
				vi.mocked(mockSessionsManager.getSession).mockReturnValue(mockSession);

				await expect(agent.prompt(mockPromptRequest)).rejects.toThrow('Session did not end in result');

				// AbortController should be reset/recreated for new prompt
				expect(mockSession.abortController).toBeDefined();
			});
		});

		describe('message processing', () => {
			let mockSession: any;

			beforeEach(() => {
				mockSession = {
					abortController: new AbortController(),
					input: { push: vi.fn() },
					options: {},
					query: {
						next: vi.fn(),
						interrupt: vi.fn(),
					},
				};
				vi.mocked(mockSessionsManager.getSession).mockReturnValue(mockSession);
			});

			it('should handle system messages', async () => {
				mockSession.query.next
					.mockResolvedValueOnce({ value: { type: 'system', message: 'System message' }, done: false })
					.mockResolvedValueOnce({ done: true });

				await expect(agent.prompt(mockPromptRequest)).rejects.toThrow('Session did not end in result');
			});

			it('should handle successful result messages', async () => {
				mockSession.query.next.mockResolvedValueOnce({
					value: { type: 'result', subtype: 'success', result: 'Success' },
					done: false,
				});

				const response = await agent.prompt(mockPromptRequest);

				expect(response).toEqual({ stopReason: 'end_turn' });
			});

			it('should handle authentication required in result', async () => {
				mockSession.query.next.mockResolvedValueOnce({
					value: { type: 'result', subtype: 'success', result: 'Please run /login' },
					done: false,
				});

				await expect(agent.prompt(mockPromptRequest)).rejects.toThrow();
			});

			it('should handle error during execution', async () => {
				mockSession.query.next.mockResolvedValueOnce({
					value: { type: 'result', subtype: 'error_during_execution' },
					done: false,
				});

				const response = await agent.prompt(mockPromptRequest);

				expect(response).toEqual({ stopReason: 'refusal' });
			});

			it('should handle max turns error', async () => {
				mockSession.query.next.mockResolvedValueOnce({
					value: { type: 'result', subtype: 'error_max_turns' },
					done: false,
				});

				const response = await agent.prompt(mockPromptRequest);

				expect(response).toEqual({ stopReason: 'max_turn_requests' });
			});

			it('should handle unknown result subtypes', async () => {
				mockSession.query.next.mockResolvedValueOnce({ value: { type: 'result', subtype: 'unknown' }, done: false });

				const response = await agent.prompt(mockPromptRequest);

				expect(response).toEqual({ stopReason: 'refusal' });
			});

			it('should handle user messages', async () => {
				const mockMessage = {
					type: 'user',
					message: {
						model: 'claude-3',
						content: [{ text: 'Hello' }],
					},
				};
				const mockNotifications = [{ type: 'message_start' }];

				mockSession.query.next
					.mockResolvedValueOnce({ value: mockMessage, done: false })
					.mockResolvedValueOnce({ value: { type: 'result', subtype: 'success', result: 'Done' }, done: false });

				vi.mocked(mockClaudeToAcpTransformer.transform).mockReturnValue(mockNotifications);

				const response = await agent.prompt(mockPromptRequest);

				expect(mockClaudeToAcpTransformer.transform).toHaveBeenCalledWith({
					message: mockMessage,
					sessionId: mockPromptRequest.sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});
				expect(mockClient.sessionUpdate).toHaveBeenCalledWith(mockNotifications[0]);
				expect(response).toEqual({ stopReason: 'end_turn' });
			});

			it('should handle assistant messages', async () => {
				const mockMessage = {
					type: 'assistant',
					message: {
						model: 'claude-3',
						content: [{ text: 'Hello back!' }],
					},
				};
				const mockNotifications = [{ type: 'content_delta' }];

				mockSession.query.next
					.mockResolvedValueOnce({ value: mockMessage, done: false })
					.mockResolvedValueOnce({ value: { type: 'result', subtype: 'success', result: 'Done' }, done: false });

				vi.mocked(mockClaudeToAcpTransformer.transform).mockReturnValue(mockNotifications);

				const response = await agent.prompt(mockPromptRequest);

				expect(mockClaudeToAcpTransformer.transform).toHaveBeenCalledWith({
					message: mockMessage,
					sessionId: mockPromptRequest.sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});
				expect(mockClient.sessionUpdate).toHaveBeenCalledWith(mockNotifications[0]);
				expect(response).toEqual({ stopReason: 'end_turn' });
			});

			it('should handle synthetic authentication error messages', async () => {
				const mockMessage = {
					type: 'assistant',
					message: {
						model: '<synthetic>',
						content: [{ text: 'Please run /login' }],
					},
				};

				mockSession.query.next.mockResolvedValueOnce({ value: mockMessage, done: false });

				await expect(agent.prompt(mockPromptRequest)).rejects.toThrow();
			});

			it('should handle multiple notifications from transformer', async () => {
				const mockMessage = {
					type: 'assistant',
					message: {
						model: 'claude-3',
						content: [{ text: 'Multi-part response' }],
					},
				};
				const mockNotifications = [
					{ type: 'content_block_start' },
					{ type: 'content_delta' },
					{ type: 'content_block_stop' },
				];

				mockSession.query.next
					.mockResolvedValueOnce({ value: mockMessage, done: false })
					.mockResolvedValueOnce({ value: { type: 'result', subtype: 'success', result: 'Done' }, done: false });

				vi.mocked(mockClaudeToAcpTransformer.transform).mockReturnValue(mockNotifications);

				const response = await agent.prompt(mockPromptRequest);

				expect(mockClient.sessionUpdate).toHaveBeenCalledTimes(3);
				expect(mockClient.sessionUpdate).toHaveBeenNthCalledWith(1, mockNotifications[0]);
				expect(mockClient.sessionUpdate).toHaveBeenNthCalledWith(2, mockNotifications[1]);
				expect(mockClient.sessionUpdate).toHaveBeenNthCalledWith(3, mockNotifications[2]);
				expect(response).toEqual({ stopReason: 'end_turn' });
			});

			it('should throw error for unknown message type', async () => {
				mockSession.query.next.mockResolvedValueOnce({ value: { type: 'unknown_type' }, done: false });

				await expect(agent.prompt(mockPromptRequest)).rejects.toThrow(/Unreachable code reached/);
			});
		});

		describe('cancellation handling', () => {
			let mockSession: any;

			beforeEach(() => {
				mockSession = {
					abortController: new AbortController(),
					input: { push: vi.fn() },
					options: {},
					query: {
						next: vi.fn(),
						interrupt: vi.fn(),
					},
				};
				vi.mocked(mockSessionsManager.getSession).mockReturnValue(mockSession);
			});

			it('should return cancelled when session is aborted at result', async () => {
				// Session starts with AbortController, then gets aborted during processing
				mockSession.query.next.mockResolvedValueOnce({
					value: { type: 'result', subtype: 'success', result: 'Done' },
					done: false,
				});

				// Abort the session during processing
				const promptPromise = agent.prompt(mockPromptRequest);
				mockSession.abortController.abort();
				const response = await promptPromise;

				// Since abort happens during result processing, it returns cancelled
				expect(response).toEqual({ stopReason: 'cancelled' });
			});

			it('should return cancelled when session ends and is aborted', async () => {
				// Session query ends without a message, but session is aborted
				mockSession.query.next.mockResolvedValueOnce({ done: true });

				// Abort session during processing
				const promptPromise = agent.prompt(mockPromptRequest);
				mockSession.abortController.abort();
				const response = await promptPromise;

				// When done=true and session is aborted, it returns cancelled
				expect(response).toEqual({ stopReason: 'cancelled' });
			});

			it('should skip processing messages when aborted', async () => {
				const mockMessage = {
					type: 'assistant',
					message: {
						model: 'claude-3',
						content: [{ text: 'Should be skipped' }],
					},
				};

				mockSession.query.next
					.mockResolvedValueOnce({ value: mockMessage, done: false })
					.mockResolvedValueOnce({ value: { type: 'result', subtype: 'success', result: 'Done' }, done: false });

				// Ensure the transformer returns an iterable (array) when called
				vi.mocked(mockClaudeToAcpTransformer.transform).mockReturnValue([]);

				// Abort session during processing
				const promptPromise = agent.prompt(mockPromptRequest);
				mockSession.abortController.abort();
				const response = await promptPromise;

				// When aborted, assistant/user messages are skipped (continue statement)
				expect(mockClaudeToAcpTransformer.transform).not.toHaveBeenCalled();
				expect(mockClient.sessionUpdate).not.toHaveBeenCalled();
				expect(response).toEqual({ stopReason: 'cancelled' });
			});
		});

		describe('input transformation', () => {
			it('should transform and add prompt to session input', async () => {
				const mockPush = vi.fn();
				const mockSession = {
					abortController: new AbortController(),
					input: { push: mockPush },
					options: {},
					query: {
						next: vi.fn().mockResolvedValue({ done: true }),
						interrupt: vi.fn(),
					},
				};
				vi.mocked(mockSessionsManager.getSession).mockReturnValue(mockSession);

				const transformedPrompt = { role: 'user', content: 'Transformed prompt' };
				vi.mocked(mockAcpToClaudeTransformer.transform).mockReturnValue(transformedPrompt);

				await expect(agent.prompt(mockPromptRequest)).rejects.toThrow('Session did not end in result');

				expect(mockAcpToClaudeTransformer.transform).toHaveBeenCalledWith(mockPromptRequest);
				expect(mockPush).toHaveBeenCalledWith(transformedPrompt);
			});
		});

		describe('edge cases', () => {
			it('should throw error when session does not end in result', async () => {
				const mockSession = {
					abortController: new AbortController(),
					input: { push: vi.fn() },
					options: {},
					query: {
						next: vi.fn().mockResolvedValue({ done: true }),
						interrupt: vi.fn(),
					},
				};
				vi.mocked(mockSessionsManager.getSession).mockReturnValue(mockSession);

				await expect(agent.prompt(mockPromptRequest)).rejects.toThrow('Session did not end in result');
			});

			it('should handle empty message values', async () => {
				const mockSession = {
					abortController: new AbortController(),
					input: { push: vi.fn() },
					options: {},
					query: {
						next: vi.fn().mockResolvedValueOnce({ value: null, done: false }).mockResolvedValueOnce({ done: true }),
						interrupt: vi.fn(),
					},
				};
				vi.mocked(mockSessionsManager.getSession).mockReturnValue(mockSession);

				await expect(agent.prompt(mockPromptRequest)).rejects.toThrow('Session did not end in result');
			});
		});
	});

	describe('cancel', () => {
		it('should delegate to sessions manager', async () => {
			const mockCancelNotification: CancelNotification = {
				method: 'cancel',
				params: { sessionId: 'test-session-id' },
			};

			await agent.cancel(mockCancelNotification);

			expect(mockSessionsManager.cancelSession).toHaveBeenCalledWith(mockCancelNotification);
		});

		it('should handle cancellation errors', async () => {
			const mockCancelNotification: CancelNotification = {
				method: 'cancel',
				params: { sessionId: 'invalid-session-id' },
			};
			const error = new Error('Session not found');
			vi.mocked(mockSessionsManager.cancelSession).mockRejectedValue(error);

			await expect(agent.cancel(mockCancelNotification)).rejects.toThrow('Session not found');
		});
	});

	describe('readTextFile', () => {
		const mockReadRequest: ReadTextFileRequest = {
			path: '/test/file.txt',
		};

		it('should delegate to client and return response', async () => {
			const mockResponse: ReadTextFileResponse = {
				content: 'file content',
			};
			vi.mocked(mockClient.readTextFile).mockResolvedValue(mockResponse);

			const response = await agent.readTextFile(mockReadRequest);

			expect(mockClient.readTextFile).toHaveBeenCalledWith(mockReadRequest);
			expect(response).toBe(mockResponse);
		});

		it('should cache full file content when no limit or line specified', async () => {
			const mockResponse: ReadTextFileResponse = {
				content: 'full file content',
			};
			vi.mocked(mockClient.readTextFile).mockResolvedValue(mockResponse);

			await agent.readTextFile(mockReadRequest);

			expect(mockCacheManager.setFileContent).toHaveBeenCalledWith('/test/file.txt', 'full file content');
		});

		it('should not cache when limit is specified', async () => {
			const requestWithLimit = { ...mockReadRequest, limit: 100 };
			const mockResponse: ReadTextFileResponse = {
				content: 'partial content',
			};
			vi.mocked(mockClient.readTextFile).mockResolvedValue(mockResponse);

			await agent.readTextFile(requestWithLimit);

			expect(mockCacheManager.setFileContent).not.toHaveBeenCalled();
		});

		it('should not cache when line is specified', async () => {
			const requestWithLine = { ...mockReadRequest, line: 5 };
			const mockResponse: ReadTextFileResponse = {
				content: 'line content',
			};
			vi.mocked(mockClient.readTextFile).mockResolvedValue(mockResponse);

			await agent.readTextFile(requestWithLine);

			expect(mockCacheManager.setFileContent).not.toHaveBeenCalled();
		});

		it('should handle client read errors', async () => {
			const error = new Error('File not found');
			vi.mocked(mockClient.readTextFile).mockRejectedValue(error);

			await expect(agent.readTextFile(mockReadRequest)).rejects.toThrow('File not found');
		});
	});

	describe('writeTextFile', () => {
		const mockWriteRequest: WriteTextFileRequest = {
			path: '/test/output.txt',
			content: 'new file content',
		};

		it('should delegate to client and return response', async () => {
			const mockResponse: WriteTextFileResponse = {
				success: true,
			};
			vi.mocked(mockClient.writeTextFile).mockResolvedValue(mockResponse);

			const response = await agent.writeTextFile(mockWriteRequest);

			expect(mockClient.writeTextFile).toHaveBeenCalledWith(mockWriteRequest);
			expect(response).toBe(mockResponse);
		});

		it('should update cache with new content and start watching', async () => {
			const mockResponse: WriteTextFileResponse = {
				success: true,
			};
			vi.mocked(mockClient.writeTextFile).mockResolvedValue(mockResponse);

			await agent.writeTextFile(mockWriteRequest);

			expect(mockCacheManager.setFileContent).toHaveBeenCalledWith(
				'/test/output.txt',
				'new file content',
				true, // startWatching = true
			);
		});

		it('should handle client write errors', async () => {
			const error = new Error('Permission denied');
			vi.mocked(mockClient.writeTextFile).mockRejectedValue(error);

			await expect(agent.writeTextFile(mockWriteRequest)).rejects.toThrow('Permission denied');

			// Should not update cache on error
			expect(mockCacheManager.setFileContent).not.toHaveBeenCalled();
		});

		it('should handle large file writes', async () => {
			const largeContent = 'x'.repeat(10000);
			const requestWithLargeContent = { ...mockWriteRequest, content: largeContent };
			const mockResponse: WriteTextFileResponse = {
				success: true,
			};
			vi.mocked(mockClient.writeTextFile).mockResolvedValue(mockResponse);

			await agent.writeTextFile(requestWithLargeContent);

			expect(mockClient.writeTextFile).toHaveBeenCalledWith(requestWithLargeContent);
			expect(mockCacheManager.setFileContent).toHaveBeenCalledWith('/test/output.txt', largeContent, true);
		});

		it('should handle empty file writes', async () => {
			const emptyRequest = { ...mockWriteRequest, content: '' };
			const mockResponse: WriteTextFileResponse = {
				success: true,
			};
			vi.mocked(mockClient.writeTextFile).mockResolvedValue(mockResponse);

			await agent.writeTextFile(emptyRequest);

			expect(mockClient.writeTextFile).toHaveBeenCalledWith(emptyRequest);
			expect(mockCacheManager.setFileContent).toHaveBeenCalledWith('/test/output.txt', '', true);
		});
	});

	describe('integration scenarios', () => {
		beforeEach(() => {
			// Initialize agent with client capabilities
			const mockClientCapabilities: ClientCapabilities = {
				notification: { progress: true },
				experimental: {},
			};
			agent.clientCapabilities = mockClientCapabilities;
		});

		it('should handle complete session lifecycle', async () => {
			// Create session
			const mockSession = {
				abortController: new AbortController(),
				input: [],
			};
			const createSessionResponse = { sessionId: 'integration-test' };
			vi.mocked(mockSessionsManager.createSession).mockResolvedValue(createSessionResponse);
			vi.mocked(mockSessionsManager.getSession).mockReturnValue(mockSession);

			// Add query mock to the session
			mockSession.query = {
				next: vi.fn().mockResolvedValueOnce({
					value: { type: 'result', subtype: 'success', result: 'Task completed' },
					done: false,
				}),
				interrupt: vi.fn(),
			};

			// Create session
			const sessionResponse = await agent.newSession({ context: { contextPaths: [] } });
			expect(sessionResponse.sessionId).toBe('integration-test');

			// Send prompt
			const promptResponse = await agent.prompt({
				sessionId: 'integration-test',
				prompt: [{ type: 'text', text: 'Complete this task' }],
			});
			expect(promptResponse.stopReason).toBe('end_turn');

			// Cancel session
			await agent.cancel({
				method: 'cancel',
				params: { sessionId: 'integration-test' },
			});

			expect(mockSessionsManager.createSession).toHaveBeenCalled();
			expect(mockSessionsManager.cancelSession).toHaveBeenCalled();
		});

		it('should handle file operations with caching', async () => {
			// Write file
			const writeResponse: WriteTextFileResponse = { success: true };
			vi.mocked(mockClient.writeTextFile).mockResolvedValue(writeResponse);

			await agent.writeTextFile({
				path: '/integration/test.txt',
				content: 'integration test content',
			});

			// Read file
			const readResponse: ReadTextFileResponse = {
				content: 'integration test content',
			};
			vi.mocked(mockClient.readTextFile).mockResolvedValue(readResponse);

			await agent.readTextFile({ path: '/integration/test.txt' });

			// Verify caching behavior
			expect(mockCacheManager.setFileContent).toHaveBeenCalledWith(
				'/integration/test.txt',
				'integration test content',
				true,
			);
			expect(mockCacheManager.setFileContent).toHaveBeenCalledWith('/integration/test.txt', 'integration test content');
		});

		it('should handle error propagation across components', async () => {
			// Session creation error
			const sessionError = new Error('Database connection failed');
			vi.mocked(mockSessionsManager.createSession).mockRejectedValue(sessionError);

			await expect(agent.newSession({ context: { contextPaths: [] } })).rejects.toThrow('Database connection failed');

			// File operation error
			const fileError = new Error('Disk full');
			vi.mocked(mockClient.writeTextFile).mockRejectedValue(fileError);

			await expect(agent.writeTextFile({ path: '/test.txt', content: 'test' })).rejects.toThrow('Disk full');
		});
	});

	describe('boundary conditions', () => {
		it('should handle extremely long prompts', async () => {
			const mockSession = {
				abortController: new AbortController(),
				input: [],
			};
			vi.mocked(mockSessionsManager.getSession).mockReturnValue(mockSession);

			// Add query mock to the session
			mockSession.query = {
				next: vi.fn().mockResolvedValue({ done: true }),
				interrupt: vi.fn(),
			};

			const longPrompt = 'x'.repeat(100000);
			const promptRequest: PromptRequest = {
				sessionId: 'test-session',
				prompt: [{ type: 'text', text: longPrompt }],
			};

			await expect(agent.prompt(promptRequest)).rejects.toThrow('Session did not end in result');

			expect(mockAcpToClaudeTransformer.transform).toHaveBeenCalledWith(promptRequest);
		});

		it('should handle concurrent operations', async () => {
			// Simulate concurrent file operations
			const writePromises = Array.from({ length: 10 }, (_, i) =>
				agent.writeTextFile({
					path: `/concurrent/file${i}.txt`,
					content: `content ${i}`,
				}),
			);

			// Mock writeTextFile to return the actual response object (WriteTextFileResponse)
			const mockResponse = {}; // WriteTextFileResponse may be an empty object
			vi.mocked(mockClient.writeTextFile).mockResolvedValue(mockResponse);

			const results = await Promise.all(writePromises);
			expect(results).toHaveLength(10);
			// Check that we successfully completed the operations
			expect(mockClient.writeTextFile).toHaveBeenCalledTimes(10);
			expect(mockCacheManager.setFileContent).toHaveBeenCalledTimes(10);
		});

		it('should handle malformed session data gracefully', async () => {
			// Session with missing required properties
			const malformedSession = null;
			vi.mocked(mockSessionsManager.getSession).mockReturnValue(malformedSession);

			await expect(
				agent.prompt({
					sessionId: 'malformed-session',
					prompt: [{ type: 'text', text: 'test' }],
				}),
			).rejects.toThrow('Session not found');
		});
	});
});
