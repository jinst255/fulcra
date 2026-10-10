import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyCachedTheme } from '@/src/ui/themeMode';
import '@/src/ui/theme.css';
import '@/src/ui/app.css';
import { App } from './App';

applyCachedTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
