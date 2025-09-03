import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionToolUse, ToolResult } from './execution-tools';
import { ExecutionToolsHandler } from './execution-tools';

// Mock the Logger
vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	})),
}));

describe('ExecutionToolsHandler', () => {
	let handler: ExecutionToolsHandler;

	beforeEach(() => {
		handler = new ExecutionToolsHandler();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getToolInfo', () => {
		describe('Task tool', () => {
			it('should handle Task tool with description and prompt', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-1',
					name: 'Task',
					input: {
						description: 'Analyze code quality',
						prompt: 'Review the TypeScript code for potential improvements',
					},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'Analyze code quality',
					kind: 'think',
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Review the TypeScript code for potential improvements' },
						},
					],
				});
			});

			it('should handle Task tool with description only', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-2',
					name: 'Task',
					input: {
						description: 'Simple task',
					},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'Simple task',
					kind: 'think',
					content: [],
				});
			});

			it('should handle Task tool with prompt only', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-3',
					name: 'Task',
					input: {
						prompt: 'Execute this specific analysis',
					},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'task',
					kind: 'think',
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Execute this specific analysis' },
						},
					],
				});
			});

			it('should handle Task tool without description or prompt', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-4',
					name: 'Task',
					input: {},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'task',
					kind: 'think',
					content: [],
				});
			});

			it('should handle Task tool with undefined properties', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-5',
					name: 'Task',
					input: {
						description: undefined,
						prompt: undefined,
					},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'task',
					kind: 'think',
					content: [],
				});
			});
		});

		it('should throw error for unsupported tool', () => {
			const toolUse: ExecutionToolUse = {
				id: 'test-6',
				name: 'UnsupportedExecutionTool',
				input: {},
			};

			expect(() => handler.getToolInfo(toolUse)).toThrow('Unsupported tool: UnsupportedExecutionTool');
		});
	});

	describe('getToolUpdate', () => {
		describe('with array content', () => {
			it('should handle execution result with array content', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: 'Task output line 1' },
						{ type: 'text', text: 'Task output line 2' },
					],
				};

				const toolUse: ExecutionToolUse = {
					id: 'test-7',
					name: 'Task',
					input: { description: 'Test task' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Task output line 1' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'Task output line 2' },
						},
					],
				});
			});

			it('should handle execution result with single array item', () => {
				const toolResult: ToolResult = {
					content: [{ type: 'text', text: 'Single task output' }],
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Single task output' },
						},
					],
				});
			});

			it('should handle empty array content', () => {
				const toolResult: ToolResult = {
					content: [],
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({});
			});
		});

		describe('with string content', () => {
			it('should handle execution result with string content', () => {
				const toolResult: ToolResult = {
					content: 'Direct string output from task',
				} as any;

				const toolUse: ExecutionToolUse = {
					id: 'test-8',
					name: 'Task',
					input: { description: 'Test task' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: {
								type: 'text',
								text: 'Direct string output from task',
							},
						},
					],
				});
			});

			it('should handle empty string content', () => {
				const toolResult: ToolResult = {
					content: '',
				} as any;

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({});
			});
		});

		describe('edge cases', () => {
			it('should return empty object for undefined toolResult content', () => {
				const toolResult: ToolResult = {
					content: undefined as any,
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({});
			});

			it('should return empty object for null toolResult content', () => {
				const toolResult: ToolResult = {
					content: null as any,
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({});
			});

			it('should handle execution result without toolUse parameter', () => {
				const toolResult: ToolResult = {
					content: [{ type: 'text', text: 'Output without tool use' }],
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Output without tool use' },
						},
					],
				});
			});
		});

		describe('specific tool update scenarios', () => {
			it('should handle Task completion result', () => {
				const toolResult: ToolResult = {
					content: [{ type: 'text', text: 'Task completed successfully. Analysis shows 3 potential improvements.' }],
				};

				const toolUse: ExecutionToolUse = {
					id: 'task-1',
					name: 'Task',
					input: {
						description: 'Code analysis',
						prompt: 'Analyze the TypeScript files for improvements',
					},
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: {
								type: 'text',
								text: 'Task completed successfully. Analysis shows 3 potential improvements.',
							},
						},
					],
				});
			});
		});
	});

	describe('integration scenarios', () => {
		it('should handle complete Task delegation workflow', () => {
			// Step 1: Get tool info for task
			const toolUse: ExecutionToolUse = {
				id: 'integration-1',
				name: 'Task',
				input: {
					description: 'Security audit',
					prompt: 'Perform a security audit of the authentication module',
				},
			};

			const toolInfo = handler.getToolInfo(toolUse);
			expect(toolInfo.title).toBe('Security audit');
			expect(toolInfo.kind).toBe('think');

			// Step 2: Process task completion result
			const toolResult: ToolResult = {
				content: [
					{ type: 'text', text: 'Security audit completed. Found 2 minor vulnerabilities and 1 recommendation.' },
				],
			};

			const update = handler.getToolUpdate(toolResult, toolUse);
			expect(update.content).toHaveLength(1);
			expect(update.content?.[0].content).toEqual({
				type: 'text',
				text: 'Security audit completed. Found 2 minor vulnerabilities and 1 recommendation.',
			});
		});
	});
});
