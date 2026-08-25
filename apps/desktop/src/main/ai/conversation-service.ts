import { UiPlanner, type ModelProvider, type UiPlannerContext } from '@qt-ui-copilot/agent-workflow';
import type { UiPlan } from '@qt-ui-copilot/contracts';

export type ConversationEvent = { type: 'started'; conversationId: string } | { type: 'message_delta'; content: string } | { type: 'tool_request'; requestId: string; path: string; reason: string } | { type: 'plan'; plan: UiPlan } | { type: 'error'; message: string } | { type: 'done' };

export class ConversationService {
  constructor(private readonly provider: ModelProvider) {}
  async *plan(conversationId: string, context: UiPlannerContext): AsyncGenerator<ConversationEvent> {
    yield { type: 'started', conversationId };
    try { const plan = await new UiPlanner(this.provider).plan(context); yield { type: 'message_delta', content: plan.summary }; yield { type: 'plan', plan }; }
    catch (error) { yield { type: 'error', message: error instanceof Error ? error.message : String(error) }; }
    yield { type: 'done' };
  }
}
