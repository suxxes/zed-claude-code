import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchToolUse, ToolResult } from './search-tools';
import { SearchToolsHandler } from './search-tools';

// Mock the Logger
vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	})),
}));

describe('SearchToolsHandler', () => {
	let handler: SearchToolsHandler;
	let cachedFileContent: Map<string, string>;

	beforeEach(() => {
		handler = new SearchToolsHandler();
		cachedFileContent = new Map();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getToolInfo', () => {
		describe('Glob tool', () => {
			it('should handle Glob tool with pattern and path', () => {
				const toolUse: SearchToolUse = {
					id: 'test-1',
					name: 'Glob',
					input: {
						pattern: '**/*.ts',
						path: '/project/src',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Find /project/src **/*.ts',
					kind: 'search',
					content: [],
					locations: [{ path: '/project/src' }],
				});
			});

			it('should handle Glob tool with pattern only', () => {
				const toolUse: SearchToolUse = {
					id: 'test-2',
					name: 'Glob',
					input: {
						pattern: '*.js',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Find *.js',
					kind: 'search',
					content: [],
					locations: [],
				});
			});

			it('should handle Glob tool with path only', () => {
				const toolUse: SearchToolUse = {
					id: 'test-3',
					name: 'Glob',
					input: {
						pattern: '',
						path: '/project/test',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Find /project/test',
					kind: 'search',
					content: [],
					locations: [{ path: '/project/test' }],
				});
			});

			it('should handle Glob tool without path or pattern', () => {
				const toolUse: SearchToolUse = {
					id: 'test-4',
					name: 'Glob',
					input: {
						pattern: '',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Find',
					kind: 'search',
					content: [],
					locations: [],
				});
			});

			it('should handle complex glob patterns', () => {
				const toolUse: SearchToolUse = {
					id: 'test-5',
					name: 'Glob',
					input: {
						pattern: 'src/**/*.{ts,tsx,js,jsx}',
						path: '/workspace',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'Find /workspace src/**/*.{ts,tsx,js,jsx}',
					kind: 'search',
					content: [],
					locations: [{ path: '/workspace' }],
				});
			});
		});

		describe('Grep tool', () => {
			it('should handle basic Grep tool with pattern only', () => {
				const toolUse: SearchToolUse = {
					id: 'test-6',
					name: 'Grep',
					input: {
						pattern: 'function',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep "function"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with pattern and path', () => {
				const toolUse: SearchToolUse = {
					id: 'test-7',
					name: 'Grep',
					input: {
						pattern: 'TODO',
						path: '/project/src',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep "TODO" /project/src',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with case insensitive flag', () => {
				const toolUse: SearchToolUse = {
					id: 'test-8',
					name: 'Grep',
					input: {
						pattern: 'Error',
						'-i': true,
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep -i "Error"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with line numbers flag', () => {
				const toolUse: SearchToolUse = {
					id: 'test-9',
					name: 'Grep',
					input: {
						pattern: 'export',
						'-n': true,
						path: '/src',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep -n "export" /src',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with context flags', () => {
				const toolUse: SearchToolUse = {
					id: 'test-10',
					name: 'Grep',
					input: {
						pattern: 'error',
						'-A': 3,
						'-B': 2,
						'-C': 1,
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep -A 3 -B 2 -C 1 "error"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with output mode FilesWithMatches', () => {
				const toolUse: SearchToolUse = {
					id: 'test-11',
					name: 'Grep',
					input: {
						pattern: 'import',
						outputMode: 'FilesWithMatches',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep -l "import"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with output mode Count', () => {
				const toolUse: SearchToolUse = {
					id: 'test-12',
					name: 'Grep',
					input: {
						pattern: 'test',
						outputMode: 'Count',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep -c "test"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with content output mode (default)', () => {
				const toolUse: SearchToolUse = {
					id: 'test-13',
					name: 'Grep',
					input: {
						pattern: 'class',
						outputMode: 'content',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep "class"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with head limit', () => {
				const toolUse: SearchToolUse = {
					id: 'test-14',
					name: 'Grep',
					input: {
						pattern: 'const',
						headLimit: 10,
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep | head -10 "const"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with glob filter', () => {
				const toolUse: SearchToolUse = {
					id: 'test-15',
					name: 'Grep',
					input: {
						pattern: 'interface',
						glob: '*.ts',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep --include="*.ts" "interface"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with type filter', () => {
				const toolUse: SearchToolUse = {
					id: 'test-16',
					name: 'Grep',
					input: {
						pattern: 'function',
						type: 'js',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep --type=js "function"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with multiline flag', () => {
				const toolUse: SearchToolUse = {
					id: 'test-17',
					name: 'Grep',
					input: {
						pattern: 'function.*{.*}',
						multiline: true,
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep -P "function.*{.*}"',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with all options combined', () => {
				const toolUse: SearchToolUse = {
					id: 'test-18',
					name: 'Grep',
					input: {
						pattern: 'error',
						path: '/project',
						'-i': true,
						'-n': true,
						'-A': 2,
						'-B': 1,
						outputMode: 'content',
						headLimit: 20,
						glob: '*.{ts,js}',
						type: 'js',
						multiline: true,
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep -i -n -A 2 -B 1 | head -20 --include="*.{ts,js}" --type=js -P "error" /project',
					kind: 'search',
					content: [],
				});
			});

			it('should handle Grep tool with zero context values', () => {
				const toolUse: SearchToolUse = {
					id: 'test-19',
					name: 'Grep',
					input: {
						pattern: 'test',
						'-A': 0,
						'-B': 0,
						'-C': 0,
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: 'grep -A 0 -B 0 -C 0 "test"',
					kind: 'search',
					content: [],
				});
			});
		});

		describe('LS tool', () => {
			it('should handle LS tool with path', () => {
				const toolUse: SearchToolUse = {
					id: 'test-20',
					name: 'LS',
					input: {
						path: '/project/src/components',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: "List the `/project/src/components` directory's contents",
					kind: 'search',
					content: [],
					locations: [],
				});
			});

			it('should handle LS tool without path', () => {
				const toolUse: SearchToolUse = {
					id: 'test-21',
					name: 'LS',
					input: {},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: "List the current directory's contents",
					kind: 'search',
					content: [],
					locations: [],
				});
			});

			it('should handle LS tool with empty path', () => {
				const toolUse: SearchToolUse = {
					id: 'test-22',
					name: 'LS',
					input: {
						path: '',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: "List the current directory's contents",
					kind: 'search',
					content: [],
					locations: [],
				});
			});

			it('should handle LS tool with undefined path', () => {
				const toolUse: SearchToolUse = {
					id: 'test-23',
					name: 'LS',
					input: {
						path: undefined,
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: "List the current directory's contents",
					kind: 'search',
					content: [],
					locations: [],
				});
			});

			it('should handle LS tool with complex path', () => {
				const toolUse: SearchToolUse = {
					id: 'test-24',
					name: 'LS',
					input: {
						path: '/home/user/projects/my-app/src/utils',
					},
				};

				const result = handler.getToolInfo(toolUse, cachedFileContent);

				expect(result).toEqual({
					title: "List the `/home/user/projects/my-app/src/utils` directory's contents",
					kind: 'search',
					content: [],
					locations: [],
				});
			});
		});

		it('should throw error for unsupported tool', () => {
			const toolUse: SearchToolUse = {
				id: 'test-25',
				name: 'UnsupportedSearchTool',
				input: {},
			};

			expect(() => handler.getToolInfo(toolUse, cachedFileContent)).toThrow('Unsupported tool: UnsupportedSearchTool');
		});
	});

	describe('getToolUpdate', () => {
		describe('with array content', () => {
			it('should handle search result with array content', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: 'src/utils/helper.ts' },
						{ type: 'text', text: 'src/components/Button.tsx' },
						{ type: 'text', text: 'src/hooks/useAuth.ts' },
					],
				};

				const toolUse: SearchToolUse = {
					id: 'test-26',
					name: 'Glob',
					input: { pattern: '**/*.ts' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'src/utils/helper.ts' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'src/components/Button.tsx' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'src/hooks/useAuth.ts' },
						},
					],
				});
			});

			it('should handle search result with single array item', () => {
				const toolResult: ToolResult = {
					content: [{ type: 'text', text: 'Found 1 match in file.ts' }],
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Found 1 match in file.ts' },
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

			it('should handle mixed content types in array', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: 'Line 1: function test() {' },
						{ type: 'text', text: 'Line 5: function helper() {' },
						{ type: 'match', text: 'Found 2 matches' } as any,
					],
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Line 1: function test() {' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'Line 5: function helper() {' },
						},
						{
							type: 'content',
							content: { type: 'match', text: 'Found 2 matches' },
						},
					],
				});
			});
		});

		describe('with string content', () => {
			it('should handle search result with string content', () => {
				const toolResult: ToolResult = {
					content: 'file1.ts\nfile2.ts\nfile3.tsx',
				} as any;

				const toolUse: SearchToolUse = {
					id: 'test-27',
					name: 'Grep',
					input: { pattern: 'interface', outputMode: 'FilesWithMatches' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: {
								type: 'text',
								text: 'file1.ts\nfile2.ts\nfile3.tsx',
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

			it('should handle search result without toolUse parameter', () => {
				const toolResult: ToolResult = {
					content: [{ type: 'text', text: 'Search results without context' }],
				};

				const result = handler.getToolUpdate(toolResult);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'Search results without context' },
						},
					],
				});
			});
		});

		describe('specific tool update scenarios', () => {
			it('should handle Glob search results', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: 'src/components/Button.tsx' },
						{ type: 'text', text: 'src/components/Modal.tsx' },
						{ type: 'text', text: 'src/pages/Home.tsx' },
					],
				};

				const toolUse: SearchToolUse = {
					id: 'glob-1',
					name: 'Glob',
					input: { pattern: '**/*.tsx', path: '/project/src' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'src/components/Button.tsx' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'src/components/Modal.tsx' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'src/pages/Home.tsx' },
						},
					],
				});
			});

			it('should handle Grep search with line numbers', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: 'file.ts:10:export function test() {' },
						{ type: 'text', text: 'file.ts:25:export const helper = () => {' },
					],
				};

				const toolUse: SearchToolUse = {
					id: 'grep-1',
					name: 'Grep',
					input: { pattern: 'export', '-n': true },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'file.ts:10:export function test() {' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'file.ts:25:export const helper = () => {' },
						},
					],
				});
			});

			it('should handle LS directory listing', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: 'components/' },
						{ type: 'text', text: 'utils/' },
						{ type: 'text', text: 'hooks/' },
						{ type: 'text', text: 'index.ts' },
						{ type: 'text', text: 'App.tsx' },
					],
				};

				const toolUse: SearchToolUse = {
					id: 'ls-1',
					name: 'LS',
					input: { path: '/project/src' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'components/' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'utils/' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'hooks/' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'index.ts' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'App.tsx' },
						},
					],
				});
			});

			it('should handle Grep count output', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: 'file1.ts:15' },
						{ type: 'text', text: 'file2.ts:3' },
						{ type: 'text', text: 'file3.ts:0' },
					],
				};

				const toolUse: SearchToolUse = {
					id: 'grep-count-1',
					name: 'Grep',
					input: { pattern: 'function', outputMode: 'Count' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'file1.ts:15' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'file2.ts:3' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'file3.ts:0' },
						},
					],
				});
			});

			it('should handle Grep files with matches output', () => {
				const toolResult: ToolResult = {
					content: [
						{ type: 'text', text: 'src/utils/helper.ts' },
						{ type: 'text', text: 'src/components/Button.tsx' },
					],
				};

				const toolUse: SearchToolUse = {
					id: 'grep-files-1',
					name: 'Grep',
					input: { pattern: 'TODO', outputMode: 'FilesWithMatches' },
				};

				const result = handler.getToolUpdate(toolResult, toolUse);

				expect(result).toEqual({
					content: [
						{
							type: 'content',
							content: { type: 'text', text: 'src/utils/helper.ts' },
						},
						{
							type: 'content',
							content: { type: 'text', text: 'src/components/Button.tsx' },
						},
					],
				});
			});
		});
	});

	describe('integration scenarios', () => {
		it('should handle complete Glob workflow', () => {
			// Step 1: Get tool info for glob search
			const toolUse: SearchToolUse = {
				id: 'integration-1',
				name: 'Glob',
				input: {
					pattern: '**/*.test.ts',
					path: '/project/src',
				},
			};

			const toolInfo = handler.getToolInfo(toolUse, cachedFileContent);
			expect(toolInfo.title).toBe('Find /project/src **/*.test.ts');
			expect(toolInfo.kind).toBe('search');

			// Step 2: Process search results
			const toolResult: ToolResult = {
				content: [
					{ type: 'text', text: 'src/utils/helper.test.ts' },
					{ type: 'text', text: 'src/components/Button.test.ts' },
				],
			};

			const update = handler.getToolUpdate(toolResult, toolUse);
			expect(update.content).toHaveLength(2);
		});

		it('should handle complete Grep workflow with context', () => {
			// Step 1: Get tool info for grep search
			const toolUse: SearchToolUse = {
				id: 'integration-2',
				name: 'Grep',
				input: {
					pattern: 'async function',
					'-n': true,
					'-A': 2,
					glob: '*.ts',
					path: '/src',
				},
			};

			const toolInfo = handler.getToolInfo(toolUse, cachedFileContent);
			expect(toolInfo.title).toBe('grep -n -A 2 --include="*.ts" "async function" /src');
			expect(toolInfo.kind).toBe('search');

			// Step 2: Process search results with context
			const toolResult: ToolResult = {
				content: [
					{ type: 'text', text: 'file.ts:10:async function fetchData() {' },
					{ type: 'text', text: 'file.ts:11-  const response = await fetch(url);' },
					{ type: 'text', text: 'file.ts:12-  return response.json();' },
				],
			};

			const update = handler.getToolUpdate(toolResult, toolUse);
			expect(update.content).toHaveLength(3);
		});

		it('should handle complete LS workflow', () => {
			// Step 1: Get tool info for directory listing
			const toolUse: SearchToolUse = {
				id: 'integration-3',
				name: 'LS',
				input: {
					path: '/project/src/components',
				},
			};

			const toolInfo = handler.getToolInfo(toolUse, cachedFileContent);
			expect(toolInfo.title).toBe("List the `/project/src/components` directory's contents");
			expect(toolInfo.kind).toBe('search');

			// Step 2: Process directory listing results
			const toolResult: ToolResult = {
				content: [
					{ type: 'text', text: 'Button.tsx' },
					{ type: 'text', text: 'Modal.tsx' },
					{ type: 'text', text: 'Input.tsx' },
					{ type: 'text', text: 'index.ts' },
				],
			};

			const update = handler.getToolUpdate(toolResult, toolUse);
			expect(update.content).toHaveLength(4);
			expect(update.content?.[0].content).toEqual({
				type: 'text',
				text: 'Button.tsx',
			});
		});
	});

	describe('error handling and edge cases', () => {
		it('should handle malformed grep input gracefully', () => {
			const toolUse: SearchToolUse = {
				id: 'edge-1',
				name: 'Grep',
				input: {
					pattern: 'test',
					'-A': undefined,
					'-B': null as any,
					outputMode: 'InvalidMode' as any,
				},
			};

			const result = handler.getToolInfo(toolUse, cachedFileContent);

			expect(result.title).toBe('grep -B null "test"');
			expect(result.kind).toBe('search');
		});

		it('should handle special characters in search patterns', () => {
			const toolUse: SearchToolUse = {
				id: 'edge-2',
				name: 'Grep',
				input: {
					pattern: 'function.*\\{.*\\}',
					multiline: true,
				},
			};

			const result = handler.getToolInfo(toolUse, cachedFileContent);

			expect(result.title).toBe('grep -P "function.*\\{.*\\}"');
		});

		it('should handle empty and undefined inputs', () => {
			const toolUse: SearchToolUse = {
				id: 'edge-3',
				name: 'Glob',
				input: {
					pattern: undefined as any,
					path: null as any,
				},
			};

			const result = handler.getToolInfo(toolUse, cachedFileContent);

			expect(result.title).toBe('Find');
			expect(result.locations).toEqual([]);
		});
	});
});
