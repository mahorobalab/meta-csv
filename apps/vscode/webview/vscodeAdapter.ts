import type { CsvFilePayload, FileSystemAdapter } from '@metatext-editor/core';
import type { EditorAppSettings, EditorStatusInfo } from '@metatext-editor/ui';

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

export interface HostCommand {
  command: 'undo' | 'redo' | 'reload' | 'hostSaved' | 'requestCsvData' | 'setZoom';
  requestId?: number;
  scale?: number;
}

export interface VsCodeAdapterBundle {
  adapter: FileSystemAdapter;
  onThemeMode: (cb: (mode: 'light' | 'dark') => void) => () => void;
  onAppSettings: (cb: (settings: EditorAppSettings) => void) => () => void;
  onHostCommand: (cb: (cmd: HostCommand) => void) => () => void;
  respondCsvData: (requestId: number, bytes: Uint8Array | null) => void;
  notifyEdit: (label: string) => void;
  notifyStatus: (status: EditorStatusInfo) => void;
  updateSettings: (patch: Partial<EditorAppSettings>) => void;
  openSettings: () => void;
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
  const settingsListeners = new Set<(settings: EditorAppSettings) => void>();
  const commandListeners = new Set<(cmd: HostCommand) => void>();

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'loaded' && pendingLoad) {
      const { resolve } = pendingLoad;
      pendingLoad = null;
      if (msg.payload?.themeMode) {
        themeListeners.forEach((cb) => cb(msg.payload.themeMode));
      }
      if (msg.payload?.appSettings) {
        settingsListeners.forEach((cb) => cb(msg.payload.appSettings));
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
    } else if (msg.type === 'configChanged' && msg.appSettings) {
      settingsListeners.forEach((cb) => cb(msg.appSettings));
    } else if (msg.type === 'hostCommand') {
      commandListeners.forEach((cb) =>
        cb({ command: msg.command, requestId: msg.requestId, scale: msg.scale }),
      );
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
    onAppSettings(cb) {
      settingsListeners.add(cb);
      return () => settingsListeners.delete(cb);
    },
    onHostCommand(cb) {
      commandListeners.add(cb);
      return () => commandListeners.delete(cb);
    },
    respondCsvData(requestId, bytes) {
      vscode.postMessage({
        type: 'csvDataResponse',
        requestId,
        csvBase64: bytes ? bytesToBase64(bytes) : undefined,
      });
    },
    notifyEdit(label) {
      vscode.postMessage({ type: 'documentEdited', label });
    },
    notifyStatus(status) {
      vscode.postMessage({ type: 'statusChanged', status });
    },
    updateSettings(patch) {
      vscode.postMessage({ type: 'updateConfig', patch });
    },
    openSettings() {
      vscode.postMessage({ type: 'openSettings' });
    },
  };
}
