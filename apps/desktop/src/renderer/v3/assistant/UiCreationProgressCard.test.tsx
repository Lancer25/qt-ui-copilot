// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UiCreationProgressCard } from './UiCreationProgressCard';
describe('UiCreationProgressCard', () => { it('shows current and completed stages', () => { render(<UiCreationProgressCard stage="building_base_ui" completed={['preparing_context', 'generating_intent']} />); expect(screen.getAllByText('生成基础 .ui').length).toBe(2); expect(screen.getByText(/✓ 准备项目上下文/)).toBeTruthy(); }); });
