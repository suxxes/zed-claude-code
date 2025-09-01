import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';

// Execution operation types
export interface BashInput {
	command: string;
	description?: string;
}

export type BashOutputInput = Record<string, never>;

export type KillBashInput = Record<string, never>;

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
	input: BashInput | BashOutputInput | KillBashInput | TaskInput;
};

/**
 * Execution operations tool handler - handles Bash, Task, and other execution tools
 */
export class ExecutionToolsHandler implements ToolHandler {
	getToolInfo(toolUse: ExecutionToolUse): ToolInfo {
		const name = toolUse.name;
		const input = toolUse.input;

		switch (name) {
			case 'Bash':
				return this.handleBashTool(input as BashInput);

			case 'BashOutput':
				return this.handleBashOutputTool(input as BashOutputInput);

			case 'KillBash':
				return this.handleKillBashTool(input as KillBashInput);

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
	 * Handle Bash command execution
	 */
	protected handleBashTool(input: BashInput): ToolInfo {
		return {
			title: input?.command ? `\`${input.command.replaceAll('`', '\\`')}\`` : 'Terminal',
			kind: 'execute',
			content: input?.description
				? [
						{
							type: 'content',
							content: { type: 'text', text: input.description },
						},
					]
				: [],
		};
	}

	/**
	 * Handle Bash output monitoring
	 */
	protected handleBashOutputTool(_input: BashOutputInput): ToolInfo {
		return {
			title: 'Tail Logs',
			kind: 'execute',
			content: [],
		};
	}

	/**
	 * Handle Bash process termination
	 */
	protected handleKillBashTool(_input: KillBashInput): ToolInfo {
		return {
			title: 'Kill Process',
			kind: 'execute',
			content: [],
		};
	}

	/**
	 * Handle Task delegation to agents
	 */
	protected handleTaskTool(input: TaskInput): ToolInfo {
		return {
			title: input?.description ? input.description : 'Task',
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
