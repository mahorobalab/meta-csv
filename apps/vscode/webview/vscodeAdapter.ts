import type { CsvFilePayload, FileSystemAdapter } from '@meta-csv/core';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

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

export interface VsCodeAdapterBundle {
  adapter: FileSystemAdapter;
  onThemeMode: (cb: (mode: 'light' | 'dark') => void) => () => void;
}

export function createVsCodeAdapter(): VsCodeAdapterBundle {
  const vscode = acquireVsCodeApi();
  let reqSeq = 1;

  const pendingSaves = new Map<
    number,
    { resolve: () => void; reject: (err: Error) => void }
  >();
  let pendingLoad: {
    resolve: (payload: CsvFilePayload) => void;
    reject: (err: Error) => void;
  } | null = null;
  const themeListeners = new Set<(mode: 'light' | 'dark') => void>();

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'loaded' && pendingLoad) {
      const { resolve } = pendingLoad;
      pendingLoad = null;
      if (msg.payload?.themeMode) {
        themeListeners.forEach((cb) => cb(msg.payload.themeMode));
      }
      resolve({
        fileName: msg.payload.fileName,
        csvBytes: base64ToBytes(msg.payload.csvBase64),
        metaText: msg.payload.metaText ?? null,
      });
    } else if (msg.type === 'error' && pendingLoad) {
      const { reject } = pendingLoad;
      pendingLoad = null;
      reject(new Error(String(msg.message ?? 'Unknown load error')));
    } else if (msg.type === 'saved') {
      const p = pendingSaves.get(msg.requestId);
      if (p) {
        pendingSaves.delete(msg.requestId);
        p.resolve();
      }
    } else if (msg.type === 'saveError') {
      const p = pendingSaves.get(msg.requestId);
      if (p) {
        pendingSaves.delete(msg.requestId);
        p.reject(new Error(String(msg.message ?? 'Save failed')));
      }
    } else if (msg.type === 'themeChanged') {
      themeListeners.forEach((cb) => cb(msg.themeMode));
    }
  });

  const adapter: FileSystemAdapter = {
    load(): Promise<CsvFilePayload> {
      return new Promise((resolve, reject) => {
        pendingLoad = { resolve, reject };
        vscode.postMessage({ type: 'ready' });
      });
    },

    saveCsv(bytes: Uint8Array): Promise<void> {
      const requestId = reqSeq++;
      return new Promise((resolve, reject) => {
        pendingSaves.set(requestId, { resolve, reject });
        vscode.postMessage({
          type: 'saveCsv',
          requestId,
          csvBase64: bytesToBase64(bytes),
        });
      });
    },

    saveMeta(jsoncText: string): Promise<void> {
      const requestId = reqSeq++;
      return new Promise((resolve, reject) => {
        pendingSaves.set(requestId, { resolve, reject });
        vscode.postMessage({
          type: 'saveMeta',
          requestId,
          metaText: jsoncText,
        });
      });
    },
  };

  return {
    adapter,
    onThemeMode(cb) {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
  };
}
