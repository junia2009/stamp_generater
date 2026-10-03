import { DEFAULT_FONT } from './fonts';
import type { OutlineSetting, Project, Sticker, TextLayer } from './types';

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const DEFAULT_OUTLINE: OutlineSetting = { enabled: true, width: 6, color: '#ffffff' };

export function createSticker(partial: Partial<Sticker> = {}): Sticker {
  return {
    id: newId(),
    image: null,
    texts: [],
    outline: { ...DEFAULT_OUTLINE },
    ...partial,
  };
}

export function createText(partial: Partial<TextLayer> = {}): TextLayer {
  return {
    id: newId(),
    text: 'テキスト',
    x: 0,
    y: 100,
    fontFamily: DEFAULT_FONT,
    fontSize: 56,
    bold: true,
    color: '#ff5a5f',
    strokeColor: '#ffffff',
    strokeWidth: 6,
    rotation: 0,
    vertical: false,
    lineHeight: 1.15,
    ...partial,
  };
}

export function createProject(count = 8): Project {
  return {
    version: 1,
    title: 'マイスタンプ',
    targetCount: count,
    stickers: Array.from({ length: count }, () => createSticker()),
    mainStickerId: null,
    tabStickerId: null,
  };
}

export function isStickerEmpty(s: Sticker): boolean {
  return !s.image && s.texts.every((t) => !t.text.trim());
}

/** スタンプを複製（ID を振り直す） */
export function cloneSticker(s: Sticker): Sticker {
  return {
    ...structuredClone(s),
    id: newId(),
    texts: s.texts.map((t) => ({ ...t, id: newId() })),
  };
}

/** 文字スタイル（文言・位置以外）を他のテキストへコピーする */
export function copyTextStyle(from: TextLayer, to: TextLayer): TextLayer {
  return {
    ...to,
    fontFamily: from.fontFamily,
    fontSize: from.fontSize,
    bold: from.bold,
    color: from.color,
    strokeColor: from.strokeColor,
    strokeWidth: from.strokeWidth,
    vertical: from.vertical,
    lineHeight: from.lineHeight,
  };
}

/** スタンプ全体（画像・文字）を中心基準で拡大縮小・移動する */
export function transformSticker(s: Sticker, scale: number, dx: number, dy: number): Sticker {
  return {
    ...s,
    image: s.image
      ? { ...s.image, scale: s.image.scale * scale, x: s.image.x * scale + dx, y: s.image.y * scale + dy }
      : null,
    texts: s.texts.map((t) => ({
      ...t,
      x: t.x * scale + dx,
      y: t.y * scale + dy,
      fontSize: Math.max(8, Math.round(t.fontSize * scale)),
      strokeWidth: Math.round(t.strokeWidth * scale * 2) / 2,
    })),
  };
}

/** よく使うセリフ（40 個セットまで埋められる） */
export const PHRASES = [
  'おはよう', 'おやすみ', 'ありがとう', 'OK!', 'りょうかい', 'よろしく',
  'おつかれさま', 'ごめんね', 'えらい！', 'すごい！', 'いいね！', 'うれしい',
  'かなしい', 'びっくり', 'おめでとう', 'ファイト！', 'まってて', 'いまどこ？',
  'いってきます', 'ただいま', 'おかえり', 'ごはんたべた？', 'なるほど', 'ほんとに！？',
  'ちょっとまって', 'わかった', 'NO!', 'はーい', 'ねむい…', 'おなかすいた',
  'たのしみ！', 'がんばって', 'だいすき', 'ありがと〜', 'ドンマイ', 'それな',
  'お願い！', 'ゆるして', 'いえーい', 'またね',
];
