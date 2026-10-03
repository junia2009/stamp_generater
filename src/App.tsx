import { useEffect, useRef, useState } from 'react';
import { importImages } from './actions';
import { BgRemovalDialog } from './components/BgRemovalDialog';
import { Editor } from './components/Editor';
import { ExportDialog } from './components/ExportDialog';
import { HelpDialog } from './components/HelpDialog';
import { Inspector } from './components/Inspector';
import { PreviewDialog } from './components/PreviewDialog';
import { StickerList } from './components/StickerList';
import { downloadBlob } from './lib/exporter';
import { createProject, createSticker, isStickerEmpty } from './lib/project';
import { ALLOWED_COUNTS } from './lib/spec';
import { fromBackupFile, loadLocal, saveLocal, toBackupBlob } from './lib/storage';
import { useStore } from './store';

type Dialog = 'bg' | 'preview' | 'export' | 'help' | null;

export function App() {
  const store = useStore();
  const { project, assets, update, undo, redo, canUndo, canRedo, current, selection, updateSticker, setSelection } = store;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [dropping, setDropping] = useState(false);
  const backupRef = useRef<HTMLInputElement>(null);

  // 起動時に前回の作業を復元
  useEffect(() => {
    loadLocal().then((d) => {
      if (d) store.load(d.project, d.assets);
      else setDialog('help');
      setLoaded(true);
    });
  }, []);

  // 自動保存
  useEffect(() => {
    if (!loaded) return;
    setSaveState('saving');
    const t = setTimeout(() => {
      saveLocal(project, assets)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 600);
    return () => clearTimeout(t);
  }, [project, assets, loaded]);

  // キーボードショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text');
      const inForm = typing || el.tagName === 'INPUT' || el.tagName === 'SELECT';
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        redo();
        return;
      }
      if (inForm || dialog || !current || !selection) return;
      const step = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (delta[e.key]) {
        e.preventDefault();
        const [dx, dy] = delta[e.key];
        updateSticker(
          current.id,
          (s) =>
            selection.kind === 'image'
              ? { ...s, image: s.image && { ...s.image, x: s.image.x + dx, y: s.image.y + dy } }
              : { ...s, texts: s.texts.map((t) => (t.id === selection.id ? { ...t, x: t.x + dx, y: t.y + dy } : t)) },
          'nudge',
        );
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        updateSticker(current.id, (s) =>
          selection.kind === 'image' ? { ...s, image: null } : { ...s, texts: s.texts.filter((t) => t.id !== selection.id) },
        );
        setSelection(null);
      } else if (e.key === 'Escape') {
        setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, dialog, current, selection, updateSticker, setSelection]);

  const changeCount = (count: number) => {
    const n = project.stickers.length;
    if (count > n) {
      update((p) => ({ ...p, targetCount: count, stickers: [...p.stickers, ...Array.from({ length: count - n }, () => createSticker())] }));
      return;
    }
    // 後ろの空のスタンプだけを削る
    let stickers = project.stickers.slice();
    while (stickers.length > count && isStickerEmpty(stickers[stickers.length - 1])) stickers = stickers.slice(0, -1);
    if (stickers.length > count) {
      alert(`作成済みのスタンプが ${stickers.length} 個あるため、${count} 個にするには不要なスタンプを削除してください。`);
    }
    update((p) => ({ ...p, targetCount: count, stickers }));
  };

  const newProject = () => {
    if (!confirm('今のスタンプを消して新しく作り始めますか？（必要なら先に「バックアップを保存」してください）')) return;
    store.load(createProject(), {});
  };

  const onDrop = async (e: React.DragEvent) => {
    setDropping(false);
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    e.preventDefault();
    const r = await importImages(store, files, true);
    if (r.skipped) alert(`スタンプは最大 40 個までです。${r.skipped} 枚は追加できませんでした。`);
  };

  const countValue = (ALLOWED_COUNTS as readonly number[]).includes(project.stickers.length) ? project.stickers.length : '';

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={onDrop}
    >
      <header className="topbar">
        <div className="brand">
          <span className="logo">S</span>
          <input
            className="title-input"
            value={project.title}
            onChange={(e) => update((p) => ({ ...p, title: e.target.value }), 'title')}
            aria-label="スタンプのタイトル"
            maxLength={40}
          />
        </div>
        <div className="top-actions">
          <label className="count-select">
            個数
            <select value={countValue} onChange={(e) => changeCount(Number(e.target.value))}>
              {countValue === '' && <option value="">{project.stickers.length} 個</option>}
              {ALLOWED_COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c} 個
                </option>
              ))}
            </select>
          </label>
          <button onClick={undo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">
            ↶
          </button>
          <button onClick={redo} disabled={!canRedo} title="やり直す (Ctrl+Shift+Z)">
            ↷
          </button>
          <span className={`save-state ${saveState}`}>
            {{ saved: '保存済み', saving: '保存中…', error: '保存できません' }[saveState]}
          </span>
          <details className="menu">
            <summary>メニュー</summary>
            <div className="menu-items" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open')}>
              <button onClick={newProject}>新しく作る</button>
              <button onClick={() => downloadBlob(toBackupBlob(project, assets), `${project.title || 'stickers'}.stamp.json`)}>
                バックアップを保存
              </button>
              <button onClick={() => backupRef.current?.click()}>バックアップを開く</button>
              <button onClick={() => setDialog('help')}>使い方・規格</button>
            </div>
          </details>
          <input
            ref={backupRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const d = await fromBackupFile(f);
                store.load(d.project, d.assets);
              } catch (err) {
                alert((err as Error).message);
              }
            }}
          />
          <button onClick={() => setDialog('preview')}>👀 プレビュー</button>
          <button className="primary" onClick={() => setDialog('export')}>
            📦 書き出し
          </button>
        </div>
      </header>

      <main className="workspace">
        <StickerList store={store} />
        <Editor store={store} />
        <Inspector store={store} onOpenBgRemoval={() => setDialog('bg')} />
      </main>

      {dropping && <div className="drop-overlay">画像をドロップしてスタンプに追加</div>}
      {dialog === 'bg' && <BgRemovalDialog store={store} onClose={() => setDialog(null)} />}
      {dialog === 'preview' && <PreviewDialog store={store} onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog store={store} onClose={() => setDialog(null)} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
