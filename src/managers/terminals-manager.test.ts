import type { TerminalHandle, TerminalOutputResponse } from '@zed-industries/agent-client-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpAgent } from '../core/acp-agent';
import type { McpTerminalIdInput, McpTerminalInput } from './mcp-server-manager';
import { TerminalsManager } from './terminals-manager';

vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})),
}));

describe('TerminalsManager', () => {
	let terminalsManager: TerminalsManager;
	let mockAgent: AcpAgent;
	let mockClient: any;
	let mockTerminalHandle: TerminalHandle;
	const sessionId = 'test-session-123';
	const workingDirectory = '/test/working/dir';

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		// Mock terminal handle
		mockTerminalHandle = {
			id: 'terminal-123',
			waitForExit: vi.fn(),
			currentOutput: vi.fn(),
			release: vi.fn().mockResolvedValue(undefined),
			kill: vi.fn().mockResolvedValue(undefined),
		} as any;

		// Mock client
		mockClient = {
			createTerminal: vi.fn().mockResolvedValue(mockTerminalHandle),
			sessionUpdate: vi.fn().mockResolvedValue(undefined),
		};

		// Mock agent
		mockAgent = {
			client: mockClient,
		} as any;

		terminalsManager = new TerminalsManager(mockAgent, sessionId, workingDirectory);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	describe('constructor', () => {
		it('should create a new TerminalsManager instance', () => {
			expect(terminalsManager).toBeInstanceOf(TerminalsManager);
		});

		it('should initialize with correct parameters', () => {
			expect(terminalsManager['agent']).toBe(mockAgent);
			expect(terminalsManager['sessionId']).toBe(sessionId);
			expect(terminalsManager['workingDirectory']).toBe(workingDirectory);
		});

		it('should handle optional working directory', () => {
			const managerWithoutCwd = new TerminalsManager(mockAgent, sessionId);
			expect(managerWithoutCwd['workingDirectory']).toBeUndefined();
		});
	});

	describe('createTerminal', () => {
		const input: McpTerminalInput = {
			command: 'echo "test"',
			timeout: 5000,
			background: false,
		};

		const extra = {
			_meta: {
				'claudecode/toolUseId': 'tool-call-123',
			},
			signal: new AbortController().signal,
		};

		it('should create a terminal and wait for completion', async () => {
			const output: TerminalOutputResponse = {
				output: 'test output',
				exitStatus: { exitCode: 0, signal: null },
				truncated: false,
			};

			mockTerminalHandle.waitForExit.mockResolvedValue(undefined);
			mockTerminalHandle.currentOutput.mockResolvedValue(output);

			const resultPromise = terminalsManager.createTerminal(input, extra);

			// Simulate immediate exit
			await vi.runAllTimersAsync();

			const result = await resultPromise;

			expect(mockClient.createTerminal).toHaveBeenCalledWith({
				sessionId,
				command: input.command,
				cwd: workingDirectory,
			});

			expect(mockClient.sessionUpdate).toHaveBeenCalledWith({
				sessionId,
				update: {
					sessionUpdate: 'tool_call_update',
					toolCallId: 'tool-call-123',
					status: 'in_progress',
					content: [{ type: 'terminal', terminalId: 'terminal-123' }],
				},
			});

			expect(result).toEqual({
				content: [{ type: 'text', text: 'test output' }],
			});

			expect(mockTerminalHandle.release).toHaveBeenCalled();
		});

		it('should handle background terminal execution', async () => {
			const backgroundInput: McpTerminalInput = {
				command: 'long-running-command',
				timeout: 5000,
				background: true,
			};

			mockTerminalHandle.waitForExit.mockImplementation(() => new Promise(() => {})); // Never resolves

			const result = await terminalsManager.createTerminal(backgroundInput, extra);

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: 'Command execution started in background terminal-123',
					},
				],
			});

			expect(mockTerminalHandle.release).not.toHaveBeenCalled();
		});

		it('should handle terminal with non-zero exit code', async () => {
			const output: TerminalOutputResponse = {
				output: 'error output',
				exitStatus: { exitCode: 1, signal: null },
				truncated: false,
			};

			mockTerminalHandle.waitForExit.mockResolvedValue(undefined);
			mockTerminalHandle.currentOutput.mockResolvedValue(output);

			const resultPromise = terminalsManager.createTerminal(input, extra);
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.content[0].text).toContain('Failed with exit code 1');
			expect(result.content[0].text).toContain('error output');
		});

		it('should handle terminal killed with signal', async () => {
			const output: TerminalOutputResponse = {
				output: 'killed output',
				exitStatus: { exitCode: 137, signal: 'SIGKILL' },
				truncated: false,
			};

			mockTerminalHandle.waitForExit.mockResolvedValue(undefined);
			mockTerminalHandle.currentOutput.mockResolvedValue(output);

			const resultPromise = terminalsManager.createTerminal(input, extra);
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.content[0].text).toContain('Failed with exit code 137 with signal `SIGKILL`');
		});

		it('should handle timeout scenario', async () => {
			const output: TerminalOutputResponse = {
				output: 'timeout output',
				exitStatus: { exitCode: null, signal: null },
				truncated: false,
			};

			// Never resolves to simulate long-running command
			mockTerminalHandle.waitForExit.mockImplementation(() => new Promise(() => {}));
			mockTerminalHandle.currentOutput.mockResolvedValue(output);

			const resultPromise = terminalsManager.createTerminal(input, extra);

			// Fast-forward time to trigger timeout
			await vi.advanceTimersByTimeAsync(5000);

			const result = await resultPromise;

			expect(result.content[0].text).toContain('Command execution process timed out');
			// Note: kill is not called for non-background terminals on timeout
			expect(mockTerminalHandle.release).toHaveBeenCalled();
		});

		it('should handle abort signal', async () => {
			const abortController = new AbortController();
			const abortExtra = {
				...extra,
				signal: abortController.signal,
			};

			// Never resolves to simulate long-running command
			mockTerminalHandle.waitForExit.mockImplementation(() => new Promise(() => {}));

			const resultPromise = terminalsManager.createTerminal(input, abortExtra);

			// Abort the operation
			abortController.abort();
			await vi.runAllTimersAsync();

			const result = await resultPromise;

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Command execution cancelled' }],
			});
		});

		it('should handle truncated output', async () => {
			const output: TerminalOutputResponse = {
				output: 'truncated output...',
				exitStatus: { exitCode: 0, signal: null },
				truncated: true,
			};

			mockTerminalHandle.waitForExit.mockResolvedValue(undefined);
			mockTerminalHandle.currentOutput.mockResolvedValue(output);

			const resultPromise = terminalsManager.createTerminal(input, extra);
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.content[0].text).toContain('Output was truncated to');
		});

		it('should throw error if no tool call ID provided', async () => {
			const invalidExtra = {
				signal: new AbortController().signal,
			};

			await expect(terminalsManager.createTerminal(input, invalidExtra)).rejects.toThrow('No tool call ID found');
		});

		it('should handle background terminal exit', async () => {
			const backgroundInput: McpTerminalInput = {
				command: 'quick-command',
				timeout: 5000,
				background: true,
			};

			const output: TerminalOutputResponse = {
				output: 'background output',
				exitStatus: { exitCode: 0, signal: null },
				truncated: false,
			};

			mockTerminalHandle.currentOutput.mockResolvedValue(output);

			// Resolve immediately to simulate quick exit
			let exitResolver: () => void;
			mockTerminalHandle.waitForExit.mockImplementation(
				() =>
					new Promise((resolve) => {
						exitResolver = resolve;
					}),
			);

			const result = await terminalsManager.createTerminal(backgroundInput, extra);

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: 'Command execution started in background terminal-123',
					},
				],
			});

			// Simulate terminal exit
			exitResolver!();
			await vi.runAllTimersAsync();

			// Check that background terminal was updated
			const terminal = terminalsManager['backgroundTerminals'].get('terminal-123');
			expect(terminal?.status).toBe('exit');
			expect(mockTerminalHandle.release).toHaveBeenCalled();
		});
	});

	describe('getTerminalOutput', () => {
		const input: McpTerminalIdInput = {
			terminalId: 'terminal-123',
		};

		it('should get output from running terminal', async () => {
			// Set up a running background terminal
			terminalsManager['backgroundTerminals'].set('terminal-123', {
				handle: mockTerminalHandle,
				status: 'start',
				prevOutput: null,
			});

			const output: TerminalOutputResponse = {
				output: 'current output',
				exitStatus: null,
				truncated: false,
			};

			mockTerminalHandle.currentOutput.mockResolvedValue(output);

			const result = await terminalsManager.getTerminalOutput(input);

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: 'current output',
					},
				],
			});

			// Check that prevOutput was updated
			const terminal = terminalsManager['backgroundTerminals'].get('terminal-123');
			expect((terminal as any).prevOutput).toEqual(output);
		});

		it('should strip duplicate output from running terminal', async () => {
			const prevOutput: TerminalOutputResponse = {
				output: 'line1\nline2',
				exitStatus: null,
				truncated: false,
			};

			terminalsManager['backgroundTerminals'].set('terminal-123', {
				handle: mockTerminalHandle,
				status: 'start',
				prevOutput,
			});

			const newOutput: TerminalOutputResponse = {
				output: 'line1\nline2\nline3',
				exitStatus: null,
				truncated: false,
			};

			mockTerminalHandle.currentOutput.mockResolvedValue(newOutput);

			const result = await terminalsManager.getTerminalOutput(input);

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: '\nline3',
					},
				],
			});
		});

		it('should get output from exited terminal', async () => {
			const pendingOutput: TerminalOutputResponse = {
				output: 'final output',
				exitStatus: { exitCode: 0, signal: null },
				truncated: false,
			};

			terminalsManager['backgroundTerminals'].set('terminal-123', {
				status: 'exit',
				pendingOutput,
			});

			const result = await terminalsManager.getTerminalOutput(input);

			expect(result).toEqual({
				content: [
					{
						type: 'text',
						text: 'final output',
					},
				],
			});
		});

		it('should handle killed terminal output', async () => {
			const pendingOutput: TerminalOutputResponse = {
				output: 'killed output',
				exitStatus: { exitCode: 137, signal: 'SIGKILL' },
				truncated: false,
			};

			terminalsManager['backgroundTerminals'].set('terminal-123', {
				status: 'kill',
				pendingOutput,
			});

			const result = await terminalsManager.getTerminalOutput(input);

			expect(result.content[0].text).toContain('Command execution process killed');
			expect(result.content[0].text).toContain('killed output');
		});

		it('should handle timeout terminal output', async () => {
			const pendingOutput: TerminalOutputResponse = {
				output: 'timeout output',
				exitStatus: null,
				truncated: false,
			};

			terminalsManager['backgroundTerminals'].set('terminal-123', {
				status: 'timeout',
				pendingOutput,
			});

			const result = await terminalsManager.getTerminalOutput(input);

			expect(result.content[0].text).toContain('Command execution process timed out');
		});

		it('should throw error for unknown terminal', async () => {
			await expect(terminalsManager.getTerminalOutput(input)).rejects.toThrow('Unknown terminal terminal-123');
		});
	});

	describe('killTerminal', () => {
		const input: McpTerminalIdInput = {
			terminalId: 'terminal-123',
		};

		it('should kill running terminal', async () => {
			const prevOutput: TerminalOutputResponse = {
				output: 'previous output',
				exitStatus: null,
				truncated: false,
			};

			terminalsManager['backgroundTerminals'].set('terminal-123', {
				handle: mockTerminalHandle,
				status: 'start',
				prevOutput,
			});

			const currentOutput: TerminalOutputResponse = {
				output: 'previous output\nfinal output',
				exitStatus: { exitCode: 137, signal: 'SIGKILL' },
				truncated: false,
			};

			mockTerminalHandle.currentOutput.mockResolvedValue(currentOutput);

			const result = await terminalsManager.killTerminal(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Command execution process killed' }],
			});

			expect(mockTerminalHandle.kill).toHaveBeenCalled();
			expect(mockTerminalHandle.release).toHaveBeenCalled();

			// Check that terminal status was updated
			const terminal = terminalsManager['backgroundTerminals'].get('terminal-123');
			expect(terminal?.status).toBe('kill');
			expect((terminal as any).pendingOutput.output).toBe('\nfinal output');
		});

		it('should handle already aborted terminal', async () => {
			terminalsManager['backgroundTerminals'].set('terminal-123', {
				status: 'abort',
				pendingOutput: {
					output: 'aborted',
					exitStatus: null,
					truncated: false,
				},
			});

			const result = await terminalsManager.killTerminal(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Command execution cancelled' }],
			});

			expect(mockTerminalHandle.kill).not.toHaveBeenCalled();
		});

		it('should handle already exited terminal', async () => {
			terminalsManager['backgroundTerminals'].set('terminal-123', {
				status: 'exit',
				pendingOutput: {
					output: 'exited',
					exitStatus: { exitCode: 0, signal: null },
					truncated: false,
				},
			});

			const result = await terminalsManager.killTerminal(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Command execution process had already exited' }],
			});
		});

		it('should handle already killed terminal', async () => {
			terminalsManager['backgroundTerminals'].set('terminal-123', {
				status: 'kill',
				pendingOutput: {
					output: 'killed',
					exitStatus: { exitCode: 137, signal: 'SIGKILL' },
					truncated: false,
				},
			});

			const result = await terminalsManager.killTerminal(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Command execution process killed' }],
			});
		});

		it('should handle timed out terminal', async () => {
			terminalsManager['backgroundTerminals'].set('terminal-123', {
				status: 'timeout',
				pendingOutput: {
					output: 'timed out',
					exitStatus: null,
					truncated: false,
				},
			});

			const result = await terminalsManager.killTerminal(input);

			expect(result).toEqual({
				content: [{ type: 'text', text: 'Command execution process timed out' }],
			});
		});

		it('should throw error for unknown terminal', async () => {
			await expect(terminalsManager.killTerminal(input)).rejects.toThrow('Unknown terminal terminal-123');
		});
	});

	describe('protected methods', () => {
		describe('await', () => {
			it('should wait for specified milliseconds', async () => {
				const startTime = Date.now();
				const waitPromise = terminalsManager['await'](1000);

				vi.advanceTimersByTime(1000);
				await waitPromise;

				expect(vi.getTimerCount()).toBe(0);
			});

			it('should handle zero timeout', async () => {
				const waitPromise = terminalsManager['await'](0);
				vi.runAllTimers();
				await waitPromise;
				expect(vi.getTimerCount()).toBe(0);
			});
		});

		describe('trimStart', () => {
			it('should trim matching prefix from string', () => {
				const result = terminalsManager['trimStart']('hello world', 'hello ');
				expect(result).toBe('world');
			});

			it('should handle partial prefix match', () => {
				const result = terminalsManager['trimStart']('hello world', 'hell');
				expect(result).toBe('o world');
			});

			it('should handle no match', () => {
				const result = terminalsManager['trimStart']('hello world', 'goodbye');
				expect(result).toBe('hello world');
			});

			it('should handle empty prefix', () => {
				const result = terminalsManager['trimStart']('hello world', '');
				expect(result).toBe('hello world');
			});

			it('should handle empty string', () => {
				const result = terminalsManager['trimStart']('', 'hello');
				expect(result).toBe('');
			});

			it('should handle undefined prefix', () => {
				const result = terminalsManager['trimStart']('hello world');
				expect(result).toBe('hello world');
			});
		});

		describe('processOutput', () => {
			it('should process successful output', () => {
				const output: TerminalOutputResponse = {
					output: 'success',
					exitStatus: { exitCode: 0, signal: null },
					truncated: false,
				};

				const result = terminalsManager['processOutput']('exit', output);
				expect(result).toBe('success');
			});

			it('should process failed output with exit code', () => {
				const output: TerminalOutputResponse = {
					output: 'error output',
					exitStatus: { exitCode: 1, signal: null },
					truncated: false,
				};

				const result = terminalsManager['processOutput']('exit', output);
				expect(result).toContain('Failed with exit code 1');
				expect(result).toContain('error output');
			});

			it('should process killed output with signal', () => {
				const output: TerminalOutputResponse = {
					output: 'killed output',
					exitStatus: { exitCode: 137, signal: 'SIGKILL' },
					truncated: false,
				};

				const result = terminalsManager['processOutput']('kill', output);
				expect(result).toContain('Command execution process killed');
				expect(result).toContain('Failed with exit code 137 with signal `SIGKILL`');
			});

			it('should process timeout output', () => {
				const output: TerminalOutputResponse = {
					output: 'timeout output',
					exitStatus: null,
					truncated: false,
				};

				const result = terminalsManager['processOutput']('timeout', output);
				expect(result).toContain('Command execution process timed out');
				expect(result).toContain('timeout output');
			});

			it('should handle interrupted execution', () => {
				const output: TerminalOutputResponse = {
					output: 'interrupted',
					exitStatus: { exitCode: null, signal: null },
					truncated: false,
				};

				const result = terminalsManager['processOutput']('start', output);
				expect(result).toContain('Execution was interrupted');
			});

			it('should handle truncated output', () => {
				const output: TerminalOutputResponse = {
					output: 'long output...',
					exitStatus: { exitCode: 0, signal: null },
					truncated: true,
				};

				const result = terminalsManager['processOutput']('exit', output);
				expect(result).toContain('Output was truncated to 14 bytes');
			});
		});
	});
});
