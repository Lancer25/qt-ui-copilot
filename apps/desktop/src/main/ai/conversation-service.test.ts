import { describe, expect, it } from 'vitest';
import { ConversationService } from './conversation-service';

describe('ConversationService', () => {
  it('emits bounded started, plan, and done events', async () => {
    const provider = { generate: async () => ({ summary: 'add button', riskLevel: 'low', operations: [{ op: 'addWidget', parentLayout: 'layout', widgetClass: 'QPushButton', objectName: 'testButton' }], expectedResults: [], componentIds: [] }) };
    const events = []; for await (const event of new ConversationService(provider).plan('c1', { requirement: 'add', targetSemanticTree: {}, runtimeFacts: {} })) events.push(event);
    expect(events.map((event) => event.type)).toEqual(['started', 'plan', 'done']);
  });
});
