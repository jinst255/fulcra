import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/src/ui/theme.css';
import { t } from '@/src/i18n/t';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p>{t('appName')}</p>
  </StrictMode>,
);
