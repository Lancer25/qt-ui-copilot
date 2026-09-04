import { describe, expect, it } from 'vitest';
import { V3TaskStreamAdjustRequestSchema, V3StartTaskInputSchema, VisualEnhancementOperationSchema, VisualEnhancementPlanSchema } from '../src/index.js';

describe('visual enhancement contract', () => {
  it('accepts the allow-listed operations', () => {
    const operation = VisualEnhancementOperationSchema.parse({
      op: 'setFont', target: 'titleLabel', value: { family: 'Microsoft YaHei', pointSize: 18, bold: true },
    });
    expect(operation.op).toBe('setFont');
    expect(VisualEnhancementPlanSchema.parse({ operations: [operation] }).operations).toHaveLength(1);
  });

  it('rejects raw XML and unknown operations', () => {
    expect(() => VisualEnhancementOperationSchema.parse({ op: 'setProperty', target: 'title', name: 'font' })).toThrow();
    expect(() => VisualEnhancementOperationSchema.parse({ op: 'setFont', target: 'title', value: { rawXml: '<font/>' } })).toThrow();
  });

  it('accepts a bounded preview adjustment request without allowing arbitrary operations', () => {
    const request = V3TaskStreamAdjustRequestSchema.parse({
      taskId: 'task-1', uiFile: 'ui/MainWindow.ui', uiContent: '<ui/>',
      requirement: '把主按钮改成蓝色', contextMode: 'focused_ui',
      previewDataUrl: 'data:image/png;base64,AAAA',
    });
    expect(request.taskId).toBe('task-1');
    expect(V3StartTaskInputSchema.parse({ kind: 'adjust', taskId: 'task-1', request })).toMatchObject({ kind: 'adjust' });
  });

  it('rejects absolute or oversized adjustment paths and operation payloads', () => {
    const base = { taskId: 'task-1', uiFile: 'ui/MainWindow.ui', uiContent: '<ui/>', requirement: '调整', contextMode: 'focused_ui' as const };
    expect(() => V3TaskStreamAdjustRequestSchema.parse({ ...base, uiFile: 'C:/project/ui/MainWindow.ui' })).toThrow();
    expect(() => V3TaskStreamAdjustRequestSchema.parse({ ...base, uiFile: 'ui/../secret.ui' })).toThrow();
    expect(() => V3TaskStreamAdjustRequestSchema.parse({ ...base, uiContent: 'x'.repeat(2_000_001) })).toThrow();
    expect(() => V3TaskStreamAdjustRequestSchema.parse({ ...base, operations: [] })).toThrow();
    expect(() => V3TaskStreamAdjustRequestSchema.parse({ ...base, previewDataUrl: 'x'.repeat(14_000_001) })).toThrow();
  });

  it('keeps existing create and modify task variants valid', () => {
    expect(V3StartTaskInputSchema.parse({ kind: 'modify', request: { requirement: '调整', uiFile: 'ui/Main.ui', uiContent: '<ui/>', contextMode: 'focused_ui' } }).kind).toBe('modify');
    expect(V3StartTaskInputSchema.parse({ kind: 'create', request: { workspaceId: 'w', requirement: '创建', attachments: [], fileName: 'Main.ui', rootType: 'QWidget', directory: 'ui', qtKitId: 'kit' } }).kind).toBe('create');
  });
});
