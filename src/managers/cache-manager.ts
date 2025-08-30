import { type FSWatcher, watch } from 'node:fs';
import { Logger } from '../utils/logger';
import type { AnyToolUse } from './tools-manager';

/**
 * Cache manager handles tool use caching and file content caching
 */
export class CacheManager {
	/** Cache of tool use instances for tracking tool execution state */
	protected toolUseCache: Map<string, AnyToolUse>;
	/** Cache of file contents for optimization and diff generation */
	protected fileContentCache: Map<string, string>;
	/** FS watchers for tracked files - only watch files that were requested for change */
	protected fileWatchers: Map<string, FSWatcher>;
	protected logger: Logger;

	constructor() {
		this.toolUseCache = new Map();
		this.fileContentCache = new Map();
		this.fileWatchers = new Map();
		this.logger = new Logger({ component: 'Cache Manager' });
	}

	/**
	 * Tool Use Cache Operations
	 */

	/**
	 * Store tool use data for later correlation
	 */
	setToolUse(toolUseId: string, toolUse: AnyToolUse): void {
		this.toolUseCache.set(toolUseId, toolUse);
		this.logger.debug(`Cached tool use: ${toolUseId}`);
	}

	/**
	 * Retrieve tool use data
	 */
	getToolUse(toolUseId: string): AnyToolUse | undefined {
		return this.toolUseCache.get(toolUseId);
	}

	/**
	 * File Content Cache Operations
	 */

	/**
	 * Store file content in cache and start watching for changes
	 * Only watches files that were requested for change (write operations)
	 */
	setFileContent(filePath: string, content: string, shouldWatch: boolean = false): void {
		this.fileContentCache.set(filePath, content);
		this.logger.debug(`Cached file content: ${filePath}`);

		if (shouldWatch && !this.fileWatchers.has(filePath)) {
			this.startWatchingFile(filePath);
		}
	}

	/**
	 * Retrieve file content from cache
	 */
	getFileContent(filePath: string): string | undefined {
		return this.fileContentCache.get(filePath);
	}

	/**
	 * Get all file content cache entries
	 */
	getAllFileContents(): Map<string, string> {
		return new Map(this.fileContentCache);
	}

	/**
	 * File Watching Operations
	 */

	/**
	 * Start watching a file for changes and invalidate cache when changed
	 */
	protected startWatchingFile(filePath: string): void {
		try {
			const watcher = watch(filePath, { persistent: false }, (eventType, filename) => {
				if (eventType === 'change' && filename) {
					this.logger.debug(`File changed: ${filePath}, invalidating cache`);
					// Remove from cache - it will be re-read when next requested
					this.fileContentCache.delete(filePath);
					// Stop watching after change detected to avoid repeated events
					this.stopWatchingFile(filePath);
				}
			});

			this.fileWatchers.set(filePath, watcher);
			this.logger.debug(`Started watching file: ${filePath}`);
		} catch (error) {
			this.logger.warn(`Failed to watch file ${filePath}: ${error}`);
		}
	}

	/**
	 * Stop watching a file
	 */
	protected stopWatchingFile(filePath: string): void {
		const watcher = this.fileWatchers.get(filePath);
		if (watcher) {
			watcher.close();
			this.fileWatchers.delete(filePath);
			this.logger.debug(`Stopped watching file: ${filePath}`);
		}
	}

	/**
	 * Cache Management Operations
	 */
}
