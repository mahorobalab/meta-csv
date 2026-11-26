import type {
  JsonlArrayMode,
  LogParserConfig,
  MetaCsvDocument,
  MetaTextFormat,
} from '@meta-csv/schema';
import { patchMetaJsonc, type ParsedCsvData } from '@meta-csv/core';
import type { FileLayoutSettingsProps } from '../../SettingsAboutDialogs';

export interface BuildFileLayoutSettingsParams {
  csvData: ParsedCsvData | null;
  activeFormat: MetaTextFormat;
  isReadOnly: boolean;
  meta: MetaCsvDocument;
  metaTextRef: React.MutableRefObject<string | null>;
  visibleColCount: number;
  effectiveDefaultFontSize: number;
  effectiveDefaultRowHeight: number;
  getDefaultColumnTitle: (idx: number) => string;
  setIsReadOnly: (next: boolean) => void;
  patchMeta: (path: Array<string | number>, value: unknown) => void;
  scheduleMetaSave: (nextText: string) => void;
}

export function buildFileLayoutSettings({
  csvData,
  activeFormat,
  isReadOnly,
  meta,
  metaTextRef,
  visibleColCount,
  effectiveDefaultFontSize,
  effectiveDefaultRowHeight,
  getDefaultColumnTitle,
  setIsReadOnly,
  patchMeta,
  scheduleMetaSave,
}: BuildFileLayoutSettingsParams): FileLayoutSettingsProps | undefined {
  if (!csvData) return undefined;
  return {
    format: activeFormat,
    readOnly: isReadOnly,
    onReadOnlyChange: (next) => {
      setIsReadOnly(next);
      patchMeta(['readOnly'], next);
    },
    hasHeader: meta.csv?.hasHeader ?? true,
    onHasHeaderChange: (next) => patchMeta(['csv', 'hasHeader'], next),
    jsonlFlattenDepth: meta.jsonl?.flattenDepth ?? 2,
    onJsonlFlattenDepthChange: (next) => patchMeta(['jsonl', 'flattenDepth'], next),
    jsonlArrayMode: meta.jsonl?.arrayMode ?? ('json' satisfies JsonlArrayMode),
    onJsonlArrayModeChange: (next) => patchMeta(['jsonl', 'arrayMode'], next),
    logLinePattern: meta.log?.linePattern ?? csvData.logOptions?.linePattern ?? '',
    logColumnNames: meta.log?.columnNames ?? csvData.logOptions?.columnNames,
    logMultilinePattern: meta.log?.multilinePattern ?? csvData.logOptions?.multilinePattern ?? '',
    logWordWrap: meta.log?.wordWrap ?? csvData.logOptions?.wordWrap ?? false,
    logMatchedPresetId: csvData.logOptions?.matchedPresetId,
    logRegexError: csvData.logOptions?.regexError,
    logSampleLines: csvData.sampleLines,
    onLogConfigChange: (patch: Partial<LogParserConfig>) => {
      let text = metaTextRef.current ?? '';
      for (const [k, v] of Object.entries(patch)) {
        text = patchMetaJsonc(text, ['log', k], v);
      }
      scheduleMetaSave(text);
    },
    freezeColumns: meta.table?.freezeColumns ?? 0,
    maxFreezeColumns: Math.max(0, visibleColCount - 1),
    onFreezeColumnsChange: (next) => patchMeta(['table', 'freezeColumns'], next),
    fontSize: effectiveDefaultFontSize,
    onFontSizeChange: (next) => patchMeta(['table', 'fontSize'], next),
    defaultRowHeight: effectiveDefaultRowHeight,
    onDefaultRowHeightChange: (next) => patchMeta(['table', 'defaultRowHeight'], next),
    columns: csvData.columnKeys.map((key, idx) => {
      const colMeta = meta.columns?.[key];
      const defaultWrap =
        activeFormat === 'log' || activeFormat === 'text' ? (meta.log?.wordWrap ?? false) : false;
      return {
        key,
        label: colMeta?.label ?? getDefaultColumnTitle(idx),
        visible: colMeta?.visible !== false,
        wrap: colMeta?.wrap ?? defaultWrap,
      };
    }),
    onToggleColumnVisible: (key, visible) => {
      if (!visible && visibleColCount <= 1) return;
      patchMeta(['columns', key, 'visible'], visible);
    },
    onToggleColumnWrap: (key, wrap) => {
      patchMeta(['columns', key, 'wrap'], wrap);
    },
  };
}
