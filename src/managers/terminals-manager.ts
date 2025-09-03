import type { TerminalHandle, TerminalOutputResponse } from '@zed-industries/agent-client-protocol';
import type { AcpAgent } from '../core/acp-agent';
import { Logger } from '../utils/logger';
import type { McpTerminalIdInput, McpTerminalInput, ToolResult } from './mcp-server-manager';

interface TerminalExtra {
	_meta?: {
		[key: string]: unknown;
		'claudecode/toolUseId'?: string;
	};
	signal?: AbortSignal;
}

type BackgroundTerminal =
	| {
			handle: TerminalHandle;
			status: BackgroundTerminalStartStatus;
			prevOutput: TerminalOutputResponse | null;
	  }
	| {
			status: BackgroundTerminalExitStatus;
			pendingOutput: TerminalOutputResponse;
	  };

type BackgroundTerminalStartStatus = 'start';
type BackgroundTerminalExitStatus = 'abort' | 'exit' | 'kill' | 'timeout';

export class TerminalsManager {
	protected logger: Logger;
	protected backgroundTerminals = new Map<string, BackgroundTerminal>();

	constructor(
		protected agent: AcpAgent,
		protected sessionId: string,
		protected workingDirectory?: string,
	) {
		this.logger = new Logger({ component: 'Terminals Manager' });
	}

	async createTerminal(input: McpTerminalInput, extra: TerminalExtra): Promise<ToolResult> {
		// Create terminal with the command
		const handle = await this.agent.client.createTerminal({
			sessionId: this.sessionId,
			command: input.command,
			cwd: this.workingDirectory,
		});

		this.logger.debug(`Created terminal ${handle.id}`);

		const toolCallId = extra._meta?.['claudecode/toolUseId'];

		if (typeof toolCallId !== 'string') {
			throw new Error('No tool call ID found');
		}

		// Send terminal update if we have a tool call ID
		if (toolCallId) {
			await this.agent.client.sessionUpdate({
				sessionId: this.sessionId,
				update: {
					sessionUpdate: 'tool_call_update',
					toolCallId,
					status: 'in_progress',
					content: [{ type: 'terminal', terminalId: handle.id }],
				},
			});
		}

		// Set up abort handling
		const abort = new Promise((resolve) => {
			if (extra?.signal?.aborted) {
				resolve(null);
			} else {
				extra?.signal?.addEventListener('abort', () => {
					resolve(null);
				});
			}
		});

		const result = Promise.race<{ status: BackgroundTerminalExitStatus }>([
			handle.waitForExit().then(() => ({ status: 'exit' })),
			abort.then(() => ({ status: 'abort' })),
			this.await(input.timeout).then(async () => {
				if (this.backgroundTerminals.get(handle.id)?.status === 'start') {
					await handle.kill();
				}

				return { status: 'timeout' };
			}),
		]);

		if (input.background) {
			this.backgroundTerminals.set(handle.id, {
				handle,
				prevOutput: null,
				status: 'start',
			});

			result.then(async ({ status }) => {
				const terminal = this.backgroundTerminals.get(handle.id);

				if (terminal?.status !== 'start') {
					return;
				}

				const currentOutput = await handle.currentOutput();

				this.backgroundTerminals.set(handle.id, {
					status,
					pendingOutput: {
						...currentOutput,
						output: this.trimStart(currentOutput.output, terminal.prevOutput?.output),
					},
				});

				return handle.release().catch();
			});

			return {
				content: [
					{
						type: 'text',
						text: `Command execution started in background ${handle.id}`,
					},
				],
			};
		}

		const { status } = await result;

		if (status === 'abort') {
			return {
				content: [{ type: 'text', text: 'Command execution cancelled' }],
			};
		}

		const output = await handle.currentOutput();
		await handle.release().catch();

		return {
			content: [{ type: 'text', text: this.processOutput(status, output) }],
		};
	}

	async getTerminalOutput(input: McpTerminalIdInput): Promise<ToolResult> {
		const terminal = this.backgroundTerminals.get(input.terminalId);

		if (!terminal) {
			throw new Error(`Unknown terminal ${input.terminalId}`);
		}

		if (terminal.status === 'start') {
			const nextOutput = await terminal.handle.currentOutput();
			const strippedOutput = this.trimStart(nextOutput.output, terminal.prevOutput?.output);

			terminal.prevOutput = nextOutput;

			return {
				content: [
					{
						type: 'text',
						text: this.processOutput('start', {
							...nextOutput,
							output: strippedOutput,
						}),
					},
				],
			};
		} else {
			return {
				content: [
					{
						type: 'text',
						text: this.processOutput(terminal.status, terminal.pendingOutput),
					},
				],
			};
		}
	}

	async killTerminal(input: McpTerminalIdInput): Promise<ToolResult> {
		const terminal = this.backgroundTerminals.get(input.terminalId);

		if (!terminal) {
			throw new Error(`Unknown terminal ${input.terminalId}`);
		}

		switch (terminal.status) {
			case 'start': {
				const nextOutput = await terminal.handle.currentOutput();

				this.backgroundTerminals.set(input.terminalId, {
					status: 'kill',
					pendingOutput: {
						...nextOutput,
						output: this.trimStart(nextOutput.output, terminal.prevOutput?.output),
					},
				});

				await terminal.handle.kill();
				await terminal.handle.release();

				return {
					content: [{ type: 'text', text: 'Command execution process killed' }],
				};
			}
			case 'abort':
				return {
					content: [{ type: 'text', text: 'Command execution cancelled' }],
				};
			case 'exit':
				return {
					content: [{ type: 'text', text: 'Command execution process had already exited' }],
				};
			case 'kill':
				return {
					content: [{ type: 'text', text: 'Command execution process killed' }],
				};
			case 'timeout':
				return {
					content: [{ type: 'text', text: 'Command execution process timed out' }],
				};
		}
	}

	protected await(ms: number = 0): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	protected trimStart(from: string, prefix = ''): string {
		if (!prefix || !from.startsWith(prefix)) {
			return from;
		}

		return from.slice(prefix.length);
	}

	protected processOutput(status: BackgroundTerminal['status'], output: TerminalOutputResponse): string {
		const { exitStatus, output: commandOutput, truncated } = output;

		const toolOutput = [];

		switch (status) {
			case 'start': {
				if (exitStatus?.exitCode === null) {
					toolOutput.push(`Execution was interrupted`);
				}
				break;
			}
			case 'kill':
				toolOutput.push(`Command execution process killed`);
				break;
			case 'timeout':
				toolOutput.push(`Command execution process timed out`);
				break;
		}

		if (exitStatus && exitStatus?.exitCode !== 0) {
			if (exitStatus?.signal !== null) {
				toolOutput.push(`Failed with exit code ${exitStatus.exitCode} with signal \`${exitStatus.signal}\``);
			} else {
				toolOutput.push(`Failed with exit code ${exitStatus.exitCode}`);
			}
		}

		if (toolOutput.length) {
			toolOutput.push(`\n`);
		}

		toolOutput.push(commandOutput);

		if (truncated) {
			toolOutput.push(`\nOutput was truncated to ${commandOutput.length} bytes`);
		}

		return toolOutput.join(`\n`);
	}
}
