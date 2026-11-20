import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 有新版時由使用者決定何時重新整理，避免煮到一半畫面重載（04 ADR-09）
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: '今仔日煮啥',
        short_name: '煮啥',
        lang: 'zh-Hant-TW',
        start_url: '/',
        display: 'standalone',
        background_color: '#F4EDE2',
        theme_color: '#F4EDE2',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // 只預先快取 App 本身；資料一律即時向雲端讀取，不做離線（04 ADR-02）
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
});
