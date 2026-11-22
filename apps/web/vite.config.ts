import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // 錯誤紀錄用：回報時附上 App 版本
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
        // 直向：Android 安裝後會鎖住；iOS 不支援，不另外處理
        orientation: 'portrait',
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
        // 管理後台的程式碼（02 L、04 ADR-15）只有管理員進 /admin 才下載，不放進預先快取
        globIgnores: ['**/admin-*.js'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // 後台自己的程式與只有它用的套件放進同一個 admin-*.js
        manualChunks(id) {
          if (id.includes('/src/features/admin/') || id.includes('/src/data/admin.ts')) return 'admin';
          if (/node_modules\/(qrcode|dijkstrajs|pngjs)\//.test(id)) return 'admin';
          return undefined;
        },
      },
    },
  },
});
