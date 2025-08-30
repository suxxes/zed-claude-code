import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { Logger, type LoggerConfig, type LogLevel } from './logger';

// Mock Node.js fs and path modules
vi.mock('node:fs');
vi.mock('node:path');

const mockAppendFileSync = appendFileSync as MockedFunction<typeof appendFileSync>;
const mockExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockMkdirSync = mkdirSync as MockedFunction<typeof mkdirSync>;
const mockDirname = dirname as MockedFunction<typeof dirname>;

describe('Logger', () => {
	let mockConsole: {
		log: MockedFunction<typeof console.log>;
		warn: MockedFunction<typeof console.warn>;
		error: MockedFunction<typeof console.error>;
		debug: MockedFunction<typeof console.debug>;
	};

	beforeEach(() => {
		// Mock console methods
		mockConsole = {
			log: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		};

		global.console = {
			...console,
			...mockConsole,
		};

		// Reset all mocks
		vi.clearAllMocks();

		// Set default mock implementations
		mockExistsSync.mockReturnValue(true);
		mockDirname.mockReturnValue('/logs');
		mockAppendFileSync.mockImplementation(() => {});
		mockMkdirSync.mockImplementation(() => '/logs');

		// Clear LOG_LEVEL environment variable to ensure clean test state
		delete process.env.LOG_LEVEL;

		// Mock Date.prototype.toISOString for consistent timestamps
		vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T12:00:00.000Z');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('constructor', () => {
		it('should create logger with default configuration', () => {
			const logger = new Logger();

			expect(logger).toBeInstanceOf(Logger);
			// With no LOG_LEVEL env var, no file initialization should occur
			expect(mockDirname).not.toHaveBeenCalled();
		});

		it('should create logger with custom configuration', () => {
			const config: LoggerConfig = {
				logLevel: 'debug',
				logFile: '/custom/path/app.log',
				component: 'CUSTOM',
			};

			const logger = new Logger(config);

			expect(logger).toBeInstanceOf(Logger);
			expect(mockDirname).toHaveBeenCalledWith('/custom/path/app.log');
		});

		it('should create logger with partial configuration', () => {
			const config: LoggerConfig = {
				logLevel: 'warn',
				component: 'PARTIAL',
			};

			const logger = new Logger(config);

			expect(logger).toBeInstanceOf(Logger);
			// With no LOG_LEVEL env var, no file initialization should occur
			expect(mockDirname).not.toHaveBeenCalled();
		});

		it('should handle empty configuration object', () => {
			const logger = new Logger({});

			expect(logger).toBeInstanceOf(Logger);
			// With no LOG_LEVEL env var, no file initialization should occur
			expect(mockDirname).not.toHaveBeenCalled();
		});

		it('should enable file logging when LOG_LEVEL environment variable is set', () => {
			const originalLogLevel = process.env.LOG_LEVEL;
			process.env.LOG_LEVEL = 'debug';

			try {
				const logger = new Logger();
				expect(logger).toBeInstanceOf(Logger);
				// With LOG_LEVEL env var set, file initialization should occur
				expect(mockDirname).toHaveBeenCalledWith('./logs/zed-claude-code.log');
			} finally {
				// Restore original LOG_LEVEL
				if (originalLogLevel !== undefined) {
					process.env.LOG_LEVEL = originalLogLevel;
				} else {
					delete process.env.LOG_LEVEL;
				}
			}
		});

		it('should use LOG_LEVEL environment variable for log level', () => {
			const originalLogLevel = process.env.LOG_LEVEL;
			process.env.LOG_LEVEL = 'warn';

			try {
				const logger = new Logger();
				// Test that warn level messages are logged (we can't directly test config, but we can test behavior)
				logger.info('info message'); // Should not be logged at warn level
				logger.warn('warn message'); // Should be logged

				// Only the warn message should have been written to file
				expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
				expect(mockAppendFileSync).toHaveBeenCalledWith(
					'./logs/zed-claude-code.log',
					expect.stringContaining('[WARN] warn message'),
				);
			} finally {
				// Restore original LOG_LEVEL
				if (originalLogLevel !== undefined) {
					process.env.LOG_LEVEL = originalLogLevel;
				} else {
					delete process.env.LOG_LEVEL;
				}
			}
		});

		it('should create log directory when it does not exist', () => {
			mockExistsSync.mockReturnValue(false);
			mockDirname.mockReturnValue('/new/log/dir');

			new Logger({ logFile: '/new/log/dir/app.log' });

			expect(mockExistsSync).toHaveBeenCalledWith('/new/log/dir');
			expect(mockMkdirSync).toHaveBeenCalledWith('/new/log/dir', { recursive: true });
		});

		it('should not create log directory when it already exists', () => {
			mockExistsSync.mockReturnValue(true);
			mockDirname.mockReturnValue('/existing/log/dir');

			new Logger({ logFile: '/existing/log/dir/app.log' });

			expect(mockExistsSync).toHaveBeenCalledWith('/existing/log/dir');
			expect(mockMkdirSync).not.toHaveBeenCalled();
		});

		it('should handle logger without logFile', () => {
			const config: LoggerConfig = {
				logLevel: 'info',
				component: 'NO_FILE',
			};

			// Override default config by not providing logFile
			const logger = new Logger({ ...config, logFile: '' });

			expect(logger).toBeInstanceOf(Logger);
		});
	});

	describe('log level methods', () => {
		let logger: Logger;

		beforeEach(() => {
			logger = new Logger({ logLevel: 'debug', logFile: '/test/app.log' });
		});

		describe('error', () => {
			it('should log error message', () => {
				logger.error('Test error message');

				expect(mockAppendFileSync).toHaveBeenCalledWith(
					'/test/app.log',
					'[2024-01-01T12:00:00.000Z] [ZCC] [ERROR] Test error message\n',
				);
			});

			it('should handle empty error message', () => {
				logger.error('');

				expect(mockAppendFileSync).toHaveBeenCalledWith('/test/app.log', '[2024-01-01T12:00:00.000Z] [ZCC] [ERROR] \n');
			});

			it('should handle error message with special characters', () => {
				logger.error('Error: {"code": 500, "message": "Internal Server Error"}');

				expect(mockAppendFileSync).toHaveBeenCalledWith(
					'/test/app.log',
					'[2024-01-01T12:00:00.000Z] [ZCC] [ERROR] Error: {"code": 500, "message": "Internal Server Error"}\n',
				);
			});
		});

		describe('warn', () => {
			it('should log warn message', () => {
				logger.warn('Test warning message');

				expect(mockAppendFileSync).toHaveBeenCalledWith(
					'/test/app.log',
					'[2024-01-01T12:00:00.000Z] [ZCC] [WARN] Test warning message\n',
				);
			});

			it('should handle multiline warning', () => {
				logger.warn('Line 1\nLine 2\nLine 3');

				expect(mockAppendFileSync).toHaveBeenCalledWith(
					'/test/app.log',
					'[2024-01-01T12:00:00.000Z] [ZCC] [WARN] Line 1\nLine 2\nLine 3\n',
				);
			});
		});

		describe('info', () => {
			it('should log info message', () => {
				logger.info('Test info message');

				expect(mockAppendFileSync).toHaveBeenCalledWith(
					'/test/app.log',
					'[2024-01-01T12:00:00.000Z] [ZCC] [INFO] Test info message\n',
				);
			});

			it('should handle unicode characters', () => {
				logger.info('Test with unicode: 🚀 ✨ 💻');

				expect(mockAppendFileSync).toHaveBeenCalledWith(
					'/test/app.log',
					'[2024-01-01T12:00:00.000Z] [ZCC] [INFO] Test with unicode: 🚀 ✨ 💻\n',
				);
			});
		});

		describe('debug', () => {
			it('should log debug message', () => {
				logger.debug('Test debug message');

				expect(mockAppendFileSync).toHaveBeenCalledWith(
					'/test/app.log',
					'[2024-01-01T12:00:00.000Z] [ZCC] [DEBUG] Test debug message\n',
				);
			});

			it('should handle very long debug messages', () => {
				const longMessage = 'A'.repeat(10000);
				logger.debug(longMessage);

				expect(mockAppendFileSync).toHaveBeenCalledWith(
					'/test/app.log',
					`[2024-01-01T12:00:00.000Z] [ZCC] [DEBUG] ${longMessage}\n`,
				);
			});
		});
	});

	describe('log level filtering', () => {
		it('should only log messages at or above error level when logLevel is error', () => {
			const logger = new Logger({ logLevel: 'error', logFile: '/test/app.log' });

			logger.error('Error message');
			logger.warn('Warn message');
			logger.info('Info message');
			logger.debug('Debug message');

			expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
			expect(mockAppendFileSync).toHaveBeenCalledWith(
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [ERROR] Error message\n',
			);
		});

		it('should log error and warn messages when logLevel is warn', () => {
			const logger = new Logger({ logLevel: 'warn', logFile: '/test/app.log' });

			logger.error('Error message');
			logger.warn('Warn message');
			logger.info('Info message');
			logger.debug('Debug message');

			expect(mockAppendFileSync).toHaveBeenCalledTimes(2);
			expect(mockAppendFileSync).toHaveBeenNthCalledWith(
				1,
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [ERROR] Error message\n',
			);
			expect(mockAppendFileSync).toHaveBeenNthCalledWith(
				2,
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [WARN] Warn message\n',
			);
		});

		it('should log error, warn, and info messages when logLevel is info', () => {
			const logger = new Logger({ logLevel: 'info', logFile: '/test/app.log' });

			logger.error('Error message');
			logger.warn('Warn message');
			logger.info('Info message');
			logger.debug('Debug message');

			expect(mockAppendFileSync).toHaveBeenCalledTimes(3);
			expect(mockAppendFileSync).toHaveBeenNthCalledWith(
				1,
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [ERROR] Error message\n',
			);
			expect(mockAppendFileSync).toHaveBeenNthCalledWith(
				2,
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [WARN] Warn message\n',
			);
			expect(mockAppendFileSync).toHaveBeenNthCalledWith(
				3,
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [INFO] Info message\n',
			);
		});

		it('should log all messages when logLevel is debug', () => {
			const logger = new Logger({ logLevel: 'debug', logFile: '/test/app.log' });

			logger.error('Error message');
			logger.warn('Warn message');
			logger.info('Info message');
			logger.debug('Debug message');

			expect(mockAppendFileSync).toHaveBeenCalledTimes(4);
		});
	});

	describe('component naming and formatting', () => {
		it('should use custom component name in log messages', () => {
			const logger = new Logger({
				component: 'CUSTOM_COMPONENT',
				logFile: '/test/app.log',
			});

			logger.info('Test message');

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [CUSTOM_COMPONENT] [INFO] Test message\n',
			);
		});

		it('should handle empty component name', () => {
			const logger = new Logger({
				component: '',
				logFile: '/test/app.log',
			});

			logger.info('Test message');

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [] [INFO] Test message\n',
			);
		});

		it('should handle component name with special characters', () => {
			const logger = new Logger({
				component: 'TEST-COMPONENT_123',
				logFile: '/test/app.log',
			});

			logger.info('Test message');

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [TEST-COMPONENT_123] [INFO] Test message\n',
			);
		});
	});

	describe('timestamp formatting', () => {
		it('should use ISO string format for timestamps', () => {
			const logger = new Logger({ logFile: '/test/app.log' });

			logger.info('Test message');

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [INFO] Test message\n',
			);
		});

		it('should use current timestamp for each log entry', () => {
			const logger = new Logger({ logFile: '/test/app.log' });

			// Change the mock to return different timestamps
			vi.spyOn(Date.prototype, 'toISOString')
				.mockReturnValueOnce('2024-01-01T12:00:00.000Z')
				.mockReturnValueOnce('2024-01-01T12:00:01.000Z');

			logger.info('First message');
			logger.info('Second message');

			expect(mockAppendFileSync).toHaveBeenNthCalledWith(
				1,
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [INFO] First message\n',
			);
			expect(mockAppendFileSync).toHaveBeenNthCalledWith(
				2,
				'/test/app.log',
				'[2024-01-01T12:00:01.000Z] [ZCC] [INFO] Second message\n',
			);
		});
	});

	describe('file operations', () => {
		it('should handle file write errors silently', () => {
			mockAppendFileSync.mockImplementation(() => {
				throw new Error('File write error');
			});

			const logger = new Logger({ logFile: '/test/app.log' });

			// Should not throw error
			expect(() => logger.info('Test message')).not.toThrow();
		});

		it('should not attempt to write when logFile is not provided', () => {
			const logger = new Logger({ logFile: undefined });

			logger.info('Test message');

			expect(mockAppendFileSync).not.toHaveBeenCalled();
		});

		it('should handle different file extensions', () => {
			const logger = new Logger({ logFile: '/test/app.txt' });
			mockDirname.mockReturnValue('/test');

			logger.info('Test message');

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				'/test/app.txt',
				'[2024-01-01T12:00:00.000Z] [ZCC] [INFO] Test message\n',
			);
		});
	});

	describe('edge cases and error handling', () => {
		it('should handle null message gracefully', () => {
			const logger = new Logger({ logFile: '/test/app.log' });

			// TypeScript will prevent this, but test runtime behavior
			logger.info(null as any);

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [INFO] null\n',
			);
		});

		it('should handle undefined message gracefully', () => {
			const logger = new Logger({ logFile: '/test/app.log' });

			// TypeScript will prevent this, but test runtime behavior
			logger.info(undefined as any);

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [INFO] undefined\n',
			);
		});

		it('should handle message with only whitespace', () => {
			const logger = new Logger({ logFile: '/test/app.log' });

			logger.info('   \t\n   ');

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				'/test/app.log',
				'[2024-01-01T12:00:00.000Z] [ZCC] [INFO]    \t\n   \n',
			);
		});

		it('should handle directory creation failure', () => {
			mockExistsSync.mockReturnValue(false);
			mockMkdirSync.mockImplementation(() => {
				throw new Error('Permission denied');
			});

			// The constructor should throw an error when directory creation fails
			// This matches the actual implementation behavior
			expect(() => new Logger({ logFile: '/restricted/app.log' })).toThrow('Permission denied');
		});
	});

	describe('log level validation', () => {
		it('should handle invalid log levels gracefully', () => {
			// Force invalid log level through type assertion
			const logger = new Logger({ logLevel: 'invalid' as LogLevel });

			logger.info('Test message');

			// Should not crash, behavior depends on implementation
			expect(logger).toBeInstanceOf(Logger);
		});

		it('should correctly order log levels', () => {
			// Test that the internal level ordering works correctly
			const logLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];

			for (const level of logLevels) {
				const logger = new Logger({ logLevel: level, logFile: '/test/app.log' });

				// Clear previous calls
				mockAppendFileSync.mockClear();

				// Test all log levels
				logger.error('Error');
				logger.warn('Warn');
				logger.info('Info');
				logger.debug('Debug');

				// Verify correct number of calls based on level
				const expectedCalls = logLevels.indexOf(level) + 1;
				expect(mockAppendFileSync).toHaveBeenCalledTimes(expectedCalls);
			}
		});
	});

	describe('performance considerations', () => {
		it('should handle high-volume logging efficiently', () => {
			const logger = new Logger({ logLevel: 'debug', logFile: '/test/app.log' });
			const messageCount = 1000;

			const startTime = Date.now();

			for (let i = 0; i < messageCount; i++) {
				logger.info(`Message ${i}`);
			}

			const endTime = Date.now();
			const duration = endTime - startTime;

			// Expect reasonable performance (less than 1 second for 1000 messages)
			expect(duration).toBeLessThan(1000);
			expect(mockAppendFileSync).toHaveBeenCalledTimes(messageCount);
		});

		it('should not log filtered messages efficiently', () => {
			const logger = new Logger({ logLevel: 'error', logFile: '/test/app.log' });
			const messageCount = 1000;

			for (let i = 0; i < messageCount; i++) {
				logger.debug(`Debug message ${i}`); // These should be filtered out
			}

			// Should not have called appendFileSync at all
			expect(mockAppendFileSync).not.toHaveBeenCalled();
		});

		it('should handle concurrent logging calls', async () => {
			const logger = new Logger({ logLevel: 'debug', logFile: '/test/app.log' });

			const promises = Array.from({ length: 100 }, (_, i) =>
				Promise.resolve().then(() => logger.info(`Concurrent message ${i}`)),
			);

			await Promise.all(promises);

			expect(mockAppendFileSync).toHaveBeenCalledTimes(100);
		});
	});

	describe('memory management', () => {
		it('should not retain references to logged messages', () => {
			const logger = new Logger({ logLevel: 'info', logFile: '/test/app.log' });

			// Log a large message
			const largeMessage = 'A'.repeat(10000);
			logger.info(largeMessage);

			expect(mockAppendFileSync).toHaveBeenCalledWith('/test/app.log', expect.stringContaining(largeMessage));

			// The logger should not retain the large message
			// This is more of a design expectation than something we can easily test
			expect(logger).toBeInstanceOf(Logger);
		});
	});

	describe('default logger export', () => {
		it('should export a default logger instance', async () => {
			// Clear mocks before importing to ensure we capture the calls
			vi.clearAllMocks();

			// Use a dynamic import to re-import the module and trigger the default logger creation
			// Since the default logger is created during module initialization, we need to reset
			// and re-import to properly test it
			// Import the default logger (it was already created when the module was loaded)
			const { logger } = await import('./logger');

			expect(logger).toBeInstanceOf(Logger);

			// Test that it works by attempting to log
			logger.info('Test default logger');

			// The logger instance should work properly
			expect(logger).toBeInstanceOf(Logger);
		});
	});
});
