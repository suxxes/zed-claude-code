import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpToolResult } from '../managers/tools-manager';
import type { FileToolUse } from './file-tools';
import { FileToolsHandler } from './file-tools';

// Mock the Logger
vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	})),
}));

describe('FileToolsHandler', () => {
	let handler: FileToolsHandler;
	let cachedFileContent: Map<string, string>;

	beforeEach(() => {
		handler = new FileToolsHandler();
		cachedFileContent = new Map();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getToolInfo', () => {
		describe('mcp__zcc__read_file and Read tools', () => {
			it('should handle read tool with file_path', () => {
				const toolUse: FileToolUse = {
					id: 'test-1',
					name: 'mcp__zcc__read_file',
					input: {
						file_path: '/test/file.txt',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Read /test/file.txt',
					kind: 'read',
					locations: [
						{
							path: '/test/file.txt',
							line: 0,
						},
					],
					content: [],
				});
			});

			it('should handle read tool with file_path property (MCP format)', () => {
				const toolUse: FileToolUse = {
					id: 'test-2',
					name: 'Read',
					input: {
						file_path: '/test/mcp-file.txt',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Read /test/mcp-file.txt',
					kind: 'read',
					locations: [
						{
							path: '/test/mcp-file.txt',
							line: 0,
						},
					],
					content: [],
				});
			});

			it('should handle read tool with offset and limit', () => {
				const toolUse: FileToolUse = {
					id: 'test-3',
					name: 'mcp__zcc__read_file',
					input: {
						file_path: '/test/file.txt',
						offset: 10,
						limit: 20,
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Read /test/file.txt (11 - 30)',
					kind: 'read',
					locations: [
						{
							path: '/test/file.txt',
							line: 10,
						},
					],
					content: [],
				});
			});

			it('should handle read tool with only offset', () => {
				const toolUse: FileToolUse = {
					id: 'test-4',
					name: 'Read',
					input: {
						file_path: '/test/file.txt',
						offset: 5,
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Read /test/file.txt (from line 6)',
					kind: 'read',
					locations: [
						{
							path: '/test/file.txt',
							line: 5,
						},
					],
					content: [],
				});
			});

			it('should handle read tool without path', () => {
				const toolUse: FileToolUse = {
					id: 'test-5',
					name: 'Read',
					input: {},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Read File',
					kind: 'read',
					locations: [],
					content: [],
				});
			});
		});

		describe('edit and write tools', () => {
			it('should handle write operation with content', () => {
				const toolUse: FileToolUse = {
					id: 'test-6',
					name: 'mcp__zcc__write_file',
					input: {
						file_path: '/test/new-file.txt',
						content: 'Hello, world!',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Write /test/new-file.txt',
					kind: 'edit',
					content: [
						{
							type: 'diff',
							path: '/test/new-file.txt',
							oldText: null,
							newText: 'Hello, world!',
						},
					],
					locations: [{ path: '/test/new-file.txt' }],
				});
			});

			it('should handle write operation with file_path property (MCP format)', () => {
				const toolUse: FileToolUse = {
					id: 'test-7',
					name: 'Write',
					input: {
						file_path: '/test/mcp-new-file.txt',
						content: 'MCP content',
					} as any,
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Write /test/mcp-new-file.txt',
					kind: 'edit',
					content: [
						{
							type: 'diff',
							path: '/test/mcp-new-file.txt',
							oldText: null,
							newText: 'MCP content',
						},
					],
					locations: [{ path: '/test/mcp-new-file.txt' }],
				});
			});

			it('should handle edit operation with oldText and newText', () => {
				const toolUse: FileToolUse = {
					id: 'test-8',
					name: 'mcp__zcc__edit_file',
					input: {
						file_path: '/test/edit-file.txt',
						old_text: 'old content',
						new_text: 'new content',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Edit /test/edit-file.txt',
					kind: 'edit',
					content: [
						{
							type: 'diff',
							path: '/test/edit-file.txt',
							oldText: 'old content',
							newText: 'new content',
						},
					],
					locations: [{ path: '/test/edit-file.txt' }],
				});
			});

			it('should handle edit operation with cached file content', () => {
				cachedFileContent.set('/test/cached-file.txt', 'line 1\nold content\nline 3');

				const toolUse: FileToolUse = {
					id: 'test-9',
					name: 'Edit',
					input: {
						file_path: '/test/cached-file.txt',
						old_text: 'old content',
						new_text: 'new content',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Edit /test/cached-file.txt',
					kind: 'edit',
					content: [
						{
							type: 'diff',
							path: '/test/cached-file.txt',
							oldText: 'old content',
							newText: 'new content',
						},
					],
					locations: [{ path: '/test/cached-file.txt' }],
				});
			});

			it('should handle edit operation without path', () => {
				const toolUse: FileToolUse = {
					id: 'test-10',
					name: 'Edit',
					input: {
						old_text: 'old',
						new_text: 'new',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Edit',
					kind: 'edit',
					content: [],
					locations: [],
				});
			});
		});

		describe('multi_edit tool', () => {
			it('should handle multi_edit operation', () => {
				const toolUse: FileToolUse = {
					id: 'test-11',
					name: 'mcp__zcc__multi_edit',
					input: {
						file_path: '/test/multi_edit-file.txt',
						edits: [
							{ old_string: 'old1', new_string: 'new1' },
							{ old_string: 'old2', new_string: 'new2', replace_all: true },
						],
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Edit /test/multi_edit-file.txt',
					kind: 'edit',
					content: [
						{
							type: 'diff',
							path: '/test/multi_edit-file.txt',
							oldText: 'old1',
							newText: 'new1',
						},
						{
							type: 'diff',
							path: '/test/multi_edit-file.txt',
							oldText: 'old2',
							newText: 'new2',
						},
					],
					locations: [{ path: '/test/multi_edit-file.txt' }],
				});
			});

			it('should handle multi_edit with cached content', () => {
				cachedFileContent.set('/test/multi-cached.txt', 'old1 text\nold2 and old2 again');

				const toolUse: FileToolUse = {
					id: 'test-12',
					name: 'MultiEdit',
					input: {
						file_path: '/test/multi-cached.txt',
						edits: [
							{ old_string: 'old1', new_string: 'new1' },
							{ old_string: 'old2', new_string: 'new2', replace_all: true },
						],
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Edit /test/multi-cached.txt',
					kind: 'edit',
					content: [
						{
							type: 'diff',
							path: '/test/multi-cached.txt',
							oldText: 'old1',
							newText: 'new1',
						},
						{
							type: 'diff',
							path: '/test/multi-cached.txt',
							oldText: 'old2',
							newText: 'new2',
						},
					],
					locations: [{ path: '/test/multi-cached.txt' }],
				});
			});

			it('should handle multi_edit without path', () => {
				const toolUse: FileToolUse = {
					id: 'test-13',
					name: 'MultiEdit',
					input: {
						file_path: undefined,
						edits: [{ old_string: 'old1', new_string: 'new1' }],
					} as any,
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Edit',
					kind: 'edit',
					content: [
						{
							type: 'diff',
							path: undefined,
							oldText: 'old1',
							newText: 'new1',
						},
					],
					locations: [],
				});
			});
		});

		it('should throw error for unsupported tool', () => {
			const toolUse: FileToolUse = {
				id: 'test-14',
				name: 'UnsupportedTool',
				input: {},
			};

			expect(() => handler.getToolInfo(toolUse, cachedFileContent)).toThrow('Unsupported tool: UnsupportedTool');
		});
	});

	describe('getToolUpdate', () => {
		describe('read tool updates', () => {
			it('should handle read update with array content', () => {
				const toolResult: McpToolResult = {
					content: [{ type: 'text', text: 'File content line 1\nFile content line 2' }],
				};

				const toolUse: FileToolUse = {
					id: 'test-15',
					name: 'Read',
					input: { file_path: '/test/file.txt' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: {
								type: 'text',
								text: '```\nFile content line 1\nFile content line 2\n```',
							},
						},
					],
				});
			});

			// Note: ToolResult.content is always an array per interface definition

			it('should handle empty read result', () => {
				const toolResult: McpToolResult = {
					content: [],
				};

				const toolUse: FileToolUse = {
					id: 'test',
					name: 'Read',
					input: { file_path: '/test/file.txt' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({});
			});

			it('should escape markdown in read content', () => {
				const toolResult: McpToolResult = {
					content: [{ type: 'text', text: '```javascript\nconst x = 1;\n```' }],
				};

				const toolUse: FileToolUse = {
					id: 'test',
					name: 'Read',
					input: { file_path: '/test/file.txt' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result.content?.[0]?.content).toEqual({
					type: 'text',
					text: '````\n```javascript\nconst x = 1;\n```\n````',
				});
			});
		});

		describe('edit tool updates', () => {
			it('should handle edit update with line numbers', () => {
				const toolResult: McpToolResult = {
					content: [{ type: 'text', text: '{"lineNumbers": [5, 10, 15]}' }],
				};

				const toolUse: FileToolUse = {
					id: 'test-16',
					name: 'Edit',
					input: { file_path: '/test/edited-file.txt' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					locations: [
						{ path: '/test/edited-file.txt', line: 5 },
						{ path: '/test/edited-file.txt', line: 10 },
						{ path: '/test/edited-file.txt', line: 15 },
					],
				});
			});

			it('should handle edit update with MCP file_path', () => {
				const toolResult: McpToolResult = {
					content: [{ type: 'text', text: '{"lineNumbers": [3]}' }],
				};

				const toolUse: FileToolUse = {
					id: 'test-17',
					name: 'mcp__zcc__edit_file',
					input: { file_path: '/test/mcp-edited.txt' } as any,
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					locations: [{ path: '/test/mcp-edited.txt', line: 3 }],
				});
			});

			it('should handle edit update with invalid JSON', () => {
				const toolResult: McpToolResult = {
					content: [{ type: 'text', text: 'invalid json' }],
				};

				const toolUse: FileToolUse = {
					id: 'test-18',
					name: 'Edit',
					input: { file_path: '/test/file.txt' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({});
			});

			it('should handle edit update without line numbers', () => {
				const toolResult: McpToolResult = {
					content: [{ type: 'text', text: '{"success": true}' }],
				};

				const toolUse: FileToolUse = {
					id: 'test-19',
					name: 'Edit',
					input: { file_path: '/test/file.txt' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({});
			});
		});

		describe('multi_edit tool updates', () => {
			it('should handle multi_edit update with line numbers', () => {
				const toolResult: McpToolResult = {
					content: [{ type: 'text', text: '{"lineNumbers": [2, 8]}' }],
				};

				const toolUse: FileToolUse = {
					id: 'test-20',
					name: 'MultiEdit',
					input: {
						file_path: '/test/multi_edited.txt',
						edits: [{ old_string: 'old', new_string: 'new' }],
					},
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					locations: [
						{ path: '/test/multi_edited.txt', line: 2 },
						{ path: '/test/multi_edited.txt', line: 8 },
					],
				});
			});

			it('should handle multi_edit update fallback to file_path', () => {
				const toolResult: McpToolResult = {
					content: [{ type: 'text', text: '{"lineNumbers": [1]}' }],
				};

				const toolUse: FileToolUse = {
					id: 'test-21',
					name: 'MultiEdit',
					input: {
						file_path: '/test/fallback.txt',
						edits: [{ old_string: 'old', new_string: 'new' }],
					} as any,
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					locations: [{ path: '/test/fallback.txt', line: 1 }],
				});
			});
		});

		it('should return empty object for tool update without toolUse', () => {
			const toolResult: McpToolResult = {
				content: [{ type: 'text', text: 'some content' }],
			};

			const result = handler.getToolUpdate(toolResult);

			expect(result).toEqual({});
		});
	});

	describe('markdownEscape protected method', () => {
		it('should escape basic markdown content', () => {
			const handler = new FileToolsHandler();
			const toolResult: McpToolResult = {
				content: [{ type: 'text', text: 'Simple text' }],
			};

			const toolUse: FileToolUse = {
				id: 'test',
				name: 'Read',
				input: { file_path: '/test/file.txt' },
			};

			const result = handler.getToolUpdate(toolResult, toolUse);

			expect(result.content?.[0].content).toEqual({
				type: 'text',
				text: '```\nSimple text\n```',
			});
		});

		it('should handle content with existing backticks', () => {
			const handler = new FileToolsHandler();
			const toolResult: McpToolResult = {
				content: [{ type: 'text', text: '```\nSome code\n```' }],
			};

			const toolUse: FileToolUse = {
				id: 'test',
				name: 'Read',
				input: { file_path: '/test/file.txt' },
			};

			const result = handler.getToolUpdate(toolResult, toolUse);

			expect(result.content?.[0].content).toEqual({
				type: 'text',
				text: '````\n```\nSome code\n```\n````',
			});
		});

		it('should handle content without trailing newline', () => {
			const handler = new FileToolsHandler();
			const toolResult: McpToolResult = {
				content: [{ type: 'text', text: 'No trailing newline' }],
			};

			const toolUse: FileToolUse = {
				id: 'test',
				name: 'Read',
				input: { file_path: '/test/file.txt' },
			};

			const result = handler.getToolUpdate(toolResult, toolUse);

			expect(result.content?.[0].content).toEqual({
				type: 'text',
				text: '```\nNo trailing newline\n```',
			});
		});
	});
});
