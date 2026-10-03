import { describe, expect, it } from 'vitest';
import { createProject, createSticker, createText, transformSticker } from '../src/lib/project';
import { stickerFileName } from '../src/lib/spec';
import { validateProject, validateRendered, type RenderedInfo } from '../src/lib/validate';

const filled = () => createSticker({ texts: [createText({ text: 'OK' })] });
const info = (over: Partial<RenderedInfo> = {}): RenderedInfo => ({
  bytes: 50_000,
  width: 370,
  height: 320,
  bounds: { x: 20, y: 20, width: 330, height: 280 },
  hasTransparency: true,
  ...over,
});

describe('validateProject', () => {
  it('8 個すべて埋まっていればエラーなし', () => {
    const p = { ...createProject(8), stickers: Array.from({ length: 8 }, filled) };
    expect(validateProject(p).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('申請できない個数ならエラーと次の区切りを案内', () => {
    const p = { ...createProject(8), stickers: Array.from({ length: 10 }, filled) };
    const errors = validateProject(p).filter((i) => i.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('あと 6 個で 16 個セット');
  });
  it('空のスタンプを番号付きで指摘する', () => {
    const p = { ...createProject(8), stickers: [...Array.from({ length: 7 }, filled), createSticker()] };
    const errors = validateProject(p).filter((i) => i.level === 'error');
    expect(errors).toEqual([expect.objectContaining({ index: 7 })]);
  });
});

describe('validateRendered', () => {
  it('規格どおりなら問題なし', () => {
    expect(validateRendered([info()])).toEqual([]);
  });
  it('1MB 超・非透過・奇数サイズはエラー', () => {
    const levels = validateRendered([info({ bytes: 2_000_000, hasTransparency: false, width: 369 })]).map((i) => i.level);
    expect(levels.filter((l) => l === 'error')).toHaveLength(3);
  });
  it('余白不足・小さすぎは警告', () => {
    expect(validateRendered([info({ bounds: { x: 2, y: 20, width: 300, height: 200 } })])[0].level).toBe('warning');
    expect(validateRendered([info({ bounds: { x: 150, y: 120, width: 50, height: 50 } })])[0].message).toContain('小さすぎ');
  });
});

describe('transformSticker', () => {
  it('画像と文字を中心基準で拡大・移動する', () => {
    const s = createSticker({
      image: { assetId: 'a', originalAssetId: 'a', x: 10, y: -10, scale: 0.5, rotation: 0, flipX: false },
      texts: [createText({ x: 20, y: 40, fontSize: 40, strokeWidth: 4 })],
    });
    const t = transformSticker(s, 2, 5, 0);
    expect(t.image).toMatchObject({ x: 25, y: -20, scale: 1 });
    expect(t.texts[0]).toMatchObject({ x: 45, y: 80, fontSize: 80, strokeWidth: 8 });
  });
});

describe('stickerFileName', () => {
  it('2 桁ゼロ埋め', () => {
    expect(stickerFileName(0)).toBe('01.png');
    expect(stickerFileName(39)).toBe('40.png');
  });
});
