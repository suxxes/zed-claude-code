import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';

// File operation types (used by file tools handlers)
export interface ReadFileInput {
	absPath?: string; // Standard format
	path?: string; // MCP format
	offset?: number;
	limit?: number;
}

export interface PathFileInput extends ReadFileInput {
	absPath?: string; // Standard format
	path: string; // MCP format
}

export interface EditFileInput {
	absPath?: string; // Standard format
	file_path?: string; // MCP format
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
	getToolInfo(toolUse: FileToolUse, cachedFileContent: Map<string, string>): ToolInfo {
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
				return this.handleEditTool(input as EditFileInput, cachedFileContent);

			case 'mcp__zcc__multi_edit':
			case 'MultiEdit':
				return this.handleMultiEditTool(input as MultiEditInput, cachedFileContent);

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
		// Get the file path from either absPath or path (MCP tools use path)
		const filePath = input.absPath || input.path;

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
	protected handleEditTool(input: EditFileInput, _cachedFileContent: Map<string, string>): ToolInfo {
		// Get the file path from either absPath or file_path (MCP tools use file_path)
		const filePath = input.absPath || input.file_path;

		// Handle write operation (content provided)
		if (input.content && !input.oldText) {
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
							oldText: input.oldText || null,
							newText: input.newText || '',
						},
					]
				: [],
			locations: filePath ? [{ path: filePath }] : [],
		};
	}

	/**
	 * Handle multi-edit operations
	 */
	protected handleMultiEditTool(input: MultiEditInput, cachedFileContent: Map<string, string>): ToolInfo {
		let oldTextMulti = input.edits.map((edit) => edit.oldString).join('\n');
		const newTextMulti = input.edits.map((edit) => edit.newString).join('\n');

		try {
			if (input.edits && input.filePath) {
				oldTextMulti = cachedFileContent.get(input.filePath) || input.edits.map((edit) => edit.oldString).join('\n');
			}
		} catch {
			//
		}

		return {
			title: input?.filePath ? `Edit ${input.filePath}` : 'Edit',
			kind: 'edit',
			content: [
				{
					type: 'diff',
					path: input.filePath,
					oldText: oldTextMulti,
					newText: newTextMulti,
				},
			],
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
						path:
							'absPath' in toolUse.input
								? (toolUse.input as ReadFileInput | EditFileInput).absPath
								: (toolUse.input as MultiEditInput).filePath,
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
						path:
							'filePath' in toolUse.input
								? (toolUse.input as MultiEditInput).filePath
								: (toolUse.input as ReadFileInput | EditFileInput).absPath,
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
			while (m.length >= escapeSequence.length) {
				escapeSequence += '`';
			}
		}

		return `${escapeSequence}\n${text}${text.endsWith('\n') ? '' : '\n'}${escapeSequence}`;
	}
}
