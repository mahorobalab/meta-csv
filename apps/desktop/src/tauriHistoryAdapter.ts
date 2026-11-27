import { invoke } from '@tauri-apps/api/core';
import type {
  HistoryAdapter,
  HistoryRestorePayload,
  HistorySnapshotMeta,
  SaveSnapshotInput,
} from '@metatext-editor/core';

interface RustRestoreMeta {
  id: string;
  hasData: boolean;
  metaText: string;
}

/**
 * Tauri-backed HistoryAdapter delegating to Rust's `gix` Shadow Git commands.
 * - Stores bare Git history adjacent to the document: `<file>.metatext.history/`
 * - Reads the just-saved file directly from disk in Rust (zero JSON byte-array IPC)
 * - Streams restored data bytes via raw Tauri binary `Response` (`ArrayBuffer`)
 */
export function createTauriHistoryAdapter(
  getFilePath: () => string | null,
): HistoryAdapter {
  return {
    readsSavedFileDirectly: true,

    async saveSnapshot(input: SaveSnapshotInput): Promise<HistorySnapshotMeta | null> {
      const filePath = getFilePath();
      if (!filePath || !input.policy.enabled) return null;
      return invoke<HistorySnapshotMeta | null>('history_save_snapshot', {
        filePath,
        message: input.message,
        includeData: Boolean(input.includeDataFromDisk || input.dataBytes),
        metaText: input.metaText,
        policy: input.policy,
      });
    },

    async listSnapshots(limit?: number): Promise<HistorySnapshotMeta[]> {
      const filePath = getFilePath();
      if (!filePath) return [];
      return invoke<HistorySnapshotMeta[]>('history_list_snapshots', {
        filePath,
        limit: limit ?? null,
      });
    },

    async restoreSnapshot(id: string): Promise<HistoryRestorePayload> {
      const filePath = getFilePath();
      if (!filePath) {
        throw new Error('Cannot restore snapshot for an unsaved file');
      }
      const meta = await invoke<RustRestoreMeta>('history_restore_snapshot_meta', {
        filePath,
        id,
      });
      let dataBytes: Uint8Array | undefined;
      if (meta.hasData) {
        const buffer = await invoke<ArrayBuffer>('history_restore_snapshot_data', {
          filePath,
          id,
        });
        dataBytes = new Uint8Array(buffer);
      }
      return {
        id: meta.id,
        dataBytes,
        metaText: meta.metaText,
      };
    },

    async getStorageUsageBytes(): Promise<number> {
      const filePath = getFilePath();
      if (!filePath) return 0;
      return invoke<number>('history_storage_usage', { filePath });
    },

    async clearHistory(): Promise<void> {
      const filePath = getFilePath();
      if (!filePath) return;
      await invoke<void>('history_clear', { filePath });
    },
  };
}
