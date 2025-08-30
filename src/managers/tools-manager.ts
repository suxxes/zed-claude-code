import type {
	PlanEntry,
	ReadTextFileRequest,
	ReadTextFileResponse,
	ToolCallContent,
	ToolCallLocation,
	ToolKind,
	WriteTextFileRequest,
	WriteTextFileResponse,
} from '@zed-industries/agent-client-protocol';
// Import specific tool use types from individual tool handlers
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
import { Logger } from '../utils/logger';

// Union type for all possible tool uses
export type AnyToolUse =
	| ExecutionToolUse
	| FileToolUse
	| GenericToolUse
	| NotebookToolUse
	| PlanningToolUse
	| SearchToolUse
	| WebToolUse;

export interface ClaudeToolResult {
	content: string;
	tool_use_id: string;
	is_error: boolean;
}

/**
 * Interface for ACP operations that tools can perform
 */
export interface AcpOperations {
	readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse>;
	writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse>;
	requestPermissions?(path: string): Promise<void>;
}

/**
 * Tool execution result from MCP tool handlers (matches MCP SDK format)
 */
export interface McpToolResult {
	content: Array<{
		type: 'text';
		text: string;
	}>;
}

/**
 * Tool information for ACP client UI rendering
 */
export interface ToolInfo {
	title: string;
	kind: ToolKind;
	content: ToolCallContent[];
	locations?: ToolCallLocation[];
}

/**
 * Tool update information for result processing
 */
export interface ToolUpdate {
	title?: string;
	content?: ToolCallContent[];
	locations?: ToolCallLocation[];
}

/**
 * Claude plan entry format from TodoWrite tool
 */
export type ClaudePlanEntry = {
	content: string;
	status: 'pending' | 'in_progress' | 'completed';
	activeForm: string;
	priority: 'high' | 'medium' | 'low';
};

/**
 * Base interface for all tool handlers
 */
export interface ToolHandler {
	/**
	 * Generate tool info for ACP client UI
	 */
	getToolInfo(toolUse: AnyToolUse, cachedFileContent: Map<string, string>): ToolInfo;

	/**
	 * Process tool result and generate update info
	 */
	getToolUpdate(toolResult: ClaudeToolResult | McpToolResult, toolUse?: AnyToolUse): ToolUpdate;
}

/**
 * Main tools manager that coordinates all specialized tool handlers
 */
export class ToolsManager {
	protected fileTools: FileToolsHandler;
	protected searchTools: SearchToolsHandler;
	protected executionTools: ExecutionToolsHandler;
	protected notebookTools: NotebookToolsHandler;
	protected webTools: WebToolsHandler;
	protected planningTools: PlanningToolsHandler;
	protected genericTools: GenericToolsHandler;
	protected logger: Logger;

	constructor() {
		this.fileTools = new FileToolsHandler();
		this.searchTools = new SearchToolsHandler();
		this.executionTools = new ExecutionToolsHandler();
		this.notebookTools = new NotebookToolsHandler();
		this.webTools = new WebToolsHandler();
		this.planningTools = new PlanningToolsHandler();
		this.genericTools = new GenericToolsHandler();
		this.logger = new Logger({ component: 'Tools Manager' });
	}

	/**
	 * Get tool info from tool use by routing to appropriate handler
	 */
	getToolInfoFromToolUse(toolUse: AnyToolUse, cachedFileContent: Map<string, string>): ToolInfo {
		const _name = toolUse.name;
		this.logger.debug(`Getting tool info for: ${toolUse.name} (${toolUse.id})`);

		try {
			// Route to appropriate handler based on tool type
			if (this.isFileOperation(toolUse)) {
				this.logger.debug(`Routing ${toolUse.name} to file tools handler`);
				return this.fileTools.getToolInfo(toolUse, cachedFileContent);
			} else if (this.isSearchOperation(toolUse)) {
				this.logger.debug(`Routing ${toolUse.name} to search tools handler`);
				return this.searchTools.getToolInfo(toolUse, cachedFileContent);
			} else if (this.isExecutionOperation(toolUse)) {
				this.logger.debug(`Routing ${toolUse.name} to execution tools handler`);
				return this.executionTools.getToolInfo(toolUse, cachedFileContent);
			} else if (this.isNotebookOperation(toolUse)) {
				this.logger.debug(`Routing ${toolUse.name} to notebook tools handler`);
				return this.notebookTools.getToolInfo(toolUse, cachedFileContent);
			} else if (this.isWebOperation(toolUse)) {
				this.logger.debug(`Routing ${toolUse.name} to web tools handler`);
				return this.webTools.getToolInfo(toolUse, cachedFileContent);
			} else if (this.isPlanningOperation(toolUse)) {
				this.logger.debug(`Routing ${toolUse.name} to planning tools handler`);
				return this.planningTools.getToolInfo(toolUse, cachedFileContent);
			} else {
				this.logger.debug(`Routing ${toolUse.name} to generic tools handler`);
				return this.genericTools.getToolInfo(toolUse as GenericToolUse, cachedFileContent);
			}
		} catch (error) {
			this.logger.warn(
				`Specialized handler failed for ${toolUse.name}, falling back to generic: ${error instanceof Error ? error.message : String(error)}`,
			);
			// Fallback to generic handler if specialized handler fails
			return this.genericTools.getToolInfo(toolUse as GenericToolUse, cachedFileContent);
		}
	}

	/**
	 * Get tool update from tool result by routing to appropriate handler
	 */
	getToolUpdateFromResult(toolResult: ClaudeToolResult, toolUse?: AnyToolUse): ToolUpdate {
		this.logger.debug(`Getting tool update for result: ${toolResult.tool_use_id} (error: ${toolResult.is_error})`);

		if (!toolUse) {
			this.logger.debug('No tool use provided, using generic handler');
			return this.genericTools.getToolUpdate(toolResult, undefined);
		}

		try {
			// Route to appropriate handler based on tool type
			if (this.isFileOperation(toolUse)) {
				this.logger.debug(`Processing ${toolUse.name} result with file tools handler`);
				return this.fileTools.getToolUpdate(toolResult, toolUse);
			} else if (this.isSearchOperation(toolUse)) {
				this.logger.debug(`Processing ${toolUse.name} result with search tools handler`);
				return this.searchTools.getToolUpdate(toolResult, toolUse);
			} else if (this.isExecutionOperation(toolUse)) {
				this.logger.debug(`Processing ${toolUse.name} result with execution tools handler`);
				return this.executionTools.getToolUpdate(toolResult, toolUse);
			} else if (this.isNotebookOperation(toolUse)) {
				this.logger.debug(`Processing ${toolUse.name} result with notebook tools handler`);
				return this.notebookTools.getToolUpdate(toolResult, toolUse);
			} else if (this.isWebOperation(toolUse)) {
				this.logger.debug(`Processing ${toolUse.name} result with web tools handler`);
				return this.webTools.getToolUpdate(toolResult, toolUse);
			} else if (this.isPlanningOperation(toolUse)) {
				this.logger.debug(`Processing ${toolUse.name} result with planning tools handler`);
				return this.planningTools.getToolUpdate(toolResult, toolUse);
			} else {
				this.logger.debug(`Processing ${toolUse.name} result with generic tools handler`);
				return this.genericTools.getToolUpdate(toolResult, toolUse as GenericToolUse);
			}
		} catch (error) {
			this.logger.warn(
				`Specialized handler failed for ${toolUse.name} result, falling back to generic: ${error instanceof Error ? error.message : String(error)}`,
			);
			// Fallback to generic handler if specialized handler fails
			return this.genericTools.getToolUpdate(toolResult, toolUse as GenericToolUse);
		}
	}

	/**
	 * Convert plan entries using planning tools handler
	 */
	convertPlanEntries(input: { todos: ClaudePlanEntry[] }): PlanEntry[] {
		return this.planningTools.convertPlanEntries(input);
	}

	/**
	 * Check if tool is a file operation
	 */
	protected isFileOperation(toolUse: AnyToolUse): toolUse is FileToolUse {
		const isFileOp = [
			'mcp__zcc__read_file',
			'mcp__zcc__edit_file',
			'mcp__zcc__write_file',
			'mcp__zcc__multi_edit',
			'Read',
			'Edit',
			'Write',
			'MultiEdit',
		].includes(toolUse.name);

		if (isFileOp) {
			this.logger.debug(`Tool ${toolUse.name} identified as file operation`);
		}

		return isFileOp;
	}

	/**
	 * Check if tool is a search operation
	 */
	protected isSearchOperation(toolUse: AnyToolUse): toolUse is SearchToolUse {
		return ['Glob', 'Grep', 'LS'].includes(toolUse.name);
	}

	/**
	 * Check if tool is an execution operation
	 */
	protected isExecutionOperation(toolUse: AnyToolUse): toolUse is ExecutionToolUse {
		return ['Bash', 'BashOutput', 'KillBash', 'Task'].includes(toolUse.name);
	}

	/**
	 * Check if tool is a notebook operation
	 */
	protected isNotebookOperation(toolUse: AnyToolUse): toolUse is NotebookToolUse {
		return ['NotebookRead', 'NotebookEdit'].includes(toolUse.name);
	}

	/**
	 * Check if tool is a web operation
	 */
	protected isWebOperation(toolUse: AnyToolUse): toolUse is WebToolUse {
		return ['WebFetch', 'WebSearch'].includes(toolUse.name);
	}

	/**
	 * Check if tool is a planning operation
	 */
	protected isPlanningOperation(toolUse: AnyToolUse): toolUse is PlanningToolUse {
		return ['TodoWrite', 'ExitPlanMode', 'exitPlanMode'].includes(toolUse.name);
	}
}
