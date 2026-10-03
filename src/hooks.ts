import { useEffect, useState } from 'react';
import { renderSticker } from './lib/render';
import type { Assets, Sticker } from './lib/types';

/** スタンプを非同期に描画した結果（canvas）を返す。入力が変わると描き直す */
export function useRenderedSticker(sticker: Sticker | undefined, assets: Assets, scale: number) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const image = sticker?.image ? assets[sticker.image.assetId] : undefined;
  useEffect(() => {
    if (!sticker) return;
    let cancelled = false;
    // 連続入力中に描画が詰まらないよう、少しだけ待ってから描く
    const timer = setTimeout(() => {
      renderSticker(sticker, assets, scale)
        .then((c) => !cancelled && setCanvas(c))
        .catch(() => {});
    }, 16);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // assets 全体ではなく、このスタンプが使う画像が変わったときだけ描き直す
  }, [sticker, image, scale]);
  return canvas;
}

export function useDataUrl(canvas: HTMLCanvasElement | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(canvas ? canvas.toDataURL('image/png') : null);
  }, [canvas]);
  return url;
}
