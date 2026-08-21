import { describe, expect, it } from 'vitest';
import { UiPlanner, VisualCritic } from '../src/index.js';
import { FakeModel } from './FakeModel.js';

const context = {
  requirement: '在保存按钮左侧增加测试连接按钮',
  targetSemanticTree: { root: 'networkSettings', widgets: ['saveButton'] },
  runtimeFacts: { qtVersion: '5.9.6' },
  componentCandidates: [{ id: 'connection-panel' }, { id: 'other' }, { id: 'third' }, { id: 'ignored' }],
  previousFindings: [{ code: 'text_clipped' }],
};

const validPlan = {
  summary: '添加测试连接按钮', riskLevel: 'medium', expectedResults: ['按钮可见'], componentIds: [],
  operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testConnectionButton', before: 'saveButton', properties: { text: '测试连接' } }],
};

describe('UiPlanner', () => {
  it('sends bounded safe context and validates a structured plan', async () => {
    const model = new FakeModel().replyWith(validPlan);
    const plan = await new UiPlanner(model).plan(context);
    expect(plan.operations).toHaveLength(1);
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0].input).toMatchObject({ requirement: context.requirement });
    expect((model.requests[0].input.componentCandidates as unknown[])).toHaveLength(3);
    expect(JSON.stringify(model.requests[0].input)).not.toContain('xml');
  });

  it('uses exactly one format repair before reporting invalid output', async () => {
    const model = new FakeModel().replyWith({ nope: true }).replyWith(validPlan);
    await expect(new UiPlanner(model).plan(context)).resolves.toEqual(expect.objectContaining({ summary: validPlan.summary }));
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1].kind).toBe('format_repair');
  });

  it('rejects raw xml from the planner', async () => {
    const model = new FakeModel().replyWith({ xml: '<ui version="4.0"><class>Injected</class></ui>' }).replyWith({ xml: '<ui/>' });
    await expect(new UiPlanner(model).plan(context)).rejects.toThrow('UiPlan schema');
  });
});

describe('VisualCritic', () => {
  it('makes deterministic failures override a positive visual answer', async () => {
    const model = new FakeModel().replyWith({ requirementSatisfied: true, score: 95, blockingIssues: [], suggestions: [] });
    const review = await new VisualCritic(model).review({
      beforeImage: 'before.png', afterImage: 'after.png', expectedResults: ['按钮可见'],
      deterministicFindings: [{ severity: 'error', code: 'text_clipped', message: '按钮文本被裁剪', target: 'testConnectionButton' }],
    });
    expect(review.requirementSatisfied).toBe(false);
    expect(review.blockingIssues[0].type).toBe('deterministic_failure');
    expect(JSON.stringify(model.requests[0].input)).not.toContain('hidden rationale');
  });
});
