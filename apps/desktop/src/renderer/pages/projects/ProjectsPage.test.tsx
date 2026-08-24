// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectsPage } from './ProjectsPage';
import { FakeDesktopApi } from '../../test/FakeDesktopApi';

describe('ProjectsPage', () => {
  afterEach(cleanup);
  it('loads persisted projects and opens a UI tab for a resource', async () => {
    const opened: unknown[] = [];
    render(<ProjectsPage api={new FakeDesktopApi()} onOpenTab={(tab) => opened.push(tab)} />);
    await waitFor(() => expect(screen.getByText('src/Settings.ui')).toBeTruthy());
    expect(screen.getByText('环境就绪')).toBeTruthy();
    screen.getByRole('button', { name: 'src/Settings.ui' }).click();
    expect(opened[0]).toMatchObject({ kind: 'ui', uiFile: 'src/Settings.ui', projectId: 'demo' });
  });
});
