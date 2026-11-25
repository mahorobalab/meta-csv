import { invoke } from '@tauri-apps/api/core';
import type { CsvFilePayload, FileSystemAdapter } from '@meta-csv/core';

function extractFileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || 'untitled.csv';
}

export function createTauriAdapter(filePath: string): FileSystemAdapter {
  return {
    async load(): Promise<CsvFilePayload> {
      const [buffer, metaText] = await Promise.all([
        invoke<ArrayBuffer>('load_csv_bytes', { path: filePath }),
        invoke<string | null>('load_meta_text', { path: filePath }),
      ]);
      return {
        fileName: extractFileName(filePath),
        csvBytes: new Uint8Array(buffer),
        metaText,
      };
    },

    async saveCsv(bytes: Uint8Array): Promise<void> {
      await invoke('save_csv_raw', bytes, {
        headers: {
          'x-file-path': encodeURIComponent(filePath),
        },
      });
    },

    async saveMeta(jsoncText: string): Promise<void> {
      await invoke('save_meta_text', {
        path: filePath,
        metaText: jsoncText,
      });
    },
  };
}
