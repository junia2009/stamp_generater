import JSZip from 'jszip';
import { hasTransparency } from './pixels';
import { canvasToBlob, ctx2d, fitContent, getBounds, renderSticker, trimToContent } from './render';
import { MAIN_H, MAIN_W, MAX_ZIP_BYTES, STICKER_H, STICKER_W, TAB_H, TAB_W, stickerFileName } from './spec';
import type { Assets, Project } from './types';
import { validateProject, validateRendered, type Issue, type RenderedInfo } from './validate';

export interface ExportOptions {
  /** 各スタンプを中身＋余白の最小サイズで切り出す */
  trim: boolean;
}

export interface ExportResult {
  zip: Blob | null;
  issues: Issue[];
}

async function analyze(canvas: HTMLCanvasElement, blob: Blob): Promise<RenderedInfo> {
  const d = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
  return {
    bytes: blob.size,
    width: canvas.width,
    height: canvas.height,
    bounds: getBounds(canvas),
    hasTransparency: hasTransparency({ data: d.data, width: d.width, height: d.height }),
  };
}

export async function renderMainAndTab(project: Project, assets: Assets) {
  const pick = (id: string | null) => project.stickers.find((s) => s.id === id) ?? project.stickers[0];
  const mainSrc = await renderSticker(pick(project.mainStickerId), assets, 2);
  const tabSrc = await renderSticker(pick(project.tabStickerId), assets, 2);
  return {
    main: fitContent(mainSrc, MAIN_W, MAIN_H, 8),
    tab: fitContent(tabSrc, TAB_W, TAB_H, 2),
  };
}

/** LINE Creators Market にそのままアップロードできる ZIP を作る */
export async function exportZip(
  project: Project,
  assets: Assets,
  options: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  const issues = validateProject(project);
  if (issues.some((i) => i.level === 'error')) return { zip: null, issues };

  const zip = new JSZip();
  const infos: RenderedInfo[] = [];
  const total = project.stickers.length + 1;
  for (let i = 0; i < project.stickers.length; i++) {
    let canvas = await renderSticker(project.stickers[i], assets, 1);
    if (options.trim) canvas = trimToContent(canvas);
    const blob = await canvasToBlob(canvas);
    infos.push(await analyze(canvas, blob));
    zip.file(stickerFileName(i), blob);
    onProgress?.(i + 1, total);
  }
  const { main, tab } = await renderMainAndTab(project, assets);
  zip.file('main.png', await canvasToBlob(main));
  zip.file('tab.png', await canvasToBlob(tab));
  onProgress?.(total, total);

  issues.push(...validateRendered(infos));
  if (issues.some((i) => i.level === 'error')) return { zip: null, issues };

  const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  if (out.size > MAX_ZIP_BYTES) {
    issues.push({ level: 'error', message: 'ZIP の合計サイズが 60MB を超えています。' });
    return { zip: null, issues };
  }
  return { zip: out, issues };
}

/** 1 枚だけ PNG を書き出す */
export async function exportSinglePng(project: Project, assets: Assets, index: number, trim: boolean): Promise<Blob> {
  let canvas = await renderSticker(project.stickers[index], assets, 1);
  if (trim) canvas = trimToContent(canvas);
  return canvasToBlob(canvas);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const STICKER_SIZE_LABEL = `${STICKER_W}×${STICKER_H}`;
