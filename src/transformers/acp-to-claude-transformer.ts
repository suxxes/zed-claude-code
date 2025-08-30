import type { SDKUserMessage } from '@anthropic-ai/claude-code';
import type { PromptRequest } from '@zed-industries/agent-client-protocol';
import type { MessageTransformer } from './message-transformer';

/**
 * Transforms ACP PromptRequest to Claude SDK format
 */
export class AcpToClaudeTransformer implements MessageTransformer<PromptRequest, SDKUserMessage> {
	transform(prompt: PromptRequest): SDKUserMessage {
		const content: Array<
			| { type: 'text'; text: string }
			| { type: 'image'; source: { type: 'base64'; data: string; media_type: string } | { type: 'url'; url: string } }
		> = [];
		const context: Array<{ type: 'text'; text: string }> = [];

		for (const chunk of prompt.prompt) {
			switch (chunk.type) {
				case 'text':
					content.push({ type: 'text', text: chunk.text });
					break;

				case 'resource_link': {
					const formattedUri = this.formatUriAsLink(chunk.uri);
					content.push({
						type: 'text',
						text: formattedUri,
					});
					break;
				}

				case 'resource': {
					if ('text' in chunk.resource) {
						const formattedUri = this.formatUriAsLink(chunk.resource.uri);
						content.push({
							type: 'text',
							text: formattedUri,
						});
						context.push({
							type: 'text',
							text: `\n<context ref="${chunk.resource.uri}">\n${chunk.resource.text}\n</context>`,
						});
					}
					break;
				}

				case 'image':
					if (chunk.data) {
						content.push({
							type: 'image',
							source: {
								type: 'base64',
								data: chunk.data,
								media_type: chunk.mimeType,
							},
						});
					} else if (chunk.uri?.startsWith('http')) {
						content.push({
							type: 'image',
							source: {
								type: 'url',
								url: chunk.uri,
							},
						});
					}
					break;

				default:
					break;
			}
		}

		content.push(...context);

		return {
			type: 'user',
			message: {
				role: 'user',
				content: content,
			},
			session_id: prompt.sessionId,
			parent_tool_use_id: null,
		};
	}

	protected formatUriAsLink(uri: string): string {
		try {
			const url = new URL(uri);

			if (url.protocol === 'file:') {
				// For file:// URLs, decode pathname for Unicode support
				const pathname = decodeURIComponent(url.pathname);

				// If it ends with / it's a directory, show the full path
				if (uri.endsWith('/') && pathname !== '/') {
					return `[@${pathname}](${uri})`;
				}

				// Otherwise extract the filename
				const segments = pathname.split('/').filter(Boolean);
				const name = segments.length > 0 ? segments[segments.length - 1] : '';

				return `[@${name}](${uri})`;
			}

			if (url.protocol === 'zed:') {
				// For zed:// URLs, extract the last path segment
				const pathname = decodeURIComponent(url.pathname);
				const segments = pathname.split('/').filter(Boolean);
				const name = segments.length > 0 ? segments[segments.length - 1] : uri;

				return `[@${name}](${uri})`;
			}

			// For other protocols, return as-is
			return uri;
		} catch {
			// If not a valid URL, return as-is
			return uri;
		}
	}
}
