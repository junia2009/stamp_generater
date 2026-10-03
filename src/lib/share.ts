/** 共有シート（Web Share API）で画像ファイルを渡せるか。iPhone ではここから「画像を保存」で写真アプリに入る */
export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare && files.length > 0 && navigator.canShare({ files });
  } catch {
    return false;
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'failed';

/**
 * 共有シートを開く。ユーザー操作の直後に呼ぶ必要がある（ファイルは事前に用意しておくこと）。
 */
export async function shareFiles(files: File[], title: string): Promise<ShareResult> {
  try {
    await navigator.share({ files, title });
    return 'shared';
  } catch (e) {
    return (e as DOMException).name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
