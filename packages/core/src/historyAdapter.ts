export interface HistoryRetentionPolicy {
  /** When false, Shadow Git snapshot recording is disabled (in-memory Undo/Redo remains active). */
  enabled: boolean;
  /** Pruning mode: keep last N snapshots or keep total repository size under M MB. */
  mode: 'count' | 'sizeMb';
  /** Maximum number of snapshots to retain in 'count' mode (default: 10). */
  maxCount: number;
  /** Maximum total history size in MB in 'sizeMb' mode (default: 10). */
  maxTotalSizeMb: number;
  /** Maximum data file size in MB to include in snapshots; above this only .metatext.jsonc is saved (default: 20). */
  maxDataFileSizeMb: number;
}

export const DEFAULT_HISTORY_RETENTION_POLICY: HistoryRetentionPolicy = {
  enabled: true,
  mode: 'count',
  maxCount: 10,
  maxTotalSizeMb: 10,
  maxDataFileSizeMb: 20,
};

export interface HistorySnapshotMeta {
  /** Full Git commit OID (40-char hex) */
  id: string;
  /** Short commit OID (7-char hex) for compact UI / audit log display */
  shortId: string;
  /** ISO 8601 UTC timestamp */
  timestamp: string;
  /** Human-readable commit message / summary */
  message: string;
  /** False when data payload was skipped (e.g. > maxDataFileSizeMb or Read-Only mode) */
  includesData: boolean;
  /** Raw data byte length when includesData is true */
  dataBytes?: number;
  /** Raw .metatext.jsonc byte length */
  metaBytes: number;
}

export interface SaveSnapshotInput {
  message: string;
  /** Omit (or pass undefined) when Read-Only, data exceeds maxDataFileSizeMb, or adapter reads saved file directly from disk */
  dataBytes?: Uint8Array;
  /** True when the adapter should include the saved file body (e.g. Desktop reading directly from disk) */
  includeDataFromDisk?: boolean;
  metaText: string;
  policy: HistoryRetentionPolicy;
}

export interface HistoryRestorePayload {
  id: string;
  dataBytes?: Uint8Array;
  metaText: string;
}

export interface HistoryAdapter {
  /** When true (Desktop Tauri), the adapter reads the already-saved file directly from disk to avoid IPC serialization overhead */
  readsSavedFileDirectly?: boolean;
  saveSnapshot(input: SaveSnapshotInput): Promise<HistorySnapshotMeta | null>;
  listSnapshots(limit?: number): Promise<HistorySnapshotMeta[]>;
  restoreSnapshot(id: string): Promise<HistoryRestorePayload>;
  getStorageUsageBytes?(): Promise<number>;
  clearHistory?(): Promise<void>;
}
