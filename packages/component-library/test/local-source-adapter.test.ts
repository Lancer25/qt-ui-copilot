import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalComponentSourceAdapter } from '../src/local-source-adapter.js';

const ui = (name: string) => `<?xml version="1.0"?><ui version="4.0"><class>${name}</class><widget class="QWidget" name="${name}"><layout class="QVBoxLayout" name="layout"><item><widget class="QPushButton" name="button"/></item></layout></widget></ui>`;

describe('LocalComponentSourceAdapter', () => {
  it('prefers manifests and infers remaining UI files without writing the source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'component-source-'));
    await mkdir(path.join(root, 'declared')); await mkdir(path.join(root, 'loose')); await mkdir(path.join(root, 'styles'));
    await writeFile(path.join(root, 'LICENSE'), 'MIT License');
    await writeFile(path.join(root, 'declared', 'card.ui'), ui('card'));
    await writeFile(path.join(root, 'declared', 'component.json'), JSON.stringify({ id: 'card', name: 'Card', description: 'A card', sourceUiFile: 'card.ui', tags: ['card'], qssDependencies: ['../styles/theme.qss'], qtVersionRange: '>=5.9.6 <7.0.0' }));
    await writeFile(path.join(root, 'loose', 'form.ui'), ui('form'));
    await writeFile(path.join(root, 'styles', 'theme.qss'), 'QWidget { color: black; }');

    const items = await new LocalComponentSourceAdapter().discover({ sourceId: 'local', rootDir: root, discovery: 'hybrid' });
    expect(items).toHaveLength(3);
    expect(items.find((item) => item.componentId === 'card')).toMatchObject({ inferred: false, license: { spdx: 'MIT' }, assets: [expect.objectContaining({ path: 'styles/theme.qss', kind: 'qss' })] });
    expect(items.find((item) => item.inferred)?.name).toBe('form');
    expect(items.find((item) => item.componentId === 'atomic-qpushbutton')).toMatchObject({ name: '按钮', inferred: true, tags: expect.arrayContaining(['原子控件', 'QPushButton']) });
  });

  it('skips symlinked trees and rejects manifest traversal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'component-source-safe-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'component-outside-'));
    await writeFile(path.join(outside, 'hidden.ui'), ui('hidden'));
    await symlink(outside, path.join(root, 'linked'), 'junction');
    await mkdir(path.join(root, 'bad')); await writeFile(path.join(root, 'bad', 'component.json'), JSON.stringify({ id: 'bad', name: 'Bad', sourceUiFile: '../../hidden.ui' }));
    await expect(new LocalComponentSourceAdapter().discover({ sourceId: 'local', rootDir: root, discovery: 'hybrid' })).rejects.toThrow(/escapes source root/);
  });
});
