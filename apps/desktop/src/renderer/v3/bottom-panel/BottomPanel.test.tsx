// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BottomPanel } from './BottomPanel';
describe('V3 BottomPanel', () => { it('switches between problems, resources, and output', async () => { const user = userEvent.setup(); render(<BottomPanel findings={['uic failed']} />); expect(screen.getByText('uic failed')).toBeTruthy(); await user.click(screen.getByRole('button', { name: 'Resources' })); expect(screen.getByText(/QSS、QRC/)).toBeTruthy(); }); });
