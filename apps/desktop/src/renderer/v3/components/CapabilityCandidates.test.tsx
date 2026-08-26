// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CapabilityCandidates } from './CapabilityCandidates';
describe('CapabilityCandidates', () => { it('shows capability source and dependency state', () => { render(<CapabilityCandidates candidates={[{ capabilityId: 'qt.widgets.QStatusBar', displayName: 'QStatusBar', kind: 'qt_widget', description: 'status', tags: ['qt'], dependencyStatus: 'ready', reasons: ['Qt Widgets 内置能力'] }]} />); expect(screen.getByText('QStatusBar')).toBeTruthy(); expect(screen.getByText(/依赖就绪/)).toBeTruthy(); }); });
