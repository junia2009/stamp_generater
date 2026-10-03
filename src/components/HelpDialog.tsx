import { Modal } from './Modal';

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="LINE スタンプメーカーへようこそ"
      onClose={onClose}
      footer={
        <button className="primary" onClick={onClose}>
          はじめる
        </button>
      }
    >
      <div className="help">
        <h4>つくりかた</h4>
        <ol>
          <li>
            左の <b>「📁 画像をまとめて追加」</b> でイラストや写真を読み込みます（画面にドラッグ＆ドロップも OK）。
            単色の背景は自動で透明になります。
          </li>
          <li>
            右の <b>「🪄 背景を消す・整える」</b> で、消し残しを自動選択・消しゴムで仕上げます。
          </li>
          <li>
            <b>「＋ 文字を追加」</b> でセリフを入れます。左の <b>「💬 空のスタンプにセリフを入れる」</b> で一括入力もできます。
          </li>
          <li>
            <b>「✨ ぴったり合わせる」</b> で、白フチ込みでちょうどよい大きさに整えます。
          </li>
          <li>
            <b>「👀 プレビュー」</b> でトーク画面での見え方を確認し、<b>「📦 書き出し」</b> で申請用 ZIP をダウンロード。
            <a href="https://creator.line.me/ja/" target="_blank" rel="noreferrer">
              LINE Creators Market
            </a>{' '}
            にそのままアップロードできます。
          </li>
        </ol>
        <h4>LINE スタンプの規格（自動で守られます）</h4>
        <ul>
          <li>スタンプ画像：最大 370×320px・偶数サイズ・背景透過 PNG・1 枚 1MB 以下・周囲に 10px ほどの余白</li>
          <li>メイン画像：240×240px ／ トークルームタブ画像：96×74px</li>
          <li>個数：8・16・24・32・40 個のいずれか</li>
        </ul>
        <h4>データについて</h4>
        <p className="muted">
          画像はすべてお使いのブラウザ内だけで処理され、外部には送信されません。作業内容はこのブラウザに自動保存されます。
          別の端末へ移すときは「メニュー → バックアップを保存」をご利用ください。
        </p>
        <p className="muted small">
          ※ 文字のフォントはすべて商用利用可能なフリーフォント（SIL Open Font License）です。他人の著作物・写真を無断で使ったスタンプは審査に通りません。
        </p>
      </div>
    </Modal>
  );
}
