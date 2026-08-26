import { describe, expect, it } from 'vitest';
import { AiAttachmentSchema, UiCreationBlueprintSchema, UiCreationRequestSchema } from '../src/index.js';

const validBlueprint = {
  fileName: 'LoginDialog.ui', rootType: 'QDialog', rootObjectName: 'loginDialog', windowTitle: 'Sign in',
  size: { width: 520, height: 360 },
  layoutTree: { kind: 'layout', className: 'QVBoxLayout', objectName: 'mainLayout', properties: {}, children: [
    { kind: 'widget', className: 'QLineEdit', objectName: 'userEdit', properties: { placeholderText: 'User' }, children: [] },
  ] },
  tabOrder: ['userEdit'], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['A usable login dialog'],
} as const;

describe('V3 UI creation contracts', () => {
  it('rejects unsafe attachments and unsupported roots', () => {
    expect(() => AiAttachmentSchema.parse({ id: 'a', name: 'x.exe', kind: 'image', mimeType: 'application/x-msdownload', size: 12, contentHash: 'a'.repeat(64), dataUrl: 'data:application/x-msdownload;base64,AA==' })).toThrow();
    expect(() => UiCreationBlueprintSchema.parse({ ...validBlueprint, rootType: 'QQuickView' })).toThrow();
  });

  it('accepts a Qt 5-compatible dialog blueprint', () => {
    expect(UiCreationBlueprintSchema.parse(validBlueprint).rootType).toBe('QDialog');
  });

  it('enforces the image and total attachment limits', () => {
    const image = (id: string) => ({ id, name: `${id}.png`, kind: 'image' as const, mimeType: 'image/png', size: 1, contentHash: 'a'.repeat(64), dataUrl: 'data:image/png;base64,AA==' });
    expect(() => UiCreationRequestSchema.parse({ workspaceId: 'w', requirement: '', attachments: [image('a'), image('b'), image('c'), image('d'), image('e')], fileName: 'x.ui', rootType: 'QWidget', directory: 'ui', qtKitId: 'qt', useProjectResources: true, useComponentLibrary: true })).toThrow(/four/);
  });
});
