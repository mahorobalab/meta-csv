import { invoke } from '@tauri-apps/api/core';
import type { CsvFilePayload, FileSystemAdapter } from '@meta-csv/core';

interface RustCsvPayload {
  fileName: string;
  csvBase64: string;
  metaText: string | null;
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...sub));
  }
  return btoa(parts.join(''));
}

export function createTauriAdapter(filePath: string): FileSystemAdapter {
  return {
    async load(): Promise<CsvFilePayload> {
      const res = await invoke<RustCsvPayload>('load_csv_with_meta', { path: filePath });
      return {
        fileName: res.fileName,
        csvBytes: base64ToBytes(res.csvBase64),
        metaText: res.metaText,
      };
    },

    async saveCsv(bytes: Uint8Array): Promise<void> {
      await invoke('save_csv_bytes', {
        path: filePath,
        csvBase64: bytesToBase64(bytes),
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
