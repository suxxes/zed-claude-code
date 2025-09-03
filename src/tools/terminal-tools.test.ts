import { describe, expect, it } from 'vitest';
import { TerminalToolsHandler } from './terminal-tools';

describe('TerminalToolsHandler', () => {
	describe('getToolInfo', () => {
		it('should handle mcp__zcc__terminal_create tool', () => {
			const handler = new TerminalToolsHandler();
			const toolUse = {
				id: 'test-id',
				name: 'mcp__zcc__terminal_create',
				input: {
					command: 'npm test',
					description: 'Running npm tests',
				},
			};

			const result = handler.getToolInfo(toolUse);

			expect(result.title).toBe('npm test');
			expect(result.kind).toBe('execute');
			expect(result.content).toEqual([
				{
					type: 'content',
					content: {
						type: 'text',
						text: 'Running npm tests',
					},
				},
			]);
		});

		it('should handle mcp__zcc__terminal_output tool', () => {
			const handler = new TerminalToolsHandler();
			const toolUse = {
				id: 'test-id',
				name: 'mcp__zcc__terminal_output',
				input: {
					terminalId: 'term_123',
				},
			};

			const result = handler.getToolInfo(toolUse);

			expect(result.title).toBe('Output');
			expect(result.kind).toBe('execute');
			expect(result.content).toEqual([]);
		});

		it('should handle mcp__zcc__terminal_kill tool', () => {
			const handler = new TerminalToolsHandler();
			const toolUse = {
				id: 'test-id',
				name: 'mcp__zcc__terminal_kill',
				input: {
					terminalId: 'term_789',
				},
			};

			const result = handler.getToolInfo(toolUse);

			expect(result.title).toBe('Kill Process');
			expect(result.kind).toBe('execute');
			expect(result.content).toEqual([]);
		});

		it('should escape backticks in command', () => {
			const handler = new TerminalToolsHandler();
			const toolUse = {
				id: 'test-id',
				name: 'mcp__zcc__terminal_create',
				input: {
					command: 'echo `date`',
				},
			};

			const result = handler.getToolInfo(toolUse);

			expect(result.title).toBe('echo \\`date\\`');
		});

		it('should throw error for unsupported tool', () => {
			const handler = new TerminalToolsHandler();
			const toolUse = {
				id: 'test-id',
				name: 'unsupported_tool',
				input: {},
			};

			expect(() => handler.getToolInfo(toolUse)).toThrow('Unsupported terminal tool: unsupported_tool');
		});
	});

	describe('getToolUpdate', () => {
		it('should return empty update for mcp__zcc__terminal_create tool without terminal ID', () => {
			const handler = new TerminalToolsHandler();
			const toolResult = {
				content: [{ type: 'text', text: 'Command output' }],
			};
			const toolUse = {
				id: 'test-id',
				name: 'mcp__zcc__terminal_create',
				input: { command: 'ls' },
			};

			const result = handler.getToolUpdate(toolResult, toolUse);

			expect(result).toEqual({});
		});

		it('should return empty for mcp__zcc__terminal_create', () => {
			const handler = new TerminalToolsHandler();
			const toolResult = {
				content: 'Command execution started in background 4e0ec752-38ca-45b5-80d3-adb56a1f4b44',
			};
			const toolUse = {
				id: 'test-id',
				name: 'mcp__zcc__terminal_create',
				input: { command: 'npm test', background: true },
			};

			const result = handler.getToolUpdate(toolResult, toolUse);

			expect(result).toEqual({});
		});

		it('should process tool result with array content', () => {
			const handler = new TerminalToolsHandler();
			const toolResult = {
				content: [
					{
						type: 'text' as const,
						text: 'Process started',
					},
				],
			};

			const result = handler.getToolUpdate(toolResult);

			expect(result).toEqual({
				content: [
					{
						type: 'content',
						content: {
							type: 'text',
							text: 'Process started',
						},
					},
				],
			});
		});

		it('should handle multiple content items in array', () => {
			const handler = new TerminalToolsHandler();
			const toolResult = {
				content: [
					{
						type: 'text' as const,
						text: 'Line 1',
					},
					{
						type: 'text' as const,
						text: 'Line 2',
					},
				],
			};

			const result = handler.getToolUpdate(toolResult);

			expect(result).toEqual({
				content: [
					{
						type: 'content',
						content: {
							type: 'text',
							text: 'Line 1',
						},
					},
					{
						type: 'content',
						content: {
							type: 'text',
							text: 'Line 2',
						},
					},
				],
			});
		});

		it('should return empty update for empty string content', () => {
			const handler = new TerminalToolsHandler();
			const toolResult = {
				content: '',
			};

			const result = handler.getToolUpdate(toolResult);

			expect(result).toEqual({});
		});

		it('should return empty update for empty array content', () => {
			const handler = new TerminalToolsHandler();
			const toolResult = {
				content: [],
			};

			const result = handler.getToolUpdate(toolResult);

			expect(result).toEqual({});
		});
	});
});
