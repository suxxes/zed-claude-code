import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';

// File operation types (used by file tools handlers)
export interface ReadFileInput {
	filePath?: string; // MCP format
	offset?: number;
	limit?: number;
}

export interface EditFileInput {
	filePath?: string; // MCP format
	oldText?: string;
	newText?: string;
	content?: string; // For write operations
}

export interface MultiEditInput {
	filePath: string;
	edits: Array<{
		oldString: string;
		newString: string;
		replaceAll?: boolean;
	}>;
}

export type FileToolUse = {
	id: string;
	name: string;
	input: ReadFileInput | EditFileInput | MultiEditInput;
};

/**
 * File operations tool handler - handles read, edit, write, and multi-edit operations
 */
export class FileToolsHandler implements ToolHandler {
	getToolInfo(toolUse: FileToolUse): ToolInfo {
		const name = toolUse.name;
		const input = toolUse.input;

		switch (name) {
			case 'mcp__zcc__read_file':
			case 'Read':
				return this.handleReadTool(input as ReadFileInput);

			case 'mcp__zcc__edit_file':
			case 'mcp__zcc__write_file':
			case 'Edit':
			case 'Write':
				return this.handleEditTool(input as EditFileInput);

			case 'mcp__zcc__multi_edit':
			case 'MultiEdit':
				return this.handleMultiEditTool(input as MultiEditInput);

			default:
				throw new Error(`Unsupported tool: ${name}`);
		}
	}

	getToolUpdate(toolResult: ClaudeToolResult | McpToolResult, toolUse?: FileToolUse): ToolUpdate {
		if (!toolUse) {
			return {};
		}

		const toolName = toolUse.name;

		switch (toolName) {
			case 'mcp__zcc__read_file':
			case 'Read':
				return this.handleReadUpdate(toolResult);

			case 'mcp__zcc__edit_file':
			case 'mcp__zcc__write_file':
			case 'Edit':
			case 'Write':
				return this.handleEditUpdate(toolResult, toolUse);

			case 'mcp__zcc__multi_edit':
			case 'MultiEdit':
				return this.handleMultiEditUpdate(toolResult, toolUse);

			default:
				return {};
		}
	}

	/**
	 * Handle file read operations
	 */
	protected handleReadTool(input: ReadFileInput): ToolInfo {
		let limit = '';

		if (input.limit) {
			limit = ` (${(input.offset ?? 0) + 1} - ${(input.offset ?? 0) + input.limit})`;
		} else if (input.offset) {
			limit = ` (from line ${input.offset + 1})`;
		}

		return {
			title: `Read ${input.filePath ?? 'File'}${limit}`,
			kind: 'read',
			locations: input.filePath
				? [
						{
							path: input.filePath,
							line: input.offset ?? 0,
						},
					]
				: [],
			content: [],
		};
	}

	/**
	 * Handle edit/write operations (unified handler)
	 */
	protected handleEditTool(input: EditFileInput): ToolInfo {
		// Handle write operation (content provided)
		if (input.content && !input.oldText) {
			return {
				title: input.filePath ? `Write ${input.filePath}` : 'Write',
				kind: 'edit',
				content: input.filePath
					? [
							{
								type: 'diff',
								path: input.filePath,
								oldText: null,
								newText: input.content,
							},
						]
					: [],
				locations: input.filePath ? [{ path: input.filePath }] : [],
			};
		}

		return {
			title: input.filePath ? `Edit ${input.filePath}` : 'Edit',
			kind: 'edit',
			content: input.filePath
				? [
						{
							type: 'diff',
							path: input.filePath,
							oldText: input.oldText,
							newText: input.newText || '',
						},
					]
				: [],
			locations: input.filePath ? [{ path: input.filePath }] : [],
		};
	}

	/**
	 * Handle multi-edit operations
	 */
	protected handleMultiEditTool(input: MultiEditInput): ToolInfo {
		return {
			title: input?.filePath ? `Edit ${input.filePath}` : 'Edit',
			kind: 'edit',
			content: input.edits.reduce(
				(content, edit) => {
					content.push({
						type: 'diff',
						path: input.filePath,
						oldText: edit.oldString,
						newText: edit.newString,
					});

					return content;
				},
				[] as ToolInfo['content'],
			),
			locations: input?.filePath ? [{ path: input.filePath }] : [],
		};
	}

	/**
	 * Handle read tool result updates
	 */
	protected handleReadUpdate(toolResult: ClaudeToolResult | McpToolResult): ToolUpdate {
		// Handle ClaudeToolResult format (content is string)
		if (typeof toolResult?.content === 'string' && toolResult.content.length > 0) {
			return {
				content: [
					{
						type: 'content',
						content: {
							type: 'text',
							text: this.markdownEscape(toolResult.content),
						},
					},
				],
			};
		}
		// Handle McpToolResult format (content is array)
		else if (Array.isArray(toolResult?.content) && toolResult.content.length > 0) {
			return {
				content: toolResult.content.map((content) => ({
					type: 'content',
					content:
						content.type === 'text'
							? {
									type: 'text',
									text: this.markdownEscape(content.text),
								}
							: content,
				})),
			};
		}
		return {};
	}

	/**
	 * Handle edit tool result updates
	 */
	protected handleEditUpdate(toolResult: ClaudeToolResult | McpToolResult, toolUse: FileToolUse): ToolUpdate {
		// Handle both ClaudeToolResult and McpToolResult formats
		const contentArray = Array.isArray(toolResult.content)
			? toolResult.content
			: [{ type: 'text' as const, text: toolResult.content }];

		if (contentArray.length > 0) {
			try {
				const firstContent = contentArray[0];
				const data = JSON.parse(firstContent.text);

				if (data.lineNumbers && Array.isArray(data.lineNumbers)) {
					const locations = data.lineNumbers.map((line: number) => ({
						path: toolUse.input.filePath,
						line: line,
					}));

					return { locations };
				}
			} catch {
				// If parsing fails, return empty object
			}
		}

		return {};
	}

	/**
	 * Handle multi-edit tool result updates
	 */
	protected handleMultiEditUpdate(toolResult: ClaudeToolResult | McpToolResult, toolUse: FileToolUse): ToolUpdate {
		// Handle both ClaudeToolResult and McpToolResult formats
		const contentArray = Array.isArray(toolResult.content)
			? toolResult.content
			: [{ type: 'text' as const, text: toolResult.content }];

		if (contentArray.length > 0) {
			try {
				const firstContent = contentArray[0];
				const data = JSON.parse(firstContent.text);

				if (data.lineNumbers && Array.isArray(data.lineNumbers)) {
					const locations = data.lineNumbers.map((line: number) => ({
						path: toolUse.input.filePath,
						line: line,
					}));

					return { locations };
				}
			} catch {
				// If parsing fails, return empty object
			}
		}

		return {};
	}

	/**
	 * Escape markdown text for safe display
	 */
	protected markdownEscape(text: string): string {
		let escapeSequence = '```';

		for (const [m] of text.matchAll(/^```+/gm)) {
			if (m.length >= escapeSequence.length) {
				escapeSequence = '`'.repeat(m.length + 1);
			}
		}

		return `${escapeSequence}\n${text}${text.endsWith('\n') ? '' : '\n'}${escapeSequence}`;
	}
}
