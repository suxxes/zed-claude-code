import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';

// File operation types (used by file tools handlers)
export interface ReadFileInput {
	file_path?: string; // MCP format
	offset?: number;
	limit?: number;
}

export interface EditFileInput {
	file_path?: string; // MCP format
	old_text?: string;
	new_text?: string;
	content?: string; // For write operations
}

export interface MultiEditInput {
	file_path: string;
	edits: Array<{
		old_string: string;
		new_string: string;
		replace_all?: boolean;
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
		// Get the file path from file_path (MCP tools use file_path)
		const filePath = input.file_path;

		let limit = '';

		if (input.limit) {
			limit = ` (${(input.offset ?? 0) + 1} - ${(input.offset ?? 0) + input.limit})`;
		} else if (input.offset) {
			limit = ` (from line ${input.offset + 1})`;
		}

		return {
			title: `Read ${filePath ?? 'File'}${limit}`,
			kind: 'read',
			locations: filePath
				? [
						{
							path: filePath,
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
		// Get the file path from file_path (MCP tools use file_path)
		const filePath = input.file_path;

		// Handle write operation (content provided)
		if (input.content && !input.old_text) {
			return {
				title: filePath ? `Write ${filePath}` : 'Write',
				kind: 'edit',
				content: filePath
					? [
							{
								type: 'diff',
								path: filePath,
								oldText: null,
								newText: input.content,
							},
						]
					: [],
				locations: filePath ? [{ path: filePath }] : [],
			};
		}

		return {
			title: filePath ? `Edit ${filePath}` : 'Edit',
			kind: 'edit',
			content: filePath
				? [
						{
							type: 'diff',
							path: filePath,
							oldText: input.old_text,
							newText: input.new_text || '',
						},
					]
				: [],
			locations: filePath ? [{ path: filePath }] : [],
		};
	}

	/**
	 * Handle multi-edit operations
	 */
	protected handleMultiEditTool(input: MultiEditInput): ToolInfo {
		return {
			title: input?.file_path ? `Edit ${input.file_path}` : 'Edit',
			kind: 'edit',
			content: input.edits.reduce(
				(content, edit) => {
					content.push({
						type: 'diff',
						path: input.file_path,
						oldText: edit.old_string,
						newText: edit.new_string,
					});

					return content;
				},
				[] as ToolInfo['content'],
			),
			locations: input?.file_path ? [{ path: input.file_path }] : [],
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
						path: toolUse.input.file_path,
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
						path: toolUse.input.file_path,
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
