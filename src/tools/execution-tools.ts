import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';

// Execution operation types
export interface TaskInput {
	description?: string;
	prompt?: string;
}

export interface ToolResult {
	content: Array<{
		type: 'text';
		text: string;
	}>;
}

export type ExecutionToolUse = {
	id: string;
	name: string;
	input: TaskInput;
};

/**
 * Execution operations tool handler - handles Task and other execution tools
 */
export class ExecutionToolsHandler implements ToolHandler {
	getToolInfo(toolUse: ExecutionToolUse): ToolInfo {
		const name = toolUse.name;
		const input = toolUse.input;

		switch (name) {
			case 'Task':
				return this.handleTaskTool(input as TaskInput);

			default:
				throw new Error(`Unsupported tool: ${name}`);
		}
	}

	getToolUpdate(toolResult: ClaudeToolResult | McpToolResult, _toolUse?: ExecutionToolUse): ToolUpdate {
		// Execution tools typically return content directly
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
	 * Handle Task delegation to agents
	 */
	protected handleTaskTool(input: TaskInput): ToolInfo {
		return {
			title: input?.description ? input.description : 'task',
			kind: 'think',
			content: input?.prompt
				? [
						{
							type: 'content',
							content: { type: 'text', text: input.prompt },
						},
					]
				: [],
		};
	}
}
