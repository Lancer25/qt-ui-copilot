import { describe, expect, it } from 'vitest';
import { VisualEnhancementOperationSchema, VisualEnhancementPlanSchema } from '../src/index.js';

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
});
