import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages（/stamp_generater/）でも動くよう相対パスで出力する
export default defineConfig({
  base: './',
  plugins: [react()],
});
