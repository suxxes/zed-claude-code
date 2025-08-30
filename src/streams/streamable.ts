/**
 * A streamable implementation for async message queues
 * Used primarily for Claude SDK user message streams
 */
export class Streamable<T> {
	protected queue: T[] = [];
	protected finished = false;
	protected streamError: Error | null = null;
	protected pendingResolvers: ((value: IteratorResult<T>) => void)[] = [];

	/**
	 * Push a new value to the stream
	 */
	push(value: T): void {
		if (this.finished) {
			throw new Error('Cannot push to finished stream');
		}

		this.queue.push(value);
		this.tryResolveNext();
	}

	/**
	 * Mark the stream as finished (no more values)
	 */
	end(): void {
		this.finished = true;
		this.resolveAllPending();
	}

	/**
	 * Mark the stream as errored
	 */
	error(err: Error): void {
		this.streamError = err;
		this.resolveAllPending();
	}

	/**
	 * Make the stream async iterable
	 */
	[Symbol.asyncIterator](): AsyncIterator<T> {
		return this;
	}

	/**
	 * Get the next value from the stream
	 */
	async next(): Promise<IteratorResult<T>> {
		if (this.streamError) {
			throw this.streamError;
		}

		// If there's a value in the queue, return it immediately
		if (this.queue.length > 0) {
			const value = this.queue.shift() as T; // Safe because length > 0
			return { value, done: false };
		}

		// If stream is finished and queue is empty, return done
		if (this.finished) {
			return { value: undefined, done: true };
		}

		// Wait for a value to be pushed or stream to end/error
		return new Promise<IteratorResult<T>>((resolve) => {
			this.pendingResolvers.push(resolve);
		});
	}

	/**
	 * Close the stream
	 */
	async return(): Promise<IteratorResult<T>> {
		this.finished = true;
		return { value: undefined, done: true };
	}

	/**
	 * Try to resolve the next pending resolver if possible
	 */
	protected tryResolveNext(): void {
		if (this.pendingResolvers.length > 0 && this.queue.length > 0) {
			const resolve = this.pendingResolvers.shift();
			const value = this.queue.shift() as T;
			if (resolve) {
				resolve({ value, done: false });
			}
		}
	}

	/**
	 * Resolve all pending resolvers (when stream ends or errors)
	 */
	protected resolveAllPending(): void {
		while (this.pendingResolvers.length > 0) {
			const resolve = this.pendingResolvers.shift();
			if (resolve) {
				if (this.streamError) {
					// Don't resolve here, let next() throw the error
					resolve({ value: undefined, done: true });
				} else {
					resolve({ value: undefined, done: true });
				}
			}
		}
	}
}
