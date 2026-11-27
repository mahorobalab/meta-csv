import type {
  CsvFilePayload,
  FileAppendResult,
  FileSystemAdapter,
  HistoryAdapter,
  HistoryRestorePayload,
  HistorySnapshotMeta,
  SaveSnapshotInput,
} from '@metatext-editor/core';
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
  command:
    | 'undo'
    | 'redo'
    | 'reload'
    | 'hostSaved'
    | 'requestCsvData'
    | 'setZoom'
    | 'historySaving'
    | 'historyUpdated';
  requestId?: number;
  scale?: number;
  saving?: boolean;
}

export interface VsCodeAdapterBundle {
  adapter: FileSystemAdapter;
  historyAdapter: HistoryAdapter;
  onThemeMode: (cb: (mode: 'light' | 'dark') => void) => () => void;
  onHostLanguage: (cb: (lang: string) => void) => () => void;
  onAppSettings: (cb: (settings: EditorAppSettings) => void) => () => void;
  onHostCommand: (cb: (cmd: HostCommand) => void) => () => void;
  respondCsvData: (requestId: number, bytes: Uint8Array | null) => void;
  notifyEdit: (label: string) => void;
  notifyStatus: (status: EditorStatusInfo) => void;
  updateSettings: (patch: Partial<EditorAppSettings>) => void;
  openSettings: () => void;
  exportBundle: (options: { includeHistory: boolean }) => Promise<boolean | string>;
}

export function createVsCodeAdapter(): VsCodeAdapterBundle {
  const vscode = acquireVsCodeApi();
  let reqSeq = 1;

  const pendingSaves = new Map<
    number,
    { resolve: () => void; reject: (err: Error) => void }
  >();
  const pendingAppends = new Map<
    number,
    { resolve: (res: FileAppendResult) => void; reject: (err: Error) => void }
  >();
  const pendingHistory = new Map<
    number,
    { resolve: (res: unknown) => void; reject: (err: Error) => void }
  >();
  let pendingLoad: {
    resolve: (payload: CsvFilePayload) => void;
    reject: (err: Error) => void;
  } | null = null;
  const themeListeners = new Set<(mode: 'light' | 'dark') => void>();
  const languageListeners = new Set<(lang: string) => void>();
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
      if (typeof msg.payload?.hostLanguage === 'string' && msg.payload.hostLanguage) {
        languageListeners.forEach((cb) => cb(msg.payload.hostLanguage));
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
    } else if (msg.type === 'appendData') {
      const p = pendingAppends.get(msg.requestId);
      if (p) {
        pendingAppends.delete(msg.requestId);
        const bytes = msg.bytesBase64 ? base64ToBytes(msg.bytesBase64) : new Uint8Array(0);
        p.resolve({
          bytes,
          nextOffset: Number(msg.nextOffset ?? 0),
          truncated: Boolean(msg.truncated),
        });
      }
    } else if (msg.type === 'appendError') {
      const p = pendingAppends.get(msg.requestId);
      if (p) {
        pendingAppends.delete(msg.requestId);
        p.reject(new Error(String(msg.message ?? 'Append read failed')));
      }
    } else if (msg.type === 'historyListResult') {
      const p = pendingHistory.get(msg.requestId);
      if (p) {
        pendingHistory.delete(msg.requestId);
        p.resolve(msg.snapshots ?? []);
      }
    } else if (msg.type === 'historyUsageResult') {
      const p = pendingHistory.get(msg.requestId);
      if (p) {
        pendingHistory.delete(msg.requestId);
        p.resolve(Number(msg.usageBytes ?? 0));
      }
    } else if (msg.type === 'exportBundleResult') {
      const p = pendingHistory.get(msg.requestId);
      if (p) {
        pendingHistory.delete(msg.requestId);
        p.resolve(msg.cancelled ? false : String(msg.fileName ?? ''));
      }
    } else if (msg.type === 'historySaveResult') {
      const p = pendingHistory.get(msg.requestId);
      if (p) {
        pendingHistory.delete(msg.requestId);
        p.resolve(msg.snapshot ?? null);
      }
    } else if (msg.type === 'historyRestoreResult') {
      const p = pendingHistory.get(msg.requestId);
      if (p) {
        pendingHistory.delete(msg.requestId);
        p.resolve({
          id: String(msg.id ?? ''),
          dataBytes: typeof msg.dataBase64 === 'string' ? base64ToBytes(msg.dataBase64) : undefined,
          metaText: String(msg.metaText ?? ''),
        } satisfies HistoryRestorePayload);
      }
    } else if (msg.type === 'historyError') {
      const p = pendingHistory.get(msg.requestId);
      if (p) {
        pendingHistory.delete(msg.requestId);
        p.reject(new Error(String(msg.message ?? 'History operation failed')));
      }
    } else if (msg.type === 'themeChanged') {
      themeListeners.forEach((cb) => cb(msg.themeMode));
    } else if (msg.type === 'configChanged' && msg.appSettings) {
      settingsListeners.forEach((cb) => cb(msg.appSettings));
    } else if (msg.type === 'hostCommand') {
      commandListeners.forEach((cb) =>
        cb({
          command: msg.command,
          requestId: msg.requestId,
          scale: msg.scale,
          saving: typeof msg.saving === 'boolean' ? msg.saving : undefined,
        }),
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

    readAppend(fromOffset: number): Promise<FileAppendResult> {
      const requestId = reqSeq++;
      return new Promise((resolve, reject) => {
        pendingAppends.set(requestId, { resolve, reject });
        vscode.postMessage({ type: 'readAppend', requestId, fromOffset });
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

  const historyAdapter: HistoryAdapter = {
    readsSavedFileDirectly: true,

    saveSnapshot(input: SaveSnapshotInput): Promise<HistorySnapshotMeta | null> {
      const requestId = reqSeq++;
      return new Promise((resolve, reject) => {
        pendingHistory.set(requestId, {
          resolve: (v) => resolve(v as HistorySnapshotMeta | null),
          reject,
        });
        vscode.postMessage({
          type: 'historySave',
          requestId,
          message: input.message,
          includeDataFromDisk: Boolean(input.includeDataFromDisk || input.dataBytes),
          metaText: input.metaText,
          policy: input.policy,
        });
      });
    },

    listSnapshots(limit?: number): Promise<HistorySnapshotMeta[]> {
      const requestId = reqSeq++;
      return new Promise((resolve, reject) => {
        pendingHistory.set(requestId, {
          resolve: (v) => resolve(v as HistorySnapshotMeta[]),
          reject,
        });
        vscode.postMessage({ type: 'historyList', requestId, limit });
      });
    },

    restoreSnapshot(id: string): Promise<HistoryRestorePayload> {
      const requestId = reqSeq++;
      return new Promise((resolve, reject) => {
        pendingHistory.set(requestId, {
          resolve: (v) => resolve(v as HistoryRestorePayload),
          reject,
        });
        vscode.postMessage({ type: 'historyRestore', requestId, id });
      });
    },

    getStorageUsageBytes(): Promise<number> {
      const requestId = reqSeq++;
      return new Promise((resolve, reject) => {
        pendingHistory.set(requestId, {
          resolve: (v) => resolve(Number(v ?? 0)),
          reject,
        });
        vscode.postMessage({ type: 'historyUsage', requestId });
      });
    },
  };

  return {
    adapter,
    historyAdapter,
    onThemeMode(cb) {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
    onHostLanguage(cb) {
      languageListeners.add(cb);
      return () => languageListeners.delete(cb);
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
    exportBundle(options: { includeHistory: boolean }): Promise<boolean | string> {
      const requestId = reqSeq++;
      return new Promise((resolve, reject) => {
        pendingHistory.set(requestId, {
          resolve: (v) => resolve(v as boolean | string),
          reject,
        });
        vscode.postMessage({
          type: 'exportBundle',
          requestId,
          includeHistory: options.includeHistory,
        });
      });
    },
  };
}
