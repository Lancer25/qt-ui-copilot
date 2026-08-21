import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sandboxed preload boundary', () => {
  it('exposes only the fixed task API and no generic IPC or filesystem bridge', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8');
    expect(source).toContain("'projects:import'");
    expect(source).toContain("'tasks:start'");
    expect(source).toContain("'workflow:event'");
    expect(source).not.toMatch(/invoke\s*\(\s*(?:channel|name|method)/);
    expect(source).not.toMatch(/require\s*\(|node:fs|child_process|shell\.open/);
  });
});
