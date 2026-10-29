import { describe, expect, it } from 'vitest';
import { UiEnhancementPlanner } from './ui-enhancement-planner';
describe('UiEnhancementPlanner', () => {
  it('returns an allow-listed enhancement plan', async () => { const planner = new UiEnhancementPlanner({ generate: async () => ({ operations: [{ op: 'setFont', target: 'title', value: { bold: true } }] }) }); await expect(planner.plan({ requirement: 'make title bold', baseUi: '<ui/>', objectNames: ['title'] })).resolves.toMatchObject({ operations: [{ op: 'setFont' }] }); });
  it('repairs common model aliases and missing op discriminators locally', async () => {
    const planner = new UiEnhancementPlanner({ generate: async () => ({ operations: [{ type: 'set_style_token', target: 'loginButton', value: '#1677ff' }, { target: 'panel', property: 'backgroundColor', value: 'blue' }] }) });
    await expect(planner.plan({ requirement: '登录页使用蓝色主题', baseUi: '<ui/>', objectNames: ['loginButton', 'panel'] })).resolves.toEqual({ operations: [{ op: 'setStyleToken', target: 'loginButton', token: 'primary' }, { op: 'setStyleToken', target: 'panel', token: 'primary' }] });
  });
});
