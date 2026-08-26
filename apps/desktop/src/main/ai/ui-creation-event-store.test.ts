import { describe, expect, it } from 'vitest';
import { UiCreationEventStore } from './ui-creation-event-store';
describe('UiCreationEventStore', () => { it('assigns ordered sequences and retains bounded history', () => { const store = new UiCreationEventStore(); for (let i = 0; i < 205; i += 1) store.append('t', { lane: 'generation', type: 'progress', stage: `s${i}`, title: `step ${i}` }); const snapshot = store.snapshot('t')!; expect(snapshot.events).toHaveLength(200); expect(snapshot.events[0].sequence).toBe(6); expect(snapshot.events.at(-1)?.sequence).toBe(205); }); });
