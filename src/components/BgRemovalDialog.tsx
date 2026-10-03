import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { AUTO_BG_TOLERANCE } from '../actions';
import { dataUrlToPixels, pixelsToDataUrl } from '../lib/imageio';
import { clonePixels, paintBrush, removeBackgroundAuto, removeColorAt, type Pixels } from '../lib/pixels';
import type { Store } from '../store';
import { Modal } from './Modal';

type Tool = 'wand' | 'erase' | 'restore';

const TOOLS: { id: Tool; label: string; help: string }[] = [
  { id: 'wand', label: '🪄 自動選択で消す', help: 'クリックした場所と似た色の範囲を透明にします' },
  { id: 'erase', label: '🧽 消しゴム', help: 'なぞった部分を透明にします' },
  { id: 'restore', label: '🖌 復元ブラシ', help: '消しすぎた部分を元の画像に戻します' },
];

export function BgRemovalDialog({ store, onClose }: { store: Store; onClose: () => void }) {
  const sticker = store.current;
  const layer = sticker?.image;
  const [original, setOriginal] = useState<Pixels | null>(null);
  const [work, setWork] = useState<Pixels | null>(null);
  const [history, setHistory] = useState<Pixels[]>([]);
  const [tool, setTool] = useState<Tool>('wand');
  const [tolerance, setTolerance] = useState(AUTO_BG_TOLERANCE);
  const [contiguous, setContiguous] = useState(true);
  const [brush, setBrush] = useState(20);
  const [zoom, setZoom] = useState(1);
  const [backdrop, setBackdrop] = useState<'checker' | 'dark' | 'pink'>('checker');
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** なぞっている最中の画像（イベントごとに再描画を待たずに書き込む） */
  const painting = useRef<Pixels | null>(null);

  useEffect(() => {
    if (!layer) return;
    let alive = true;
    Promise.all([dataUrlToPixels(store.assets[layer.originalAssetId]), dataUrlToPixels(store.assets[layer.assetId])]).then(
      ([o, w]) => {
        if (!alive) return;
        setOriginal(o);
        setWork(w);
      },
    );
    return () => {
      alive = false;
    };
    // ダイアログを開いたときに 1 回だけ読み込む
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !work) return;
    c.width = work.width;
    c.height = work.height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(work.data), work.width, work.height), 0, 0);
  }, [work]);

  if (!sticker || !layer) return null;

  const commit = (next: Pixels) => {
    if (work) setHistory((h) => [...h.slice(-19), work]);
    setWork(next);
  };

  const toImage = (e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, scale: c.width / r.width };
  };

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!work || !original) return;
    const p = toImage(e);
    if (tool === 'wand') {
      commit(removeColorAt(work, Math.floor(p.x), Math.floor(p.y), tolerance, contiguous));
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = clonePixels(work);
    paintBrush(next, original, p.x, p.y, brush * p.scale, tool);
    painting.current = next;
    commit(next);
  };

  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
    const target = painting.current;
    if (!target || !original || tool === 'wand') return;
    const p = toImage(e);
    // 履歴はなぞり始めに 1 回だけ積み、なぞっている間は同じバッファに描き足す
    paintBrush(target, original, p.x, p.y, brush * p.scale, tool);
    setWork({ ...target });
  };

  const apply = () => {
    if (!work) return;
    const id = store.addAsset(pixelsToDataUrl(work));
    store.updateSticker(sticker.id, (s) => ({ ...s, image: s.image && { ...s.image, assetId: id } }));
    onClose();
  };

  return (
    <Modal
      title="背景を消す・整える"
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={apply} disabled={!work}>
            この画像を使う
          </button>
        </>
      }
    >
      <div className="bg-tool">
        <div className="bg-controls">
          <div className="btn-row">
            <button
              className="primary"
              disabled={!original}
              onClick={() => original && commit(removeBackgroundAuto(original, tolerance))}
              title="画像の外周の色を背景とみなして、つながっている部分を透明にします"
            >
              ✨ 背景を自動で消す
            </button>
            <button disabled={!original} onClick={() => original && commit(clonePixels(original))}>
              元の画像に戻す
            </button>
          </div>
          <div className="seg vertical" role="group" aria-label="ツール">
            {TOOLS.map((t) => (
              <button key={t.id} className={tool === t.id ? 'on' : ''} onClick={() => setTool(t.id)} title={t.help}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="muted small">{TOOLS.find((t) => t.id === tool)!.help}</p>
          <label className="field slider">
            <span>
              色の許容範囲<output>{tolerance}</output>
            </span>
            <input type="range" min={1} max={150} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
          </label>
          {tool === 'wand' && (
            <label className="check">
              <input type="checkbox" checked={contiguous} onChange={(e) => setContiguous(e.target.checked)} />
              つながっている部分だけ消す
            </label>
          )}
          {tool !== 'wand' && (
            <label className="field slider">
              <span>
                ブラシの大きさ<output>{brush}px</output>
              </span>
              <input type="range" min={2} max={80} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
            </label>
          )}
          <label className="field slider">
            <span>
              表示倍率<output>{Math.round(zoom * 100)}%</output>
            </span>
            <input type="range" min={0.5} max={4} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <div className="seg" role="group" aria-label="確認用の背景">
            {(['checker', 'dark', 'pink'] as const).map((b) => (
              <button key={b} className={backdrop === b ? 'on' : ''} onClick={() => setBackdrop(b)}>
                {{ checker: '透過', dark: '黒', pink: 'ピンク' }[b]}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button
              disabled={!history.length}
              onClick={() => {
                setWork(history[history.length - 1]);
                setHistory((h) => h.slice(0, -1));
              }}
            >
              ↶ ひとつ戻す
            </button>
          </div>
          <p className="muted small">ヒント：黒やピンクの背景にすると、消し残しが見つけやすくなります。</p>
        </div>
        <div className={`bg-canvas-wrap backdrop-${backdrop}`}>
          {!work && <p className="muted">読み込み中…</p>}
          <div className="bg-canvas-inner" style={{ width: `${zoom * 100}%` }}>
            <canvas
              ref={canvasRef}
              style={{ cursor: tool === 'wand' ? 'crosshair' : 'none' }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => (painting.current = null)}
              onPointerCancel={() => (painting.current = null)}
              onPointerLeave={() => setCursor(null)}
            />
            {cursor && tool !== 'wand' && (
              <div
                className="brush-cursor"
                style={{ left: cursor.x, top: cursor.y, width: brush * 2, height: brush * 2 }}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
