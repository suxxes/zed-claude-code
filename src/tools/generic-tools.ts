import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';

export type GenericToolUse = {
	id: string;
	name: string;
	input: unknown;
};

/**
 * Generic tool handler for unknown or other tools
 */
export class GenericToolsHandler implements ToolHandler {
	getToolInfo(toolUse: GenericToolUse, _cachedFileContent: Map<string, string>): ToolInfo {
		const name = toolUse.name;
		const input = toolUse.input;

		// Handle known generic tools
		if (name === 'Other') {
			return this.handleOtherTool(name, input);
		}

		// Handle unknown tools
		return this.handleUnknownTool(name, input);
	}

	getToolUpdate(toolResult: ClaudeToolResult | McpToolResult, _toolUse?: GenericToolUse): ToolUpdate {
		// Generic handler for tool updates - handle both string and array content
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
	 * Handle "Other" tool type with JSON display
	 */
	protected handleOtherTool(name: string, input: unknown): ToolInfo {
		return {
			title: name || 'Unknown Tool',
			kind: 'other',
			content: [
				{
					type: 'content',
					content: {
						type: 'text',
						text: `\`\`\`json\n${JSON.stringify(input, null, 2) || '{}'}\`\`\``,
					},
				},
			],
		};
	}

	/**
	 * Handle completely unknown tools
	 */
	protected handleUnknownTool(name: string, input?: unknown): ToolInfo {
		return {
			title: name || 'Unknown Tool',
			kind: 'other',
			content: input
				? [
						{
							type: 'content',
							content: {
								type: 'text',
								text: `\`\`\`json\n${JSON.stringify(input, null, 2)}\`\`\``,
							},
						},
					]
				: [],
		};
	}
}
