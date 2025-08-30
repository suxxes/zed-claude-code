import type { FSWatcher } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheManager } from './cache-manager';
import type { AnyToolUse } from './tools-manager';

// Mock the Logger
vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})),
}));

// Mock fs.watch
vi.mock('node:fs', () => ({
	watch: vi.fn(),
}));

describe('CacheManager', () => {
	let cacheManager: CacheManager;
	let mockWatch: ReturnType<typeof vi.fn>;
	let mockWatcherClose: ReturnType<typeof vi.fn>;
	let mockWatcher: FSWatcher;

	beforeEach(async () => {
		vi.clearAllMocks();

		// Get the mock after clearing
		const { watch } = await import('node:fs');
		mockWatch = vi.mocked(watch);

		// Setup mock watcher
		mockWatcherClose = vi.fn();
		mockWatcher = {
			close: mockWatcherClose,
		} as unknown as FSWatcher;

		mockWatch.mockReturnValue(mockWatcher);

		cacheManager = new CacheManager();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create a new CacheManager instance', () => {
			expect(cacheManager).toBeInstanceOf(CacheManager);
		});

		it('should initialize with empty caches', () => {
			const allFiles = cacheManager.getAllFileContents();
			expect(allFiles.size).toBe(0);
		});
	});

	describe('Tool Use Cache Operations', () => {
		const mockToolUse: AnyToolUse = {
			name: 'test_tool',
			tool_use_id: 'test-id-123',
			parameters: { param1: 'value1' },
		} as AnyToolUse;

		describe('setToolUse', () => {
			it('should store tool use data', () => {
				cacheManager.setToolUse('test-id', mockToolUse);

				const retrieved = cacheManager.getToolUse('test-id');
				expect(retrieved).toEqual(mockToolUse);
			});

			it('should overwrite existing tool use data', () => {
				const firstToolUse = { ...mockToolUse, parameters: { param: 'first' } };
				const secondToolUse = { ...mockToolUse, parameters: { param: 'second' } };

				cacheManager.setToolUse('test-id', firstToolUse);
				cacheManager.setToolUse('test-id', secondToolUse);

				const retrieved = cacheManager.getToolUse('test-id');
				expect(retrieved).toEqual(secondToolUse);
			});

			it('should handle empty tool use id', () => {
				cacheManager.setToolUse('', mockToolUse);

				const retrieved = cacheManager.getToolUse('');
				expect(retrieved).toEqual(mockToolUse);
			});

			it('should handle special characters in tool use id', () => {
				const specialId = 'test-id-@#$%^&*()';
				cacheManager.setToolUse(specialId, mockToolUse);

				const retrieved = cacheManager.getToolUse(specialId);
				expect(retrieved).toEqual(mockToolUse);
			});
		});

		describe('getToolUse', () => {
			it('should return undefined for non-existent tool use', () => {
				const retrieved = cacheManager.getToolUse('non-existent');
				expect(retrieved).toBeUndefined();
			});

			it('should return cached tool use data', () => {
				cacheManager.setToolUse('test-id', mockToolUse);

				const retrieved = cacheManager.getToolUse('test-id');
				expect(retrieved).toEqual(mockToolUse);
			});

			it('should handle null parameters in tool use', () => {
				const toolUseWithNull = { ...mockToolUse, parameters: null };
				cacheManager.setToolUse('null-params', toolUseWithNull);

				const retrieved = cacheManager.getToolUse('null-params');
				expect(retrieved).toEqual(toolUseWithNull);
			});
		});

		describe('concurrent tool use operations', () => {
			it('should handle multiple tool uses stored simultaneously', () => {
				const toolUse1 = { ...mockToolUse, tool_use_id: 'id1' };
				const toolUse2 = { ...mockToolUse, tool_use_id: 'id2' };
				const toolUse3 = { ...mockToolUse, tool_use_id: 'id3' };

				cacheManager.setToolUse('id1', toolUse1);
				cacheManager.setToolUse('id2', toolUse2);
				cacheManager.setToolUse('id3', toolUse3);

				expect(cacheManager.getToolUse('id1')).toEqual(toolUse1);
				expect(cacheManager.getToolUse('id2')).toEqual(toolUse2);
				expect(cacheManager.getToolUse('id3')).toEqual(toolUse3);
			});

			it('should handle rapid consecutive operations', () => {
				const iterations = 100;

				for (let i = 0; i < iterations; i++) {
					const toolUse = { ...mockToolUse, tool_use_id: `id-${i}` };
					cacheManager.setToolUse(`id-${i}`, toolUse);
				}

				for (let i = 0; i < iterations; i++) {
					const retrieved = cacheManager.getToolUse(`id-${i}`);
					expect(retrieved?.tool_use_id).toBe(`id-${i}`);
				}
			});
		});
	});

	describe('File Content Cache Operations', () => {
		const testFilePath = '/test/file.txt';
		const testContent = 'This is test content';

		describe('setFileContent', () => {
			it('should store file content without watching', () => {
				cacheManager.setFileContent(testFilePath, testContent, false);

				const retrieved = cacheManager.getFileContent(testFilePath);
				expect(retrieved).toBe(testContent);
				expect(mockWatch).not.toHaveBeenCalled();
			});

			it('should store file content with watching enabled', () => {
				cacheManager.setFileContent(testFilePath, testContent, true);

				const retrieved = cacheManager.getFileContent(testFilePath);
				expect(retrieved).toBe(testContent);
				expect(mockWatch).toHaveBeenCalledWith(testFilePath, { persistent: false }, expect.any(Function));
			});

			it('should not start watching if already watching', () => {
				cacheManager.setFileContent(testFilePath, testContent, true);
				cacheManager.setFileContent(testFilePath, 'updated content', true);

				// Watch should only be called once
				expect(mockWatch).toHaveBeenCalledTimes(1);
			});

			it('should default to no watching when shouldWatch not specified', () => {
				cacheManager.setFileContent(testFilePath, testContent);

				expect(mockWatch).not.toHaveBeenCalled();
			});

			it('should handle empty file content', () => {
				cacheManager.setFileContent(testFilePath, '');

				const retrieved = cacheManager.getFileContent(testFilePath);
				expect(retrieved).toBe('');
			});

			it('should handle very large content', () => {
				const largeContent = 'x'.repeat(10000);
				cacheManager.setFileContent(testFilePath, largeContent);

				const retrieved = cacheManager.getFileContent(testFilePath);
				expect(retrieved).toBe(largeContent);
			});

			it('should handle special characters in file paths', () => {
				const specialPath = '/test/file with spaces & symbols!@#.txt';
				cacheManager.setFileContent(specialPath, testContent);

				const retrieved = cacheManager.getFileContent(specialPath);
				expect(retrieved).toBe(testContent);
			});

			it('should overwrite existing file content', () => {
				const firstContent = 'First content';
				const secondContent = 'Second content';

				cacheManager.setFileContent(testFilePath, firstContent);
				cacheManager.setFileContent(testFilePath, secondContent);

				const retrieved = cacheManager.getFileContent(testFilePath);
				expect(retrieved).toBe(secondContent);
			});
		});

		describe('getFileContent', () => {
			it('should return undefined for non-cached file', () => {
				const retrieved = cacheManager.getFileContent('/non/existent/file.txt');
				expect(retrieved).toBeUndefined();
			});

			it('should return cached file content', () => {
				cacheManager.setFileContent(testFilePath, testContent);

				const retrieved = cacheManager.getFileContent(testFilePath);
				expect(retrieved).toBe(testContent);
			});
		});

		describe('getAllFileContents', () => {
			it('should return empty map when no files cached', () => {
				const allFiles = cacheManager.getAllFileContents();
				expect(allFiles).toBeInstanceOf(Map);
				expect(allFiles.size).toBe(0);
			});

			it('should return all cached files', () => {
				const file1 = '/path/file1.txt';
				const file2 = '/path/file2.txt';
				const content1 = 'Content 1';
				const content2 = 'Content 2';

				cacheManager.setFileContent(file1, content1);
				cacheManager.setFileContent(file2, content2);

				const allFiles = cacheManager.getAllFileContents();
				expect(allFiles.size).toBe(2);
				expect(allFiles.get(file1)).toBe(content1);
				expect(allFiles.get(file2)).toBe(content2);
			});

			it('should return a copy of the cache map', () => {
				cacheManager.setFileContent(testFilePath, testContent);

				const allFiles1 = cacheManager.getAllFileContents();
				const allFiles2 = cacheManager.getAllFileContents();

				// Should be different instances
				expect(allFiles1).not.toBe(allFiles2);
				// But with same content
				expect(allFiles1).toEqual(allFiles2);
			});
		});

		describe('concurrent file operations', () => {
			it('should handle multiple files cached simultaneously', () => {
				const files = Array.from({ length: 50 }, (_, i) => ({
					path: `/test/file${i}.txt`,
					content: `Content for file ${i}`,
				}));

				// Cache all files
				for (const file of files) {
					cacheManager.setFileContent(file.path, file.content);
				}

				// Verify all files are cached correctly
				for (const file of files) {
					const retrieved = cacheManager.getFileContent(file.path);
					expect(retrieved).toBe(file.content);
				}
			});

			it('should handle rapid file content updates', () => {
				const updates = 100;
				let finalContent = '';

				for (let i = 0; i < updates; i++) {
					finalContent = `Content update ${i}`;
					cacheManager.setFileContent(testFilePath, finalContent);
				}

				const retrieved = cacheManager.getFileContent(testFilePath);
				expect(retrieved).toBe(finalContent);
			});
		});
	});

	describe('File Watching Operations', () => {
		const testFilePath = '/test/watched-file.txt';
		const testContent = 'Watched content';

		describe('file watching setup', () => {
			it('should start watching when setFileContent called with shouldWatch=true', () => {
				cacheManager.setFileContent(testFilePath, testContent, true);

				expect(mockWatch).toHaveBeenCalledWith(testFilePath, { persistent: false }, expect.any(Function));
			});

			it('should handle watch setup errors gracefully', () => {
				const error = new Error('Watch error');
				mockWatch.mockImplementationOnce(() => {
					throw error;
				});

				expect(() => {
					cacheManager.setFileContent(testFilePath, testContent, true);
				}).not.toThrow();

				// Content should still be cached despite watch error
				const retrieved = cacheManager.getFileContent(testFilePath);
				expect(retrieved).toBe(testContent);
			});

			it('should not start multiple watchers for same file', () => {
				cacheManager.setFileContent(testFilePath, testContent, true);
				cacheManager.setFileContent(testFilePath, 'updated content', true);

				expect(mockWatch).toHaveBeenCalledTimes(1);
			});
		});

		describe('file change handling', () => {
			it('should invalidate cache when file changes', () => {
				let changeCallback: (eventType: string, filename: string) => void;

				mockWatch.mockImplementationOnce((_path, _options, callback) => {
					changeCallback = callback;
					return mockWatcher;
				});

				cacheManager.setFileContent(testFilePath, testContent, true);

				// Verify content is cached
				expect(cacheManager.getFileContent(testFilePath)).toBe(testContent);

				// Simulate file change
				changeCallback('change', 'watched-file.txt');

				// Content should be removed from cache
				expect(cacheManager.getFileContent(testFilePath)).toBeUndefined();

				// Watcher should be closed
				expect(mockWatcherClose).toHaveBeenCalled();
			});

			it('should handle change events without filename', () => {
				let changeCallback: (eventType: string, filename: string | null) => void;

				mockWatch.mockImplementationOnce((_path, _options, callback) => {
					changeCallback = callback;
					return mockWatcher;
				});

				cacheManager.setFileContent(testFilePath, testContent, true);

				// Simulate change event without filename
				changeCallback('change', null as any);

				// Content should remain cached (no filename provided)
				expect(cacheManager.getFileContent(testFilePath)).toBe(testContent);

				// Watcher should not be closed
				expect(mockWatcherClose).not.toHaveBeenCalled();
			});

			it('should handle non-change events', () => {
				let changeCallback: (eventType: string, filename: string) => void;

				mockWatch.mockImplementationOnce((_path, _options, callback) => {
					changeCallback = callback;
					return mockWatcher;
				});

				cacheManager.setFileContent(testFilePath, testContent, true);

				// Simulate rename event
				changeCallback('rename', 'watched-file.txt');

				// Content should remain cached (not a change event)
				expect(cacheManager.getFileContent(testFilePath)).toBe(testContent);

				// Watcher should not be closed
				expect(mockWatcherClose).not.toHaveBeenCalled();
			});
		});

		describe('watcher lifecycle', () => {
			it('should close watcher when file changes', () => {
				let changeCallback: (eventType: string, filename: string) => void;

				mockWatch.mockImplementationOnce((_path, _options, callback) => {
					changeCallback = callback;
					return mockWatcher;
				});

				cacheManager.setFileContent(testFilePath, testContent, true);
				changeCallback('change', 'watched-file.txt');

				expect(mockWatcherClose).toHaveBeenCalled();
			});

			it('should handle multiple watchers for different files', () => {
				const file1 = '/test/file1.txt';
				const file2 = '/test/file2.txt';
				const watcher1 = { close: vi.fn() } as unknown as FSWatcher;
				const watcher2 = { close: vi.fn() } as unknown as FSWatcher;

				mockWatch.mockReturnValueOnce(watcher1).mockReturnValueOnce(watcher2);

				cacheManager.setFileContent(file1, 'content1', true);
				cacheManager.setFileContent(file2, 'content2', true);

				expect(mockWatch).toHaveBeenCalledTimes(2);
			});
		});

		describe('error scenarios', () => {
			it('should propagate watcher close errors', () => {
				let changeCallback: (eventType: string, filename: string) => void;
				const faultyWatcher = {
					close: vi.fn(() => {
						throw new Error('Close error');
					}),
				} as unknown as FSWatcher;

				mockWatch.mockImplementationOnce((_path, _options, callback) => {
					changeCallback = callback;
					return faultyWatcher;
				});

				cacheManager.setFileContent(testFilePath, testContent, true);

				expect(() => {
					changeCallback('change', 'watched-file.txt');
				}).toThrow('Close error');
			});

			it('should handle missing watcher in close operation', () => {
				// This tests the protected stopWatchingFile method indirectly
				// by ensuring no errors occur when trying to close non-existent watchers

				// Set up a file with watching, then simulate change
				let changeCallback: (eventType: string, filename: string) => void;

				mockWatch.mockImplementationOnce((_path, _options, callback) => {
					changeCallback = callback;
					return mockWatcher;
				});

				cacheManager.setFileContent(testFilePath, testContent, true);

				// First change should work normally
				expect(() => {
					changeCallback('change', 'watched-file.txt');
				}).not.toThrow();

				// Attempting to trigger another change (watcher already removed) should not error
				expect(() => {
					changeCallback('change', 'watched-file.txt');
				}).not.toThrow();
			});
		});
	});

	describe('Cache Memory Management', () => {
		it('should handle large number of tool use cache entries', () => {
			const entries = 1000;

			for (let i = 0; i < entries; i++) {
				const toolUse = {
					name: 'test_tool',
					tool_use_id: `test-${i}`,
					parameters: { index: i },
				} as AnyToolUse;

				cacheManager.setToolUse(`id-${i}`, toolUse);
			}

			// Verify all entries are accessible
			for (let i = 0; i < entries; i++) {
				const retrieved = cacheManager.getToolUse(`id-${i}`);
				expect(retrieved?.parameters).toEqual({ index: i });
			}
		});

		it('should handle large number of file cache entries', () => {
			const entries = 1000;

			for (let i = 0; i < entries; i++) {
				cacheManager.setFileContent(`/test/file-${i}.txt`, `Content ${i}`);
			}

			// Verify all entries are accessible
			for (let i = 0; i < entries; i++) {
				const retrieved = cacheManager.getFileContent(`/test/file-${i}.txt`);
				expect(retrieved).toBe(`Content ${i}`);
			}
		});

		it('should handle mixed cache operations', () => {
			const iterations = 100;

			for (let i = 0; i < iterations; i++) {
				// Add tool use
				const toolUse = {
					name: 'mixed_tool',
					tool_use_id: `mixed-${i}`,
					parameters: { value: i },
				} as AnyToolUse;

				cacheManager.setToolUse(`tool-${i}`, toolUse);

				// Add file content
				cacheManager.setFileContent(`/mixed/file-${i}.txt`, `Mixed content ${i}`);

				// Verify both are accessible
				expect(cacheManager.getToolUse(`tool-${i}`)).toEqual(toolUse);
				expect(cacheManager.getFileContent(`/mixed/file-${i}.txt`)).toBe(`Mixed content ${i}`);
			}
		});
	});

	describe('Edge Cases and Boundary Conditions', () => {
		describe('input validation', () => {
			it('should handle null and undefined tool use ids', () => {
				const toolUse = { name: 'test', tool_use_id: 'test' } as AnyToolUse;

				expect(() => {
					cacheManager.setToolUse(null as any, toolUse);
				}).not.toThrow();

				expect(() => {
					cacheManager.setToolUse(undefined as any, toolUse);
				}).not.toThrow();
			});

			it('should handle null and undefined file paths', () => {
				expect(() => {
					cacheManager.setFileContent(null as any, 'content');
				}).not.toThrow();

				expect(() => {
					cacheManager.setFileContent(undefined as any, 'content');
				}).not.toThrow();
			});

			it('should handle null and undefined content', () => {
				expect(() => {
					cacheManager.setFileContent('/test/null-content.txt', null as any);
				}).not.toThrow();

				expect(() => {
					cacheManager.setFileContent('/test/undefined-content.txt', undefined as any);
				}).not.toThrow();
			});
		});

		describe('special file paths', () => {
			it('should handle absolute paths', () => {
				const absolutePath = '/absolute/path/to/file.txt';
				cacheManager.setFileContent(absolutePath, 'absolute content');

				expect(cacheManager.getFileContent(absolutePath)).toBe('absolute content');
			});

			it('should handle relative paths', () => {
				const relativePath = './relative/path/file.txt';
				cacheManager.setFileContent(relativePath, 'relative content');

				expect(cacheManager.getFileContent(relativePath)).toBe('relative content');
			});

			it('should handle paths with multiple consecutive slashes', () => {
				const weirdPath = '/path//with///multiple////slashes/file.txt';
				cacheManager.setFileContent(weirdPath, 'weird path content');

				expect(cacheManager.getFileContent(weirdPath)).toBe('weird path content');
			});

			it('should handle very long file paths', () => {
				const longPath = `/${'a'.repeat(1000)}/file.txt`;
				cacheManager.setFileContent(longPath, 'long path content');

				expect(cacheManager.getFileContent(longPath)).toBe('long path content');
			});
		});

		describe('content edge cases', () => {
			it('should handle binary content as string', () => {
				const binaryContent = '\x00\x01\x02\xFF';
				cacheManager.setFileContent('/test/binary.bin', binaryContent);

				expect(cacheManager.getFileContent('/test/binary.bin')).toBe(binaryContent);
			});

			it('should handle unicode content', () => {
				const unicodeContent = '🚀 Hello 世界 🌍 مرحبا';
				cacheManager.setFileContent('/test/unicode.txt', unicodeContent);

				expect(cacheManager.getFileContent('/test/unicode.txt')).toBe(unicodeContent);
			});

			it('should handle content with newlines and special characters', () => {
				const complexContent = 'Line 1\nLine 2\r\nLine 3\tTabbed\x00Null';
				cacheManager.setFileContent('/test/complex.txt', complexContent);

				expect(cacheManager.getFileContent('/test/complex.txt')).toBe(complexContent);
			});
		});

		describe('rapid operations', () => {
			it('should handle rapid cache invalidation', () => {
				const callbacks: Array<(eventType: string, filename: string) => void> = [];

				mockWatch.mockImplementation((_path, _options, callback) => {
					callbacks.push(callback);
					return { close: vi.fn() } as unknown as FSWatcher;
				});

				const filePath = '/test/rapid-invalidation.txt';

				// Set up multiple files with watching
				for (let i = 0; i < 10; i++) {
					cacheManager.setFileContent(`${filePath}-${i}`, `Content ${i}`, true);
				}

				// Rapidly trigger changes
				expect(() => {
					for (let i = 0; i < callbacks.length; i++) {
						callbacks[i]('change', `rapid-invalidation-${i}.txt`);
					}
				}).not.toThrow();
			});

			it('should handle interleaved read/write operations', () => {
				const iterations = 50;
				const filePath = '/test/interleaved.txt';

				for (let i = 0; i < iterations; i++) {
					cacheManager.setFileContent(filePath, `Content ${i}`);

					const retrieved = cacheManager.getFileContent(filePath);
					expect(retrieved).toBe(`Content ${i}`);

					// Also test tool use operations
					const toolUse = { name: 'test', tool_use_id: `id-${i}` } as AnyToolUse;
					cacheManager.setToolUse(`tool-${i}`, toolUse);

					const retrievedTool = cacheManager.getToolUse(`tool-${i}`);
					expect(retrievedTool).toEqual(toolUse);
				}
			});
		});
	});
});
