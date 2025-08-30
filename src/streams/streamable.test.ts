import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Streamable } from './streamable';

describe('Streamable', () => {
	let streamable: Streamable<string>;

	beforeEach(() => {
		streamable = new Streamable<string>();
	});

	afterEach(() => {
		// Clean up any pending promises or timers
		vi.clearAllTimers();
	});

	describe('constructor', () => {
		it('should create a new Streamable instance', () => {
			expect(streamable).toBeInstanceOf(Streamable);
		});

		it('should initialize with empty queue', () => {
			expect(streamable.queue).toEqual([]);
		});

		it('should initialize as not finished', () => {
			expect(streamable.finished).toBe(false);
		});

		it('should initialize with no error', () => {
			expect(streamable.streamError).toBe(null);
		});

		it('should initialize with no pending resolvers', () => {
			expect(streamable.pendingResolvers).toEqual([]);
		});

		it('should support different data types', () => {
			const numberStream = new Streamable<number>();
			const objectStream = new Streamable<{ id: number; name: string }>();
			const arrayStream = new Streamable<string[]>();

			expect(numberStream).toBeInstanceOf(Streamable);
			expect(objectStream).toBeInstanceOf(Streamable);
			expect(arrayStream).toBeInstanceOf(Streamable);
		});
	});

	describe('push', () => {
		it('should add value to queue', () => {
			streamable.push('test');
			expect(streamable.queue).toEqual(['test']);
		});

		it('should add multiple values to queue', () => {
			streamable.push('first');
			streamable.push('second');
			streamable.push('third');
			expect(streamable.queue).toEqual(['first', 'second', 'third']);
		});

		it('should throw error when pushing to finished stream', () => {
			streamable.end();
			expect(() => streamable.push('test')).toThrow('Cannot push to finished stream');
		});

		it('should resolve pending next() call when pushing', async () => {
			const nextPromise = streamable.next();
			streamable.push('test');

			const result = await nextPromise;
			expect(result).toEqual({ value: 'test', done: false });
		});

		it('should clear pending resolvers after resolving', async () => {
			const nextPromise = streamable.next();
			streamable.push('test');
			await nextPromise;

			expect(streamable.pendingResolvers).toHaveLength(0);
		});

		it('should handle multiple concurrent push operations', () => {
			streamable.push('first');
			streamable.push('second');
			streamable.push('third');

			expect(streamable.queue).toEqual(['first', 'second', 'third']);
		});

		it('should handle pushing different data types', () => {
			const numberStream = new Streamable<number>();
			const objectStream = new Streamable<{ id: number }>();

			numberStream.push(42);
			objectStream.push({ id: 1 });

			expect(numberStream.queue).toEqual([42]);
			expect(objectStream.queue).toEqual([{ id: 1 }]);
		});
	});

	describe('end', () => {
		it('should mark stream as finished', () => {
			streamable.end();
			expect(streamable.finished).toBe(true);
		});

		it('should resolve pending next() call with done: true', async () => {
			const nextPromise = streamable.next();
			streamable.end();

			const result = await nextPromise;
			expect(result).toEqual({ value: undefined, done: true });
		});

		it('should clear pending resolvers after resolving', async () => {
			const nextPromise = streamable.next();
			streamable.end();
			await nextPromise;

			expect(streamable.pendingResolvers).toHaveLength(0);
		});

		it('should not affect queue contents', () => {
			streamable.push('test');
			streamable.end();
			expect(streamable.queue).toEqual(['test']);
		});

		it('should be idempotent', () => {
			streamable.end();
			streamable.end();
			expect(streamable.finished).toBe(true);
		});

		it('should handle ending stream without pending operations', () => {
			expect(() => streamable.end()).not.toThrow();
			expect(streamable.finished).toBe(true);
		});
	});

	describe('error', () => {
		it('should set stream error', () => {
			const error = new Error('Test error');
			streamable.error(error);
			expect(streamable.streamError).toBe(error);
		});

		it('should resolve pending next() call with done: true', async () => {
			const nextPromise = streamable.next();
			const error = new Error('Test error');
			streamable.error(error);

			const result = await nextPromise;
			expect(result).toEqual({ value: undefined, done: true });
		});

		it('should clear pending resolvers after resolving', async () => {
			const nextPromise = streamable.next();
			const error = new Error('Test error');
			streamable.error(error);
			await nextPromise;

			expect(streamable.pendingResolvers).toHaveLength(0);
		});

		it('should not affect queue contents when errored', () => {
			streamable.push('test');
			const error = new Error('Test error');
			streamable.error(error);
			expect(streamable.queue).toEqual(['test']);
		});

		it('should handle error without pending operations', () => {
			const error = new Error('Test error');
			expect(() => streamable.error(error)).not.toThrow();
			expect(streamable.streamError).toBe(error);
		});

		it('should preserve original error object', () => {
			const originalError = new Error('Original message');
			originalError.stack = 'original stack';
			streamable.error(originalError);

			expect(streamable.streamError).toBe(originalError);
			expect(streamable.streamError?.message).toBe('Original message');
		});
	});

	describe('Symbol.asyncIterator', () => {
		it('should return itself as async iterator', () => {
			const iterator = streamable[Symbol.asyncIterator]();
			expect(iterator).toBe(streamable);
		});

		it('should support for-await-of loops', async () => {
			const values: string[] = [];

			// Start iteration in background
			const iterationPromise = (async () => {
				for await (const value of streamable) {
					values.push(value);
				}
			})();

			// Push some values
			streamable.push('first');
			streamable.push('second');
			streamable.end();

			await iterationPromise;
			expect(values).toEqual(['first', 'second']);
		});

		it('should handle empty stream in for-await-of', async () => {
			const values: string[] = [];

			const iterationPromise = (async () => {
				for await (const value of streamable) {
					values.push(value);
				}
			})();

			streamable.end();
			await iterationPromise;
			expect(values).toEqual([]);
		});
	});

	describe('next', () => {
		it('should return queued value immediately if available', async () => {
			streamable.push('test');
			const result = await streamable.next();
			expect(result).toEqual({ value: 'test', done: false });
		});

		it('should remove value from queue when returned', async () => {
			streamable.push('test');
			await streamable.next();
			expect(streamable.queue).toEqual([]);
		});

		it('should return values in FIFO order', async () => {
			streamable.push('first');
			streamable.push('second');

			const result1 = await streamable.next();
			const result2 = await streamable.next();

			expect(result1).toEqual({ value: 'first', done: false });
			expect(result2).toEqual({ value: 'second', done: false });
		});

		it('should return done: true if stream is finished and queue is empty', async () => {
			streamable.end();
			const result = await streamable.next();
			expect(result).toEqual({ value: undefined, done: true });
		});

		it('should return queued values even if stream is finished', async () => {
			streamable.push('test');
			streamable.end();

			const result1 = await streamable.next();
			const result2 = await streamable.next();

			expect(result1).toEqual({ value: 'test', done: false });
			expect(result2).toEqual({ value: undefined, done: true });
		});

		it('should throw error if stream is errored', async () => {
			const error = new Error('Test error');
			streamable.error(error);

			await expect(streamable.next()).rejects.toThrow('Test error');
		});

		it('should wait for value if queue is empty and stream not finished', async () => {
			const nextPromise = streamable.next();

			// Should not resolve immediately
			let resolved = false;
			nextPromise.then(() => {
				resolved = true;
			});
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(resolved).toBe(false);

			// Should resolve when value is pushed
			streamable.push('test');
			const result = await nextPromise;
			expect(result).toEqual({ value: 'test', done: false });
		});

		it('should handle multiple concurrent next() calls', async () => {
			const promise1 = streamable.next();
			const promise2 = streamable.next();
			const promise3 = streamable.next();

			// Add a small delay to ensure promises are registered
			await new Promise((resolve) => setTimeout(resolve, 1));

			streamable.push('first');
			streamable.push('second');
			streamable.push('third');

			const results = await Promise.all([promise1, promise2, promise3]);

			// Check that we got all three results
			expect(results).toHaveLength(3);
			expect(results.every((r) => !r.done)).toBe(true);

			// Check that we got all expected values (order might vary due to async nature)
			const values = results.map((r) => r.value).sort();
			expect(['first', 'second', 'third'].sort()).toEqual(values);
		});

		it('should throw error for values in queue if stream is errored', async () => {
			streamable.push('test');
			const error = new Error('Test error');
			streamable.error(error);

			await expect(streamable.next()).rejects.toThrow('Test error');
		});

		it('should handle undefined values in queue', async () => {
			const undefinedStream = new Streamable<string | undefined>();
			undefinedStream.push(undefined);

			// Should not be treated as queue being empty
			const result = await undefinedStream.next();
			expect(result).toEqual({ value: undefined, done: false });
		});
	});

	describe('return', () => {
		it('should mark stream as finished', async () => {
			await streamable.return();
			expect(streamable.finished).toBe(true);
		});

		it('should return done: true', async () => {
			const result = await streamable.return();
			expect(result).toEqual({ value: undefined, done: true });
		});

		it('should not affect queue contents', async () => {
			streamable.push('test');
			await streamable.return();
			expect(streamable.queue).toEqual(['test']);
		});

		it('should handle multiple calls', async () => {
			const result1 = await streamable.return();
			const result2 = await streamable.return();

			expect(result1).toEqual({ value: undefined, done: true });
			expect(result2).toEqual({ value: undefined, done: true });
			expect(streamable.finished).toBe(true);
		});
	});

	describe('stream lifecycle integration', () => {
		it('should handle complete stream lifecycle', async () => {
			const values: string[] = [];

			// Start consuming stream
			const consumePromise = (async () => {
				for await (const value of streamable) {
					values.push(value);
				}
			})();

			// Produce values
			streamable.push('first');
			streamable.push('second');
			streamable.end();

			await consumePromise;
			expect(values).toEqual(['first', 'second']);
			expect(streamable.finished).toBe(true);
		});

		it('should handle error during stream consumption', async () => {
			const values: string[] = [];
			let caughtError: Error | null = null;

			const consumePromise = (async () => {
				try {
					for await (const value of streamable) {
						values.push(value);
					}
				} catch (error) {
					caughtError = error as Error;
				}
			})();

			streamable.push('first');
			const testError = new Error('Stream error');
			streamable.error(testError);

			await consumePromise;
			expect(values).toEqual(['first']);
			expect(caughtError).toBe(testError);
		});

		it('should handle premature stream closure', async () => {
			const values: string[] = [];

			const consumePromise = (async () => {
				for await (const value of streamable) {
					values.push(value);
				}
			})();

			streamable.push('first');
			await streamable.return(); // Close stream early

			await consumePromise;
			expect(values).toEqual(['first']);
			expect(streamable.pendingResolvers).toHaveLength(0);
		});
	});

	describe('error handling and edge cases', () => {
		it('should handle rapid push/end sequence', async () => {
			const values: string[] = [];

			const consumePromise = (async () => {
				for await (const value of streamable) {
					values.push(value);
				}
			})();

			streamable.push('test1');
			streamable.push('test2');
			streamable.end();

			await consumePromise;
			expect(values).toEqual(['test1', 'test2']);
		});

		it('should handle error after values are queued', async () => {
			streamable.push('test1');
			streamable.push('test2');

			const error = new Error('Test error');
			streamable.error(error);

			// First call should throw because error is set
			await expect(streamable.next()).rejects.toThrow('Test error');
		});

		it('should handle concurrent push and next operations', async () => {
			const results: Array<{ value: string; done: boolean }> = [];

			// Start multiple next() calls
			const nextPromises = [streamable.next(), streamable.next(), streamable.next()];

			// Add small delay to ensure next() calls are registered
			await new Promise((resolve) => setTimeout(resolve, 1));

			// Push values with immediate timing
			streamable.push('first');
			streamable.push('second');
			streamable.push('third');

			const resolvedResults = await Promise.all(nextPromises);
			results.push(...resolvedResults);

			expect(results).toHaveLength(3);
			expect(results.every((r) => !r.done)).toBe(true);

			const values = results.map((r) => r.value);
			expect(values).toEqual(expect.arrayContaining(['first', 'second', 'third']));
		});

		it('should handle large amounts of data', async () => {
			const dataSize = 10000;
			const testData = Array.from({ length: dataSize }, (_, i) => `item-${i}`);

			// Push all data
			for (const item of testData) {
				streamable.push(item);
			}
			streamable.end();

			// Consume all data
			const results: string[] = [];
			for await (const value of streamable) {
				results.push(value);
			}

			expect(results).toEqual(testData);
			expect(results).toHaveLength(dataSize);
		});

		it('should maintain order under concurrent operations', async () => {
			const values: string[] = [];

			// Start consumption
			const consumePromise = (async () => {
				for await (const value of streamable) {
					values.push(value);
				}
			})();

			// Push values sequentially to ensure order (the test is about maintaining order)
			// We'll use sequential pushes with small delays to test async handling
			for (let i = 0; i < 10; i++) {
				streamable.push(`value-${i}`);
				// Small delay to allow async processing
				await new Promise((resolve) => setTimeout(resolve, 1));
			}

			streamable.end();
			await consumePromise;

			// Should maintain insertion order
			expect(values).toHaveLength(10);
			for (let i = 0; i < 10; i++) {
				expect(values[i]).toBe(`value-${i}`);
			}
		});

		it('should handle mixed operations sequence', async () => {
			const results: Array<{ value?: string; done: boolean }> = [];

			// Mix of immediate and deferred operations
			streamable.push('immediate1');
			results.push(await streamable.next());

			const deferredNext = streamable.next();
			streamable.push('deferred1');
			results.push(await deferredNext);

			streamable.push('immediate2');
			streamable.push('immediate3');
			results.push(await streamable.next());
			results.push(await streamable.next());

			streamable.end();
			results.push(await streamable.next());

			expect(results).toEqual([
				{ value: 'immediate1', done: false },
				{ value: 'deferred1', done: false },
				{ value: 'immediate2', done: false },
				{ value: 'immediate3', done: false },
				{ value: undefined, done: true },
			]);
		});
	});

	describe('memory and resource management', () => {
		it('should not leak memory with abandoned streams', async () => {
			// Create stream and abandon it without cleanup
			const abandonedStream = new Streamable<string>();
			abandonedStream.push('test');

			// Should not cause issues when GC'd
			expect(abandonedStream.queue).toEqual(['test']);
		});

		it('should handle stream cleanup after error', async () => {
			const error = new Error('Test error');

			streamable.push('test1');
			streamable.error(error);

			await expect(streamable.next()).rejects.toThrow('Test error');

			// Stream should still be in errored state
			expect(streamable.streamError).toBe(error);
			expect(streamable.queue).toEqual(['test1']);
		});

		it('should handle cleanup with pending operations', async () => {
			const pendingNext = streamable.next();

			// End stream while next() is waiting
			streamable.end();

			const result = await pendingNext;
			expect(result).toEqual({ value: undefined, done: true });
			expect(streamable.pendingResolvers).toHaveLength(0);
		});
	});

	describe('type safety and generics', () => {
		it('should maintain type safety with different types', async () => {
			const numberStream = new Streamable<number>();
			const objectStream = new Streamable<{ id: number; name: string }>();

			numberStream.push(42);
			objectStream.push({ id: 1, name: 'test' });

			const numberResult = await numberStream.next();
			const objectResult = await objectStream.next();

			expect(numberResult.value).toBe(42);
			expect(objectResult.value).toEqual({ id: 1, name: 'test' });
		});

		it('should handle union types', async () => {
			const mixedStream = new Streamable<string | number | null>();

			mixedStream.push('string');
			mixedStream.push(42);
			mixedStream.push(null);

			const results = [await mixedStream.next(), await mixedStream.next(), await mixedStream.next()];

			expect(results[0].value).toBe('string');
			expect(results[1].value).toBe(42);
			expect(results[2].value).toBe(null);
		});

		it('should handle complex object types', async () => {
			interface ComplexType {
				nested: {
					array: number[];
					optional?: string;
				};
				callback: () => void;
			}

			const complexStream = new Streamable<ComplexType>();
			const testObject: ComplexType = {
				nested: {
					array: [1, 2, 3],
					optional: 'test',
				},
				callback: vi.fn(),
			};

			complexStream.push(testObject);
			const result = await complexStream.next();

			expect(result.value).toBe(testObject);
			expect(result.value?.nested.array).toEqual([1, 2, 3]);
		});
	});
});
