import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';

// Search operation types
export interface GlobInput {
	pattern: string;
	path?: string;
}

export interface GrepInput {
	pattern: string;
	path?: string;
	glob?: string;
	type?: string;
	multiline?: boolean;
	'-i'?: boolean;
	'-n'?: boolean;
	'-A'?: number;
	'-B'?: number;
	'-C'?: number;
	outputMode?: 'content' | 'FilesWithMatches' | 'Count';
	headLimit?: number;
}

export interface LsInput {
	path?: string;
}

export type SearchToolUse = {
	id: string;
	name: string;
	input: GlobInput | GrepInput | LsInput;
};

/**
 * Search operations tool handler - handles Glob, Grep, and LS operations
 */
export class SearchToolsHandler implements ToolHandler {
	getToolInfo(toolUse: SearchToolUse): ToolInfo {
		const name = toolUse.name;
		const input = toolUse.input;

		switch (name) {
			case 'Glob':
				return this.handleGlobTool(input as GlobInput);

			case 'Grep':
				return this.handleGrepTool(input as GrepInput);

			case 'LS':
				return this.handleLsTool(input as LsInput);

			default:
				throw new Error(`Unsupported tool: ${name}`);
		}
	}

	getToolUpdate(toolResult: ClaudeToolResult | McpToolResult, _toolUse?: SearchToolUse): ToolUpdate {
		// Search tools typically return content directly
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
	 * Handle Glob search operations
	 */
	protected handleGlobTool(input: GlobInput): ToolInfo {
		let label = 'find';
		if (input.path) label += ` ${input.path}`;
		if (input.pattern) label += ` ${input.pattern}`;

		return {
			title: label,
			kind: 'search',
			content: [],
			locations: input.path ? [{ path: input.path }] : [],
		};
	}

	/**
	 * Handle Grep search operations
	 */
	protected handleGrepTool(input: GrepInput): ToolInfo {
		let label = 'grep';

		// Add flags
		if (input['-i']) label += ' -i';
		if (input['-n']) label += ' -n';
		if (input['-A'] !== undefined) label += ` -A ${input['-A']}`;
		if (input['-B'] !== undefined) label += ` -B ${input['-B']}`;
		if (input['-C'] !== undefined) label += ` -C ${input['-C']}`;

		// Add output mode
		if (input.outputMode) {
			switch (input.outputMode) {
				case 'FilesWithMatches':
					label += ' -l';
					break;
				case 'Count':
					label += ' -c';
					break;
			}
		}

		// Add additional options
		if (input.headLimit !== undefined) label += ` | head -${input.headLimit}`;
		if (input.glob) label += ` --include="${input.glob}"`;
		if (input.type) label += ` --type=${input.type}`;
		if (input.multiline) label += ' -P';

		// Add pattern and path
		label += ` "${input.pattern}"`;
		if (input.path) label += ` ${input.path}`;

		return {
			title: label,
			kind: 'search',
			content: [],
		};
	}

	/**
	 * Handle LS directory listing operations
	 */
	protected handleLsTool(input: LsInput): ToolInfo {
		return {
			title: input?.path ? `ls \`${input.path}\`` : 'ls',
			kind: 'search',
			content: [],
			locations: [],
		};
	}
}
