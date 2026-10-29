const paths = {
  explorer: 'M3 10 12 3l9 7v10H3zM9 20v-7h6v7',
  tasks: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  components: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  'new-file': 'M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10L13 3Zm0 0v7h7M8 15h8m-4-4v8',
  'new-folder': 'M3 7V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm9 4v6m-3-3h6',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9',
  collapse: 'M8 3h11a2 2 0 0 1 2 2v11M5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm2 7h6',
  close: 'M8 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3m8-12 4 4-4 4m-6-4h10',
  minimize: 'M5 12h14',
  maximize: 'M5 5h14v14H5z',
  'window-close': 'm6 6 12 12M18 6 6 18',
};

export function WorkspaceIcon({ name }: { name: keyof typeof paths }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
