import type { Pixels } from './pixels';
import { createCanvas, ctx2d, loadImage } from './render';

/** 取り込む画像の最大辺。スタンプは 370px なので、拡大余地を残しつつメモリを節約する */
const MAX_IMPORT_SIDE = 1200;

export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** 画像ファイルを読み込み、必要なら縮小して PNG の dataURL にする */
export async function importImageFile(file: File): Promise<string> {
  const src = await readFileAsDataURL(file);
  const img = await loadImage(src);
  const s = Math.min(1, MAX_IMPORT_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = createCanvas(Math.max(1, Math.round(img.naturalWidth * s)), Math.max(1, Math.round(img.naturalHeight * s)));
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export async function dataUrlToPixels(src: string): Promise<Pixels> {
  const img = await loadImage(src);
  const c = createCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = ctx2d(c);
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height };
}

export function pixelsToDataUrl(p: Pixels): string {
  const c = createCanvas(p.width, p.height);
  ctx2d(c).putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return c.toDataURL('image/png');
}

export function isImageFile(f: File): boolean {
  return /^image\/(png|jpe?g|gif|webp|bmp)$/.test(f.type);
}
