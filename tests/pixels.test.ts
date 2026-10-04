import { describe, expect, it } from 'vitest';
import {
  addOutline,
  contentBounds,
  createPixels,
  distanceToOpaque,
  estimateBackgroundColors,
  hasTransparency,
  paintBrush,
  removeBackgroundAuto,
  removeColorAt,
  channelDominance,
  type Pixels,
} from '../src/lib/pixels';

/** 背景色 bg の上に、(x0,y0)-(x1,y1) の矩形を fg で塗った画像 */
function rectImage(w: number, h: number, bg: number[], fg: number[], x0: number, y0: number, x1: number, y1: number): Pixels {
  const p = createPixels(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = x >= x0 && x <= x1 && y >= y0 && y <= y1 ? fg : bg;
      p.data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  return p;
}
const alpha = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];

describe('estimateBackgroundColors', () => {
  it('外周の色を背景色として推定する', () => {
    const p = rectImage(20, 20, [255, 255, 255], [255, 0, 0], 5, 5, 14, 14);
    expect(estimateBackgroundColors(p)).toEqual([[255, 255, 255]]);
  });
  it('外周が透明なら候補なし', () => {
    expect(estimateBackgroundColors(createPixels(10, 10))).toEqual([]);
  });
});

describe('removeBackgroundAuto', () => {
  it('外周とつながった背景だけを透明にし、中の絵は残す', () => {
    const p = rectImage(20, 20, [255, 255, 255], [255, 0, 0], 5, 5, 14, 14);
    const out = removeBackgroundAuto(p, 30, false);
    expect(alpha(out, 0, 0)).toBe(0);
    expect(alpha(out, 19, 19)).toBe(0);
    expect(alpha(out, 10, 10)).toBe(255);
  });
  it('絵に囲まれた背景色（キャラの白目など）は消さない', () => {
    const p = rectImage(20, 20, [255, 255, 255], [0, 0, 0], 4, 4, 15, 15);
    // 黒い四角の中に白い穴
    for (let y = 8; y <= 11; y++) for (let x = 8; x <= 11; x++) p.data.set([255, 255, 255, 255], (y * 20 + x) * 4);
    const out = removeBackgroundAuto(p, 30, false);
    expect(alpha(out, 0, 0)).toBe(0);
    expect(alpha(out, 9, 9)).toBe(255);
  });
  it('元の画像を書き換えない', () => {
    const p = rectImage(10, 10, [255, 255, 255], [0, 0, 0], 3, 3, 6, 6);
    removeBackgroundAuto(p, 30);
    expect(alpha(p, 0, 0)).toBe(255);
  });
  it('境界の画素を半透明にしてハローを減らす', () => {
    const p = rectImage(20, 20, [255, 255, 255], [0, 0, 0], 5, 5, 14, 14);
    // 背景に近い明るいグレーの縁
    for (let x = 5; x <= 14; x++) p.data.set([220, 220, 220, 255], (5 * 20 + x) * 4);
    const out = removeBackgroundAuto(p, 30, true);
    const a = alpha(out, 10, 5);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
  });
});

describe('removeBackgroundAuto（グリーンバック）', () => {
  /**
   * 暗い緑の背景の中央に、明るい黄緑の光（グロー）の輪、その内側に白フチ付きの水色キャラ。
   * キャラの中に「背景と同じ緑の穴」と「背景とは違う明るい緑の模様」を置く。
   */
  function greenScreen(): Pixels {
    const w = 60;
    const h = 60;
    const p = createPixels(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const r = Math.hypot(x - 30, y - 30);
        let c = [5, 101, 3];
        if (r < 24) c = r < 17 ? [255, 255, 255] : [149, 175, 68]; // グロー
        if (r < 15) c = [110, 190, 200]; // キャラ
        p.data.set([...c, 255], (y * w + x) * 4);
      }
    for (let y = 26; y <= 29; y++) for (let x = 26; x <= 29; x++) p.data.set([6, 100, 4, 255], (y * w + x) * 4); // 穴
    for (let y = 32; y <= 35; y++) for (let x = 32; x <= 35; x++) p.data.set([120, 230, 90, 255], (y * w + x) * 4); // 緑の模様
    return p;
  }

  it('緑が突出した色を検出する', () => {
    expect(channelDominance([5, 101, 3])).toEqual({ channel: 1, score: 96 });
    expect(channelDominance([250, 250, 250]).score).toBe(0);
  });
  it('明るさの違うグローも含めて背景を消し、キャラは残す', () => {
    const out = removeBackgroundAuto(greenScreen(), 40);
    expect(alpha(out, 0, 0)).toBe(0);
    expect(alpha(out, 30, 9)).toBe(0); // グロー（r≈21）
    expect(alpha(out, 30, 15)).toBe(255); // 白フチ
    expect(alpha(out, 20, 30)).toBe(255); // キャラ
  });
  it('囲まれた背景色の穴は消し、背景と違う緑の模様は残す', () => {
    const out = removeBackgroundAuto(greenScreen(), 40);
    expect(alpha(out, 27, 27)).toBe(0);
    expect(alpha(out, 33, 33)).toBe(255);
  });
  it('消した部分に接する画素の緑かぶりを取り除く', () => {
    const p = greenScreen();
    // 白フチの外端（グローに接する）に、背景の緑が少し混ざった画素
    const i = (30 * 60 + 46) * 4;
    p.data.set([215, 222, 215, 255], i);
    const out = removeBackgroundAuto(p, 40);
    expect(out.data[i + 3]).toBe(255);
    expect([...out.data.slice(i, i + 3)]).toEqual([215, 215, 215]);
  });
});

describe('removeColorAt', () => {
  it('contiguous=true ならクリックした領域だけ消す', () => {
    // 左右に分かれた 2 つの赤い領域
    const p = rectImage(20, 10, [0, 0, 255], [255, 0, 0], 0, 0, 4, 9);
    for (let y = 0; y < 10; y++) for (let x = 15; x < 20; x++) p.data.set([255, 0, 0, 255], (y * 20 + x) * 4);
    const out = removeColorAt(p, 1, 1, 20, true, false);
    expect(alpha(out, 1, 1)).toBe(0);
    expect(alpha(out, 17, 5)).toBe(255);
    expect(alpha(out, 10, 5)).toBe(255);
  });
  it('contiguous=false なら同じ色を全部消す', () => {
    const p = rectImage(20, 10, [0, 0, 255], [255, 0, 0], 0, 0, 4, 9);
    for (let y = 0; y < 10; y++) for (let x = 15; x < 20; x++) p.data.set([255, 0, 0, 255], (y * 20 + x) * 4);
    const out = removeColorAt(p, 1, 1, 20, false, false);
    expect(alpha(out, 17, 5)).toBe(0);
    expect(alpha(out, 10, 5)).toBe(255);
  });
  it('範囲外のクリックは何もしない', () => {
    const p = rectImage(4, 4, [0, 0, 0], [0, 0, 0], 0, 0, 0, 0);
    expect(alpha(removeColorAt(p, 10, 10, 20, true), 0, 0)).toBe(255);
  });
});

describe('paintBrush', () => {
  it('erase で消し、restore で元に戻す', () => {
    const original = rectImage(20, 20, [10, 20, 30], [10, 20, 30], 0, 0, 0, 0);
    const p = { ...original, data: new Uint8ClampedArray(original.data) };
    paintBrush(p, original, 10, 10, 3, 'erase');
    expect(alpha(p, 10, 10)).toBe(0);
    expect(alpha(p, 0, 0)).toBe(255);
    paintBrush(p, original, 10, 10, 5, 'restore');
    expect(alpha(p, 10, 10)).toBe(255);
  });
});

describe('contentBounds', () => {
  it('不透明部分の外接矩形を返す', () => {
    const p = createPixels(30, 20);
    p.data[(5 * 30 + 7) * 4 + 3] = 255;
    p.data[(12 * 30 + 20) * 4 + 3] = 255;
    expect(contentBounds(p)).toEqual({ x: 7, y: 5, width: 14, height: 8 });
  });
  it('空なら null', () => {
    expect(contentBounds(createPixels(5, 5))).toBeNull();
  });
});

describe('distanceToOpaque / addOutline', () => {
  it('不透明画素までのユークリッド距離を求める', () => {
    const p = createPixels(11, 11);
    p.data[(5 * 11 + 5) * 4 + 3] = 255;
    const d = distanceToOpaque(p);
    expect(d[5 * 11 + 5]).toBe(0);
    expect(d[5 * 11 + 8]).toBeCloseTo(3);
    expect(d[8 * 11 + 9]).toBeCloseTo(5);
  });
  it('指定した太さのフチを付け、元の絵は上に残す', () => {
    const p = createPixels(30, 30);
    for (let y = 12; y < 18; y++) for (let x = 12; x < 18; x++) p.data.set([255, 0, 0, 255], (y * 30 + x) * 4);
    const out = addOutline(p, 4, '#ffffff');
    // 元の絵
    expect([...out.data.slice((15 * 30 + 15) * 4, (15 * 30 + 15) * 4 + 4)]).toEqual([255, 0, 0, 255]);
    // フチ（絵から 3px）
    expect([...out.data.slice((15 * 30 + 20) * 4, (15 * 30 + 20) * 4 + 4)]).toEqual([255, 255, 255, 255]);
    // フチの外（絵から 8px）
    expect(alpha(out, 25, 15)).toBe(0);
  });
});

describe('hasTransparency', () => {
  it('透明な画素があるか判定する', () => {
    expect(hasTransparency(createPixels(2, 2))).toBe(true);
    expect(hasTransparency(rectImage(2, 2, [0, 0, 0], [0, 0, 0], 0, 0, 0, 0))).toBe(false);
  });
});
