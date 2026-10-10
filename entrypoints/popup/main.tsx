import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyCachedTheme } from '@/src/ui/themeMode';
import '@/src/ui/theme.css';
import './popup.css';
import { Popup } from './Popup';

applyCachedTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
