import { invoke } from '@tauri-apps/api/core';
import type { CsvFilePayload, FileAppendResult, FileSystemAdapter } from '@metatext-editor/core';
import { createNewFileTemplate, type NewFileFormat } from '@metatext-editor/ui';

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

    async readAppend(fromOffset: number): Promise<FileAppendResult> {
      const res = await invoke<{ bytes: number[]; nextOffset: number; truncated: boolean }>(
        'read_file_append',
        { path: currentPath, offset: fromOffset },
      );
      return {
        bytes: new Uint8Array(res.bytes),
        nextOffset: res.nextOffset,
        truncated: res.truncated,
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

export function createUntitledDesktopAdapter(
  onSaveAsRequested: (bytes: Uint8Array, metaText: string) => Promise<boolean>,
  onSaveAsStreamRequested?: (chunks: Iterable<Uint8Array>, metaText: string) => Promise<boolean>,
  format: NewFileFormat = 'csv',
): DesktopFileSystemAdapter {
  const template = createNewFileTemplate(format);
  let currentPath: string | null = null;
  let metaText = template.metaText;

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
        fileName: template.fileName,
        csvBytes: new TextEncoder().encode(template.content),
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
