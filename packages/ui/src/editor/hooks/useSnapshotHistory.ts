import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_HISTORY_RETENTION_POLICY,
  computeTableCellDiff,
  detectTargetFormat,
  parseMetaJsonc,
  type HistoryAdapter,
  type HistoryRetentionPolicy,
  type HistorySnapshotMeta,
  type ParsedCsvData,
  type TableCellDiffResult,
} from '@metatext-editor/core';
import type { EditorAppSettings } from '../../dialogs/types';
import { parseTabularInWorker } from '../../parseInWorker';
import type { MetaSaveOptions } from './useDocumentLoader';

export interface UseSnapshotHistoryParams {
  historyAdapter?: HistoryAdapter;
  appSettings?: EditorAppSettings;
  fileName: string;
  csvData: ParsedCsvData | null;
  setCsvData: React.Dispatch<React.SetStateAction<ParsedCsvData | null>>;
  setAutoWidths: React.Dispatch<React.SetStateAction<number[]>>;
  rowsRef: React.MutableRefObject<string[][]>;
  metaTextRef: React.MutableRefObject<string | null>;
  isReadOnly: boolean;
  scheduleMetaSave: (nextText: string, options?: MetaSaveOptions) => void;
  setDirtyCsv: (dirty: boolean) => void;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatusMsg: (msg: string) => void;
  showHistoryPanel: boolean;
}

export function buildRetentionPolicy(appSettings?: EditorAppSettings): HistoryRetentionPolicy {
  return {
    enabled: appSettings?.historyEnabled ?? DEFAULT_HISTORY_RETENTION_POLICY.enabled,
    mode: appSettings?.historyRetentionMode ?? DEFAULT_HISTORY_RETENTION_POLICY.mode,
    maxCount: appSettings?.historyMaxCount ?? DEFAULT_HISTORY_RETENTION_POLICY.maxCount,
    maxTotalSizeMb:
      appSettings?.historyMaxTotalSizeMb ?? DEFAULT_HISTORY_RETENTION_POLICY.maxTotalSizeMb,
    maxDataFileSizeMb:
      appSettings?.historyMaxDataFileSizeMb ?? DEFAULT_HISTORY_RETENTION_POLICY.maxDataFileSizeMb,
  };
}

export function useSnapshotHistory({
  historyAdapter,
  appSettings,
  fileName,
  csvData,
  setCsvData,
  setAutoWidths,
  rowsRef,
  metaTextRef,
  isReadOnly,
  scheduleMetaSave,
  setDirtyCsv,
  setDataVersion,
  setStatusMsg,
  showHistoryPanel,
}: UseSnapshotHistoryParams) {
  const [snapshots, setSnapshots] = useState<HistorySnapshotMeta[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [storageUsageBytes, setStorageUsageBytes] = useState<number | null>(null);
  const [diffBySnapshotId, setDiffBySnapshotId] = useState<Record<string, TableCellDiffResult | null>>({});
  const [loadingDiffId, setLoadingDiffId] = useState<string | null>(null);

  const policy = useMemo(() => buildRetentionPolicy(appSettings), [appSettings]);

  const refreshSnapshots = useCallback(async () => {
    if (!historyAdapter) {
      setSnapshots([]);
      setStorageUsageBytes(null);
      return;
    }
    setLoadingSnapshots(true);
    try {
      const [list, usage] = await Promise.all([
        historyAdapter.listSnapshots(50),
        historyAdapter.getStorageUsageBytes ? historyAdapter.getStorageUsageBytes() : Promise.resolve(null),
      ]);
      setSnapshots(list);
      setStorageUsageBytes(usage);
    } catch {
      // Ignore transient errors (e.g. untitled unsaved tab)
    } finally {
      setLoadingSnapshots(false);
    }
  }, [historyAdapter]);

  useEffect(() => {
    if (showHistoryPanel) {
      void refreshSnapshots();
    }
  }, [showHistoryPanel, refreshSnapshots]);

  const recordSaveSnapshotAsync = useCallback(
    (dataBytes: Uint8Array | undefined, message?: string) => {
      if (!historyAdapter || !policy.enabled) return;
      const metaText = metaTextRef.current ?? '';
      const maxDataBytes = policy.maxDataFileSizeMb * 1024 * 1024;
      const readsDirectly = Boolean(historyAdapter.readsSavedFileDirectly);
      const shouldIncludeData =
        !isReadOnly &&
        (readsDirectly || (dataBytes !== undefined && dataBytes.byteLength <= maxDataBytes));

      setSavingSnapshot(true);
      void historyAdapter
        .saveSnapshot({
          message: message ?? `Saved ${fileName}`,
          dataBytes: !readsDirectly && shouldIncludeData ? dataBytes : undefined,
          includeDataFromDisk: readsDirectly && shouldIncludeData,
          metaText,
          policy,
        })
        .then((saved) => {
          if (!saved) return;
          setActiveSnapshotId(saved.id);
          setDiffBySnapshotId({});
          setStatusMsg(
            saved.includesData
              ? `Saved ${fileName} · snapshot ${saved.shortId}`
              : `Saved ${fileName} · snapshot ${saved.shortId} (meta only)`,
          );
          if (showHistoryPanel) {
            void refreshSnapshots();
          }
        })
        .catch(() => {
          // Never block or alarm the user on background snapshot failure
        })
        .finally(() => {
          setSavingSnapshot(false);
        });
    },
    [
      historyAdapter,
      policy,
      metaTextRef,
      isReadOnly,
      fileName,
      setStatusMsg,
      showHistoryPanel,
      refreshSnapshots,
    ],
  );

  const restoreSnapshotToView = useCallback(
    async (snap: HistorySnapshotMeta) => {
      if (!historyAdapter) return;
      try {
        const payload = await historyAdapter.restoreSnapshot(snap.id);
        const parsedMeta = parseMetaJsonc(payload.metaText);

        if (payload.dataBytes && payload.dataBytes.byteLength > 0) {
          const resolvedFormat = detectTargetFormat(fileName, parsedMeta.format);
          const { parsed, autoWidths } = await parseTabularInWorker(payload.dataBytes, {
            format: resolvedFormat,
            csv: parsedMeta.csv,
            jsonl: parsedMeta.jsonl,
            log: parsedMeta.log,
          });
          rowsRef.current = parsed.rows;
          setCsvData(parsed);
          setAutoWidths(autoWidths);
          setDirtyCsv(true);
        }

        scheduleMetaSave(payload.metaText, {
          skipHistory: false,
          label: `Restore snapshot ${snap.shortId}`,
        });
        setActiveSnapshotId(snap.id);
        setDataVersion((v) => v + 1);
        setStatusMsg(
          payload.dataBytes
            ? `Restored view to ${snap.shortId} (press Ctrl+S to save)`
            : `Restored metadata to ${snap.shortId} (meta only)`,
        );
      } catch (err) {
        setStatusMsg(`Restore failed: ${String(err)}`);
      }
    },
    [
      historyAdapter,
      fileName,
      rowsRef,
      setCsvData,
      setAutoWidths,
      setDirtyCsv,
      scheduleMetaSave,
      setDataVersion,
      setStatusMsg,
    ],
  );

  const computeSnapshotDiffWithCurrent = useCallback(
    async (snap: HistorySnapshotMeta) => {
      if (!historyAdapter || !csvData || !snap.includesData) return;
      if (diffBySnapshotId[snap.id] !== undefined) {
        setDiffBySnapshotId((prev) => {
          const next = { ...prev };
          delete next[snap.id];
          return next;
        });
        return;
      }
      setLoadingDiffId(snap.id);
      try {
        const payload = await historyAdapter.restoreSnapshot(snap.id);
        if (!payload.dataBytes) {
          setDiffBySnapshotId((prev) => ({ ...prev, [snap.id]: null }));
          return;
        }
        const parsedMeta = parseMetaJsonc(payload.metaText);
        const resolvedFormat = detectTargetFormat(fileName, parsedMeta.format);
        const { parsed } = await parseTabularInWorker(payload.dataBytes, {
          format: resolvedFormat,
          csv: parsedMeta.csv,
          jsonl: parsedMeta.jsonl,
          log: parsedMeta.log,
        });
        const diff = computeTableCellDiff(
          { columnKeys: parsed.columnKeys, rows: parsed.rows },
          { columnKeys: csvData.columnKeys, rows: rowsRef.current },
          { maxChanges: 200 },
        );
        setDiffBySnapshotId((prev) => ({ ...prev, [snap.id]: diff }));
      } catch {
        setDiffBySnapshotId((prev) => ({ ...prev, [snap.id]: null }));
      } finally {
        setLoadingDiffId(null);
      }
    },
    [historyAdapter, csvData, diffBySnapshotId, fileName, rowsRef],
  );

  return {
    policy,
    snapshots,
    loadingSnapshots,
    savingSnapshot,
    activeSnapshotId,
    storageUsageBytes,
    diffBySnapshotId,
    loadingDiffId,
    refreshSnapshots,
    recordSaveSnapshotAsync,
    restoreSnapshotToView,
    computeSnapshotDiffWithCurrent,
  };
}
