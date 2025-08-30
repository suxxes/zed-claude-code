import type { SDKAssistantMessage, SDKUserMessage } from '@anthropic-ai/claude-code';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheManager } from '../managers/cache-manager';
import type { ToolsManager } from '../managers/tools-manager';
import { ClaudeToAcpTransformer } from './claude-to-acp-transformer';

// Mock dependencies
vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	})),
}));

describe('ClaudeToAcpTransformer', () => {
	let transformer: ClaudeToAcpTransformer;
	let mockCacheManager: CacheManager;
	let mockToolsManager: ToolsManager;
	const sessionId = 'test-session-123';

	beforeEach(() => {
		transformer = new ClaudeToAcpTransformer();

		// Mock CacheManager
		mockCacheManager = {
			setToolUse: vi.fn(),
			getToolUse: vi.fn(),
			getAllFileContents: vi.fn().mockReturnValue(new Map()),
		} as unknown as CacheManager;

		// Mock ToolsManager
		mockToolsManager = {
			convertPlanEntries: vi.fn(),
			getToolInfoFromToolUse: vi.fn(),
			getToolUpdateFromResult: vi.fn(),
		} as unknown as ToolsManager;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create a new ClaudeToAcpTransformer instance', () => {
			expect(transformer).toBeInstanceOf(ClaudeToAcpTransformer);
		});
	});

	describe('transform', () => {
		describe('text chunks', () => {
			it('should transform text chunks to agent_message_chunk updates', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [{ type: 'text', text: 'Hello, world!' }],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(result[0]).toEqual({
					sessionId,
					update: {
						sessionUpdate: 'agent_message_chunk',
						content: {
							type: 'text',
							text: 'Hello, world!',
						},
					},
				});
			});

			it('should handle multiple text chunks', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [
							{ type: 'text', text: 'First chunk' },
							{ type: 'text', text: 'Second chunk' },
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(2);
				expect(result[0].update).toMatchObject({
					sessionUpdate: 'agent_message_chunk',
					content: { type: 'text', text: 'First chunk' },
				});
				expect(result[1].update).toMatchObject({
					sessionUpdate: 'agent_message_chunk',
					content: { type: 'text', text: 'Second chunk' },
				});
			});

			it('should handle empty text', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [{ type: 'text', text: '' }],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(result[0].update).toMatchObject({
					sessionUpdate: 'agent_message_chunk',
					content: { type: 'text', text: '' },
				});
			});
		});

		describe('thinking chunks', () => {
			it('should transform thinking chunks to agent_thought_chunk updates', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [{ type: 'thinking', thinking: 'I need to consider...' }],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(result[0]).toEqual({
					sessionId,
					update: {
						sessionUpdate: 'agent_thought_chunk',
						content: {
							type: 'text',
							text: 'I need to consider...',
						},
					},
				});
			});
		});

		describe('image chunks', () => {
			it('should transform base64 image chunks', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'image',
								source: {
									type: 'base64',
									data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
									media_type: 'image/png',
								},
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(result[0]).toEqual({
					sessionId,
					update: {
						sessionUpdate: 'agent_message_chunk',
						content: {
							type: 'image',
							data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
							mimeType: 'image/png',
							uri: undefined,
						},
					},
				});
			});

			it('should transform URL image chunks', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'image',
								source: {
									type: 'url',
									url: 'https://example.com/image.png',
								},
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(result[0]).toEqual({
					sessionId,
					update: {
						sessionUpdate: 'agent_message_chunk',
						content: {
							type: 'image',
							data: '',
							mimeType: '',
							uri: 'https://example.com/image.png',
						},
					},
				});
			});
		});

		describe('tool_use chunks', () => {
			beforeEach(() => {
				vi.mocked(mockToolsManager.getToolInfoFromToolUse).mockReturnValue({
					title: 'Test Tool',
					kind: 'bash',
					content: [{ type: 'text', text: 'Tool content' }],
				});
			});

			it('should handle regular tool_use chunks', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_use',
								id: 'tool-123',
								name: 'TestTool',
								input: { param: 'value' },
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(mockCacheManager.setToolUse).toHaveBeenCalledWith('tool-123', {
					type: 'tool_use',
					id: 'tool-123',
					name: 'TestTool',
					input: { param: 'value' },
				});

				expect(mockToolsManager.getToolInfoFromToolUse).toHaveBeenCalledWith(
					{
						type: 'tool_use',
						id: 'tool-123',
						name: 'TestTool',
						input: { param: 'value' },
					},
					new Map(),
				);

				expect(result).toHaveLength(1);
				expect(result[0]).toEqual({
					sessionId,
					update: {
						toolCallId: 'tool-123',
						sessionUpdate: 'tool_call',
						rawInput: { param: 'value' },
						status: 'pending',
						title: 'Test Tool',
						kind: 'bash',
						content: [{ type: 'text', text: 'Tool content' }],
					},
				});
			});

			it('should handle TodoWrite tool_use chunks specially', () => {
				const planEntries = [
					{
						id: '1',
						content: 'Task 1',
						status: 'pending' as const,
						priority: 'medium' as const,
					},
				];

				vi.mocked(mockToolsManager.convertPlanEntries).mockReturnValue(planEntries);

				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_use',
								id: 'todo-123',
								name: 'TodoWrite',
								input: { todos: [{ content: 'Task 1', status: 'pending', priority: 'medium', id: '1' }] },
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(mockCacheManager.setToolUse).toHaveBeenCalledWith('todo-123', {
					type: 'tool_use',
					id: 'todo-123',
					name: 'TodoWrite',
					input: { todos: [{ content: 'Task 1', status: 'pending', priority: 'medium', id: '1' }] },
				});

				expect(mockToolsManager.convertPlanEntries).toHaveBeenCalledWith({
					todos: [{ content: 'Task 1', status: 'pending', priority: 'medium', id: '1' }],
				});

				expect(result).toHaveLength(1);
				expect(result[0]).toEqual({
					sessionId,
					update: {
						sessionUpdate: 'plan',
						entries: planEntries,
					},
				});
			});

			it('should handle tool_use with complex input', () => {
				const complexInput = {
					command: 'ls -la',
					options: { recursive: true },
					paths: ['/home', '/var'],
				};

				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_use',
								id: 'complex-tool-123',
								name: 'ComplexTool',
								input: complexInput,
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(mockCacheManager.setToolUse).toHaveBeenCalledWith('complex-tool-123', {
					type: 'tool_use',
					id: 'complex-tool-123',
					name: 'ComplexTool',
					input: complexInput,
				});

				expect(result[0].update).toMatchObject({
					rawInput: complexInput,
				});
			});
		});

		describe('tool_result chunks', () => {
			beforeEach(() => {
				vi.mocked(mockToolsManager.getToolUpdateFromResult).mockReturnValue({
					title: 'Updated Tool',
					content: [{ type: 'text', text: 'Result content' }],
				});
			});

			it('should handle successful tool_result chunks', () => {
				const cachedToolUse = {
					type: 'tool_use' as const,
					id: 'tool-123',
					name: 'TestTool',
					input: { param: 'value' },
				};

				vi.mocked(mockCacheManager.getToolUse).mockReturnValue(cachedToolUse);

				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_result',
								tool_use_id: 'tool-123',
								content: 'Success result',
								is_error: false,
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(mockCacheManager.getToolUse).toHaveBeenCalledWith('tool-123');
				expect(mockToolsManager.getToolUpdateFromResult).toHaveBeenCalledWith(
					{
						type: 'tool_result',
						tool_use_id: 'tool-123',
						content: 'Success result',
						is_error: false,
					},
					cachedToolUse,
				);

				expect(result).toHaveLength(1);
				expect(result[0]).toEqual({
					sessionId,
					update: {
						toolCallId: 'tool-123',
						sessionUpdate: 'tool_call_update',
						status: 'completed',
						title: 'Updated Tool',
						content: [{ type: 'text', text: 'Result content' }],
					},
				});
			});

			it('should handle error tool_result chunks', () => {
				const cachedToolUse = {
					type: 'tool_use' as const,
					id: 'tool-456',
					name: 'FailingTool',
					input: { param: 'value' },
				};

				vi.mocked(mockCacheManager.getToolUse).mockReturnValue(cachedToolUse);

				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_result',
								tool_use_id: 'tool-456',
								content: 'Error occurred',
								is_error: true,
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(result[0]).toEqual({
					sessionId,
					update: {
						toolCallId: 'tool-456',
						sessionUpdate: 'tool_call_update',
						status: 'failed',
						title: 'Updated Tool',
						content: [{ type: 'text', text: 'Result content' }],
					},
				});
			});

			it('should handle tool_result with no cached tool_use', () => {
				vi.mocked(mockCacheManager.getToolUse).mockReturnValue(undefined);

				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_result',
								tool_use_id: 'unknown-tool',
								content: 'Result content',
								is_error: false,
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(mockToolsManager.getToolUpdateFromResult).toHaveBeenCalledWith(
					{
						type: 'tool_result',
						tool_use_id: 'unknown-tool',
						content: 'Result content',
						is_error: false,
					},
					undefined,
				);

				expect(result).toHaveLength(1);
				expect(result[0].update).toMatchObject({
					toolCallId: 'unknown-tool',
					sessionUpdate: 'tool_call_update',
					status: 'completed',
				});
			});

			it('should handle tool_result with empty content', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_result',
								tool_use_id: 'empty-tool',
								content: '',
								is_error: false,
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(result[0].update).toMatchObject({
					toolCallId: 'empty-tool',
					sessionUpdate: 'tool_call_update',
					status: 'completed',
				});
			});
		});

		describe('mixed chunk types', () => {
			it('should handle messages with multiple different chunk types', () => {
				vi.mocked(mockToolsManager.getToolInfoFromToolUse).mockReturnValue({
					title: 'Mixed Tool',
					kind: 'bash',
					content: [{ type: 'text', text: 'Tool info' }],
				});

				vi.mocked(mockToolsManager.getToolUpdateFromResult).mockReturnValue({
					title: 'Result Tool',
					content: [{ type: 'text', text: 'Tool result' }],
				});

				const cachedToolUse = {
					type: 'tool_use' as const,
					id: 'tool-789',
					name: 'MixedTool',
					input: {},
				};

				vi.mocked(mockCacheManager.getToolUse).mockReturnValue(cachedToolUse);

				const message: SDKAssistantMessage = {
					message: {
						content: [
							{ type: 'text', text: 'Starting task...' },
							{ type: 'thinking', thinking: 'Let me think about this...' },
							{
								type: 'tool_use',
								id: 'tool-789',
								name: 'MixedTool',
								input: { command: 'test' },
							},
							{ type: 'text', text: 'Tool executed' },
							{
								type: 'tool_result',
								tool_use_id: 'tool-789',
								content: 'Success',
								is_error: false,
							},
							{ type: 'text', text: 'Task completed!' },
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(6);

				// Check each chunk transformation
				expect(result[0].update).toMatchObject({
					sessionUpdate: 'agent_message_chunk',
					content: { type: 'text', text: 'Starting task...' },
				});

				expect(result[1].update).toMatchObject({
					sessionUpdate: 'agent_thought_chunk',
					content: { type: 'text', text: 'Let me think about this...' },
				});

				expect(result[2].update).toMatchObject({
					toolCallId: 'tool-789',
					sessionUpdate: 'tool_call',
					status: 'pending',
					title: 'Mixed Tool',
				});

				expect(result[3].update).toMatchObject({
					sessionUpdate: 'agent_message_chunk',
					content: { type: 'text', text: 'Tool executed' },
				});

				expect(result[4].update).toMatchObject({
					toolCallId: 'tool-789',
					sessionUpdate: 'tool_call_update',
					status: 'completed',
					title: 'Result Tool',
				});

				expect(result[5].update).toMatchObject({
					sessionUpdate: 'agent_message_chunk',
					content: { type: 'text', text: 'Task completed!' },
				});
			});
		});

		describe('error handling', () => {
			it('should throw error for unknown chunk types', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [{ type: 'unknown_type', data: 'test' }] as any,
					},
				} as SDKAssistantMessage;

				expect(() => {
					transformer.transform({
						message,
						sessionId,
						toolsManager: mockToolsManager,
						cacheManager: mockCacheManager,
					});
				}).toThrow('unhandled chunk type: unknown_type');
			});

			it('should handle empty message content', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(0);
			});

			it('should handle malformed tool_use chunks', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_use',
								id: '',
								name: '',
								input: null,
							},
						],
					},
				} as SDKAssistantMessage;

				// Should not throw, but should call managers with the malformed data
				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(mockCacheManager.setToolUse).toHaveBeenCalledWith('', {
					type: 'tool_use',
					id: '',
					name: '',
					input: null,
				});
			});

			it('should handle malformed tool_result chunks', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_result',
								tool_use_id: '',
								content: '',
								is_error: false,
							},
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(result[0].update).toMatchObject({
					toolCallId: '',
					sessionUpdate: 'tool_call_update',
					status: 'completed',
				});
			});
		});

		describe('special chunk types', () => {
			it('should handle redacted_thinking chunks as unknown type', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [{ type: 'redacted_thinking' }] as any,
					},
				} as SDKAssistantMessage;

				expect(() => {
					transformer.transform({
						message,
						sessionId,
						toolsManager: mockToolsManager,
						cacheManager: mockCacheManager,
					});
				}).toThrow('unhandled chunk type: redacted_thinking');
			});

			it('should handle document chunks as unknown type', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [{ type: 'document' }] as any,
					},
				} as SDKAssistantMessage;

				expect(() => {
					transformer.transform({
						message,
						sessionId,
						toolsManager: mockToolsManager,
						cacheManager: mockCacheManager,
					});
				}).toThrow('unhandled chunk type: document');
			});

			it('should handle web_search_tool_result chunks as unknown type', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [{ type: 'web_search_tool_result' }] as any,
					},
				} as SDKAssistantMessage;

				expect(() => {
					transformer.transform({
						message,
						sessionId,
						toolsManager: mockToolsManager,
						cacheManager: mockCacheManager,
					});
				}).toThrow('unhandled chunk type: web_search_tool_result');
			});

			it('should handle untagged_text chunks as unknown type', () => {
				const message: SDKAssistantMessage = {
					message: {
						content: [{ type: 'untagged_text', text: 'untagged content' }] as any,
					},
				} as SDKAssistantMessage;

				expect(() => {
					transformer.transform({
						message,
						sessionId,
						toolsManager: mockToolsManager,
						cacheManager: mockCacheManager,
					});
				}).toThrow('unhandled chunk type: untagged_text');
			});
		});

		describe('integration with managers', () => {
			it('should pass file contents from cache manager to tools manager', () => {
				const fileContents = new Map([
					['/path/to/file1.ts', 'file1 content'],
					['/path/to/file2.js', 'file2 content'],
				]);

				vi.mocked(mockCacheManager.getAllFileContents).mockReturnValue(fileContents);

				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_use',
								id: 'tool-integration',
								name: 'IntegrationTool',
								input: { test: 'data' },
							},
						],
					},
				} as SDKAssistantMessage;

				transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(mockCacheManager.getAllFileContents).toHaveBeenCalled();
				expect(mockToolsManager.getToolInfoFromToolUse).toHaveBeenCalledWith(expect.any(Object), fileContents);
			});

			it('should handle tools manager throwing errors', () => {
				vi.mocked(mockToolsManager.getToolInfoFromToolUse).mockImplementation(() => {
					throw new Error('Tools manager error');
				});

				const message: SDKAssistantMessage = {
					message: {
						content: [
							{
								type: 'tool_use',
								id: 'error-tool',
								name: 'ErrorTool',
								input: { test: 'data' },
							},
						],
					},
				} as SDKAssistantMessage;

				expect(() => {
					transformer.transform({
						message,
						sessionId,
						toolsManager: mockToolsManager,
						cacheManager: mockCacheManager,
					});
				}).toThrow('Tools manager error');
			});

			it('should handle cache manager operations', () => {
				const toolUse = {
					type: 'tool_use' as const,
					id: 'cache-test',
					name: 'CacheTool',
					input: { cached: true },
				};

				const message: SDKAssistantMessage = {
					message: {
						content: [toolUse],
					},
				} as SDKAssistantMessage;

				transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(mockCacheManager.setToolUse).toHaveBeenCalledWith('cache-test', toolUse);
			});
		});

		describe('user messages', () => {
			it('should handle user messages same as assistant messages', () => {
				const message: SDKUserMessage = {
					message: {
						content: [{ type: 'text', text: 'User input' }],
					},
				} as SDKUserMessage;

				const result = transformer.transform({
					message,
					sessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(1);
				expect(result[0]).toEqual({
					sessionId,
					update: {
						sessionUpdate: 'agent_message_chunk',
						content: {
							type: 'text',
							text: 'User input',
						},
					},
				});
			});
		});

		describe('session id propagation', () => {
			it('should include session id in all returned notifications', () => {
				const customSessionId = 'custom-session-456';
				const message: SDKAssistantMessage = {
					message: {
						content: [
							{ type: 'text', text: 'First' },
							{ type: 'thinking', thinking: 'Second' },
							{ type: 'text', text: 'Third' },
						],
					},
				} as SDKAssistantMessage;

				const result = transformer.transform({
					message,
					sessionId: customSessionId,
					toolsManager: mockToolsManager,
					cacheManager: mockCacheManager,
				});

				expect(result).toHaveLength(3);
				result.forEach((notification) => {
					expect(notification.sessionId).toBe(customSessionId);
				});
			});
		});
	});
});
