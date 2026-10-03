import { isStickerEmpty } from './project';
import { ALLOWED_COUNTS, MAX_FILE_BYTES, SAFE_MARGIN, STICKER_H, STICKER_W, stickerFileName } from './spec';
import type { Project } from './types';

export interface RenderedInfo {
  /** 書き出す PNG のバイト数 */
  bytes: number;
  width: number;
  height: number;
  /** 中身の外接矩形（何もなければ null） */
  bounds: { x: number; y: number; width: number; height: number } | null;
  hasTransparency: boolean;
}

export interface Issue {
  level: 'error' | 'warning';
  message: string;
  /** 対象スタンプの番号（0 始まり）。全体の問題なら undefined */
  index?: number;
}

/** 描画前に判定できる問題 */
export function validateProject(project: Project): Issue[] {
  const issues: Issue[] = [];
  const n = project.stickers.length;
  if (!(ALLOWED_COUNTS as readonly number[]).includes(n)) {
    const next = ALLOWED_COUNTS.find((c) => c >= n);
    issues.push({
      level: 'error',
      message: `スタンプの個数は ${ALLOWED_COUNTS.join(' / ')} 個のいずれかにする必要があります（現在 ${n} 個${
        next ? `。あと ${next - n} 個で ${next} 個セット` : ''
      }）。`,
    });
  }
  project.stickers.forEach((s, i) => {
    if (isStickerEmpty(s)) {
      issues.push({ level: 'error', index: i, message: `${stickerFileName(i)}：画像も文字もありません。` });
    }
  });
  if (!project.title.trim()) {
    issues.push({ level: 'warning', message: 'タイトルが空です（申請時にも入力が必要です）。' });
  }
  return issues;
}

/** 描画結果から判定できる問題 */
export function validateRendered(infos: RenderedInfo[]): Issue[] {
  const issues: Issue[] = [];
  infos.forEach((info, i) => {
    const name = stickerFileName(i);
    if (info.width > STICKER_W || info.height > STICKER_H) {
      issues.push({ level: 'error', index: i, message: `${name}：サイズが ${STICKER_W}×${STICKER_H} を超えています。` });
    }
    if (info.width % 2 || info.height % 2) {
      issues.push({ level: 'error', index: i, message: `${name}：縦横のサイズは偶数にする必要があります。` });
    }
    if (info.bytes > MAX_FILE_BYTES) {
      issues.push({
        level: 'error',
        index: i,
        message: `${name}：ファイルサイズが 1MB を超えています（${(info.bytes / 1024).toFixed(0)}KB）。`,
      });
    }
    if (!info.hasTransparency) {
      issues.push({ level: 'error', index: i, message: `${name}：背景が透過されていません。` });
    }
    const b = info.bounds;
    if (!b) return;
    if (
      b.x < SAFE_MARGIN ||
      b.y < SAFE_MARGIN ||
      b.x + b.width > info.width - SAFE_MARGIN ||
      b.y + b.height > info.height - SAFE_MARGIN
    ) {
      issues.push({
        level: 'warning',
        index: i,
        message: `${name}：端から ${SAFE_MARGIN}px 以内に絵がはみ出しています（余白が必要です）。「ぴったり合わせる」で直せます。`,
      });
    }
    if (b.width < info.width * 0.45 && b.height < info.height * 0.45) {
      issues.push({
        level: 'warning',
        index: i,
        message: `${name}：絵が小さすぎます。トークで小さく表示されるので大きくしましょう。`,
      });
    }
  });
  return issues;
}
