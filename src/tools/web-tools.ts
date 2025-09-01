import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';

// Web operation types
export interface WebFetchInput {
	url: string;
	prompt?: string;
}

export interface WebSearchInput {
	query: string;
	allowedDomains?: string[];
	blockedDomains?: string[];
}

export type WebToolUse = {
	id: string;
	name: string;
	input: WebFetchInput | WebSearchInput;
};

/**
 * Web operations tool handler - handles WebFetch and WebSearch operations
 */
export class WebToolsHandler implements ToolHandler {
	getToolInfo(toolUse: WebToolUse): ToolInfo {
		const name = toolUse.name;
		const input = toolUse.input;

		switch (name) {
			case 'WebFetch':
				return this.handleWebFetchTool(input as WebFetchInput);

			case 'WebSearch':
				return this.handleWebSearchTool(input as WebSearchInput);

			default:
				throw new Error(`Unsupported tool: ${name}`);
		}
	}

	getToolUpdate(toolResult: ClaudeToolResult | McpToolResult, _toolUse?: WebToolUse): ToolUpdate {
		// Web tools typically return content directly
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
	 * Handle web content fetching operations
	 */
	protected handleWebFetchTool(input: WebFetchInput): ToolInfo {
		return {
			title: input?.url ? `Fetch ${input.url}` : 'Fetch',
			kind: 'fetch',
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

	/**
	 * Handle web search operations
	 */
	protected handleWebSearchTool(input: WebSearchInput): ToolInfo {
		let label = `"${input.query}"`;

		if (input.allowedDomains && input.allowedDomains.length > 0) {
			label += ` (allowed: ${input.allowedDomains.join(', ')})`;
		}

		if (input.blockedDomains && input.blockedDomains.length > 0) {
			label += ` (blocked: ${input.blockedDomains.join(', ')})`;
		}

		return {
			title: label,
			kind: 'fetch',
			content: [],
		};
	}
}
