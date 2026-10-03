// すべて SIL Open Font License（商用利用可・LINE スタンプ販売に使用可）の Google Fonts
export interface FontOption {
  family: string;
  label: string;
}

export const FONTS: FontOption[] = [
  { family: 'M PLUS Rounded 1c', label: 'M PLUS Rounded（丸ゴシック）' },
  { family: 'Zen Maru Gothic', label: 'Zen 丸ゴシック' },
  { family: 'Kosugi Maru', label: '小杉丸ゴシック' },
  { family: 'Mochiy Pop One', label: 'もっちりポップ' },
  { family: 'Dela Gothic One', label: 'デラゴシック（極太）' },
  { family: 'RocknRoll One', label: 'ロックンロール' },
  { family: 'Reggae One', label: 'レゲエ' },
  { family: 'Rampart One', label: 'ランパート（立体）' },
  { family: 'Hachi Maru Pop', label: 'はちまるポップ（手書き風）' },
  { family: 'Yusei Magic', label: 'ユーセイマジック（マジック風）' },
  { family: 'Yomogi', label: 'よもぎ（手書き）' },
  { family: 'Kaisei Decol', label: '解星デコール（明朝）' },
  { family: 'DotGothic16', label: 'ドットゴシック' },
];

export const DEFAULT_FONT = FONTS[0].family;

export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  [
    'M+PLUS+Rounded+1c:wght@400;800',
    'Zen+Maru+Gothic:wght@500;900',
    'Kosugi+Maru',
    'Mochiy+Pop+One',
    'Dela+Gothic+One',
    'RocknRoll+One',
    'Reggae+One',
    'Rampart+One',
    'Hachi+Maru+Pop',
    'Yusei+Magic',
    'Yomogi',
    'Kaisei+Decol:wght@400;700',
    'DotGothic16',
  ]
    .map((f) => `family=${f}`)
    .join('&') +
  '&display=swap';

export function fontString(family: string, size: number, bold: boolean): string {
  return `${bold ? 800 : 400} ${size}px "${family}", sans-serif`;
}

/**
 * Canvas に描く前に、使う文字のグリフを確実に読み込む。
 * 日本語フォントは文字範囲ごとに分割配信されるため、実際の文字列を渡す必要がある。
 */
export async function ensureFontLoaded(family: string, bold: boolean, text: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await document.fonts.load(fontString(family, 40, bold), text || 'あ');
  } catch {
    // オフライン時などはフォールバックフォントで描画する
  }
}
