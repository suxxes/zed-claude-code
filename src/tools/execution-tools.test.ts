import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BashOutputInput, ExecutionToolUse, KillBashInput, ToolResult } from './execution-tools';
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
		describe('Bash tool', () => {
			it('should handle Bash tool with command and description', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-1',
					name: 'Bash',
					input: {
						command: 'ls -la',
						description: 'List all files in directory',
					},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'ls -la',
					kind: 'execute',
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'List all files in directory' },
						},
					],
				});
			});

			it('should handle Bash tool with command only', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-2',
					name: 'Bash',
					input: {
						command: 'npm install',
					},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'npm install',
					kind: 'execute',
					content: [],
				});
			});

			it('should handle Bash tool without command', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-3',
					name: 'Bash',
					input: {
						command: '',
						description: 'Empty command test',
					},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'bash',
					kind: 'execute',
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Empty command test' },
						},
					],
				});
			});

			it('should escape backticks in command', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-4',
					name: 'Bash',
					input: {
						command: 'echo `date`',
					},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'echo `date`',
					kind: 'execute',
					content: [],
				});
			});

			it('should handle complex command with multiple backticks', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-5',
					name: 'Bash',
					input: {
						command: 'echo `pwd` && ls `dirname $0`',
					},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'echo `pwd` && ls `dirname $0`',
					kind: 'execute',
					content: [],
				});
			});

			it('should handle undefined input properties', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-6',
					name: 'Bash',
					input: {
						command: undefined,
						description: undefined,
					} as any,
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'bash',
					kind: 'execute',
					content: [],
				});
			});
		});

		describe('BashOutput tool', () => {
			it('should handle BashOutput tool', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-7',
					name: 'BashOutput',
					input: {},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'tail',
					kind: 'execute',
					content: [],
				});
			});

			it('should handle BashOutput tool with empty input object', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-8',
					name: 'BashOutput',
					input: {} as BashOutputInput,
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'tail',
					kind: 'execute',
					content: [],
				});
			});
		});

		describe('KillBash tool', () => {
			it('should handle KillBash tool', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-9',
					name: 'KillBash',
					input: {},
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'kill',
					kind: 'execute',
					content: [],
				});
			});

			it('should handle KillBash tool with empty input object', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-10',
					name: 'KillBash',
					input: {} as KillBashInput,
				};

				const result = handler.getToolInfo(toolUse);

				expect(result).toEqual({
					title: 'kill',
					kind: 'execute',
					content: [],
				});
			});
		});

		describe('Task tool', () => {
			it('should handle Task tool with description and prompt', () => {
				const toolUse: ExecutionToolUse = {
					id: 'test-11',
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
					id: 'test-12',
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
					id: 'test-13',
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
					id: 'test-14',
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
					id: 'test-15',
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
				id: 'test-16',
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
						{ type: 'text', text: 'Command output line 1' },
						{ type: 'text', text: 'Command output line 2' },
					],
				};

				const toolUse: ExecutionToolUse = {
					id: 'test-17',
					name: 'Bash',
					input: { command: 'ls -la' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Command output line 1' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'Command output line 2' },
						},
					],
				});
			});

			it('should handle execution result with single array item', () => {
				const toolResult: ToolResult = {
					content: [{ type: 'text', text: 'Single command output' }],
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Single command output' },
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
					content: 'Direct string output from command',
				} as any;

				const toolUse: ExecutionToolUse = {
					id: 'test-18',
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
								text: 'Direct string output from command',
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

			it('should handle mixed content types in array', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: 'Text output' },
						{ type: 'error', text: 'Error message' } as any,
						{ type: 'text', text: 'More text' },
					],
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Text output' },
						},
						{
							type: 'content',
							content: { type: 'error', text: 'Error message' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'More text' },
						},
					],
				});
			});
		});

		describe('specific tool update scenarios', () => {
			it('should handle Bash command result', () => {
				const toolResult: ToolResult = {
					content: [
						{
							type: 'text',
							text: 'total 24\ndrwxr-xr-x  5 user  staff  160 Dec 12 10:30 .\ndrwxr-xr-x  3 user  staff   96 Dec 12 10:29 ..',
						},
					],
				};

				const toolUse: ExecutionToolUse = {
					id: 'bash-1',
					name: 'Bash',
					input: { command: 'ls -la' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: {
								type: 'text',
								text: 'total 24\ndrwxr-xr-x  5 user  staff  160 Dec 12 10:30 .\ndrwxr-xr-x  3 user  staff   96 Dec 12 10:29 ..',
							},
						},
					],
				});
			});

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

			it('should handle BashOutput monitoring result', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: '[2023-12-12 10:30:15] Server started on port 3000' },
						{ type: 'text', text: '[2023-12-12 10:30:16] Connected to database' },
					],
				};

				const toolUse: ExecutionToolUse = {
					id: 'bash-output-1',
					name: 'BashOutput',
					input: {},
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: '[2023-12-12 10:30:15] Server started on port 3000' },
						},
						{
							type: 'content',
							content: { type: 'text', text: '[2023-12-12 10:30:16] Connected to database' },
						},
					],
				});
			});

			it('should handle KillBash termination result', () => {
				const toolResult: ToolResult = {
					content: [{ type: 'text', text: 'Process terminated successfully' }],
				};

				const toolUse: ExecutionToolUse = {
					id: 'kill-bash-1',
					name: 'KillBash',
					input: {},
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Process terminated successfully' },
						},
					],
				});
			});
		});
	});

	describe('integration scenarios', () => {
		it('should handle complete Bash execution workflow', () => {
			// Step 1: Get tool info for command
			const toolUse: ExecutionToolUse = {
				id: 'integration-1',
				name: 'Bash',
				input: {
					command: 'npm test',
					description: 'Run test suite',
				},
			};

			const toolInfo = handler.getToolInfo(toolUse);
			expect(toolInfo.title).toBe('npm test');
			expect(toolInfo.kind).toBe('execute');

			// Step 2: Process command result
			const toolResult: ToolResult = {
				content: [{ type: 'text', text: '✓ All tests passed (15 tests, 45 assertions)' }],
			};

			const update = handler.getToolUpdate(toolResult, toolUse);
			expect(update.content).toHaveLength(1);
			expect(update.content?.[0].content).toEqual({
				type: 'text',
				text: '✓ All tests passed (15 tests, 45 assertions)',
			});
		});

		it('should handle complete Task delegation workflow', () => {
			// Step 1: Get tool info for task
			const toolUse: ExecutionToolUse = {
				id: 'integration-2',
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
