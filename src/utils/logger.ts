import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LoggerConfig {
	logLevel?: LogLevel;
	logFile?: string | null;
	component?: string;
}

export class Logger {
	protected config: Required<Omit<LoggerConfig, 'logFile'>> & { logFile: string | null };
	protected static readonly levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];

	constructor(config: LoggerConfig = {}) {
		// Read LOG_LEVEL from environment, fallback to 'info'
		const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
		const defaultLogLevel = Logger.levels.includes(envLogLevel) ? envLogLevel : 'info';

		// Only enable file logging if LOG_LEVEL is set (i.e., debug mode is enabled)
		const defaultLogFile = process.env.LOG_LEVEL ? './logs/zed-claude-code.log' : null;

		this.config = {
			logLevel: defaultLogLevel,
			logFile: defaultLogFile,
			component: 'ZCC',
			...config,
		};

		this.initializeLogFile();
	}

	protected initializeLogFile(): void {
		if (this.config.logFile) {
			const logDir = dirname(this.config.logFile);
			if (!existsSync(logDir)) {
				mkdirSync(logDir, { recursive: true });
			}
		}
	}

	error(message: string): void {
		this.log('error', message);
	}

	warn(message: string): void {
		this.log('warn', message);
	}

	info(message: string): void {
		this.log('info', message);
	}

	debug(message: string): void {
		this.log('debug', message);
	}

	protected log(level: LogLevel, message: string): void {
		const configLevel = this.config.logLevel;
		const levelIndex = Logger.levels.indexOf(level);
		const configLevelIndex = Logger.levels.indexOf(configLevel);

		if (levelIndex <= configLevelIndex) {
			const timestamp = new Date().toISOString();
			const logMessage = `[${timestamp}] [${this.config.component}] [${level.toUpperCase()}] ${message}\n`;

			if (this.config.logFile) {
				try {
					appendFileSync(this.config.logFile, logMessage);
				} catch {
					// Silent failure - we can't output to console in stdin mode
				}
			}
		}
	}
}

// Default logger instance
export const logger = new Logger();
