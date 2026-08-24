import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { DesktopApi } from './lib/api';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';

declare global { interface Window { qtUiCopilot: DesktopApi; } }

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element is missing');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
