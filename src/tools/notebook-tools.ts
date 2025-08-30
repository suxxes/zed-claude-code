import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';

// Notebook operation types
export interface NotebookReadInput {
	notebook_path: string;
}

export interface NotebookEditInput {
	notebook_path: string;
	new_source?: string;
}

export type NotebookToolUse = {
	id: string;
	name: string;
	input: NotebookReadInput | NotebookEditInput;
};

/**
 * Jupyter Notebook operations tool handler - handles NotebookRead and NotebookEdit
 */
export class NotebookToolsHandler implements ToolHandler {
	getToolInfo(toolUse: NotebookToolUse, _cachedFileContent: Map<string, string>): ToolInfo {
		const name = toolUse.name;
		const input = toolUse.input;

		switch (name) {
			case 'NotebookRead':
				return this.handleNotebookReadTool(input);

			case 'NotebookEdit':
				return this.handleNotebookEditTool(input);

			default:
				throw new Error(`Unsupported tool: ${name}`);
		}
	}

	getToolUpdate(toolResult: ClaudeToolResult | McpToolResult, _toolUse?: NotebookToolUse): ToolUpdate {
		// Notebook tools typically return content directly
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
	 * Handle Jupyter Notebook reading operations
	 */
	protected handleNotebookReadTool(input: NotebookReadInput): ToolInfo {
		return {
			title: input?.notebook_path ? `Read Jupyter Notebook ${input.notebook_path}` : 'Read Jupyter Notebook',
			kind: 'read',
			content: [],
			locations: input?.notebook_path ? [{ path: input.notebook_path }] : [],
		};
	}

	/**
	 * Handle Jupyter Notebook editing operations
	 */
	protected handleNotebookEditTool(input: NotebookEditInput): ToolInfo {
		return {
			title: input?.notebook_path ? `Edit Jupyter Notebook ${input.notebook_path}` : 'Edit Jupyter Notebook',
			kind: 'edit',
			content: input?.new_source
				? [
						{
							type: 'content',
							content: { type: 'text', text: input.new_source },
						},
					]
				: [],
			locations: input?.notebook_path ? [{ path: input.notebook_path }] : [],
		};
	}
}
