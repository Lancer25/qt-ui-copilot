import { describe, expect, it, vi } from 'vitest';
import { UiAdjustmentError, UiAdjustmentService } from './ui-adjustment-service.js';

const ui = `<ui version="4.0"><class>Form</class><widget class="QWidget" name="Form"><widget class="QLabel" name="title"><property name="text"><string>Hello</string></property></widget></widget><resources/><connections/></ui>`;
const planner = (operations: unknown[]) => ({ plan: vi.fn().mockResolvedValue({ operations }) });

describe('UiAdjustmentService', () => {
  it('applies a structured plan and returns hashes and summary without writing', async () => {
    const p = planner([{ op: 'setFont', target: 'title', value: { bold: true } }]);
    const result = await new UiAdjustmentService(p).adjust({ uiFile: 'Form.ui', uiContent: ui, requirement: 'make title bold', contextMode: 'focused_ui' });
    expect(result.source).not.toBe(ui);
    expect(result.source).toContain('<bold>true</bold>');
    expect(result.beforeHash).not.toBe(result.afterHash);
    expect(result.summary).toContain('1');
    expect(p.plan).toHaveBeenCalledWith(expect.objectContaining({ objectNames: expect.arrayContaining(['Form', 'title']) }));
  });

  it('applies multiple operations in order', async () => {
    const result = await new UiAdjustmentService(planner([
      { op: 'setFont', target: 'title', value: { bold: true } },
      { op: 'setAlignment', target: 'title', value: 'AlignCenter' },
    ])).adjust({ uiFile: 'Form.ui', uiContent: ui, requirement: 'bold and center', contextMode: 'whole_project' });
    expect(result.operations).toHaveLength(2);
    expect(result.source).toContain('AlignCenter');
  });

  it('rolls back on an invalid target and exposes the original source', async () => {
    const promise = new UiAdjustmentService(planner([{ op: 'setFont', target: 'missing', value: { bold: true } }])).adjust({ uiFile: 'Form.ui', uiContent: ui, requirement: 'change missing', contextMode: 'focused_ui' });
    await expect(promise).rejects.toMatchObject({ name: 'UiAdjustmentError', source: ui });
  });

  it('rejects uic failures without changing the source', async () => {
    const service = new UiAdjustmentService({ planner: planner([{ op: 'setFont', target: 'title', value: { bold: true } }]), validateUic: async () => false });
    await expect(service.adjust({ uiFile: 'Form.ui', uiContent: ui, requirement: 'bold', contextMode: 'focused_ui' })).rejects.toThrow('uic 校验失败');
  });

  it('honours cancellation before and during planning', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(new UiAdjustmentService(planner([])).adjust({ uiFile: 'Form.ui', uiContent: ui, requirement: 'anything', contextMode: 'focused_ui', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const deferred = new Promise<never>(() => undefined);
    const p = { plan: vi.fn().mockReturnValue(deferred) };
    const running = new UiAdjustmentService(p).adjust({ uiFile: 'Form.ui', uiContent: ui, requirement: 'anything', contextMode: 'focused_ui', signal: controller.signal });
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('wraps planner format errors as adjustment errors', async () => {
    const p = { plan: vi.fn().mockRejectedValue(new Error('invalid plan')) };
    await expect(new UiAdjustmentService(p).adjust({ uiFile: 'Form.ui', uiContent: ui, requirement: 'anything', contextMode: 'focused_ui' })).rejects.toMatchObject({ name: 'UiAdjustmentError', source: ui });
    expect(new UiAdjustmentError('x', ui).beforeHash).toHaveLength(64);
  });
});
