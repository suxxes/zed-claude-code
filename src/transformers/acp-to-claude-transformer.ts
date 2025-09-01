import type { SDKUserMessage } from '@anthropic-ai/claude-code';
import type { PromptRequest } from '@zed-industries/agent-client-protocol';
import formatUriAsLink from '../utils/string';
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
					const formattedUri = formatUriAsLink(chunk.uri);
					content.push({
						type: 'text',
						text: formattedUri,
					});
					break;
				}

				case 'resource': {
					if ('text' in chunk.resource) {
						const formattedUri = formatUriAsLink(chunk.resource.uri);
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
}
