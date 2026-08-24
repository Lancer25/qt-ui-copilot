// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkbenchPage } from './WorkbenchPage';
import { FakeDesktopApi } from '../../test/FakeDesktopApi';

afterEach(cleanup);

describe('WorkbenchPage', () => {
  it('exposes the existing workflow controls through the V2 page boundary', () => {
    render(<WorkbenchPage api={new FakeDesktopApi()} />);
    expect(screen.getByLabelText('界面需求')).toBeTruthy();
    expect(screen.getByRole('button', { name: '生成修改计划' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '批准并应用候选修改' })).toBeTruthy();
  });
});
