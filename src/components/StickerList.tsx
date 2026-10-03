import { memo, useRef, useState } from 'react';
import { fillPhrases, importImages } from '../actions';
import { useDataUrl, useRenderedSticker } from '../hooks';
import { cloneSticker, createSticker, isStickerEmpty } from '../lib/project';
import { ALLOWED_COUNTS, stickerFileName } from '../lib/spec';
import type { Assets, Sticker } from '../lib/types';
import type { Store } from '../store';

const Thumb = memo(function Thumb({ sticker, assets }: { sticker: Sticker; assets: Assets }) {
  const canvas = useRenderedSticker(sticker, assets, 0.5);
  const url = useDataUrl(canvas);
  if (isStickerEmpty(sticker)) return <div className="thumb-empty">空</div>;
  return url ? <img src={url} alt="" draggable={false} /> : <div className="thumb-empty">…</div>;
});

export function StickerList({ store }: { store: Store }) {
  const { project, assets, currentIndex, setCurrentIndex, update } = store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const n = project.stickers.length;
  const filled = project.stickers.filter((s) => !isStickerEmpty(s)).length;
  const nextAllowed = ALLOWED_COUNTS.find((c) => c >= n);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= n || from === to) return;
    update((p) => {
      const stickers = p.stickers.slice();
      const [s] = stickers.splice(from, 1);
      stickers.splice(to, 0, s);
      return { ...p, stickers };
    });
    setCurrentIndex(to);
  };

  const add = () => {
    update((p) => ({ ...p, stickers: [...p.stickers, createSticker()] }));
    setCurrentIndex(n);
  };

  const duplicate = () => {
    update((p) => {
      const stickers = p.stickers.slice();
      stickers.splice(currentIndex + 1, 0, cloneSticker(p.stickers[currentIndex]));
      return { ...p, stickers };
    });
    setCurrentIndex(currentIndex + 1);
  };

  const remove = () => {
    if (n <= 1) return;
    const s = project.stickers[currentIndex];
    if (!isStickerEmpty(s) && !confirm(`${stickerFileName(currentIndex)} を削除しますか？`)) return;
    update((p) => ({
      ...p,
      stickers: p.stickers.filter((_, i) => i !== currentIndex),
      mainStickerId: p.mainStickerId === s.id ? null : p.mainStickerId,
      tabStickerId: p.tabStickerId === s.id ? null : p.tabStickerId,
    }));
    setCurrentIndex(Math.max(0, currentIndex - 1));
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setProgress('読み込み中…');
    try {
      const r = await importImages(store, [...files], removeBg, (d, t) => setProgress(`読み込み中… ${d}/${t}`));
      if (r.skipped) alert(`スタンプは最大 40 個までです。${r.skipped} 枚は追加できませんでした。`);
    } catch (e) {
      alert(`画像を読み込めませんでした：${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <nav className="sticker-list">
      <header>
        <h3>
          スタンプ <small>{filled}/{n} 作成済み</small>
        </h3>
        {nextAllowed !== n && (
          <p className="warn-text">
            {nextAllowed ? `あと ${nextAllowed - n} 個で ${nextAllowed} 個セット` : '40 個を超えています'}
          </p>
        )}
      </header>
      <ol className="thumbs">
        {project.stickers.map((s, i) => (
          <li key={s.id}>
            <button
              className={`thumb ${i === currentIndex ? 'on' : ''} ${dragFrom === i ? 'dragging' : ''}`}
              onClick={() => setCurrentIndex(i)}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDragFrom(null)}
              onDragOver={(e) => dragFrom !== null && e.preventDefault()}
              onDrop={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.stopPropagation();
                move(dragFrom, i);
                setDragFrom(null);
              }}
              aria-label={`スタンプ ${i + 1}`}
            >
              <Thumb sticker={s} assets={assets} />
              <span className="num">{i + 1}</span>
              {project.mainStickerId === s.id && <span className="badge main">メイン</span>}
              {project.tabStickerId === s.id && <span className="badge tab">タブ</span>}
            </button>
          </li>
        ))}
        {n < 40 && (
          <li>
            <button className="thumb add" onClick={add} aria-label="スタンプを追加">
              ＋
            </button>
          </li>
        )}
      </ol>
      <div className="list-actions">
        <button onClick={() => move(currentIndex, currentIndex - 1)} disabled={currentIndex === 0} title="前へ移動">
          ◀
        </button>
        <button onClick={() => move(currentIndex, currentIndex + 1)} disabled={currentIndex === n - 1} title="後ろへ移動">
          ▶
        </button>
        <button onClick={duplicate} disabled={n >= 40}>
          複製
        </button>
        <button className="danger" onClick={remove} disabled={n <= 1}>
          削除
        </button>
      </div>
      <div className="bulk">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          multiple
          hidden
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button className="primary" disabled={!!progress} onClick={() => fileRef.current?.click()}>
          {progress ?? '📁 画像をまとめて追加'}
        </button>
        <label className="check small">
          <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />
          背景を自動で透明にする
        </label>
        <button
          onClick={() => {
            const c = fillPhrases(store);
            if (!c) alert('文字が空のスタンプがありません。');
          }}
        >
          💬 空のスタンプにセリフを入れる
        </button>
      </div>
    </nav>
  );
}
