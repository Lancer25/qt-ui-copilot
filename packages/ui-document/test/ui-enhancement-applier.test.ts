import { describe, expect, it } from 'vitest';
import { applyEnhancement } from '../src/ui-enhancement-applier';

const source = `<?xml version="1.0"?><ui version="4.0"><class>Form</class><widget class="QWidget" name="Form"><layout class="QVBoxLayout" name="layout"><item><widget class="QLabel" name="title"><property name="text"><string>Title</string></property></widget></item></layout></widget></ui>`;

describe('ui enhancement applier', () => {
  it('applies a font operation through the existing safe XML patcher', () => {
    const result = applyEnhancement(source, { op: 'setFont', target: 'title', value: { family: 'Microsoft YaHei', pointSize: 18, bold: true } });
    expect(result.applied).toBe(true);
    expect(result.source).toContain('<font>');
  });
  it('returns a warning for unknown targets without changing source', () => {
    const result = applyEnhancement(source, { op: 'setFont', target: 'missing', value: { bold: true } });
    expect(result.applied).toBe(false);
    expect(result.warning?.code).toBe('unknown_target');
    expect(result.source).toBe(source);
  });
});
