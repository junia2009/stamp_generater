import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** 新しいバージョンがあるか 1 時間ごとに確認する */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function PwaToast({ beforeUpdate }: { beforeUpdate: () => Promise<void> }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => reg.update().catch(() => {}), UPDATE_CHECK_MS);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (needRefresh) {
    return (
      <div className="toast" role="status">
        <span>新しいバージョンがあります。</span>
        <button
          className="primary"
          onClick={async () => {
            // 再読み込みの前に作業内容を確実に保存する
            await beforeUpdate().catch(() => {});
            await updateServiceWorker(true);
          }}
        >
          更新する
        </button>
        <button onClick={() => setNeedRefresh(false)}>あとで</button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className="toast" role="status">
        <span>✅ オフラインでも使えるようになりました。</span>
        <button onClick={() => setOfflineReady(false)}>OK</button>
      </div>
    );
  }
  return null;
}
