import { describe, expect, it } from 'vitest';
import { UiCapabilitySchema, UiCapabilityCandidateSchema } from '../src/ui-capability.js';

const capabilityInput = {
  id: 'qt.widgets.QPushButton',
  kind: 'qt_widget' as const,
  displayName: 'Push Button',
  description: 'Command button',
  tags: ['button'],
  qt: { minVersion: '5.9.6', modules: ['Widgets'], verifiedKitIds: [] },
  designer: { className: 'QPushButton', container: false },
  dependencies: { qss: [], qrc: [], fonts: [], promotedWidgets: [] },
  source: { type: 'builtin' as const },
};

describe('UI capability contracts', () => {
  it('parses a built-in Qt widget capability', () => {
    const capability = UiCapabilitySchema.parse(capabilityInput);
    expect(capability.id).toBe('qt.widgets.QPushButton');
  });

  it('rejects unsafe class names and paths', () => {
    expect(() => UiCapabilitySchema.parse({
      ...capabilityInput,
      designer: { className: '../bad', container: false },
    })).toThrow();
    expect(() => UiCapabilitySchema.parse({
      ...capabilityInput,
      source: { type: 'project', path: '../project.ui' },
    })).toThrow();
  });

  it('parses bounded candidate metadata', () => {
    const candidate = UiCapabilityCandidateSchema.parse({
      capabilityId: capabilityInput.id,
      displayName: capabilityInput.displayName,
      kind: capabilityInput.kind,
      description: capabilityInput.description,
      tags: capabilityInput.tags,
      dependencyStatus: 'ready',
      reasons: ['Qt Widgets is available'],
    });
    expect(candidate.dependencyStatus).toBe('ready');
  });

  it('rejects invalid versions and unknown fields', () => {
    expect(() => UiCapabilitySchema.parse({
      ...capabilityInput,
      qt: { ...capabilityInput.qt, minVersion: '5' },
    })).toThrow();
    expect(() => UiCapabilitySchema.parse({ ...capabilityInput, unexpected: true })).toThrow();
  });
});
