import type { ToolKind } from '@zed-industries/agent-client-protocol';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { ExecutionToolUse } from '../tools/execution-tools';
import { ExecutionToolsHandler } from '../tools/execution-tools';
import type { FileToolUse } from '../tools/file-tools';
import { FileToolsHandler } from '../tools/file-tools';
import type { GenericToolUse } from '../tools/generic-tools';
import { GenericToolsHandler } from '../tools/generic-tools';
import type { NotebookToolUse } from '../tools/notebook-tools';
import { NotebookToolsHandler } from '../tools/notebook-tools';
import type { PlanningToolUse } from '../tools/planning-tools';
import { PlanningToolsHandler } from '../tools/planning-tools';
import type { SearchToolUse } from '../tools/search-tools';
import { SearchToolsHandler } from '../tools/search-tools';
import type { WebToolUse } from '../tools/web-tools';
import { WebToolsHandler } from '../tools/web-tools';
import type { AnyToolUse, ClaudePlanEntry, ToolInfo, ToolResult, ToolUpdate } from './tools-manager';
import { ToolsManager } from './tools-manager';

// Mock the Logger
vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})),
}));

// Mock all tool handler classes
vi.mock('../tools/execution-tools', () => ({
	ExecutionToolsHandler: vi.fn().mockImplementation(() => ({
		getToolInfo: vi.fn(),
		getToolUpdate: vi.fn(),
	})),
}));

vi.mock('../tools/file-tools', () => ({
	FileToolsHandler: vi.fn().mockImplementation(() => ({
		getToolInfo: vi.fn(),
		getToolUpdate: vi.fn(),
	})),
}));

vi.mock('../tools/generic-tools', () => ({
	GenericToolsHandler: vi.fn().mockImplementation(() => ({
		getToolInfo: vi.fn(),
		getToolUpdate: vi.fn(),
	})),
}));

vi.mock('../tools/notebook-tools', () => ({
	NotebookToolsHandler: vi.fn().mockImplementation(() => ({
		getToolInfo: vi.fn(),
		getToolUpdate: vi.fn(),
	})),
}));

vi.mock('../tools/planning-tools', () => ({
	PlanningToolsHandler: vi.fn().mockImplementation(() => ({
		getToolInfo: vi.fn(),
		getToolUpdate: vi.fn(),
		convertPlanEntries: vi.fn(),
	})),
}));

vi.mock('../tools/search-tools', () => ({
	SearchToolsHandler: vi.fn().mockImplementation(() => ({
		getToolInfo: vi.fn(),
		getToolUpdate: vi.fn(),
	})),
}));

vi.mock('../tools/web-tools', () => ({
	WebToolsHandler: vi.fn().mockImplementation(() => ({
		getToolInfo: vi.fn(),
		getToolUpdate: vi.fn(),
	})),
}));

describe('ToolsManager', () => {
	let toolsManager: ToolsManager;
	let mockFileTools: { getToolInfo: Mock; getToolUpdate: Mock };
	let mockSearchTools: { getToolInfo: Mock; getToolUpdate: Mock };
	let mockExecutionTools: { getToolInfo: Mock; getToolUpdate: Mock };
	let mockNotebookTools: { getToolInfo: Mock; getToolUpdate: Mock };
	let mockWebTools: { getToolInfo: Mock; getToolUpdate: Mock };
	let mockPlanningTools: { getToolInfo: Mock; getToolUpdate: Mock; convertPlanEntries: Mock };
	let mockGenericTools: { getToolInfo: Mock; getToolUpdate: Mock };

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Create fresh instances
		toolsManager = new ToolsManager();

		// Get mock instances for each handler
		mockFileTools = (toolsManager as any).fileTools;
		mockSearchTools = (toolsManager as any).searchTools;
		mockExecutionTools = (toolsManager as any).executionTools;
		mockNotebookTools = (toolsManager as any).notebookTools;
		mockWebTools = (toolsManager as any).webTools;
		mockPlanningTools = (toolsManager as any).planningTools;
		mockGenericTools = (toolsManager as any).genericTools;
	});

	describe('constructor', () => {
		it('should create a new ToolsManager instance', () => {
			expect(toolsManager).toBeInstanceOf(ToolsManager);
		});

		it('should initialize all tool handlers', () => {
			expect(FileToolsHandler).toHaveBeenCalledTimes(1);
			expect(SearchToolsHandler).toHaveBeenCalledTimes(1);
			expect(ExecutionToolsHandler).toHaveBeenCalledTimes(1);
			expect(NotebookToolsHandler).toHaveBeenCalledTimes(1);
			expect(WebToolsHandler).toHaveBeenCalledTimes(1);
			expect(PlanningToolsHandler).toHaveBeenCalledTimes(1);
			expect(GenericToolsHandler).toHaveBeenCalledTimes(1);
		});
	});

	describe('getToolInfoFromToolUse', () => {
		it('should route file operations to FileToolsHandler', () => {
			const toolUse: FileToolUse = {
				id: 'test-id',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path' },
			};

			const expectedInfo: ToolInfo = {
				title: 'Reading file',
				kind: 'file' as ToolKind,
				content: [],
			};

			mockFileTools.getToolInfo.mockReturnValue(expectedInfo);

			const result = toolsManager.getToolInfoFromToolUse(toolUse);

			expect(mockFileTools.getToolInfo).toHaveBeenCalledWith(toolUse);
			expect(result).toEqual(expectedInfo);
		});

		it('should route all file tool variants to FileToolsHandler', () => {
			const fileToolNames = [
				'mcp__zcc__read_file',
				'mcp__zcc__edit_file',
				'mcp__zcc__write_file',
				'mcp__zcc__multi_edit',
				'Read',
				'Edit',
				'Write',
				'MultiEdit',
			];

			const expectedInfo: ToolInfo = {
				title: 'File operation',
				kind: 'file' as ToolKind,
				content: [],
			};

			mockFileTools.getToolInfo.mockReturnValue(expectedInfo);

			for (const toolName of fileToolNames) {
				const toolUse: FileToolUse = {
					id: 'test-id',
					name: toolName,
					input: { absPath: '/test/path' },
				};

				const result = toolsManager.getToolInfoFromToolUse(toolUse);

				expect(mockFileTools.getToolInfo).toHaveBeenCalledWith(toolUse);
				expect(result).toEqual(expectedInfo);
			}

			expect(mockFileTools.getToolInfo).toHaveBeenCalledTimes(fileToolNames.length);
		});

		it('should route search operations to SearchToolsHandler', () => {
			const searchToolNames = ['Glob', 'Grep', 'LS'];
			const expectedInfo: ToolInfo = {
				title: 'Search operation',
				kind: 'file' as ToolKind,
				content: [],
			};

			mockSearchTools.getToolInfo.mockReturnValue(expectedInfo);

			for (const toolName of searchToolNames) {
				const toolUse: SearchToolUse = {
					id: 'test-id',
					name: toolName,
					input: {},
				};

				const result = toolsManager.getToolInfoFromToolUse(toolUse);

				expect(mockSearchTools.getToolInfo).toHaveBeenCalledWith(toolUse);
				expect(result).toEqual(expectedInfo);
			}

			expect(mockSearchTools.getToolInfo).toHaveBeenCalledTimes(searchToolNames.length);
		});

		it('should route execution operations to ExecutionToolsHandler', () => {
			const executionToolNames = ['Bash', 'BashOutput', 'KillBash', 'Task'];
			const expectedInfo: ToolInfo = {
				title: 'Execution operation',
				kind: 'shell' as ToolKind,
				content: [],
			};

			mockExecutionTools.getToolInfo.mockReturnValue(expectedInfo);

			for (const toolName of executionToolNames) {
				const toolUse: ExecutionToolUse = {
					id: 'test-id',
					name: toolName,
					input: {},
				};

				const result = toolsManager.getToolInfoFromToolUse(toolUse);

				expect(mockExecutionTools.getToolInfo).toHaveBeenCalledWith(toolUse);
				expect(result).toEqual(expectedInfo);
			}

			expect(mockExecutionTools.getToolInfo).toHaveBeenCalledTimes(executionToolNames.length);
		});

		it('should route notebook operations to NotebookToolsHandler', () => {
			const notebookToolNames = ['NotebookRead', 'NotebookEdit'];
			const expectedInfo: ToolInfo = {
				title: 'Notebook operation',
				kind: 'file' as ToolKind,
				content: [],
			};

			mockNotebookTools.getToolInfo.mockReturnValue(expectedInfo);

			for (const toolName of notebookToolNames) {
				const toolUse: NotebookToolUse = {
					id: 'test-id',
					name: toolName,
					input: {},
				};

				const result = toolsManager.getToolInfoFromToolUse(toolUse);

				expect(mockNotebookTools.getToolInfo).toHaveBeenCalledWith(toolUse);
				expect(result).toEqual(expectedInfo);
			}

			expect(mockNotebookTools.getToolInfo).toHaveBeenCalledTimes(notebookToolNames.length);
		});

		it('should route web operations to WebToolsHandler', () => {
			const webToolNames = ['WebFetch', 'WebSearch'];
			const expectedInfo: ToolInfo = {
				title: 'Web operation',
				kind: 'web' as ToolKind,
				content: [],
			};

			mockWebTools.getToolInfo.mockReturnValue(expectedInfo);

			for (const toolName of webToolNames) {
				const toolUse: WebToolUse = {
					id: 'test-id',
					name: toolName,
					input: {},
				};

				const result = toolsManager.getToolInfoFromToolUse(toolUse);

				expect(mockWebTools.getToolInfo).toHaveBeenCalledWith(toolUse);
				expect(result).toEqual(expectedInfo);
			}

			expect(mockWebTools.getToolInfo).toHaveBeenCalledTimes(webToolNames.length);
		});

		it('should route planning operations to PlanningToolsHandler', () => {
			const planningToolNames = ['TodoWrite', 'ExitPlanMode', 'exitPlanMode'];
			const expectedInfo: ToolInfo = {
				title: 'Planning operation',
				kind: 'generic' as ToolKind,
				content: [],
			};

			mockPlanningTools.getToolInfo.mockReturnValue(expectedInfo);

			for (const toolName of planningToolNames) {
				const toolUse: PlanningToolUse = {
					id: 'test-id',
					name: toolName,
					input: {},
				};

				const result = toolsManager.getToolInfoFromToolUse(toolUse);

				expect(mockPlanningTools.getToolInfo).toHaveBeenCalledWith(toolUse);
				expect(result).toEqual(expectedInfo);
			}

			expect(mockPlanningTools.getToolInfo).toHaveBeenCalledTimes(planningToolNames.length);
		});

		it('should route unknown operations to GenericToolsHandler', () => {
			const toolUse: GenericToolUse = {
				id: 'test-id',
				name: 'UnknownTool',
				input: {},
			};

			const expectedInfo: ToolInfo = {
				title: 'Generic operation',
				kind: 'generic' as ToolKind,
				content: [],
			};

			mockGenericTools.getToolInfo.mockReturnValue(expectedInfo);

			const result = toolsManager.getToolInfoFromToolUse(toolUse);

			expect(mockGenericTools.getToolInfo).toHaveBeenCalledWith(toolUse);
			expect(result).toEqual(expectedInfo);
		});

		it('should fallback to GenericToolsHandler when specialized handler throws error', () => {
			const toolUse: FileToolUse = {
				id: 'test-id',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path' },
			};

			const error = new Error('Specialized handler error');
			const fallbackInfo: ToolInfo = {
				title: 'Fallback operation',
				kind: 'generic' as ToolKind,
				content: [],
			};

			mockFileTools.getToolInfo.mockImplementation(() => {
				throw error;
			});
			mockGenericTools.getToolInfo.mockReturnValue(fallbackInfo);

			const result = toolsManager.getToolInfoFromToolUse(toolUse);

			expect(mockFileTools.getToolInfo).toHaveBeenCalledWith(toolUse);
			expect(mockGenericTools.getToolInfo).toHaveBeenCalledWith(toolUse);
			expect(result).toEqual(fallbackInfo);
		});

		it('should handle non-Error exceptions in specialized handlers', () => {
			const toolUse: FileToolUse = {
				id: 'test-id',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path' },
			};

			const fallbackInfo: ToolInfo = {
				title: 'Fallback operation',
				kind: 'generic' as ToolKind,
				content: [],
			};

			mockFileTools.getToolInfo.mockImplementation(() => {
				throw 'String error';
			});
			mockGenericTools.getToolInfo.mockReturnValue(fallbackInfo);

			const result = toolsManager.getToolInfoFromToolUse(toolUse);

			expect(mockFileTools.getToolInfo).toHaveBeenCalledWith(toolUse);
			expect(mockGenericTools.getToolInfo).toHaveBeenCalledWith(toolUse);
			expect(result).toEqual(fallbackInfo);
		});
	});

	describe('getToolUpdateFromResult', () => {
		it('should route file operation results to FileToolsHandler', () => {
			const toolResult: ToolResult = {
				content: 'File operation result',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const toolUse: FileToolUse = {
				id: 'test-id',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path' },
			};

			const expectedUpdate: ToolUpdate = {
				title: 'File updated',
				content: [],
			};

			mockFileTools.getToolUpdate.mockReturnValue(expectedUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockFileTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(expectedUpdate);
		});

		it('should route search operation results to SearchToolsHandler', () => {
			const toolResult: ToolResult = {
				content: 'Search result',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const toolUse: SearchToolUse = {
				id: 'test-id',
				name: 'Glob',
				input: { pattern: '*.ts' },
			};

			const expectedUpdate: ToolUpdate = {
				title: 'Search completed',
				content: [],
			};

			mockSearchTools.getToolUpdate.mockReturnValue(expectedUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockSearchTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(expectedUpdate);
		});

		it('should route execution operation results to ExecutionToolsHandler', () => {
			const toolResult: ToolResult = {
				content: 'Command executed',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const toolUse: ExecutionToolUse = {
				id: 'test-id',
				name: 'Bash',
				input: { command: 'ls -la' },
			};

			const expectedUpdate: ToolUpdate = {
				title: 'Command executed',
				content: [],
			};

			mockExecutionTools.getToolUpdate.mockReturnValue(expectedUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockExecutionTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(expectedUpdate);
		});

		it('should route notebook operation results to NotebookToolsHandler', () => {
			const toolResult: ToolResult = {
				content: 'Notebook updated',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const toolUse: NotebookToolUse = {
				id: 'test-id',
				name: 'NotebookEdit',
				input: { notebook_path: '/test/notebook.ipynb' },
			};

			const expectedUpdate: ToolUpdate = {
				title: 'Notebook updated',
				content: [],
			};

			mockNotebookTools.getToolUpdate.mockReturnValue(expectedUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockNotebookTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(expectedUpdate);
		});

		it('should route web operation results to WebToolsHandler', () => {
			const toolResult: ToolResult = {
				content: 'Web content fetched',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const toolUse: WebToolUse = {
				id: 'test-id',
				name: 'WebFetch',
				input: { url: 'https://example.com' },
			};

			const expectedUpdate: ToolUpdate = {
				title: 'Web content fetched',
				content: [],
			};

			mockWebTools.getToolUpdate.mockReturnValue(expectedUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockWebTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(expectedUpdate);
		});

		it('should route planning operation results to PlanningToolsHandler', () => {
			const toolResult: ToolResult = {
				content: 'Todo list updated',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const toolUse: PlanningToolUse = {
				id: 'test-id',
				name: 'TodoWrite',
				input: { todos: [] },
			};

			const expectedUpdate: ToolUpdate = {
				title: 'Todo list updated',
				content: [],
			};

			mockPlanningTools.getToolUpdate.mockReturnValue(expectedUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockPlanningTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(expectedUpdate);
		});

		it('should route unknown operation results to GenericToolsHandler', () => {
			const toolResult: ToolResult = {
				content: 'Generic result',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const toolUse: GenericToolUse = {
				id: 'test-id',
				name: 'UnknownTool',
				input: {},
			};

			const expectedUpdate: ToolUpdate = {
				title: 'Generic update',
				content: [],
			};

			mockGenericTools.getToolUpdate.mockReturnValue(expectedUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockGenericTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(expectedUpdate);
		});

		it('should use GenericToolsHandler when no toolUse is provided', () => {
			const toolResult: ToolResult = {
				content: 'Result without tool use',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const expectedUpdate: ToolUpdate = {
				title: 'Generic update',
				content: [],
			};

			mockGenericTools.getToolUpdate.mockReturnValue(expectedUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult);

			expect(mockGenericTools.getToolUpdate).toHaveBeenCalledWith(toolResult, undefined);
			expect(result).toEqual(expectedUpdate);
		});

		it('should handle error results properly', () => {
			const toolResult: ToolResult = {
				content: 'Error occurred',
				tool_use_id: 'test-id',
				is_error: true,
			};

			const toolUse: FileToolUse = {
				id: 'test-id',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path' },
			};

			const expectedUpdate: ToolUpdate = {
				title: 'Error in file operation',
				content: [],
			};

			mockFileTools.getToolUpdate.mockReturnValue(expectedUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockFileTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(expectedUpdate);
		});

		it('should fallback to GenericToolsHandler when specialized handler throws error', () => {
			const toolResult: ToolResult = {
				content: 'Result',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const toolUse: FileToolUse = {
				id: 'test-id',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path' },
			};

			const error = new Error('Handler error');
			const fallbackUpdate: ToolUpdate = {
				title: 'Fallback update',
				content: [],
			};

			mockFileTools.getToolUpdate.mockImplementation(() => {
				throw error;
			});
			mockGenericTools.getToolUpdate.mockReturnValue(fallbackUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockFileTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(mockGenericTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(fallbackUpdate);
		});

		it('should handle non-Error exceptions in result handlers', () => {
			const toolResult: ToolResult = {
				content: 'Result',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const toolUse: FileToolUse = {
				id: 'test-id',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path' },
			};

			const fallbackUpdate: ToolUpdate = {
				title: 'Fallback update',
				content: [],
			};

			mockFileTools.getToolUpdate.mockImplementation(() => {
				throw 'String error';
			});
			mockGenericTools.getToolUpdate.mockReturnValue(fallbackUpdate);

			const result = toolsManager.getToolUpdateFromResult(toolResult, toolUse);

			expect(mockFileTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(mockGenericTools.getToolUpdate).toHaveBeenCalledWith(toolResult, toolUse);
			expect(result).toEqual(fallbackUpdate);
		});
	});

	describe('convertPlanEntries', () => {
		it('should delegate to PlanningToolsHandler', () => {
			const input = {
				todos: [
					{
						content: 'Test todo',
						status: 'pending' as const,
						activeForm: 'test-form',
					},
				] as ClaudePlanEntry[],
			};

			const expectedResult = [
				{
					id: 'test-id',
					description: 'Test todo',
					status: 'pending',
					dependencies: [],
					metadata: {},
				},
			];

			mockPlanningTools.convertPlanEntries.mockReturnValue(expectedResult);

			const result = toolsManager.convertPlanEntries(input);

			expect(mockPlanningTools.convertPlanEntries).toHaveBeenCalledWith(input);
			expect(result).toEqual(expectedResult);
		});

		it('should handle empty todos array', () => {
			const input = { todos: [] as ClaudePlanEntry[] };
			const expectedResult: any[] = [];

			mockPlanningTools.convertPlanEntries.mockReturnValue(expectedResult);

			const result = toolsManager.convertPlanEntries(input);

			expect(mockPlanningTools.convertPlanEntries).toHaveBeenCalledWith(input);
			expect(result).toEqual(expectedResult);
		});

		it('should handle multiple plan entries', () => {
			const input = {
				todos: [
					{
						content: 'First todo',
						status: 'pending' as const,
						activeForm: 'form-1',
					},
					{
						content: 'Second todo',
						status: 'in_progress' as const,
						activeForm: 'form-2',
					},
					{
						content: 'Third todo',
						status: 'completed' as const,
						activeForm: 'form-3',
					},
				] as ClaudePlanEntry[],
			};

			const expectedResult = [
				{
					id: 'test-id-1',
					description: 'First todo',
					status: 'pending',
					dependencies: [],
					metadata: {},
				},
				{
					id: 'test-id-2',
					description: 'Second todo',
					status: 'in_progress',
					dependencies: [],
					metadata: {},
				},
				{
					id: 'test-id-3',
					description: 'Third todo',
					status: 'completed',
					dependencies: [],
					metadata: {},
				},
			];

			mockPlanningTools.convertPlanEntries.mockReturnValue(expectedResult);

			const result = toolsManager.convertPlanEntries(input);

			expect(mockPlanningTools.convertPlanEntries).toHaveBeenCalledWith(input);
			expect(result).toEqual(expectedResult);
		});
	});

	describe('tool type detection methods', () => {
		describe('isFileOperation', () => {
			it('should correctly identify file operations', () => {
				const fileToolNames = [
					'mcp__zcc__read_file',
					'mcp__zcc__edit_file',
					'mcp__zcc__write_file',
					'mcp__zcc__multi_edit',
					'Read',
					'Edit',
					'Write',
					'MultiEdit',
				];

				for (const toolName of fileToolNames) {
					const toolUse: AnyToolUse = {
						id: 'test-id',
						name: toolName,
						input: {},
					};

					// Test through getToolInfoFromToolUse to verify protected method behavior
					mockFileTools.getToolInfo.mockReturnValue({
						title: 'File operation',
						kind: 'file' as ToolKind,
						content: [],
					});

					toolsManager.getToolInfoFromToolUse(toolUse, new Map());

					expect(mockFileTools.getToolInfo).toHaveBeenCalled();
				}
			});
		});

		describe('isSearchOperation', () => {
			it('should correctly identify search operations', () => {
				const searchToolNames = ['Glob', 'Grep', 'LS'];

				for (const toolName of searchToolNames) {
					const toolUse: AnyToolUse = {
						id: 'test-id',
						name: toolName,
						input: {},
					};

					mockSearchTools.getToolInfo.mockReturnValue({
						title: 'Search operation',
						kind: 'file' as ToolKind,
						content: [],
					});

					toolsManager.getToolInfoFromToolUse(toolUse, new Map());

					expect(mockSearchTools.getToolInfo).toHaveBeenCalled();
				}
			});
		});

		describe('isExecutionOperation', () => {
			it('should correctly identify execution operations', () => {
				const executionToolNames = ['Bash', 'BashOutput', 'KillBash', 'Task'];

				for (const toolName of executionToolNames) {
					const toolUse: AnyToolUse = {
						id: 'test-id',
						name: toolName,
						input: {},
					};

					mockExecutionTools.getToolInfo.mockReturnValue({
						title: 'Execution operation',
						kind: 'shell' as ToolKind,
						content: [],
					});

					toolsManager.getToolInfoFromToolUse(toolUse, new Map());

					expect(mockExecutionTools.getToolInfo).toHaveBeenCalled();
				}
			});
		});

		describe('isNotebookOperation', () => {
			it('should correctly identify notebook operations', () => {
				const notebookToolNames = ['NotebookRead', 'NotebookEdit'];

				for (const toolName of notebookToolNames) {
					const toolUse: AnyToolUse = {
						id: 'test-id',
						name: toolName,
						input: {},
					};

					mockNotebookTools.getToolInfo.mockReturnValue({
						title: 'Notebook operation',
						kind: 'file' as ToolKind,
						content: [],
					});

					toolsManager.getToolInfoFromToolUse(toolUse, new Map());

					expect(mockNotebookTools.getToolInfo).toHaveBeenCalled();
				}
			});
		});

		describe('isWebOperation', () => {
			it('should correctly identify web operations', () => {
				const webToolNames = ['WebFetch', 'WebSearch'];

				for (const toolName of webToolNames) {
					const toolUse: AnyToolUse = {
						id: 'test-id',
						name: toolName,
						input: {},
					};

					mockWebTools.getToolInfo.mockReturnValue({
						title: 'Web operation',
						kind: 'web' as ToolKind,
						content: [],
					});

					toolsManager.getToolInfoFromToolUse(toolUse, new Map());

					expect(mockWebTools.getToolInfo).toHaveBeenCalled();
				}
			});
		});

		describe('isPlanningOperation', () => {
			it('should correctly identify planning operations', () => {
				const planningToolNames = ['TodoWrite', 'ExitPlanMode', 'exitPlanMode'];

				for (const toolName of planningToolNames) {
					const toolUse: AnyToolUse = {
						id: 'test-id',
						name: toolName,
						input: {},
					};

					mockPlanningTools.getToolInfo.mockReturnValue({
						title: 'Planning operation',
						kind: 'generic' as ToolKind,
						content: [],
					});

					toolsManager.getToolInfoFromToolUse(toolUse, new Map());

					expect(mockPlanningTools.getToolInfo).toHaveBeenCalled();
				}
			});
		});
	});

	describe('edge cases and boundary conditions', () => {
		it('should handle tools with similar prefixes correctly', () => {
			// Test that tools with similar names are routed correctly
			const toolUse1: AnyToolUse = {
				id: 'test-id-1',
				name: 'Bash',
				input: {},
			};

			const toolUse2: AnyToolUse = {
				id: 'test-id-2',
				name: 'BashOutput',
				input: {},
			};

			mockExecutionTools.getToolInfo.mockReturnValue({
				title: 'Execution',
				kind: 'shell' as ToolKind,
				content: [],
			});

			toolsManager.getToolInfoFromToolUse(toolUse1, new Map());
			toolsManager.getToolInfoFromToolUse(toolUse2, new Map());

			expect(mockExecutionTools.getToolInfo).toHaveBeenCalledTimes(2);
		});

		it('should handle empty input objects', () => {
			const toolUse: AnyToolUse = {
				id: 'test-id',
				name: 'UnknownTool',
				input: {},
			};

			mockGenericTools.getToolInfo.mockReturnValue({
				title: 'Generic',
				kind: 'generic' as ToolKind,
				content: [],
			});

			const result = toolsManager.getToolInfoFromToolUse(toolUse);

			expect(mockGenericTools.getToolInfo).toHaveBeenCalledWith(toolUse);
			expect(result).toBeDefined();
		});

		it('should handle tools with null input', () => {
			const toolUse: AnyToolUse = {
				id: 'test-id',
				name: 'UnknownTool',
				input: null as any,
			};

			mockGenericTools.getToolInfo.mockReturnValue({
				title: 'Generic',
				kind: 'generic' as ToolKind,
				content: [],
			});

			const result = toolsManager.getToolInfoFromToolUse(toolUse);

			expect(mockGenericTools.getToolInfo).toHaveBeenCalledWith(toolUse);
			expect(result).toBeDefined();
		});

		it('should handle concurrent tool operations', async () => {
			const toolUse1: FileToolUse = {
				id: 'test-id-1',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path1' },
			};

			const toolUse2: ExecutionToolUse = {
				id: 'test-id-2',
				name: 'Bash',
				input: { command: 'ls' },
			};

			mockFileTools.getToolInfo.mockReturnValue({
				title: 'File operation',
				kind: 'file' as ToolKind,
				content: [],
			});

			mockExecutionTools.getToolInfo.mockReturnValue({
				title: 'Execution operation',
				kind: 'shell' as ToolKind,
				content: [],
			});

			const [result1, result2] = await Promise.all([
				Promise.resolve(toolsManager.getToolInfoFromToolUse(toolUse1)),
				Promise.resolve(toolsManager.getToolInfoFromToolUse(toolUse2)),
			]);

			expect(mockFileTools.getToolInfo).toHaveBeenCalledWith(toolUse1);
			expect(mockExecutionTools.getToolInfo).toHaveBeenCalledWith(toolUse2);
			expect(result1).toBeDefined();
			expect(result2).toBeDefined();
		});
	});

	describe('error propagation', () => {
		it('should propagate errors from planning tools convertPlanEntries', () => {
			const input = { todos: [] as ClaudePlanEntry[] };
			const error = new Error('Conversion failed');

			mockPlanningTools.convertPlanEntries.mockImplementation(() => {
				throw error;
			});

			expect(() => toolsManager.convertPlanEntries(input)).toThrow('Conversion failed');
		});

		it('should handle errors in generic fallback handler', () => {
			const toolUse: AnyToolUse = {
				id: 'test-id',
				name: 'UnknownTool',
				input: {},
			};

			const error = new Error('Generic handler failed');
			mockGenericTools.getToolInfo.mockImplementation(() => {
				throw error;
			});

			expect(() => toolsManager.getToolInfoFromToolUse(toolUse)).toThrow('Generic handler failed');
		});

		it('should handle errors in generic fallback for tool results', () => {
			const toolResult: ToolResult = {
				content: 'Result',
				tool_use_id: 'test-id',
				is_error: false,
			};

			const error = new Error('Generic update failed');
			mockGenericTools.getToolUpdate.mockImplementation(() => {
				throw error;
			});

			expect(() => toolsManager.getToolUpdateFromResult(toolResult)).toThrow('Generic update failed');
		});
	});

	describe('logging behavior', () => {
		it('should log debug messages for tool routing', () => {
			const toolUse: FileToolUse = {
				id: 'test-id',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path' },
			};

			mockFileTools.getToolInfo.mockReturnValue({
				title: 'File operation',
				kind: 'file' as ToolKind,
				content: [],
			});

			toolsManager.getToolInfoFromToolUse(toolUse);

			// Verify logger was called (we can't easily verify the exact messages due to mocking)
			const logger = (toolsManager as any).logger;
			expect(logger.debug).toHaveBeenCalled();
		});

		it('should log warnings when fallback is used', () => {
			const toolUse: FileToolUse = {
				id: 'test-id',
				name: 'mcp__zcc__read_file',
				input: { absPath: '/test/path' },
			};

			const error = new Error('Handler failed');
			mockFileTools.getToolInfo.mockImplementation(() => {
				throw error;
			});
			mockGenericTools.getToolInfo.mockReturnValue({
				title: 'Fallback',
				kind: 'generic' as ToolKind,
				content: [],
			});

			toolsManager.getToolInfoFromToolUse(toolUse);

			const logger = (toolsManager as any).logger;
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe('Tool Use Cache Operations', () => {
		const mockToolUse: AnyToolUse = {
			name: 'test_tool',
			tool_use_id: 'test-id-123',
			parameters: { param1: 'value1' },
		} as AnyToolUse;

		describe('setToolUse', () => {
			it('should store tool use data', () => {
				toolsManager.setToolUse('test-id', mockToolUse);

				const retrieved = toolsManager.getToolUse('test-id');

				expect(retrieved).toEqual(mockToolUse);
			});

			it('should overwrite existing tool use data', () => {
				const firstToolUse = { ...mockToolUse, parameters: { param: 'first' } };
				const secondToolUse = { ...mockToolUse, parameters: { param: 'second' } };

				toolsManager.setToolUse('test-id', firstToolUse);
				toolsManager.setToolUse('test-id', secondToolUse);

				const retrieved = toolsManager.getToolUse('test-id');
				expect(retrieved).toEqual(secondToolUse);
			});

			it('should handle empty tool use id', () => {
				toolsManager.setToolUse('', mockToolUse);

				const retrieved = toolsManager.getToolUse('');
				expect(retrieved).toEqual(mockToolUse);
			});

			it('should handle empty null use id', () => {
				expect(() => {
					toolsManager.setToolUse(null as any, mockToolUse);
				}).not.toThrow();
			});

			it('should handle empty undefined use id', () => {
				expect(() => {
					toolsManager.setToolUse(undefined as any, mockToolUse);
				}).not.toThrow();
			});

			it('should handle special characters in tool use id', () => {
				const specialId = 'test-id-@#$%^&*()';
				toolsManager.setToolUse(specialId, mockToolUse);

				const retrieved = toolsManager.getToolUse(specialId);
				expect(retrieved).toEqual(mockToolUse);
			});
		});

		describe('getToolUse', () => {
			it('should return undefined for non-existent tool use', () => {
				const retrieved = toolsManager.getToolUse('non-existent');
				expect(retrieved).toBeUndefined();
			});

			it('should return cached tool use data', () => {
				toolsManager.setToolUse('test-id', mockToolUse);

				const retrieved = toolsManager.getToolUse('test-id');
				expect(retrieved).toEqual(mockToolUse);
			});

			it('should handle null parameters in tool use', () => {
				const toolUseWithNull = { ...mockToolUse, parameters: null };
				toolsManager.setToolUse('null-params', toolUseWithNull);

				const retrieved = toolsManager.getToolUse('null-params');
				expect(retrieved).toEqual(toolUseWithNull);
			});
		});

		describe('concurrent tool use operations', () => {
			it('should handle multiple tool uses stored simultaneously', () => {
				const toolUse1 = { ...mockToolUse, tool_use_id: 'id1' };
				const toolUse2 = { ...mockToolUse, tool_use_id: 'id2' };
				const toolUse3 = { ...mockToolUse, tool_use_id: 'id3' };

				toolsManager.setToolUse('id1', toolUse1);
				toolsManager.setToolUse('id2', toolUse2);
				toolsManager.setToolUse('id3', toolUse3);

				expect(toolsManager.getToolUse('id1')).toEqual(toolUse1);
				expect(toolsManager.getToolUse('id2')).toEqual(toolUse2);
				expect(toolsManager.getToolUse('id3')).toEqual(toolUse3);
			});

			it('should handle rapid consecutive operations', () => {
				const iterations = 100;

				for (let i = 0; i < iterations; i++) {
					const toolUse = { ...mockToolUse, tool_use_id: `id-${i}` };
					toolsManager.setToolUse(`id-${i}`, toolUse);
				}

				for (let i = 0; i < iterations; i++) {
					const retrieved = toolsManager.getToolUse(`id-${i}`);
					expect(retrieved?.tool_use_id).toBe(`id-${i}`);
				}
			});
		});
	});

	describe('Cache Memory Management', () => {
		it('should handle large number of tool use cache entries', () => {
			const entries = 1000;

			for (let i = 0; i < entries; i++) {
				const toolUse = {
					name: 'test_tool',
					tool_use_id: `test-${i}`,
					parameters: { index: i },
				} as AnyToolUse;

				toolsManager.setToolUse(`id-${i}`, toolUse);
			}

			// Verify all entries are accessible
			for (let i = 0; i < entries; i++) {
				const retrieved = toolsManager.getToolUse(`id-${i}`);
				expect(retrieved?.parameters).toEqual({ index: i });
			}
		});
	});
});
