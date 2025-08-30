import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '../utils/logger';

/**
 * Dependency manager for runtime safety and updates
 * Checks for Claude Code SDK presence and handles updates
 */
export class DependencyManager {
	protected logger: Logger;
	protected packageName = '@anthropic-ai/claude-code';

	constructor() {
		this.logger = new Logger({ component: 'DependencyManager' });
	}

	/**
	 * Quick check if Claude Code SDK is available
	 * Does not attempt installation - just verifies presence
	 */
	checkClaudeCodeSdk(): void {
		try {
			// Try to require the package to check if it's available
			require.resolve(this.packageName);

			this.logger.debug('Claude Code SDK is available');
		} catch {
			// Package not found - provide helpful error message
			const packagePath = resolve(process.cwd(), 'node_modules', this.packageName);
			const exists = existsSync(packagePath);

			if (!exists) {
				this.logger.error(`
					Claude Code SDK not found!

					The required package '${this.packageName}' is not installed.
					This usually happens if:
					1. npm install didn't complete successfully
					2. The postinstall script failed
					3. You're running from a non-standard location

					To fix this, run:
					    npm install ${this.packageName}

					Then restart the server.
				`);

				throw new Error('Claude Code SDK is required but not installed');
			}
		}
	}

	/**
	 * Find the Claude Code executable path
	 * Returns the path to the claude executable or null if not found
	 */
	findClaudeExecutable(): string | null {
		try {
			// First, try to find claude in node_modules/.bin
			const nodeModulesBin = resolve(process.cwd(), 'node_modules', '.bin', 'claude');

			if (existsSync(nodeModulesBin)) {
				this.logger.debug(`Found claude executable in node_modules: ${nodeModulesBin}`);
				return nodeModulesBin;
			}

			// Try to find in PATH using which/where command
			try {
				const whichResult = execSync(process.platform === 'win32' ? 'where claude' : 'which claude', {
					encoding: 'utf-8',
					timeout: 5000,
				}).trim();

				if (whichResult && existsSync(whichResult)) {
					this.logger.debug(`Found claude executable in PATH: ${whichResult}`);
					return whichResult;
				}
			} catch {
				this.logger.debug('Claude not found in PATH');
			}

			// Try common installation paths
			const commonPaths = [
				'/usr/local/bin/claude',
				'/usr/bin/claude',
				`${process.env.HOME}/.local/bin/claude`,
				`${process.env.HOME}/bin/claude`,
			];

			for (const path of commonPaths) {
				if (path && existsSync(path)) {
					this.logger.debug(`Found claude executable at: ${path}`);
					return path;
				}
			}

			this.logger.warn('Claude executable not found in any expected locations');

			return null;
		} catch (error) {
			this.logger.warn(`Error finding claude executable: ${error instanceof Error ? error.message : 'Unknown error'}`);
			return null;
		}
	}

	/**
	 * Ensure Claude executable is available, install if necessary
	 * Returns the path to the claude executable
	 */
	ensureClaudeExecutable(): string {
		// First try to find existing installation
		const existingPath = this.findClaudeExecutable();

		if (existingPath) {
			return existingPath;
		}

		// If not found, ensure the SDK is installed which should provide the executable
		try {
			this.checkClaudeCodeSdk();

			// Try to find again after ensuring SDK is present
			const newPath = this.findClaudeExecutable();

			if (newPath) {
				return newPath;
			}
		} catch {
			this.logger.error('Failed to ensure Claude Code SDK installation');
		}

		// If still not found, provide a helpful error
		throw new Error(`
			Claude executable not found!

			The claude command-line tool is required but could not be located.
			This usually means the Claude Code SDK installation is incomplete.

			To fix this:
			1. Ensure you have installed claude-code: npm install -g @anthropic-ai/claude-code
			2. Or install it locally: npm install @anthropic-ai/claude-code
			3. Make sure the installation completed successfully

			Expected locations checked:
			- node_modules/.bin/claude
			- System PATH
			- Common installation directories
		`);
	}

	/**
	 * Check for updates and install if available
	 * This runs on each server start to ensure latest SDK version
	 */
	async checkAndUpdateClaudeCodeSdk(): Promise<void> {
		try {
			this.logger.info('Checking for Claude Code SDK updates...');

			// Get current version
			const currentVersion = this.getCurrentVersion();

			if (!currentVersion) {
				this.logger.warn('Could not determine current SDK version');
				return;
			}

			// Get latest version from npm
			const latestVersion = await this.getLatestVersion();

			if (!latestVersion) {
				this.logger.warn('Could not determine latest SDK version');
				return;
			}

			this.logger.debug(`Current version: ${currentVersion}, Latest version: ${latestVersion}`);

			// Compare versions
			if (this.isNewerVersion(latestVersion, currentVersion)) {
				this.logger.info(`Updating Claude Code SDK from ${currentVersion} to ${latestVersion}...`);

				await this.installLatestVersion();

				this.logger.info('Claude Code SDK updated successfully');
			} else {
				this.logger.debug('Claude Code SDK is up to date');
			}
		} catch (error) {
			this.logger.warn(`Update check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			// Don't throw - this is a non-critical operation
		}
	}

	/**
	 * Get current installed version of Claude Code SDK
	 */
	protected getCurrentVersion(): string | null {
		try {
			const packageJsonPath = resolve(process.cwd(), 'node_modules', this.packageName, 'package.json');

			if (!existsSync(packageJsonPath)) {
				return null;
			}

			const packageJson = JSON.parse(require('node:fs').readFileSync(packageJsonPath, 'utf-8'));

			return packageJson.version;
		} catch (error) {
			this.logger.debug(`Failed to get current version: ${error instanceof Error ? error.message : 'Unknown error'}`);
			return null;
		}
	}

	/**
	 * Get latest version from npm registry
	 */
	protected async getLatestVersion(): Promise<string | null> {
		try {
			const output = execSync(`npm view ${this.packageName} version --silent`, {
				encoding: 'utf-8',
				timeout: 10000, // 10 second timeout
			});

			return output.trim();
		} catch (error) {
			this.logger.debug(`Failed to get latest version: ${error instanceof Error ? error.message : 'Unknown error'}`);
			return null;
		}
	}

	/**
	 * Install latest version of Claude Code SDK
	 */
	protected async installLatestVersion(): Promise<void> {
		try {
			execSync(`npm install ${this.packageName}@latest --save`, {
				encoding: 'utf-8',
				timeout: 60000, // 60 second timeout
				stdio: 'inherit',
			});
		} catch (error) {
			throw new Error(`Failed to install latest version: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Compare two semver versions
	 * Returns true if newVersion is newer than currentVersion
	 */
	protected isNewerVersion(newVersion: string, currentVersion: string): boolean {
		try {
			const newParts = newVersion.split('.').map(Number);
			const currentParts = currentVersion.split('.').map(Number);

			// Pad arrays to same length
			const maxLength = Math.max(newParts.length, currentParts.length);

			while (newParts.length < maxLength) newParts.push(0);
			while (currentParts.length < maxLength) currentParts.push(0);

			// Compare version parts
			for (let i = 0; i < maxLength; i++) {
				if (newParts[i] > currentParts[i]) return true;
				if (newParts[i] < currentParts[i]) return false;
			}

			return false; // Versions are equal
		} catch (error) {
			this.logger.debug(`Version comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			return false; // Conservative approach - don't update if we can't compare
		}
	}
}

export const dependencyManager = new DependencyManager();
