import type { PlanEntry } from '@zed-industries/agent-client-protocol';
import type {
	ClaudePlanEntry,
	ClaudeToolResult,
	McpToolResult,
	ToolHandler,
	ToolInfo,
	ToolUpdate,
} from '../managers/tools-manager';

// Planning operation types
export interface TodoWriteInput {
	todos: Array<{
		content: string;
		status: 'pending' | 'in_progress' | 'completed';
		priority?: 'low' | 'medium' | 'high';
		id?: string;
	}>;
}

export interface ExitPlanModeInput {
	plan?: string;
}

export type PlanningToolUse = {
	id: string;
	name: string;
	input: TodoWriteInput | ExitPlanModeInput;
};

/**
 * Planning operations tool handler - handles TodoWrite and ExitPlanMode operations
 */
export class PlanningToolsHandler implements ToolHandler {
	getToolInfo(toolUse: PlanningToolUse): ToolInfo {
		const name = toolUse.name;
		const input = toolUse.input;

		switch (name) {
			case 'TodoWrite':
				return this.handleTodoWriteTool(input as TodoWriteInput);

			case 'ExitPlanMode':
			case 'exitPlanMode':
				return this.handleExitPlanModeTool(input as ExitPlanModeInput);

			default:
				throw new Error(`Unsupported tool: ${name}`);
		}
	}

	getToolUpdate(toolResult: ClaudeToolResult | McpToolResult, _toolUse?: PlanningToolUse): ToolUpdate {
		// Planning tools typically don't need special update handling
		if (Array.isArray(toolResult.content) && toolResult.content.length > 0) {
			return {
				content: toolResult.content.map((content) => ({
					type: 'content',
					content,
				})),
			};
		} else if (typeof toolResult.content === 'string' && toolResult.content.length > 0) {
			return {
				content: [
					{
						type: 'content',
						content: {
							type: 'text',
							text: toolResult.content,
						},
					},
				],
			};
		}

		return {};
	}

	/**
	 * Handle TODO management operations
	 */
	protected handleTodoWriteTool(input: TodoWriteInput): ToolInfo {
		return {
			title: input?.todos ? `Update TODOs: ${input.todos.map((todo) => todo.content).join(', ')}` : 'Update TODO',
			kind: 'think',
			content: [],
		};
	}

	/**
	 * Handle plan mode exit operations
	 */
	protected handleExitPlanModeTool(input: ExitPlanModeInput): ToolInfo {
		return {
			title: 'Exit Plan Mode',
			kind: 'think',
			content: input?.plan ? [{ type: 'content', content: { type: 'text', text: input.plan } }] : [],
		};
	}

	/**
	 * Convert Claude plan entries to ACP plan format
	 */
	convertPlanEntries(input: { todos: ClaudePlanEntry[] }): PlanEntry[] {
		return input.todos.map((todo) => ({
			content: todo.content,
			status: todo.status,
			activeForm: todo.activeForm,
			priority: 'medium',
		}));
	}
}
