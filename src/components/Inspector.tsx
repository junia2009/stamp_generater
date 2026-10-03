import { useRef, useState, type ReactNode } from 'react';
import { defaultTextFor, setImageForCurrent } from '../actions';
import { fitSticker } from '../lib/fit';
import { FONTS } from '../lib/fonts';
import { fitFontSize } from '../lib/render';
import { PHRASES, copyTextStyle, newId } from '../lib/project';
import type { Sticker, TextLayer } from '../lib/types';
import type { Store } from '../store';

const SWATCHES = ['#ffffff', '#222222', '#ff5a5f', '#ff9f1c', '#ffd23f', '#3bb273', '#2ec4b6', '#3a86ff', '#8338ec', '#ff70a6', '#8d6e63'];

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 1, unit = '', format, onChange } = props;
  return (
    <label className="field slider">
      <span>
        {label}
        <output>{format ? format(value) : `${Math.round(value * 10) / 10}${unit}`}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="colors">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        {SWATCHES.map((c) => (
          <button
            key={c}
            className={`swatch ${c === value ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      <header>
        <h3>{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Inspector({ store, onOpenBgRemoval }: { store: Store; onOpenBgRemoval: () => void }) {
  const { current: sticker, selection, setSelection, updateSticker, update, project, assets } = store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!sticker) return null;

  const edit = (fn: (s: Sticker) => Sticker, key?: string) => updateSticker(sticker.id, fn, key);
  const editText = (id: string, patch: Partial<TextLayer>, key?: string) =>
    edit((s) => ({ ...s, texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), key && `${key}-${id}`);

  const addText = () => {
    const t = defaultTextFor(sticker);
    // 直前の文字のスタイルを引き継ぐ
    const prev = sticker.texts.at(-1) ?? project.stickers.flatMap((s) => s.texts).at(-1);
    const layer = prev ? { ...copyTextStyle(prev, t), fontSize: t.fontSize, y: sticker.texts.length ? t.y - 70 : t.y } : t;
    edit((s) => ({ ...s, texts: [...s.texts, layer] }));
    setSelection({ kind: 'text', id: layer.id });
    setTimeout(() => {
      const el = document.getElementById(`text-input-${layer.id}`) as HTMLTextAreaElement | null;
      el?.focus();
      el?.select();
    }, 50);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      await setImageForCurrent(store, f, removeBg);
    } catch (e) {
      alert(`画像を読み込めませんでした：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const fit = async () => {
    const next = await fitSticker(sticker, assets);
    edit(() => next);
  };

  const applyToAll = (fn: (s: Sticker) => Sticker, what: string) => {
    if (!confirm(`${what}を全スタンプに適用しますか？`)) return;
    update((p) => ({ ...p, stickers: p.stickers.map((s) => (s.id === sticker.id ? s : fn(s))) }));
  };

  const img = sticker.image;
  const selectedText = selection?.kind === 'text' ? sticker.texts.find((t) => t.id === selection.id) : undefined;

  return (
    <aside className="inspector">
      <Panel title="レイアウト">
        <div className="btn-row">
          <button onClick={fit} title="フチ取りを含めて、余白ガイドにぴったり収まるよう拡大・中央寄せします">
            ✨ ぴったり合わせる
          </button>
        </div>
        <div className="btn-row">
          <label className="check">
            <input
              type="checkbox"
              checked={project.mainStickerId === sticker.id}
              onChange={(e) => update((p) => ({ ...p, mainStickerId: e.target.checked ? sticker.id : null }))}
            />
            メイン画像に使う
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={project.tabStickerId === sticker.id}
              onChange={(e) => update((p) => ({ ...p, tabStickerId: e.target.checked ? sticker.id : null }))}
            />
            タブ画像に使う
          </label>
        </div>
      </Panel>

      <Panel
        title="画像"
        actions={
          img && (
            <button className="link danger" onClick={() => edit((s) => ({ ...s, image: null }))}>
              削除
            </button>
          )
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          hidden
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="btn-row">
          <button className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? '読み込み中…' : img ? '🖼 画像を差し替え' : '🖼 画像を追加'}
          </button>
          {img && <button onClick={onOpenBgRemoval}>🪄 背景を消す・整える</button>}
        </div>
        <label className="check small">
          <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />
          取り込むときに背景を自動で透明にする
        </label>
        {img && (
          <>
            <Slider
              label="大きさ"
              value={img.scale}
              min={0.05}
              max={3}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => edit((s) => ({ ...s, image: s.image && { ...s.image, scale: v } }), 'img-scale')}
            />
            <Slider
              label="回転"
              value={img.rotation}
              min={-180}
              max={180}
              unit="°"
              onChange={(v) => edit((s) => ({ ...s, image: s.image && { ...s.image, rotation: v } }), 'img-rot')}
            />
            <div className="btn-row">
              <button onClick={() => edit((s) => ({ ...s, image: s.image && { ...s.image, flipX: !s.image.flipX } }))}>
                ↔ 左右反転
              </button>
              <button onClick={() => edit((s) => ({ ...s, image: s.image && { ...s.image, x: 0, y: 0 } }))}>中央へ</button>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="文字"
        actions={
          <button className="link" onClick={addText}>
            ＋ 文字を追加
          </button>
        }
      >
        {sticker.texts.length === 0 && <p className="muted">「＋ 文字を追加」でセリフを入れられます。</p>}
        <div className="text-list">
          {sticker.texts.map((t) => (
            <button
              key={t.id}
              className={`text-chip ${selectedText?.id === t.id ? 'on' : ''}`}
              style={{ fontFamily: `"${t.fontFamily}"`, color: t.color }}
              onClick={() => setSelection({ kind: 'text', id: t.id })}
            >
              {t.text.trim() || '（空）'}
            </button>
          ))}
        </div>
        {selectedText && (
          <TextEditor
            key={selectedText.id}
            t={selectedText}
            onChange={(patch, key) => editText(selectedText.id, patch, key)}
            onDelete={() => {
              edit((s) => ({ ...s, texts: s.texts.filter((x) => x.id !== selectedText.id) }));
              setSelection(null);
            }}
            onDuplicate={() => {
              const copy = { ...selectedText, id: newId(), x: selectedText.x + 12, y: selectedText.y + 12 };
              edit((s) => ({ ...s, texts: [...s.texts, copy] }));
              setSelection({ kind: 'text', id: copy.id });
            }}
            onApplyAll={() =>
              applyToAll(
                (s) => ({ ...s, texts: s.texts.map((x) => copyTextStyle(selectedText, x)) }),
                'この文字のフォント・色・縁取り',
              )
            }
          />
        )}
      </Panel>

      <Panel
        title="フチ取り（スタンプの白フチ）"
        actions={
          <button className="link" onClick={() => applyToAll((s) => ({ ...s, outline: { ...sticker.outline } }), 'フチ取りの設定')}>
            全スタンプに適用
          </button>
        }
      >
        <label className="check">
          <input
            type="checkbox"
            checked={sticker.outline.enabled}
            onChange={(e) => edit((s) => ({ ...s, outline: { ...s.outline, enabled: e.target.checked } }))}
          />
          フチ取りをつける
        </label>
        {sticker.outline.enabled && (
          <>
            <Slider
              label="太さ"
              value={sticker.outline.width}
              min={1}
              max={20}
              unit="px"
              onChange={(v) => edit((s) => ({ ...s, outline: { ...s.outline, width: v } }), 'outline-w')}
            />
            <ColorField
              label="色"
              value={sticker.outline.color}
              onChange={(v) => edit((s) => ({ ...s, outline: { ...s.outline, color: v } }), 'outline-c')}
            />
          </>
        )}
      </Panel>
    </aside>
  );
}

function TextEditor({
  t,
  onChange,
  onDelete,
  onDuplicate,
  onApplyAll,
}: {
  t: TextLayer;
  onChange: (patch: Partial<TextLayer>, coalesceKey?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onApplyAll: () => void;
}) {
  return (
    <div className="text-editor">
      <textarea
        id={`text-input-${t.id}`}
        rows={2}
        value={t.text}
        placeholder="セリフを入力（改行できます）"
        onChange={(e) => onChange({ text: e.target.value }, 'text')}
      />
      <select
        className="phrase-select"
        value=""
        onChange={(e) => e.target.value && onChange({ text: e.target.value })}
        aria-label="セリフ候補"
      >
        <option value="">💬 よく使うセリフから選ぶ…</option>
        {PHRASES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <label className="field">
        <span>フォント</span>
        <select value={t.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} style={{ fontFamily: `"${t.fontFamily}"` }}>
          {FONTS.map((f) => (
            <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <div className="btn-row">
        <label className="check">
          <input type="checkbox" checked={t.bold} onChange={(e) => onChange({ bold: e.target.checked })} />
          太字
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={t.vertical}
            onChange={(e) => {
              const next = { ...t, vertical: e.target.checked };
              // 縦横を切り替えるとはみ出しやすいので、収まる大きさまで縮める
              onChange({ vertical: next.vertical, fontSize: Math.min(t.fontSize, fitFontSize(next, 320, 280, 200)) });
            }}
          />
          縦書き
        </label>
      </div>
      <Slider label="文字の大きさ" value={t.fontSize} min={12} max={200} unit="px" onChange={(v) => onChange({ fontSize: v }, 'size')} />
      <ColorField label="文字の色" value={t.color} onChange={(v) => onChange({ color: v }, 'color')} />
      <Slider label="縁取りの太さ" value={t.strokeWidth} min={0} max={20} step={0.5} unit="px" onChange={(v) => onChange({ strokeWidth: v }, 'sw')} />
      {t.strokeWidth > 0 && <ColorField label="縁取りの色" value={t.strokeColor} onChange={(v) => onChange({ strokeColor: v }, 'sc')} />}
      <Slider label="回転" value={t.rotation} min={-180} max={180} unit="°" onChange={(v) => onChange({ rotation: v }, 'rot')} />
      {t.text.includes('\n') && (
        <Slider label="行間" value={t.lineHeight} min={0.7} max={2} step={0.05} onChange={(v) => onChange({ lineHeight: v }, 'lh')} />
      )}
      <div className="btn-row">
        <button onClick={() => onChange({ x: 0 })}>左右中央へ</button>
        <button onClick={onDuplicate}>複製</button>
        <button className="danger" onClick={onDelete}>
          削除
        </button>
      </div>
      <button className="link" onClick={onApplyAll}>
        この文字スタイルを全スタンプの文字に適用
      </button>
    </div>
  );
}
