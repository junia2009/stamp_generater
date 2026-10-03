import { useEffect, useState } from 'react';
import { downloadBlob, exportSinglePng, exportZip, renderMainAndTab } from '../lib/exporter';
import { ALLOWED_COUNTS } from '../lib/spec';
import { validateProject, type Issue } from '../lib/validate';
import type { Store } from '../store';
import { Modal } from './Modal';

function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim() || 'stickers';
}

export function ExportDialog({ store, onClose }: { store: Store; onClose: () => void }) {
  const { project, assets, setCurrentIndex } = store;
  const [trim, setTrim] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>(() => validateProject(project));
  const [done, setDone] = useState(false);
  const [previews, setPreviews] = useState<{ main: string; tab: string } | null>(null);

  useEffect(() => {
    let alive = true;
    renderMainAndTab(project, assets).then(({ main, tab }) => {
      if (alive) setPreviews({ main: main.toDataURL(), tab: tab.toDataURL() });
    });
    return () => {
      alive = false;
    };
  }, [project, assets]);

  const run = async () => {
    setDone(false);
    setProgress('準備中…');
    try {
      const r = await exportZip(project, assets, { trim }, (d, t) => setProgress(`画像を作成中… ${d}/${t}`));
      setIssues(r.issues);
      if (r.zip) {
        downloadBlob(r.zip, `${safeFileName(project.title)}.zip`);
        setDone(true);
      }
    } catch (e) {
      alert(`書き出しに失敗しました：${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <Modal
      title="LINE Creators Market 用に書き出す"
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose}>閉じる</button>
          <button className="primary" onClick={run} disabled={!!progress}>
            {progress ?? '📦 ZIP をダウンロード'}
          </button>
        </>
      }
    >
      <div className="export">
        <div>
          <h4>書き出される内容</h4>
          <ul className="spec-list">
            <li>
              <b>01.png 〜 {String(project.stickers.length).padStart(2, '0')}.png</b>：スタンプ画像（最大 370×320px・透過 PNG）
            </li>
            <li>
              <b>main.png</b>：メイン画像（240×240px）
            </li>
            <li>
              <b>tab.png</b>：トークルームタブ画像（96×74px）
            </li>
          </ul>
          <label className="check">
            <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
            各スタンプの余白をカットして、絵の大きさぴったりで書き出す
          </label>
          <p className="muted small">
            チェックなしでは全画像を 370×320px で書き出します。どちらもガイドラインの範囲内です。
          </p>

          {previews && (
            <div className="main-tab">
              <figure>
                <img src={previews.main} width={120} height={120} alt="メイン画像" className="checker" />
                <figcaption>main.png</figcaption>
              </figure>
              <figure>
                <img src={previews.tab} width={96} height={74} alt="タブ画像" className="checker" />
                <figcaption>tab.png</figcaption>
              </figure>
              <p className="muted small">変更するには、スタンプ編集画面の「メイン画像に使う」「タブ画像に使う」にチェックします。</p>
            </div>
          )}
        </div>

        <div>
          <h4>チェック結果</h4>
          {errors.length === 0 && warnings.length === 0 && <p className="ok-text">✅ 問題は見つかりませんでした。</p>}
          {done && <p className="ok-text">✅ ダウンロードしました。LINE Creators Market の「スタンプ画像」から ZIP をアップロードしてください。</p>}
          <ul className="issues">
            {[...errors, ...warnings].map((i, k) => (
              <li key={k} className={i.level}>
                <span>{i.level === 'error' ? '⛔' : '⚠️'}</span>
                <span>{i.message}</span>
                {i.index !== undefined && (
                  <button
                    className="link"
                    onClick={() => {
                      setCurrentIndex(i.index!);
                      onClose();
                    }}
                  >
                    直す
                  </button>
                )}
              </li>
            ))}
          </ul>
          {errors.length > 0 && <p className="muted small">⛔ のエラーがあると ZIP は作成されません。⚠️ は確認のみで書き出せます。</p>}
          <p className="muted small">申請できる個数：{ALLOWED_COUNTS.join(' / ')} 個</p>

          <h4>1 枚ずつ保存</h4>
          <div className="btn-row">
            <button
              onClick={async () =>
                downloadBlob(await exportSinglePng(project, assets, store.currentIndex, trim), `${String(store.currentIndex + 1).padStart(2, '0')}.png`)
              }
            >
              編集中のスタンプを PNG で保存
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
