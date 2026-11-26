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
): FileSystemAdapter {
  let metaText = DEFAULT_NEW_META;

  return {
    async load(): Promise<CsvFilePayload> {
      return {
        fileName: 'untitled.csv',
        csvBytes: new TextEncoder().encode(DEFAULT_NEW_CSV),
        metaText,
      };
    },

    async saveCsv(bytes: Uint8Array): Promise<void> {
      await onSaveAsRequested(bytes, metaText);
    },

    async saveMeta(jsoncText: string): Promise<void> {
      metaText = jsoncText;
    },
  };
}
