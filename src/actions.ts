import { initialImageLayer } from './lib/fit';
import { dataUrlToPixels, importImageFile, isImageFile, pixelsToDataUrl } from './lib/imageio';
import { removeBackgroundAuto } from './lib/pixels';
import { PHRASES, createSticker, createText } from './lib/project';
import { fitFontSize, loadImage } from './lib/render';
import { ALLOWED_COUNTS, SAFE_MARGIN, STICKER_W } from './lib/spec';
import type { ImageLayer, Sticker } from './lib/types';
import type { Store } from './store';

export const AUTO_BG_TOLERANCE = 40;
const MAX_STICKERS = ALLOWED_COUNTS[ALLOWED_COUNTS.length - 1];

async function fileToLayer(store: Store, file: File, removeBg: boolean, outlineWidth: number): Promise<ImageLayer> {
  const original = await importImageFile(file);
  const originalId = store.addAsset(original);
  let pixels = await dataUrlToPixels(original);
  let url = original;
  if (removeBg) {
    pixels = removeBackgroundAuto(pixels, AUTO_BG_TOLERANCE);
    url = pixelsToDataUrl(pixels);
  }
  const assetId = store.addAsset(url);
  const img = await loadImage(url);
  return initialImageLayer(assetId, originalId, img, pixels, outlineWidth);
}

/** 現在のスタンプの画像を差し替える（なければ追加） */
export async function setImageForCurrent(store: Store, file: File, removeBg: boolean): Promise<void> {
  const target = store.current;
  if (!target) return;
  const layer = await fileToLayer(store, file, removeBg, target.outline.enabled ? target.outline.width : 0);
  store.updateSticker(target.id, (s) => ({ ...s, image: layer }));
  store.setSelection({ kind: 'image' });
}

/**
 * 複数の画像をまとめて取り込む。現在のスタンプ以降の「画像が空のスタンプ」に順に入れ、
 * 足りなければ新しいスタンプを追加する（最大 40 個）。
 */
export async function importImages(
  store: Store,
  files: File[],
  removeBg: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<{ added: number; skipped: number }> {
  const images = files.filter(isImageFile);
  const layers: ImageLayer[] = [];
  for (let i = 0; i < images.length; i++) {
    layers.push(await fileToLayer(store, images[i], removeBg, 6));
    onProgress?.(i + 1, images.length);
  }
  let added = 0;
  const start = store.currentIndex;
  store.update((p) => {
    const stickers = p.stickers.slice();
    let queue = layers.slice();
    for (let i = start; i < stickers.length && queue.length; i++) {
      if (!stickers[i].image) {
        stickers[i] = { ...stickers[i], image: queue[0] };
        queue = queue.slice(1);
        added++;
      }
    }
    while (queue.length && stickers.length < MAX_STICKERS) {
      stickers.push(createSticker({ image: queue[0] }));
      queue = queue.slice(1);
      added++;
    }
    return { ...p, stickers };
  });
  return { added, skipped: images.length - added };
}

/** 文字が入っていないスタンプに、よく使うセリフを順番に入れる */
export function fillPhrases(store: Store): number {
  let count = 0;
  store.update((p) => {
    const used = new Set(p.stickers.flatMap((s) => s.texts.map((t) => t.text)));
    const pool = PHRASES.filter((ph) => !used.has(ph));
    const stickers = p.stickers.map((s): Sticker => {
      if (s.texts.some((t) => t.text.trim()) || !pool.length) return s;
      count++;
      return { ...s, texts: [defaultTextFor(s, pool.shift()!)] };
    });
    return count ? { ...p, stickers } : p;
  });
  return count;
}

/** 画像の有無に応じて置き場所を変え、文字数に合わせて大きさを決めた文字 */
export function defaultTextFor(s: Sticker, text = 'テキスト') {
  const outline = s.outline.enabled ? s.outline.width : 0;
  const t = createText({ text, y: s.image ? 110 : 0 });
  const maxW = STICKER_W - (SAFE_MARGIN + outline + 4) * 2;
  const fontSize = s.image ? fitFontSize(t, maxW, 80, 60) : fitFontSize(t, maxW, 220, 130);
  return { ...t, fontSize };
}
