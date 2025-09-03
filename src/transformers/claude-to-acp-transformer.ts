import type { SDKAssistantMessage, SDKUserMessage } from '@anthropic-ai/claude-code';
import type { SessionNotification } from '@zed-industries/agent-client-protocol';
import type { ClaudePlanEntry, ToolsManager } from '../managers/tools-manager';
import { Logger } from '../utils/logger';
import type { MessageTransformer } from './message-transformer';

/**
 * Transforms Claude SDK messages to ACP SessionNotification format
 */
export class ClaudeToAcpTransformer
	implements
		MessageTransformer<
			{
				message: SDKAssistantMessage | SDKUserMessage;
				sessionId: string;
				toolsManager: ToolsManager;
			},
			SessionNotification[]
		>
{
	protected logger: Logger;

	constructor() {
		this.logger = new Logger({ component: 'Claude-to-ACP Transformer' });
	}

	transform({
		message,
		sessionId,
		toolsManager,
	}: {
		message: SDKAssistantMessage | SDKUserMessage;
		sessionId: string;
		toolsManager: ToolsManager;
	}): SessionNotification[] {
		const chunks = message.message.content as ContentChunk[];
		const output = [];

		this.logger.debug(`Transforming ${chunks.length} chunks for session ${sessionId}`);

		for (const chunk of chunks) {
			this.logger.debug(`Processing chunk type: ${chunk.type}`);

			let update: SessionNotification['update'];

			switch (chunk.type) {
				case 'text':
					update = {
						sessionUpdate: 'agent_message_chunk',
						content: {
							type: 'text',
							text: chunk.text,
						},
					};
					break;

				case 'image':
					update = {
						sessionUpdate: 'agent_message_chunk',
						content: {
							type: 'image',
							data: chunk.source.type === 'base64' ? chunk.source.data : '',
							mimeType: chunk.source.type === 'base64' ? chunk.source.media_type : '',
							uri: chunk.source.type === 'url' ? chunk.source.url : undefined,
						},
					};
					break;

				case 'thinking':
					update = {
						sessionUpdate: 'agent_thought_chunk',
						content: {
							type: 'text',
							text: chunk.thinking,
						},
					};
					break;

				case 'tool_use':
					this.logger.info(`Tool use detected: ${chunk.name} (${chunk.id})`);
					this.logger.info(`Tool input: ${JSON.stringify(chunk.input)}`);

					// Cache tool use for later reference in tool_result handling
					this.logger.info(`Caching tool use: ${chunk.name} (${chunk.id})`);
					toolsManager.setToolUse(chunk.id, chunk);

					if (chunk.name === 'TodoWrite') {
						this.logger.info(`Processing TodoWrite tool use`);

						update = {
							sessionUpdate: 'plan',
							entries: toolsManager.convertPlanEntries(chunk.input as { todos: ClaudePlanEntry[] }),
						};
					} else {
						this.logger.info(`Getting tool info for: ${chunk.name} (${chunk.id})`);

						const toolInfo = toolsManager.getToolInfoFromToolUse(chunk);

						this.logger.info(`Tool info result: ${JSON.stringify(toolInfo)}`);

						update = {
							toolCallId: chunk.id,
							sessionUpdate: 'tool_call',
							rawInput: chunk.input as Record<string, unknown>,
							status: 'pending',
							...toolInfo,
						};
					}
					break;

				case 'tool_result': {
					this.logger.info(`Tool result received: ${chunk.tool_use_id}`);

					if (chunk.is_error) {
						this.logger.error(`Tool result ERROR for ${chunk.tool_use_id}: ${chunk.content}`);
					}

					this.logger.info(`Processing tool result for: ${chunk.tool_use_id}`);

					const cachedToolUse = toolsManager.getToolUse(chunk.tool_use_id);

					this.logger.info(`Cached tool use: ${cachedToolUse ? cachedToolUse.name : 'not found'}`);

					// Skip TodoWrite tool results - they don't generate updates
					if (cachedToolUse?.name === 'TodoWrite') {
						continue;
					}

					const toolUpdate = toolsManager.getToolUpdateFromResult(chunk, cachedToolUse);

					this.logger.info(`Tool update result: ${JSON.stringify(toolUpdate)}`);

					update = {
						toolCallId: chunk.tool_use_id,
						sessionUpdate: 'tool_call_update',
						status: chunk.is_error ? 'failed' : 'completed',
						...toolUpdate,
					};
					break;
				}

				default:
					throw new Error(`unhandled chunk type: ${(chunk as { type: string }).type}`);
			}

			this.logger.info(`Generated update: ${JSON.stringify({ sessionId, update })}`);

			output.push({ sessionId, update });
		}

		this.logger.info(`Returning ${output.length} session notifications`);

		return output;
	}
}

type ContentChunk =
	| { type: 'text'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: unknown }
	| {
			type: 'tool_result';
			content: string;
			tool_use_id: string;
			is_error: boolean;
	  }
	| { type: 'thinking'; thinking: string }
	| { type: 'redacted_thinking' }
	| { type: 'image'; source: ImageSource }
	| { type: 'document' }
	| { type: 'web_search_tool_result' }
	| { type: 'untagged_text'; text: string };

type ImageSource = { type: 'base64'; data: string; media_type: string } | { type: 'url'; url: string };
