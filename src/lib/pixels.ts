// Canvas に依存しないピクセル処理。ImageData と同じ形のオブジェクトを受け取るのでテストしやすい。

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type RGB = [number, number, number];

export function createPixels(width: number, height: number): Pixels {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

export function clonePixels(p: Pixels): Pixels {
  return { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height };
}

function colorDistance(d: Uint8ClampedArray, i: number, c: RGB): number {
  const dr = d[i] - c[0];
  const dg = d[i + 1] - c[1];
  const db = d[i + 2] - c[2];
  // 人間の見た目に近づけるための簡易重み付け
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

function minDistance(d: Uint8ClampedArray, i: number, keys: RGB[]): number {
  let best = Infinity;
  for (const k of keys) {
    const v = colorDistance(d, i, k);
    if (v < best) best = v;
  }
  return best;
}

/**
 * 画像の外周の色から背景色の候補を推定する。
 * 外周の画素を量子化して集計し、外周の 8% 以上を占める色を返す（最大 4 色）。
 */
export function estimateBackgroundColors(p: Pixels): RGB[] {
  const { data, width, height } = p;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  const visit = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) return;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++;
    bin.r += data[i];
    bin.g += data[i + 1];
    bin.b += data[i + 2];
    bins.set(key, bin);
    total++;
  };
  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(0, y);
    visit(width - 1, y);
  }
  if (total === 0) return [];
  return [...bins.values()]
    .filter((b) => b.n / total >= 0.08)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((b) => [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)] as RGB);
}

/**
 * seeds から始めて、keys のいずれかに tolerance 以内の色の画素を塗りつぶし式に集める。
 * 既に透明な画素も背景として通過できる。戻り値は 1 = 背景 のマスク。
 */
function floodMask(p: Pixels, seeds: number[], keys: RGB[], tolerance: number): Uint8Array {
  const { data, width, height } = p;
  const mask = new Uint8Array(width * height);
  const stack: number[] = [];
  const isBg = (idx: number) => {
    const i = idx * 4;
    return data[i + 3] < 16 || minDistance(data, i, keys) <= tolerance;
  };
  for (const s of seeds) {
    if (!mask[s] && isBg(s)) {
      mask[s] = 1;
      stack.push(s);
    }
  }
  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = (idx - x) / width;
    const push = (n: number) => {
      if (!mask[n] && isBg(n)) {
        mask[n] = 1;
        stack.push(n);
      }
    };
    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y < height - 1) push(idx + width);
  }
  return mask;
}

/**
 * マスクされた画素を透明にする。マスクに接する画素は背景色との近さに応じて
 * 半透明にし、白フチ・色にじみ（ハロー）を減らす。
 */
function applyMask(p: Pixels, mask: Uint8Array, keys: RGB[], tolerance: number, soften: boolean): Pixels {
  const out = clonePixels(p);
  const { data, width, height } = out;
  const softRange = Math.max(tolerance, 24);
  for (let idx = 0; idx < mask.length; idx++) {
    const i = idx * 4;
    if (mask[idx]) {
      data[i + 3] = 0;
      continue;
    }
    if (!soften || keys.length === 0) continue;
    const x = idx % width;
    const y = (idx - x) / width;
    const touches =
      (x > 0 && mask[idx - 1]) ||
      (x < width - 1 && mask[idx + 1]) ||
      (y > 0 && mask[idx - width]) ||
      (y < height - 1 && mask[idx + width]);
    if (!touches) continue;
    const dist = minDistance(p.data, i, keys);
    const ratio = Math.min(1, Math.max(0, (dist - tolerance) / softRange) + 0.35);
    data[i + 3] = Math.round(data[i + 3] * ratio);
  }
  return out;
}

function borderSeeds(width: number, height: number): number[] {
  const seeds: number[] = [];
  for (let x = 0; x < width; x++) seeds.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) seeds.push(y * width, y * width + width - 1);
  return seeds;
}

/** 外周から続く背景を自動で透明にする（単色・ほぼ単色の背景向け） */
export function removeBackgroundAuto(p: Pixels, tolerance: number, soften = true): Pixels {
  const keys = estimateBackgroundColors(p);
  if (keys.length === 0) return clonePixels(p);
  const mask = floodMask(p, borderSeeds(p.width, p.height), keys, tolerance);
  return applyMask(p, mask, keys, tolerance, soften);
}

/**
 * 自動選択（マジックワンド）：クリックした色に近い領域を透明にする。
 * contiguous=false なら画像全体から同じ色を消す。
 */
export function removeColorAt(
  p: Pixels,
  x: number,
  y: number,
  tolerance: number,
  contiguous: boolean,
  soften = true,
): Pixels {
  const { data, width, height } = p;
  if (x < 0 || y < 0 || x >= width || y >= height) return clonePixels(p);
  const i = (y * width + x) * 4;
  if (data[i + 3] < 16) return clonePixels(p);
  const key: RGB = [data[i], data[i + 1], data[i + 2]];
  let mask: Uint8Array;
  if (contiguous) {
    mask = floodMask(p, [y * width + x], [key], tolerance);
  } else {
    mask = new Uint8Array(width * height);
    for (let idx = 0; idx < mask.length; idx++) {
      if (minDistance(data, idx * 4, [key]) <= tolerance) mask[idx] = 1;
    }
  }
  return applyMask(p, mask, [key], tolerance, soften);
}

/** 円形ブラシで消す（erase）／元画像から戻す（restore） */
export function paintBrush(
  target: Pixels,
  original: Pixels,
  cx: number,
  cy: number,
  radius: number,
  mode: 'erase' | 'restore',
): void {
  const { width, height, data } = target;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * width + x) * 4;
      if (mode === 'erase') {
        data[i + 3] = 0;
      } else {
        data[i] = original.data[i];
        data[i + 1] = original.data[i + 1];
        data[i + 2] = original.data[i + 2];
        data[i + 3] = original.data[i + 3];
      }
    }
  }
}

/** 不透明部分の外接矩形。何もなければ null */
export function contentBounds(
  p: Pixels,
  alphaThreshold = 8,
): { x: number; y: number; width: number; height: number } | null {
  const { data, width, height } = p;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const INF = 1e20;

/** Felzenszwalb & Huttenlocher の 1 次元二乗距離変換 */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** 不透明画素（alpha >= threshold）までのユークリッド距離 */
export function distanceToOpaque(p: Pixels, threshold = 128): Float64Array {
  const { data, width, height } = p;
  const n = Math.max(width, height);
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i++) grid[i] = data[i * 4 + 3] >= threshold ? 0 : INF;
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) grid[y * width + x] = Math.sqrt(d[x]);
  }
  return grid;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * スタンプらしい「フチ取り」を付ける。不透明部分から width px 以内を color で塗り、
 * その上に元の画像を重ねる（アンチエイリアス付き）。
 */
export function addOutline(p: Pixels, width: number, color: string): Pixels {
  if (width <= 0) return clonePixels(p);
  const dist = distanceToOpaque(p, 100);
  const [cr, cg, cb] = hexToRgb(color);
  const out = createPixels(p.width, p.height);
  const s = p.data;
  const o = out.data;
  for (let idx = 0; idx < dist.length; idx++) {
    const i = idx * 4;
    const outlineA = Math.min(1, Math.max(0, width + 0.5 - dist[idx]));
    const srcA = s[i + 3] / 255;
    // src over outline
    const a = srcA + outlineA * (1 - srcA);
    if (a <= 0) continue;
    o[i] = (s[i] * srcA + cr * outlineA * (1 - srcA)) / a;
    o[i + 1] = (s[i + 1] * srcA + cg * outlineA * (1 - srcA)) / a;
    o[i + 2] = (s[i + 2] * srcA + cb * outlineA * (1 - srcA)) / a;
    o[i + 3] = a * 255;
  }
  return out;
}

/** 透明部分があるか（LINE は背景透過が必須） */
export function hasTransparency(p: Pixels): boolean {
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] < 255) return true;
  return false;
}
