import { memo, useEffect, useRef, useState } from 'react';
import { useDataUrl, useRenderedSticker } from '../hooks';
import { isStickerEmpty } from '../lib/project';
import type { Assets, Sticker } from '../lib/types';
import type { Store } from '../store';
import { Modal } from './Modal';

/** LINE ではスタンプ画像が @2x として扱われ、370px の画像はおよそ 185pt で表示される */
const StickerImg = memo(function StickerImg({ sticker, assets, className }: { sticker: Sticker; assets: Assets; className?: string }) {
  const url = useDataUrl(useRenderedSticker(sticker, assets, 1));
  return url ? <img className={className} src={url} alt="" /> : <div className={className} />;
});

const THEMES = [
  { id: 'default', label: 'ブルー', bg: '#8cabd9' },
  { id: 'white', label: 'ホワイト', bg: '#ffffff' },
  { id: 'dark', label: 'ダーク', bg: '#1f1f1f' },
  { id: 'pink', label: 'ピンク', bg: '#f6c5d5' },
];

interface Message {
  me: boolean;
  sticker?: Sticker;
  text?: string;
}

export function PreviewDialog({ store, onClose }: { store: Store; onClose: () => void }) {
  const stickers = store.project.stickers.filter((s) => !isStickerEmpty(s));
  const [theme, setTheme] = useState(THEMES[0]);
  const [messages, setMessages] = useState<Message[]>(() => [
    { me: false, text: '新しいスタンプできた？' },
    ...(stickers[0] ? [{ me: true, sticker: stickers[0] }] : []),
    { me: false, text: 'かわいい！他のも見せて' },
    ...(stickers[1] ? [{ me: true, sticker: stickers[1] }] : []),
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages]);

  return (
    <Modal title="トーク画面でプレビュー" onClose={onClose} wide>
      <div className="preview">
        <div className="phone">
          <div className="phone-header">◀ ともだち</div>
          <div className="chat" style={{ background: theme.bg }}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.me ? 'me' : 'them'}`}>
                {m.sticker ? (
                  <StickerImg sticker={m.sticker} assets={store.assets} className="chat-sticker" />
                ) : (
                  <span className="bubble">{m.text}</span>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="keyboard">
            {stickers.length === 0 && <p className="muted">まだスタンプがありません</p>}
            {stickers.map((s) => (
              <button key={s.id} onClick={() => setMessages((m) => [...m, { me: true, sticker: s }])} title="送信">
                <StickerImg sticker={s} assets={store.assets} />
              </button>
            ))}
          </div>
        </div>
        <div className="preview-side">
          <p>下のスタンプ一覧をタップすると、トークに送信したときの見え方を確認できます。</p>
          <p className="muted small">実際の LINE とほぼ同じ大きさ（画像の半分のサイズ）で表示しています。</p>
          <div className="seg vertical" role="group" aria-label="トーク背景">
            {THEMES.map((t) => (
              <button key={t.id} className={theme.id === t.id ? 'on' : ''} onClick={() => setTheme(t)}>
                <span className="dot" style={{ background: t.bg }} /> {t.label}
              </button>
            ))}
          </div>
          <button onClick={() => setMessages([])}>トークをクリア</button>
        </div>
      </div>
    </Modal>
  );
}
