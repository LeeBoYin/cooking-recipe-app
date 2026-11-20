import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { App } from './App.tsx';
import { installGlobalErrorReporting } from './data/errors.ts';
import { locale, messages } from './i18n/index.ts';
import './styles.css';

installGlobalErrorReporting();

const root = document.getElementById('root');
if (!root) throw new Error('找不到 #root');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

createRoot(root).render(
  <StrictMode>
    <IntlProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </IntlProvider>
  </StrictMode>,
);
