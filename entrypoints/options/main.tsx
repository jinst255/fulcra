import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/src/ui/theme.css';
import '@/src/ui/app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
