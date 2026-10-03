export interface ImageLayer {
  /** assets マップのキー（背景除去済みの画像 dataURL を指す） */
  assetId: string;
  /** 元画像の assetId（背景除去をやり直すときに使う） */
  originalAssetId: string;
  /** キャンバス中心からの位置（px, 370x320 座標系） */
  x: number;
  y: number;
  /** 1 = 画像の元の大きさ */
  scale: number;
  /** 度 */
  rotation: number;
  flipX: boolean;
}

export interface TextLayer {
  id: string;
  text: string;
  /** キャンバス中心からの位置 */
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  color: string;
  strokeColor: string;
  /** 0 で縁取りなし */
  strokeWidth: number;
  rotation: number;
  vertical: boolean;
  /** 行間（フォントサイズに対する倍率） */
  lineHeight: number;
}

export interface OutlineSetting {
  enabled: boolean;
  width: number;
  color: string;
}

export interface Sticker {
  id: string;
  image: ImageLayer | null;
  texts: TextLayer[];
  outline: OutlineSetting;
}

export interface Project {
  version: 1;
  title: string;
  /** 申請予定の個数（8/16/24/32/40） */
  targetCount: number;
  stickers: Sticker[];
  /** main.png / tab.png の元にするスタンプ ID */
  mainStickerId: string | null;
  tabStickerId: string | null;
}

/** 画像本体（dataURL）。履歴（Undo）に含めないよう Project とは別管理 */
export type Assets = Record<string, string>;

export type Selection = { kind: 'image' } | { kind: 'text'; id: string } | null;
