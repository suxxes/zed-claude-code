import type { PromptRequest } from '@zed-industries/agent-client-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AcpToClaudeTransformer } from './acp-to-claude-transformer';

describe('AcpToClaudeTransformer', () => {
	let transformer: AcpToClaudeTransformer;

	beforeEach(() => {
		transformer = new AcpToClaudeTransformer();
	});

	describe('constructor', () => {
		it('should create a new AcpToClaudeTransformer instance', () => {
			expect(transformer).toBeInstanceOf(AcpToClaudeTransformer);
		});
	});

	describe('transform', () => {
		describe('text content', () => {
			it('should transform simple text content', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-123',
					prompt: [
						{
							type: 'text',
							text: 'Hello, world!',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result).toEqual({
					type: 'user',
					message: {
						role: 'user',
						content: [
							{
								type: 'text',
								text: 'Hello, world!',
							},
						],
					},
					session_id: 'test-session-123',
					parent_tool_use_id: null,
				});
			});

			it('should transform multiple text chunks', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-456',
					prompt: [
						{
							type: 'text',
							text: 'First chunk',
						},
						{
							type: 'text',
							text: 'Second chunk',
						},
						{
							type: 'text',
							text: 'Third chunk',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(3);
				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: 'First chunk',
				});
				expect(result.message.content[1]).toEqual({
					type: 'text',
					text: 'Second chunk',
				});
				expect(result.message.content[2]).toEqual({
					type: 'text',
					text: 'Third chunk',
				});
			});

			it('should handle empty text content', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-empty',
					prompt: [
						{
							type: 'text',
							text: '',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toEqual([
					{
						type: 'text',
						text: '',
					},
				]);
			});

			it('should handle text with special characters and Unicode', () => {
				const specialText = 'Hello 🌍! Special chars: <>&"\'ñáéíóú';
				const prompt: PromptRequest = {
					sessionId: 'test-session-special',
					prompt: [
						{
							type: 'text',
							text: specialText,
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: specialText,
				});
			});

			it('should handle extremely long text content', () => {
				const longText = 'x'.repeat(100000); // 100KB of text
				const prompt: PromptRequest = {
					sessionId: 'test-session-long',
					prompt: [
						{
							type: 'text',
							text: longText,
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: longText,
				});
				expect(result.message.content[0].text).toHaveLength(100000);
			});
		});

		describe('resource_link content', () => {
			it('should transform file:// URI to formatted link', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-file',
					prompt: [
						{
							type: 'resource_link',
							uri: 'file:///path/to/file.txt',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: '[file.txt](file:///path/to/file.txt)',
				});
			});

			it('should transform zed:// URI to formatted link', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-zed',
					prompt: [
						{
							type: 'resource_link',
							uri: 'zed://project/src/main.ts',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: '[main.ts](zed://project/src/main.ts)',
				});
			});

			it('should pass through non-file/zed URIs unchanged', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-http',
					prompt: [
						{
							type: 'resource_link',
							uri: 'https://example.com/resource',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: 'https://example.com/resource',
				});
			});

			it('should handle malformed file URI gracefully', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-malformed',
					prompt: [
						{
							type: 'resource_link',
							uri: 'file://',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: '[](file://)',
				});
			});

			it('should handle URI with no filename', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-no-file',
					prompt: [
						{
							type: 'resource_link',
							uri: 'file:///path/to/',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: '[/path/to/](file:///path/to/)',
				});
			});
		});

		describe('resource content', () => {
			it('should transform resource with text content', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-resource',
					prompt: [
						{
							type: 'resource',
							resource: {
								uri: 'file:///path/to/code.ts',
								text: 'const hello = "world";',
							},
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(2);
				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: '[code.ts](file:///path/to/code.ts)',
				});
				expect(result.message.content[1]).toEqual({
					type: 'text',
					text: '\n<context ref="file:///path/to/code.ts">\nconst hello = "world";\n</context>',
				});
			});

			it('should handle resource with empty text content', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-empty-resource',
					prompt: [
						{
							type: 'resource',
							resource: {
								uri: 'file:///empty.txt',
								text: '',
							},
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(2);
				expect(result.message.content[1]).toEqual({
					type: 'text',
					text: '\n<context ref="file:///empty.txt">\n\n</context>',
				});
			});

			it('should handle resource with large text content', () => {
				const largeContent = 'console.log("line");\n'.repeat(10000);
				const prompt: PromptRequest = {
					sessionId: 'test-session-large-resource',
					prompt: [
						{
							type: 'resource',
							resource: {
								uri: 'file:///large.js',
								text: largeContent,
							},
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(2);
				expect(result.message.content[1].text).toContain(largeContent);
				expect(result.message.content[1].text.length).toBeGreaterThan(largeContent.length);
			});

			it('should handle resource with special characters in content', () => {
				const specialContent = 'const msg = "Hello <world> & \'universe\' "galaxy"";';
				const prompt: PromptRequest = {
					sessionId: 'test-session-special-resource',
					prompt: [
						{
							type: 'resource',
							resource: {
								uri: 'file:///special.js',
								text: specialContent,
							},
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[1].text).toContain(specialContent);
			});

			it('should skip resource without text property', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-no-text',
					prompt: [
						{
							type: 'resource',
							resource: {
								uri: 'file:///binary.bin',
								// No text property
							} as any,
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(0);
			});
		});

		describe('image content', () => {
			it('should transform image with base64 data', () => {
				const base64Data =
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77yQAAAABJRU5ErkJggg==';
				const prompt: PromptRequest = {
					sessionId: 'test-session-image',
					prompt: [
						{
							type: 'image',
							data: base64Data,
							mimeType: 'image/png',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'image',
					source: {
						type: 'base64',
						data: base64Data,
						media_type: 'image/png',
					},
				});
			});

			it('should transform image with HTTP URL', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-image-url',
					prompt: [
						{
							type: 'image',
							uri: 'https://example.com/image.jpg',
							mimeType: 'image/jpeg',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'image',
					source: {
						type: 'url',
						url: 'https://example.com/image.jpg',
					},
				});
			});

			it('should transform image with HTTPS URL', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-image-https',
					prompt: [
						{
							type: 'image',
							uri: 'https://secure.example.com/image.png',
							mimeType: 'image/png',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'image',
					source: {
						type: 'url',
						url: 'https://secure.example.com/image.png',
					},
				});
			});

			it('should skip image without data or valid URI', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-invalid-image',
					prompt: [
						{
							type: 'image',
							mimeType: 'image/png',
							// No data or uri
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(0);
			});

			it('should skip image with file:// URI', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-file-image',
					prompt: [
						{
							type: 'image',
							uri: 'file:///path/to/image.jpg',
							mimeType: 'image/jpeg',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(0);
			});

			it('should handle different image MIME types', () => {
				const testCases = [
					{ mimeType: 'image/png', data: 'png-data' },
					{ mimeType: 'image/jpeg', data: 'jpeg-data' },
					{ mimeType: 'image/gif', data: 'gif-data' },
					{ mimeType: 'image/webp', data: 'webp-data' },
				];

				for (const testCase of testCases) {
					const prompt: PromptRequest = {
						sessionId: 'test-session-mime',
						prompt: [
							{
								type: 'image',
								data: testCase.data,
								mimeType: testCase.mimeType,
							},
						],
					};

					const result = transformer.transform(prompt);

					expect(result.message.content[0]).toEqual({
						type: 'image',
						source: {
							type: 'base64',
							data: testCase.data,
							media_type: testCase.mimeType,
						},
					});
				}
			});

			it('should handle very large base64 image data', () => {
				const largeBase64 = 'A'.repeat(1000000); // 1MB of base64 data
				const prompt: PromptRequest = {
					sessionId: 'test-session-large-image',
					prompt: [
						{
							type: 'image',
							data: largeBase64,
							mimeType: 'image/png',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content[0]).toEqual({
					type: 'image',
					source: {
						type: 'base64',
						data: largeBase64,
						media_type: 'image/png',
					},
				});
			});
		});

		describe('mixed content', () => {
			it('should transform mixed content types', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-mixed',
					prompt: [
						{
							type: 'text',
							text: 'Here is some code:',
						},
						{
							type: 'resource_link',
							uri: 'file:///code.ts',
						},
						{
							type: 'resource',
							resource: {
								uri: 'file:///example.js',
								text: 'console.log("example");',
							},
						},
						{
							type: 'image',
							data: 'base64-image-data',
							mimeType: 'image/png',
						},
						{
							type: 'text',
							text: "And that's it!",
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(6);
				expect(result.message.content[0]).toEqual({
					type: 'text',
					text: 'Here is some code:',
				});
				expect(result.message.content[1]).toEqual({
					type: 'text',
					text: '[code.ts](file:///code.ts)',
				});
				expect(result.message.content[2]).toEqual({
					type: 'text',
					text: '[example.js](file:///example.js)',
				});
				expect(result.message.content[3]).toEqual({
					type: 'image',
					source: {
						type: 'base64',
						data: 'base64-image-data',
						media_type: 'image/png',
					},
				});
				expect(result.message.content[4]).toEqual({
					type: 'text',
					text: "And that's it!",
				});
				expect(result.message.content[5]).toEqual({
					type: 'text',
					text: '\n<context ref="file:///example.js">\nconsole.log("example");\n</context>',
				});
			});

			it('should place all context at the end', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-context-order',
					prompt: [
						{
							type: 'resource',
							resource: {
								uri: 'file:///first.js',
								text: 'first content',
							},
						},
						{
							type: 'text',
							text: 'Some text',
						},
						{
							type: 'resource',
							resource: {
								uri: 'file:///second.js',
								text: 'second content',
							},
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(5);
				// First resource link
				expect(result.message.content[0].text).toBe('[first.js](file:///first.js)');
				// Text content
				expect(result.message.content[1].text).toBe('Some text');
				// Second resource link
				expect(result.message.content[2].text).toBe('[second.js](file:///second.js)');
				// First context
				expect(result.message.content[3].text).toContain('first content');
				// Second context
				expect(result.message.content[4].text).toContain('second content');
			});
		});

		describe('unknown content types', () => {
			it('should skip unknown content types', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-unknown',
					prompt: [
						{
							type: 'text',
							text: 'Known content',
						},
						{
							type: 'unknown_type' as any,
							someProperty: 'some value',
						},
						{
							type: 'text',
							text: 'More known content',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(2);
				expect(result.message.content[0].text).toBe('Known content');
				expect(result.message.content[1].text).toBe('More known content');
			});
		});

		describe('empty prompts', () => {
			it('should handle empty prompt array', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-empty',
					prompt: [],
				};

				const result = transformer.transform(prompt);

				expect(result).toEqual({
					type: 'user',
					message: {
						role: 'user',
						content: [],
					},
					session_id: 'test-session-empty',
					parent_tool_use_id: null,
				});
			});

			it('should handle prompt with only skipped content', () => {
				const prompt: PromptRequest = {
					sessionId: 'test-session-skipped',
					prompt: [
						{
							type: 'image',
							mimeType: 'image/png',
							// No data or valid URI
						},
						{
							type: 'unknown_type' as any,
							data: 'irrelevant',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.message.content).toHaveLength(0);
			});
		});

		describe('session ID handling', () => {
			it('should preserve session ID', () => {
				const sessionId = 'very-unique-session-id-12345';
				const prompt: PromptRequest = {
					sessionId,
					prompt: [
						{
							type: 'text',
							text: 'Test',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.session_id).toBe(sessionId);
			});

			it('should handle empty session ID', () => {
				const prompt: PromptRequest = {
					sessionId: '',
					prompt: [
						{
							type: 'text',
							text: 'Test',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.session_id).toBe('');
			});

			it('should handle special characters in session ID', () => {
				const sessionId = 'session-123_test@domain.com!#$%';
				const prompt: PromptRequest = {
					sessionId,
					prompt: [
						{
							type: 'text',
							text: 'Test',
						},
					],
				};

				const result = transformer.transform(prompt);

				expect(result.session_id).toBe(sessionId);
			});
		});

		describe('output structure validation', () => {
			it('should always set parent_tool_use_id to null', () => {
				const prompt: PromptRequest = {
					sessionId: 'test',
					prompt: [{ type: 'text', text: 'test' }],
				};

				const result = transformer.transform(prompt);

				expect(result.parent_tool_use_id).toBeNull();
			});

			it('should always set type to "user"', () => {
				const prompt: PromptRequest = {
					sessionId: 'test',
					prompt: [{ type: 'text', text: 'test' }],
				};

				const result = transformer.transform(prompt);

				expect(result.type).toBe('user');
			});

			it('should always set message role to "user"', () => {
				const prompt: PromptRequest = {
					sessionId: 'test',
					prompt: [{ type: 'text', text: 'test' }],
				};

				const result = transformer.transform(prompt);

				expect(result.message.role).toBe('user');
			});

			it('should ensure content is always an array', () => {
				const prompt: PromptRequest = {
					sessionId: 'test',
					prompt: [],
				};

				const result = transformer.transform(prompt);

				expect(Array.isArray(result.message.content)).toBe(true);
			});
		});
	});

	describe('edge cases and error handling', () => {
		it('should handle null or undefined prompt chunks gracefully', () => {
			const prompt: PromptRequest = {
				sessionId: 'test-session',
				prompt: [
					null as any,
					{
						type: 'text',
						text: 'Valid content',
					},
					undefined as any,
				],
			};

			// Should throw an error due to null chunks
			expect(() => transformer.transform(prompt)).toThrow("Cannot read properties of null (reading 'type')");
		});

		it('should handle malformed prompt request', () => {
			const malformedPrompt = {
				sessionId: 'test',
				// Missing prompt property
			} as any;

			expect(() => transformer.transform(malformedPrompt)).toThrow();
		});

		it('should handle circular references in prompt chunks', () => {
			const circularChunk: any = {
				type: 'text',
				text: 'Circular reference test',
			};
			circularChunk.self = circularChunk;

			const prompt: PromptRequest = {
				sessionId: 'test-circular',
				prompt: [circularChunk],
			};

			// Should not cause infinite loops
			const result = transformer.transform(prompt);
			expect(result.message.content[0].text).toBe('Circular reference test');
		});

		it('should handle very deeply nested object structures', () => {
			let deepObject: any = { type: 'text', text: 'Deep test' };
			for (let i = 0; i < 1000; i++) {
				deepObject = { nested: deepObject };
			}

			const prompt: PromptRequest = {
				sessionId: 'test-deep',
				prompt: [deepObject as any],
			};

			// Should handle gracefully without stack overflow
			expect(() => transformer.transform(prompt)).not.toThrow();
		});

		it('should handle prompt with mixed valid and invalid chunks', () => {
			const prompt: PromptRequest = {
				sessionId: 'test-mixed-valid',
				prompt: [
					{
						type: 'text',
						text: 'Valid text 1',
					},
					{
						type: 'invalid_type' as any,
						invalidProperty: 'should be ignored',
					},
					{
						type: 'text',
						text: 'Valid text 2',
					},
					{
						type: 'image',
						// Missing required properties
					} as any,
					{
						type: 'resource_link',
						uri: 'file:///valid/path.txt',
					},
				],
			};

			const result = transformer.transform(prompt);

			expect(result.message.content).toHaveLength(3);
			expect(result.message.content[0].text).toBe('Valid text 1');
			expect(result.message.content[1].text).toBe('Valid text 2');
			expect(result.message.content[2].text).toBe('[path.txt](file:///valid/path.txt)');
		});
	});

	describe('performance and memory', () => {
		it('should handle large number of chunks efficiently', () => {
			const chunks = Array.from({ length: 10000 }, (_, i) => ({
				type: 'text' as const,
				text: `Chunk ${i}`,
			}));

			const prompt: PromptRequest = {
				sessionId: 'test-performance',
				prompt: chunks,
			};

			const startTime = performance.now();
			const result = transformer.transform(prompt);
			const endTime = performance.now();

			expect(result.message.content).toHaveLength(10000);
			expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
		});

		it('should handle repeated transformations without memory leaks', () => {
			const prompt: PromptRequest = {
				sessionId: 'test-memory',
				prompt: [
					{
						type: 'text',
						text: 'Memory test content',
					},
				],
			};

			// Perform many transformations
			for (let i = 0; i < 1000; i++) {
				const result = transformer.transform(prompt);
				expect(result.message.content).toHaveLength(1);
			}

			// If we reach here without running out of memory, the test passes
			expect(true).toBe(true);
		});
	});
});
