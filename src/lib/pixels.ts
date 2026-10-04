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

function allSeeds(p: Pixels, pred: (idx: number) => boolean): number[] {
  const seeds: number[] = [];
  for (let idx = 0; idx < p.width * p.height; idx++) if (pred(idx)) seeds.push(idx);
  return seeds;
}

function borderSeeds(width: number, height: number): number[] {
  const seeds: number[] = [];
  for (let x = 0; x < width; x++) seeds.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) seeds.push(y * width, y * width + width - 1);
  return seeds;
}

/** 色の中で 1 つのチャンネル（R/G/B）がどれだけ突出しているか */
export function channelDominance(c: RGB): { channel: 0 | 1 | 2; score: number } {
  const channel = (c[1] >= c[0] && c[1] >= c[2] ? 1 : c[2] >= c[0] ? 2 : 0) as 0 | 1 | 2;
  const others = [0, 1, 2].filter((k) => k !== channel).map((k) => c[k]);
  return { channel, score: c[channel] - Math.max(...others) };
}

/** 囲まれた領域を背景の穴とみなす、背景色との平均色の差の上限 */
const ENCLOSED_KEY_MAX_DISTANCE = 60;

/** これ以上 1 チャンネルが突出していれば、グリーンバック／ブルーバック等とみなす */
export const CHROMA_KEY_MIN_DOMINANCE = 40;

/**
 * クロマキー（グリーンバック・ブルーバック等）を透明にする。
 * 背景色との「距離」ではなく「キーの色（例：緑）が他の色よりどれだけ強いか」で判定するので、
 * 背景にグラデーションや光（グロー）があっても、明るさに関係なく消せる。
 * 外周から続く部分だけを消し、境界は半透明にして、残った部分の色かぶり（緑のにじみ）も取り除く。
 */
export interface ChromaKeyOptions {
  soften?: boolean;
  /** 背景の代表色。指定すると、絵に囲まれた「背景と同じ色の穴」（文字の内側など）も消す */
  keyColor?: RGB;
  /** 塗りつぶしの開始点（画素番号）。省略すると画像の外周から */
  seeds?: number[];
}

export function removeChromaKey(p: Pixels, channel: 0 | 1 | 2, tolerance: number, options: ChromaKeyOptions = {}): Pixels {
  const { soften = true, keyColor, seeds } = options;
  const { width, height } = p;
  const src = p.data;
  const o1 = channel === 0 ? 1 : 0;
  const o2 = channel === 2 ? 1 : 2;
  const score = (idx: number) => {
    const i = idx * 4;
    return src[i + channel] - Math.max(src[i + o1], src[i + o2]);
  };
  // この強さ以上は完全に透明、lo 以下は不透明、その間は半透明
  const hi = Math.max(8, 60 - tolerance);
  const lo = soften ? hi * 0.4 : hi - 0.5;
  const n = width * height;
  const alphaScale = new Float32Array(n).fill(1);
  const visited = new Uint8Array(n);
  const stack: number[] = [];
  const visit = (idx: number) => {
    if (visited[idx]) return;
    const transparent = src[idx * 4 + 3] < 16;
    const sc = score(idx);
    if (!transparent && sc <= lo) return;
    visited[idx] = 1;
    alphaScale[idx] = transparent || sc >= hi ? 0 : (hi - sc) / (hi - lo);
    stack.push(idx);
  };
  for (const s of seeds ?? borderSeeds(width, height)) visit(s);
  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % width;
    if (x > 0) visit(idx - 1);
    if (x < width - 1) visit(idx + 1);
    if (idx >= width) visit(idx - width);
    if (idx < n - width) visit(idx + width);
  }

  if (keyColor) removeEnclosedKeyRegions();

  /**
   * 外周とつながっていない領域（文字の内側の穴など）を、背景なら消す。
   * 次のどちらかなら背景とみなす：
   * - 中心部（キーの色が強い画素）の平均色が背景色とほぼ同じ
   * - 中心部の色の大半が、外周から実際に消した色（グローなども含む）に含まれる
   * 背景で使われていない色の緑（キャラの服など）は残す。
   */
  function removeEnclosedKeyRegions() {
    const removedPalette = new Uint32Array(4096);
    for (let idx = 0; idx < n; idx++) if (visited[idx] && alphaScale[idx] === 0) removedPalette[colorBin(src, idx * 4)]++;
    const seen = new Uint8Array(n);
    const region: number[] = [];
    const coreMin = channelDominance(keyColor!).score * 0.6;
    for (let start = 0; start < n; start++) {
      if (visited[start] || seen[start] || score(start) < hi) continue;
      region.length = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let core = 0;
      let strong = 0;
      let strongInPalette = 0;
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const idx = stack.pop()!;
        region.push(idx);
        const i = idx * 4;
        const sc = score(idx);
        if (sc >= coreMin) {
          sr += src[i];
          sg += src[i + 1];
          sb += src[i + 2];
          core++;
        }
        if (sc >= hi) {
          strong++;
          if (removedPalette[colorBin(src, i)] >= 3) strongInPalette++;
        }
        const x = idx % width;
        const push = (m: number) => {
          if (!visited[m] && !seen[m] && score(m) > lo) {
            seen[m] = 1;
            stack.push(m);
          }
        };
        if (x > 0) push(idx - 1);
        if (x < width - 1) push(idx + 1);
        if (idx >= width) push(idx - width);
        if (idx < n - width) push(idx + width);
      }
      const sameAsKey =
        core > 0 && Math.hypot(sr / core - keyColor![0], sg / core - keyColor![1], sb / core - keyColor![2]) <= ENCLOSED_KEY_MAX_DISTANCE;
      const seenInBackground = strong > 0 && strongInPalette / strong >= 0.8;
      if (!sameAsKey && !seenInBackground) continue;
      for (const idx of region) {
        const sc = score(idx);
        visited[idx] = 1;
        alphaScale[idx] = sc >= hi ? 0 : (hi - sc) / (hi - lo);
      }
    }
  }

  const out = clonePixels(p);
  const d = out.data;
  for (let idx = 0; idx < n; idx++) if (visited[idx]) d[idx * 4 + 3] = Math.round(d[idx * 4 + 3] * alphaScale[idx]);
  removeTinyIslands(out, TINY_ISLAND_MAX_PIXELS);

  // 消した部分から 2px 以内（境界の帯）の画素を調べる
  const R = 2;
  const near = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (d[idx * 4 + 3] === 0) continue;
      let hit = visited[idx] === 1;
      for (let dy = -R; dy <= R && !hit; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width && visited[yy * width + xx]) {
            hit = true;
            break;
          }
        }
      }
      near[idx] = hit ? 1 : 0;
    }
  }

  // 境界の画素は「背景（グロー等）」と「絵の色」が混ざっている。
  // 近くの背景色 B と、内側にある混じりけのない色の候補 F のうち、
  // 観測した色 C を B〜F の混色としていちばんうまく説明できる F を選び、色を F に、
  // 混ざり具合を透明度にする（細い白フチの隣に茶色の線があっても、白フチは白のまま）。
  const S = 4;
  const candidates: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!near[idx]) continue;
      const i = idx * 4;
      // いちばん近い「消した背景」の元の色
      let bIdx = -1;
      let bDist = Infinity;
      candidates.length = 0;
      for (let dy = -S; dy <= S; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -S; dx <= S; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const m = yy * width + xx;
          const dd = dx * dx + dy * dy;
          if (visited[m] && alphaScale[m] === 0) {
            if (dd < bDist) {
              bDist = dd;
              bIdx = m;
            }
          } else if (!near[m] && !visited[m] && d[m * 4 + 3] === 255) {
            candidates.push(m, dd);
          }
        }
      }
      let unmixed = false;
      if (bIdx >= 0 && candidates.length) {
        const b = bIdx * 4;
        const cr = src[i] - src[b];
        const cg = src[i + 1] - src[b + 1];
        const cb = src[i + 2] - src[b + 2];
        let best = -1;
        let bestRes = Infinity;
        let bestT = 1;
        for (let k = 0; k < candidates.length; k += 2) {
          const m = candidates[k];
          const j = m * 4;
          const fr = d[j] - src[b];
          const fg = d[j + 1] - src[b + 1];
          const fb = d[j + 2] - src[b + 2];
          const ff = fr * fr + fg * fg + fb * fb;
          if (ff < 1) continue;
          const t = Math.min(1, Math.max(0, (cr * fr + cg * fg + cb * fb) / ff));
          // 遠い候補ほど不利にして、すぐ内側の色（白フチなど）を優先する
          const res = (cr - t * fr) ** 2 + (cg - t * fg) ** 2 + (cb - t * fb) ** 2 + UNMIX_DISTANCE_PENALTY * candidates[k + 1];
          if (res < bestRes) {
            bestRes = res;
            best = m;
            bestT = t;
          }
        }
        if (best >= 0 && bestRes <= UNMIX_MAX_RESIDUAL ** 2 + UNMIX_DISTANCE_PENALTY * S * S) {
          const j = best * 4;
          d[i] = d[j];
          d[i + 1] = d[j + 1];
          d[i + 2] = d[j + 2];
          d[i + 3] = Math.round(d[i + 3] * (soften ? bestT : bestT >= 0.5 ? 1 : 0));
          unmixed = true;
        }
      }
      if (!unmixed) d[i + channel] = Math.min(d[i + channel], Math.max(d[i + o1], d[i + o2]));
    }
  }

  // 境界の透明度は画素ごとにばらつくので、3×3 でならしてギザギザ・ざらつきを抑える
  if (soften) {
    const a0 = new Uint8ClampedArray(n);
    for (let idx = 0; idx < n; idx++) a0[idx] = d[idx * 4 + 3];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!near[idx]) continue;
        let sum = 0;
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            sum += a0[yy * width + xx];
            cnt++;
          }
        }
        d[idx * 4 + 3] = Math.min(a0[idx], Math.round(sum / cnt) + 24);
      }
    }
  }
  return out;
}

/** 境界の色を「背景と絵の色の混色」として説明できたとみなす誤差の上限 */
const UNMIX_MAX_RESIDUAL = 40;
/** 候補が 1px 遠ざかるごとに加える不利の量（誤差の二乗に対して） */
const UNMIX_DISTANCE_PENALTY = 30;

/** 4bit ずつに量子化した色の番号（0〜4095） */
function colorBin(d: Uint8ClampedArray, i: number): number {
  return ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
}

/** 背景除去で取り残された、数ピクセルだけの孤立した点を消す */
const TINY_ISLAND_MAX_PIXELS = 6;

export function removeTinyIslands(p: Pixels, maxPixels: number): void {
  const { width, height, data } = p;
  const n = width * height;
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const region: number[] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || data[start * 4 + 3] === 0) continue;
    region.length = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const idx = stack.pop()!;
      region.push(idx);
      const x = idx % width;
      const y = (idx - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const m = yy * width + xx;
          if (!seen[m] && data[m * 4 + 3] > 0) {
            seen[m] = 1;
            stack.push(m);
          }
        }
      }
    }
    if (region.length <= maxPixels) for (const idx of region) data[idx * 4 + 3] = 0;
  }
}

/**
 * 外周から続く背景を自動で透明にする。
 * 背景が緑・青などの鮮やかな色ならクロマキー、白などならその色に近い部分を消す。
 */
export function removeBackgroundAuto(p: Pixels, tolerance: number, soften = true): Pixels {
  const keys = estimateBackgroundColors(p);
  if (keys.length === 0) return clonePixels(p);
  const dom = channelDominance(keys[0]);
  if (dom.score >= CHROMA_KEY_MIN_DOMINANCE) return removeChromaKey(p, dom.channel, tolerance, { soften, keyColor: keys[0] });
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
  // 緑・青などの鮮やかな色をクリックしたら、明るさの違う同系色（グロー等）もまとめて消す
  const dom = channelDominance(key);
  if (dom.score >= CHROMA_KEY_MIN_DOMINANCE) {
    return removeChromaKey(p, dom.channel, tolerance, {
      soften,
      keyColor: contiguous ? undefined : key,
      seeds: contiguous ? [y * width + x] : allSeeds(p, (idx) => minDistance(data, idx * 4, [key]) <= tolerance),
    });
  }
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
