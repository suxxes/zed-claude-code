/**
 * Base interface for message transformers
 */
export interface MessageTransformer<TInput, TOutput> {
	transform(input: TInput): TOutput;
}
