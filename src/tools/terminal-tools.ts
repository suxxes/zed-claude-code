import type { ClaudeToolResult, McpToolResult, ToolHandler, ToolInfo, ToolUpdate } from '../managers/tools-manager';
import { Logger } from '../utils/logger';

export interface TerminalCreateInput {
	command: string;
	args?: string[];
	cwd?: string;
	env?: Array<{ name: string; value: string }>;
}

interface TerminalCreateInputWithDescription extends TerminalCreateInput {
	description?: string;
}

export interface TerminalOutputInput {
	terminalId: string;
}

export interface TerminalKillInput {
	terminalId: string;
}

export interface TerminalReleaseInput {
	terminalId: string;
}

export interface TerminalWaitForExitInput {
	terminalId: string;
}

export type TerminalToolUse = {
	id: string;
	name: string;
	input:
		| TerminalCreateInput
		| TerminalOutputInput
		| TerminalKillInput
		| TerminalReleaseInput
		| TerminalWaitForExitInput;
};

/**
 * Terminal operations handler that maps ACP terminal methods to terminal handles
 */
export class TerminalToolsHandler implements ToolHandler {
	protected logger: Logger;

	constructor() {
		this.logger = new Logger({ component: 'TerminalToolsHandler' });
	}

	getToolInfo(toolUse: TerminalToolUse): ToolInfo {
		const name = toolUse.name;
		const input = toolUse.input;

		switch (name) {
			case 'mcp__zcc__terminal_create':
				return this.handleTerminalCreateTool(input as TerminalCreateInput);

			case 'mcp__zcc__terminal_output':
				return this.handleTerminalOutputTool(input as TerminalOutputInput);

			case 'mcp__zcc__terminal_kill':
				return this.handleTerminalKillTool(input as TerminalKillInput);

			default:
				throw new Error(`Unsupported terminal tool: ${name}`);
		}
	}

	getToolUpdate(toolResult: ClaudeToolResult | McpToolResult, toolUse?: TerminalToolUse): ToolUpdate {
		if (toolUse?.name === 'mcp__zcc__terminal_create') {
			return {};
		}

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

	protected handleTerminalCreateTool(input: TerminalCreateInput): ToolInfo {
		const title = input.command?.replaceAll('`', '\\`') ?? 'Terminal';
		const content = [];

		// Add description if provided
		const inputWithDesc = input as TerminalCreateInputWithDescription;
		if (inputWithDesc.description) {
			content.push({
				type: 'content' as const,
				content: {
					type: 'text' as const,
					text: inputWithDesc.description,
				},
			});
		}

		return {
			title,
			kind: 'execute',
			content,
		};
	}

	protected handleTerminalOutputTool(_input: TerminalOutputInput): ToolInfo {
		this.logger.info(JSON.stringify(_input, null, 2));
		return {
			title: 'Output',
			kind: 'execute',
			content: [],
		};
	}

	protected handleTerminalKillTool(_input: TerminalKillInput): ToolInfo {
		return {
			title: 'Kill Process',
			kind: 'execute',
			content: [],
		};
	}
}
