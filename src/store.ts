import { useCallback, useRef, useState } from 'react';
import { createProject, newId } from './lib/project';
import type { Assets, Project, Selection, Sticker } from './lib/types';

const HISTORY_LIMIT = 100;
/** 同じキーの連続操作（スライダーのドラッグ等）は 1 回の履歴にまとめる */
const COALESCE_MS = 700;

export interface Store {
  project: Project;
  assets: Assets;
  currentIndex: number;
  selection: Selection;
  canUndo: boolean;
  canRedo: boolean;
  current: Sticker | undefined;
  setCurrentIndex: (i: number) => void;
  setSelection: (s: Selection) => void;
  update: (fn: (p: Project) => Project, coalesceKey?: string) => void;
  updateSticker: (id: string, fn: (s: Sticker) => Sticker, coalesceKey?: string) => void;
  addAsset: (dataUrl: string) => string;
  /** プロジェクトを丸ごと差し替える（読み込み・新規作成） */
  load: (project: Project, assets: Assets) => void;
  undo: () => void;
  redo: () => void;
}

export function useStore(): Store {
  const [project, setProject] = useState<Project>(() => createProject());
  const [assets, setAssets] = useState<Assets>({});
  const [currentIndex, setCurrentIndexRaw] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const last = useRef<{ key?: string; at: number }>({ at: 0 });
  const projectRef = useRef(project);
  projectRef.current = project;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const update = useCallback((fn: (p: Project) => Project, coalesceKey?: string) => {
    const prev = projectRef.current;
    const next = fn(prev);
    if (next === prev) return;
    const now = Date.now();
    const coalesce = coalesceKey && last.current.key === coalesceKey && now - last.current.at < COALESCE_MS;
    last.current = { key: coalesceKey, at: now };
    if (!coalesce) past.current = [...past.current.slice(-HISTORY_LIMIT + 1), prev];
    future.current = [];
    projectRef.current = next;
    setProject(next);
  }, []);

  const updateSticker = useCallback(
    (id: string, fn: (s: Sticker) => Sticker, coalesceKey?: string) =>
      update((p) => {
        const i = p.stickers.findIndex((s) => s.id === id);
        if (i < 0) return p;
        const stickers = p.stickers.slice();
        stickers[i] = fn(stickers[i]);
        return { ...p, stickers };
      }, coalesceKey),
    [update],
  );

  const addAsset = useCallback((dataUrl: string) => {
    const existing = Object.entries(assetsRef.current).find(([, v]) => v === dataUrl);
    if (existing) return existing[0];
    const id = newId();
    assetsRef.current = { ...assetsRef.current, [id]: dataUrl };
    setAssets(assetsRef.current);
    return id;
  }, []);

  const load = useCallback((p: Project, a: Assets) => {
    projectRef.current = p;
    assetsRef.current = a;
    setProject(p);
    setAssets(a);
    past.current = [];
    future.current = [];
    setCurrentIndexRaw(0);
    setSelection(null);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.at(-1);
    if (!prev) return;
    past.current = past.current.slice(0, -1);
    future.current = [projectRef.current, ...future.current];
    projectRef.current = prev;
    last.current = { at: 0 };
    setProject(prev);
  }, []);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, projectRef.current];
    projectRef.current = next;
    last.current = { at: 0 };
    setProject(next);
  }, []);

  const setCurrentIndex = useCallback((i: number) => {
    setCurrentIndexRaw(i);
    setSelection(null);
  }, []);

  const safeIndex = Math.min(currentIndex, project.stickers.length - 1);
  return {
    project,
    assets,
    currentIndex: safeIndex,
    selection,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    current: project.stickers[safeIndex],
    setCurrentIndex,
    setSelection,
    update,
    updateSticker,
    addAsset,
    load,
    undo,
    redo,
  };
}
