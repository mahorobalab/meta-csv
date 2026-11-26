import { invoke } from '@tauri-apps/api/core';
import type { CsvFilePayload, FileSystemAdapter } from '@metatext-editor/core';

function extractFileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || 'untitled.csv';
}

export interface DesktopFileSystemAdapter extends FileSystemAdapter {
  setFilePath(nextPath: string): void;
}

export async function saveFileStreamViaTauri(
  filePath: string,
  chunks: Iterable<Uint8Array>,
): Promise<number> {
  const writeId = await invoke<number>('begin_file_write', { path: filePath });
  let totalBytes = 0;
  try {
    for (const chunk of chunks) {
      if (chunk.byteLength > 0) {
        totalBytes += chunk.byteLength;
        await invoke('write_file_chunk', chunk, {
          headers: {
            'x-write-id': String(writeId),
          },
        });
      }
      // Yield briefly so UI remains responsive and GC can reclaim the chunk buffer
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    await invoke('finish_file_write', { writeId });
    return totalBytes;
  } catch (err) {
    await invoke('abort_file_write', { writeId }).catch(() => {});
    throw err;
  }
}

export function createTauriAdapter(initialPath: string): DesktopFileSystemAdapter {
  let currentPath = initialPath;

  return {
    setFilePath(nextPath: string): void {
      currentPath = nextPath;
    },

    async load(): Promise<CsvFilePayload> {
      const [buffer, metaText] = await Promise.all([
        invoke<ArrayBuffer>('load_csv_bytes', { path: currentPath }),
        invoke<string | null>('load_meta_text', { path: currentPath }),
      ]);
      return {
        fileName: extractFileName(currentPath),
        csvBytes: new Uint8Array(buffer),
        metaText,
      };
    },

    async saveCsv(bytes: Uint8Array): Promise<void> {
      await invoke('save_csv_raw', bytes, {
        headers: {
          'x-file-path': encodeURIComponent(currentPath),
        },
      });
    },

    async saveCsvStream(chunks: Iterable<Uint8Array>): Promise<void> {
      await saveFileStreamViaTauri(currentPath, chunks);
    },

    async saveMeta(jsoncText: string): Promise<void> {
      await invoke('save_meta_text', {
        path: currentPath,
        metaText: jsoncText,
      });
    },
  };
}

const DEFAULT_NEW_CSV = [',,,,', ',,,,', ',,,,', ',,,,', ',,,,'].join('\r\n');
const DEFAULT_NEW_META = `{
  "version": "0.1",
  "format": "csv",
  "csv": {
    "hasHeader": false
  }
}
`;

export function createUntitledDesktopAdapter(
  onSaveAsRequested: (bytes: Uint8Array, metaText: string) => Promise<boolean>,
  onSaveAsStreamRequested?: (chunks: Iterable<Uint8Array>, metaText: string) => Promise<boolean>,
): DesktopFileSystemAdapter {
  let currentPath: string | null = null;
  let metaText = DEFAULT_NEW_META;

  return {
    setFilePath(nextPath: string): void {
      currentPath = nextPath;
    },

    async load(): Promise<CsvFilePayload> {
      if (currentPath) {
        const [buffer, loadedMeta] = await Promise.all([
          invoke<ArrayBuffer>('load_csv_bytes', { path: currentPath }),
          invoke<string | null>('load_meta_text', { path: currentPath }),
        ]);
        return {
          fileName: extractFileName(currentPath),
          csvBytes: new Uint8Array(buffer),
          metaText: loadedMeta,
        };
      }
      return {
        fileName: 'untitled.csv',
        csvBytes: new TextEncoder().encode(DEFAULT_NEW_CSV),
        metaText,
      };
    },

    async saveCsv(bytes: Uint8Array): Promise<void> {
      if (currentPath) {
        await invoke('save_csv_raw', bytes, {
          headers: {
            'x-file-path': encodeURIComponent(currentPath),
          },
        });
        return;
      }
      await onSaveAsRequested(bytes, metaText);
    },

    async saveCsvStream(chunks: Iterable<Uint8Array>): Promise<void> {
      if (currentPath) {
        await saveFileStreamViaTauri(currentPath, chunks);
        return;
      }
      if (onSaveAsStreamRequested) {
        await onSaveAsStreamRequested(chunks, metaText);
        return;
      }
      const list = Array.from(chunks);
      const total = list.reduce((s, c) => s + c.byteLength, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of list) {
        merged.set(c, off);
        off += c.byteLength;
      }
      await onSaveAsRequested(merged, metaText);
    },

    async saveMeta(jsoncText: string): Promise<void> {
      metaText = jsoncText;
      if (currentPath) {
        await invoke('save_meta_text', {
          path: currentPath,
          metaText: jsoncText,
        });
      }
    },
  };
}
