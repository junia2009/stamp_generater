import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useRenderedSticker } from '../hooks';
import { hitBox, imageBox, loadImage, textBox, type LayerBox } from '../lib/render';
import { SAFE_MARGIN, STICKER_H, STICKER_W } from '../lib/spec';
import type { Selection, Sticker } from '../lib/types';
import type { Store } from '../store';

export type Backdrop = 'checker' | 'white' | 'dark' | 'line';

const BACKDROPS: { id: Backdrop; label: string }[] = [
  { id: 'checker', label: '透過' },
  { id: 'white', label: '白' },
  { id: 'dark', label: '黒' },
  { id: 'line', label: 'トーク背景' },
];

interface Drag {
  mode: 'move' | 'transform';
  sel: NonNullable<Selection>;
  key: string;
  startX: number;
  startY: number;
  layerX: number;
  layerY: number;
  /** transform 用 */
  cx: number;
  cy: number;
  startDist: number;
  startAngle: number;
  startSize: number;
  startRotation: number;
}

function useImageSize(src: string | undefined) {
  const [size, setSize] = useState<{ naturalWidth: number; naturalHeight: number } | null>(null);
  useEffect(() => {
    if (!src) return setSize(null);
    let alive = true;
    loadImage(src).then((img) => alive && setSize({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }));
    return () => {
      alive = false;
    };
  }, [src]);
  return size;
}

export function selectionBox(sticker: Sticker, sel: Selection, imgSize: ReturnType<typeof useImageSize>): LayerBox | null {
  if (!sel) return null;
  if (sel.kind === 'image') return sticker.image && imgSize ? imageBox(sticker.image, imgSize) : null;
  const t = sticker.texts.find((x) => x.id === sel.id);
  return t ? textBox(t) : null;
}

export function Editor({ store }: { store: Store }) {
  const { current: sticker, assets, selection, setSelection, updateSticker } = store;
  const canvas = useRenderedSticker(sticker, assets, 2);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [backdrop, setBackdrop] = useState<Backdrop>('checker');
  const [showGuide, setShowGuide] = useState(true);
  const imgSize = useImageSize(sticker?.image ? assets[sticker.image.assetId] : undefined);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !canvas) return;
    const ctx = view.getContext('2d')!;
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(canvas, 0, 0, view.width, view.height);
  }, [canvas]);

  if (!sticker) return null;

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * STICKER_W, y: ((e.clientY - r.top) / r.height) * STICKER_H };
  };

  const hitTest = (x: number, y: number): Selection => {
    for (let i = sticker.texts.length - 1; i >= 0; i--) {
      const t = sticker.texts[i];
      if (t.text.trim() && hitBox(textBox(t), x, y)) return { kind: 'text', id: t.id };
    }
    if (sticker.image && imgSize && hitBox(imageBox(sticker.image, imgSize), x, y)) return { kind: 'image' };
    return null;
  };

  const layerPos = (sel: Selection) => {
    if (sel?.kind === 'image' && sticker.image) return { x: sticker.image.x, y: sticker.image.y };
    if (sel?.kind === 'text') {
      const t = sticker.texts.find((x) => x.id === sel.id);
      if (t) return { x: t.x, y: t.y };
    }
    return null;
  };

  const beginDrag = (e: RPointerEvent, sel: Selection, mode: Drag['mode']) => {
    const pos = layerPos(sel);
    const box = selectionBox(sticker, sel, imgSize);
    if (!sel || !pos || !box) return;
    const p = toLocal(e);
    const t = sel?.kind === 'text' ? sticker.texts.find((x) => x.id === sel.id) : undefined;
    drag.current = {
      mode,
      sel,
      key: `${mode}-${Date.now()}`,
      startX: p.x,
      startY: p.y,
      layerX: pos.x,
      layerY: pos.y,
      cx: box.cx,
      cy: box.cy,
      startDist: Math.max(1, Math.hypot(p.x - box.cx, p.y - box.cy)),
      startAngle: Math.atan2(p.y - box.cy, p.x - box.cx),
      startSize: t ? t.fontSize : sticker.image?.scale ?? 1,
      startRotation: t ? t.rotation : sticker.image?.rotation ?? 0,
    };
    wrapRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    const p = toLocal(e);
    const hit = hitTest(p.x, p.y);
    setSelection(hit);
    if (hit) beginDrag(e, hit, 'move');
  };

  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const selection = d.sel;
    const p = toLocal(e);
    if (d.mode === 'move') {
      let nx = d.layerX + p.x - d.startX;
      let ny = d.layerY + p.y - d.startY;
      // 中央付近では吸着させる
      if (Math.abs(nx) < 4) nx = 0;
      if (Math.abs(ny) < 4) ny = 0;
      nx = Math.round(nx);
      ny = Math.round(ny);
      updateSticker(
        sticker.id,
        (s) =>
          selection.kind === 'image'
            ? { ...s, image: s.image && { ...s.image, x: nx, y: ny } }
            : { ...s, texts: s.texts.map((t) => (t.id === selection.id ? { ...t, x: nx, y: ny } : t)) },
        d.key,
      );
    } else {
      const ratio = Math.hypot(p.x - d.cx, p.y - d.cy) / d.startDist;
      let rot = d.startRotation + ((Math.atan2(p.y - d.cy, p.x - d.cx) - d.startAngle) * 180) / Math.PI;
      rot = ((((rot + 180) % 360) + 360) % 360) - 180;
      if (Math.abs(rot) < 4) rot = 0;
      rot = Math.round(rot);
      updateSticker(
        sticker.id,
        (s) =>
          selection.kind === 'image'
            ? { ...s, image: s.image && { ...s.image, scale: Math.max(0.02, d.startSize * ratio), rotation: rot } }
            : {
                ...s,
                texts: s.texts.map((t) =>
                  t.id === selection.id ? { ...t, fontSize: Math.max(8, Math.round(d.startSize * ratio)), rotation: rot } : t,
                ),
              },
        d.key,
      );
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!selection) return;
    const f = e.deltaY < 0 ? 1.05 : 1 / 1.05;
    updateSticker(
      sticker.id,
      (s) =>
        selection.kind === 'image'
          ? { ...s, image: s.image && { ...s.image, scale: Math.max(0.02, s.image.scale * f) } }
          : {
              ...s,
              texts: s.texts.map((t) => (t.id === selection.id ? { ...t, fontSize: Math.max(8, Math.round(t.fontSize * f)) } : t)),
            },
      'wheel',
    );
  };

  const box = selectionBox(sticker, selection, imgSize);

  return (
    <section className="editor">
      <div className="editor-toolbar">
        <div className="seg" role="group" aria-label="背景">
          {BACKDROPS.map((b) => (
            <button key={b.id} className={backdrop === b.id ? 'on' : ''} onClick={() => setBackdrop(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} />
          余白ガイド
        </label>
      </div>
      <div className={`stage backdrop-${backdrop}`}>
        <div
          ref={wrapRef}
          className="stage-inner"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={onWheel}
          onDoubleClick={() => {
            if (selection?.kind === 'text') document.getElementById(`text-input-${selection.id}`)?.focus();
          }}
        >
          <canvas ref={viewRef} width={STICKER_W * 2} height={STICKER_H * 2} />
          <svg viewBox={`0 0 ${STICKER_W} ${STICKER_H}`} className="overlay">
            {showGuide && (
              <rect
                className="guide"
                x={SAFE_MARGIN}
                y={SAFE_MARGIN}
                width={STICKER_W - SAFE_MARGIN * 2}
                height={STICKER_H - SAFE_MARGIN * 2}
              />
            )}
            {box && (
              <g transform={`translate(${box.cx} ${box.cy}) rotate(${box.rotation})`}>
                <rect className="sel" x={-box.width / 2} y={-box.height / 2} width={box.width} height={box.height} />
                <circle
                  className="handle"
                  cx={box.width / 2}
                  cy={box.height / 2}
                  r={8}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    beginDrag(e, selection, 'transform');
                  }}
                >
                  <title>ドラッグで拡大縮小・回転</title>
                </circle>
              </g>
            )}
          </svg>
          {sticker.texts.length === 0 && !sticker.image && (
            <div className="stage-empty">
              右のパネルから
              <br />
              画像や文字を追加しましょう
            </div>
          )}
        </div>
      </div>
      <p className="hint">
        ドラッグで移動／右下の●で拡大縮小・回転／ホイールで拡大縮小／ダブルクリックで文字編集／矢印キーで微調整
      </p>
    </section>
  );
}
