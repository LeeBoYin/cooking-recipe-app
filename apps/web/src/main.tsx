import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { App } from './App.tsx';
import { installGlobalErrorReporting } from './data/errors.ts';
import { ToastProvider } from './features/shell/Toast.tsx';
import { locale, messages } from './i18n/index.ts';
import { captureInstallPrompt } from './pwa/install.ts';
import './styles.css';

installGlobalErrorReporting();
captureInstallPrompt();

const root = document.getElementById('root');
if (!root) throw new Error('找不到 #root');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

createRoot(root).render(
  <StrictMode>
    <IntlProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </QueryClientProvider>
    </IntlProvider>
  </StrictMode>,
);

// 啟動畫面（index.html 內嵌）：#root 有內容、第一個畫面可以顯示時淡出移除。
const splash = document.getElementById('splash');
if (splash) {
  const removeSplash = () => {
    observer.disconnect();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      splash.remove();
      return;
    }
    splash.classList.add('splash-out');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    window.setTimeout(() => splash.remove(), 600);
  };
  const observer = new MutationObserver(() => {
    if (root.childElementCount > 0) removeSplash();
  });
  observer.observe(root, { childList: true });
}
