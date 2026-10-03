import { ensureFontLoaded, fontString } from './fonts';
import { addOutline, contentBounds, type Pixels } from './pixels';
import { SAFE_MARGIN, STICKER_H, STICKER_W } from './spec';
import type { Assets, ImageLayer, Sticker, TextLayer } from './types';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: true })!;
}

// ---- テキストのレイアウト ----

/** 縦書きで 90° 回転させる文字 */
const ROTATE_IN_VERTICAL = new Set(['ー', '〜', '～', '…', '‥', '―', '-', '−', '=', '＝', '(', ')', '（', '）', '「', '」', '『', '』', '【', '】', '[', ']', '<', '>', '〈', '〉']);

let measureCtx: CanvasRenderingContext2D | null = null;
function measurer(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = ctx2d(createCanvas(1, 1));
  return measureCtx;
}

export interface TextMetricsBox {
  width: number;
  height: number;
}

export function measureText(t: TextLayer): TextMetricsBox {
  const ctx = measurer();
  ctx.font = fontString(t.fontFamily, t.fontSize, t.bold);
  const lines = t.text.split('\n');
  const step = t.fontSize * t.lineHeight;
  if (t.vertical) {
    const maxChars = Math.max(1, ...lines.map((l) => [...l].length));
    return { width: lines.length * step, height: maxChars * t.fontSize * 1.05 };
  }
  const width = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  return { width, height: lines.length * step };
}

/** 文字が maxW×maxH に収まる最大のフォントサイズ（上限 cap） */
export function fitFontSize(t: TextLayer, maxW: number, maxH: number, cap: number): number {
  const m = measureText({ ...t, fontSize: 100 });
  const pad = t.strokeWidth * 2;
  const size = Math.min(cap, ((maxW - pad) / m.width) * 100, ((maxH - pad) / m.height) * 100);
  return Math.max(12, Math.floor(size));
}

function drawTextLayer(ctx: CanvasRenderingContext2D, t: TextLayer): void {
  if (!t.text.trim()) return;
  const lines = t.text.split('\n');
  const step = t.fontSize * t.lineHeight;
  const box = measureText(t);
  ctx.save();
  ctx.translate(STICKER_W / 2 + t.x, STICKER_H / 2 + t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.font = fontString(t.fontFamily, t.fontSize, t.bold);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // 文字ごとの描画位置を先に求め、縁取り→塗りの順で 2 パス描く（行同士の縁が塗りに被らないように）
  const glyphs: { s: string; x: number; y: number; rotate: boolean }[] = [];
  if (t.vertical) {
    const charStep = t.fontSize * 1.05;
    lines.forEach((line, li) => {
      const cx = box.width / 2 - step / 2 - li * step;
      [...line].forEach((ch, ci) => {
        glyphs.push({ s: ch, x: cx, y: -box.height / 2 + charStep / 2 + ci * charStep, rotate: ROTATE_IN_VERTICAL.has(ch) });
      });
    });
  } else {
    lines.forEach((line, li) => {
      glyphs.push({ s: line, x: 0, y: -box.height / 2 + step / 2 + li * step, rotate: false });
    });
  }

  const pass = (stroke: boolean) => {
    for (const g of glyphs) {
      ctx.save();
      ctx.translate(g.x, g.y);
      if (g.rotate) ctx.rotate(Math.PI / 2);
      if (stroke) ctx.strokeText(g.s, 0, 0);
      else ctx.fillText(g.s, 0, 0);
      ctx.restore();
    }
  };
  if (t.strokeWidth > 0) {
    ctx.strokeStyle = t.strokeColor;
    ctx.lineWidth = t.strokeWidth * 2;
    pass(true);
  }
  ctx.fillStyle = t.color;
  pass(false);
  ctx.restore();
}

function drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer, img: HTMLImageElement): void {
  ctx.save();
  ctx.translate(STICKER_W / 2 + layer.x, STICKER_H / 2 + layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.flipX ? -layer.scale : layer.scale, layer.scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
}

export async function prepareSticker(sticker: Sticker, assets: Assets): Promise<HTMLImageElement | null> {
  await Promise.all(sticker.texts.map((t) => ensureFontLoaded(t.fontFamily, t.bold, t.text)));
  if (!sticker.image) return null;
  const src = assets[sticker.image.assetId];
  if (!src) return null;
  return loadImage(src);
}

function toPixels(c: HTMLCanvasElement): Pixels {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height };
}

function putPixels(c: HTMLCanvasElement, p: Pixels): void {
  ctx2d(c).putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
}

/**
 * スタンプを描画する。scale=2 なら 740x640 で描画（編集画面の高精細表示・main/tab 用）。
 * 戻り値のキャンバスは透過 PNG としてそのまま書き出せる。
 */
export async function renderSticker(sticker: Sticker, assets: Assets, scale = 1): Promise<HTMLCanvasElement> {
  const img = await prepareSticker(sticker, assets);
  const canvas = createCanvas(Math.round(STICKER_W * scale), Math.round(STICKER_H * scale));
  const ctx = ctx2d(canvas);
  ctx.scale(scale, scale);
  if (sticker.image && img) drawImageLayer(ctx, sticker.image, img);
  for (const t of sticker.texts) drawTextLayer(ctx, t);
  if (sticker.outline.enabled && sticker.outline.width > 0) {
    const outlined = addOutline(toPixels(canvas), sticker.outline.width * scale, sticker.outline.color);
    putPixels(canvas, outlined);
  }
  return canvas;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG の生成に失敗しました'))), 'image/png'),
  );
}

export function getBounds(c: HTMLCanvasElement) {
  return contentBounds(toPixels(c));
}

/**
 * 描画済みスタンプから中身だけを切り出し、指定サイズに収まるよう縮小して中央に配置する。
 * main.png / tab.png の生成や「余白カット」に使う。
 */
export function fitContent(src: HTMLCanvasElement, w: number, h: number, margin: number): HTMLCanvasElement {
  const out = createCanvas(w, h);
  const b = getBounds(src);
  if (!b) return out;
  const s = Math.min((w - margin * 2) / b.width, (h - margin * 2) / b.height);
  const dw = b.width * s;
  const dh = b.height * s;
  const ctx = ctx2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // 大きく縮小するときは段階的に縮めると綺麗になる
  let source: HTMLCanvasElement = src;
  let sx = b.x;
  let sy = b.y;
  let sw = b.width;
  let sh = b.height;
  while (sw * 0.5 > dw * 1.2) {
    const half = createCanvas(Math.ceil(sw / 2), Math.ceil(sh / 2));
    const hc = ctx2d(half);
    hc.imageSmoothingQuality = 'high';
    hc.drawImage(source, sx, sy, sw, sh, 0, 0, half.width, half.height);
    source = half;
    sx = 0;
    sy = 0;
    sw = half.width;
    sh = half.height;
  }
  ctx.drawImage(source, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return out;
}

/** 中身を囲む最小サイズ（＋余白・偶数 px・最大 370x320）で切り出す */
export function trimToContent(src: HTMLCanvasElement): HTMLCanvasElement {
  const b = getBounds(src);
  if (!b) return src;
  const even = (n: number) => n + (n % 2);
  const w = Math.min(STICKER_W, even(b.width + SAFE_MARGIN * 2));
  const h = Math.min(STICKER_H, even(b.height + SAFE_MARGIN * 2));
  const out = createCanvas(w, h);
  const ctx = ctx2d(out);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  ctx.drawImage(src, Math.round(w / 2 - cx), Math.round(h / 2 - cy));
  return out;
}

// ---- 当たり判定（ドラッグ移動用） ----

export interface LayerBox {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
}

export function imageBox(layer: ImageLayer, img: { naturalWidth: number; naturalHeight: number }): LayerBox {
  return {
    cx: STICKER_W / 2 + layer.x,
    cy: STICKER_H / 2 + layer.y,
    width: img.naturalWidth * layer.scale,
    height: img.naturalHeight * layer.scale,
    rotation: layer.rotation,
  };
}

export function textBox(t: TextLayer): LayerBox {
  const m = measureText(t);
  const pad = t.strokeWidth;
  return {
    cx: STICKER_W / 2 + t.x,
    cy: STICKER_H / 2 + t.y,
    width: m.width + pad * 2,
    height: m.height + pad * 2,
    rotation: t.rotation,
  };
}

export function hitBox(box: LayerBox, px: number, py: number, slack = 4): boolean {
  const r = (-box.rotation * Math.PI) / 180;
  const dx = px - box.cx;
  const dy = py - box.cy;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= box.width / 2 + slack && Math.abs(ly) <= box.height / 2 + slack;
}
