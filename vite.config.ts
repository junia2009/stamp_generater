import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const GOOGLE_FONTS_MAX_AGE = 60 * 60 * 24 * 365;

// GitHub Pages（/stamp_generater/）でも動くよう相対パスで出力する
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 編集中に勝手に再読み込みしないよう、更新はユーザーの操作で適用する
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'favicon-32.png'],
      manifest: {
        name: 'LINE スタンプメーカー',
        short_name: 'スタンプメーカー',
        description: 'ブラウザだけで LINE スタンプを作成。背景透過・白フチ・文字入れ・規格チェック・申請用 ZIP 書き出しまで。',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#06c755',
        background_color: '#f3f5f7',
        categories: ['graphics', 'design', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // フォントの CSS は更新されうるので、キャッシュを返しつつ裏で更新する
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            // フォント本体（日本語は文字範囲ごとに分割配信される）は一度取得したら使い回す
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 1500, maxAgeSeconds: GOOGLE_FONTS_MAX_AGE },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
