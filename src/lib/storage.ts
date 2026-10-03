import { get, set } from 'idb-keyval';
import type { Assets, Project } from './types';

const KEY = 'line-sticker-maker:project';

export interface SavedData {
  project: Project;
  assets: Assets;
}

/** プロジェクトで使っている画像だけを残す */
export function collectUsedAssets(project: Project, assets: Assets): Assets {
  const used: Assets = {};
  for (const s of project.stickers) {
    if (!s.image) continue;
    for (const id of [s.image.assetId, s.image.originalAssetId]) {
      if (assets[id]) used[id] = assets[id];
    }
  }
  return used;
}

export async function saveLocal(project: Project, assets: Assets): Promise<void> {
  await set(KEY, { project, assets: collectUsedAssets(project, assets) } satisfies SavedData);
}

export async function loadLocal(): Promise<SavedData | null> {
  try {
    const data = (await get(KEY)) as SavedData | undefined;
    return data && isSavedData(data) ? data : null;
  } catch {
    return null;
  }
}

export function isSavedData(v: unknown): v is SavedData {
  const d = v as SavedData;
  return !!d && typeof d === 'object' && d.project?.version === 1 && Array.isArray(d.project.stickers) && typeof d.assets === 'object';
}

/** 別の端末へ移したりバックアップしたりするためのファイル */
export function toBackupBlob(project: Project, assets: Assets): Blob {
  const data: SavedData = { project, assets: collectUsedAssets(project, assets) };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function fromBackupFile(file: File): Promise<SavedData> {
  const data = JSON.parse(await file.text());
  if (!isSavedData(data)) throw new Error('このファイルはスタンプのプロジェクトではありません');
  return data;
}
