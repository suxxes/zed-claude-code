#!/usr/bin/env node

/**
 * Zed Claude Code - CLI Interface
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { AgentSideConnection } from '@zed-industries/agent-client-protocol';
import { AcpAgent } from './core/acp-agent';
import { DependencyManager } from './managers/dependency-manager';
import { logger } from './utils/logger';

interface CliArgs {
	debug?: boolean;
	'ensure-dependencies'?: boolean;
	version?: boolean;
}

function getPackageVersion(): string {
	try {
		const packageJsonPath = join(__dirname, '../package.json');
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
		return packageJson.version;
	} catch {
		return 'unknown';
	}
}

function ensureDependencies(): void {
	const dependencyManager = new DependencyManager();
	console.log('Checking and installing dependencies...');

	try {
		dependencyManager.checkClaudeCodeSdk();
		console.log('Dependencies verified successfully.');
	} catch (_error) {
		console.error('Failed to ensure dependencies:', _error);
		process.exit(1);
	}
}

export function startServer(): void {
	logger.info('Zed Claude Code starting...');

	// Create a bidirectional communication channel with Claude Code
	new AgentSideConnection(
		// Factory function to create our ACP agent instance
		(client) => new AcpAgent(client),
		// Convert Node.js streams to Web Streams API directly
		Writable.toWeb(process.stdout),
		Readable.toWeb(process.stdin),
	);

	// Keep process alive
	process.stdin.resume();

	process.on('SIGINT', () => {
		console.info('Received SIGINT, shutting down...');
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		console.info('Received SIGTERM, shutting down...');
		process.exit(0);
	});

	process.on('uncaughtException', (error) => {
		console.error('[FATAL] Uncaught exception:', error);
		process.exit(1);
	});

	process.on('unhandledRejection', (error, promise) => {
		console.error('[FATAL] Unhandled rejection:', error, promise);
		process.exit(1);
	});

	logger.info('Zed Claude Code is running');
}

try {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			debug: {
				type: 'boolean',
				default: false,
			},
			'ensure-dependencies': {
				type: 'boolean',
				default: false,
			},
			version: {
				type: 'boolean',
				default: false,
			},
		},
		allowPositionals: false,
	});

	const args = values as CliArgs;

	// Handle --version flag
	if (args.version) {
		console.log(getPackageVersion());
		process.exit(0);
	}

	// Handle --ensure-dependencies flag
	if (args['ensure-dependencies']) {
		ensureDependencies();
	}

	// Set debug mode if requested
	if (args.debug) {
		process.env.LOG_LEVEL = 'debug';
	}

	startServer();
} catch (_error) {
	console.error('CLI error:', _error);
	process.exit(1);
}
