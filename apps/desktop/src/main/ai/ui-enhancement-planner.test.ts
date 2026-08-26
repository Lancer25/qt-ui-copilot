import { describe, expect, it } from 'vitest';
import { UiEnhancementPlanner } from './ui-enhancement-planner';
describe('UiEnhancementPlanner', () => { it('returns an allow-listed enhancement plan', async () => { const planner = new UiEnhancementPlanner({ generate: async () => ({ operations: [{ op: 'setFont', target: 'title', value: { bold: true } }] }) }); await expect(planner.plan({ requirement: 'make title bold', baseUi: '<ui/>', objectNames: ['title'] })).resolves.toMatchObject({ operations: [{ op: 'setFont' }] }); }); });
