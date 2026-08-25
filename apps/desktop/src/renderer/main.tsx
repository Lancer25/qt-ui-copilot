import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { V3App } from './v3/V3App';
import type { DesktopApi } from './lib/api';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';

declare global { interface Window { qtUiCopilot: DesktopApi; } }

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element is missing');
}

const enableV3 = import.meta.env.VITE_QT_UI_COPILOT_V3 === '1';
createRoot(root).render(<StrictMode>{enableV3 ? <V3App api={window.qtUiCopilot} /> : <App />}</StrictMode>);
