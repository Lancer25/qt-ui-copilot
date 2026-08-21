import { describe, expect, it } from 'vitest';
import { ProjectProfileSchema, UiOperationSchema } from '../src/index.js';

describe('shared contracts', () => {
  it('rejects shell-string build commands and accepts argv arrays', () => {
    expect(() => ProjectProfileSchema.parse({
      id: 'demo', rootDir: 'D:/demo',
      qt: { version: '5.9.6', uic: 'D:/Qt/bin/uic.exe', rcc: 'D:/Qt/bin/rcc.exe' },
      build: { command: 'cmake --build build' }, run: { executable: 'D:/demo/build/demo.exe' }
    })).toThrow();
  });

  it('accepts a constrained property operation', () => {
    expect(UiOperationSchema.parse({ op: 'setProperty', target: 'saveButton', name: 'text', value: '保存' }).op)
      .toBe('setProperty');
  });
});
