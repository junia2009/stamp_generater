// LINE Creators Market「スタンプ」制作ガイドラインに基づく規格値
// https://creator.line.me/ja/guideline/sticker/

/** スタンプ画像の最大サイズ（偶数px）。本アプリは常にこのサイズのキャンバスで編集する */
export const STICKER_W = 370;
export const STICKER_H = 320;

/** 画像の周囲に必要な余白（目安 10px） */
export const SAFE_MARGIN = 10;

/** メイン画像（ストアで表示） */
export const MAIN_W = 240;
export const MAIN_H = 240;

/** トークルームタブ画像 */
export const TAB_W = 96;
export const TAB_H = 74;

/** 1セットで申請できるスタンプの個数 */
export const ALLOWED_COUNTS = [8, 16, 24, 32, 40] as const;

/** 1ファイルあたりの上限 */
export const MAX_FILE_BYTES = 1024 * 1024;

/** ZIP全体の上限 */
export const MAX_ZIP_BYTES = 60 * 1024 * 1024;

export function stickerFileName(index: number): string {
  return `${String(index + 1).padStart(2, '0')}.png`;
}
