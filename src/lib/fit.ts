import { contentBounds } from './pixels';
import { transformSticker } from './project';
import { getBounds, renderSticker } from './render';
import { SAFE_MARGIN, STICKER_H, STICKER_W } from './spec';
import type { Assets, ImageLayer, Sticker } from './types';

/** フチ取りを含めて安全領域にちょうど収まるよう、スタンプ全体を拡大縮小・中央寄せする */
export async function fitSticker(sticker: Sticker, assets: Assets): Promise<Sticker> {
  const bare = await renderSticker({ ...sticker, outline: { ...sticker.outline, enabled: false } }, assets, 1);
  const b = getBounds(bare);
  if (!b) return sticker;
  const pad = SAFE_MARGIN + (sticker.outline.enabled ? sticker.outline.width : 0) + 2;
  const s = Math.min((STICKER_W - pad * 2) / b.width, (STICKER_H - pad * 2) / b.height);
  const cx = b.x + b.width / 2 - STICKER_W / 2;
  const cy = b.y + b.height / 2 - STICKER_H / 2;
  return transformSticker(sticker, s, -cx * s, -cy * s);
}

/** 新しく取り込んだ画像を、中身がキャンバスに収まる大きさで中央に置く */
export function initialImageLayer(
  assetId: string,
  originalAssetId: string,
  img: HTMLImageElement,
  pixels: { data: Uint8ClampedArray; width: number; height: number },
  outlineWidth: number,
): ImageLayer {
  const b = contentBounds(pixels) ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
  const pad = SAFE_MARGIN + outlineWidth + 2;
  const scale = Math.min((STICKER_W - pad * 2) / b.width, (STICKER_H - pad * 2) / b.height);
  const cx = b.x + b.width / 2 - img.naturalWidth / 2;
  const cy = b.y + b.height / 2 - img.naturalHeight / 2;
  return { assetId, originalAssetId, x: -cx * scale, y: -cy * scale, scale, rotation: 0, flipX: false };
}
