import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GOOGLE_FONTS_URL } from './lib/fonts';
import './styles.css';

// フォント一覧は fonts.ts で一元管理する
document.getElementById('google-fonts')?.setAttribute('href', GOOGLE_FONTS_URL);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
