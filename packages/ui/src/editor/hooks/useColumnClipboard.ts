import { useCallback } from 'react';
import type { MetaTextDocument } from '@metatext-editor/schema';
import { patchMetaJsonc, type ParsedCsvData } from '@metatext-editor/core';
import {
  readClipboardForColumnPaste,
  writeColumnsToClipboard,
  type CopiedColumnMeta,
  type CopiedColumnPayload,
  type NativeClipboardBridge,
} from '../../columnClipboard';
import { makeUniqueColumnKey } from '../utils/rowOrderUtils';

export interface UseColumnClipboardParams {
  csvData: ParsedCsvData | null;
  setCsvData: React.Dispatch<React.SetStateAction<ParsedCsvData | null>>;
  meta: MetaTextDocument;
  metaTextRef: React.MutableRefObject<string | null>;
  rowsRef: React.MutableRefObject<string[][]>;
  copiedColumnRef: React.MutableRefObject<CopiedColumnPayload | null>;
  isReadOnly: boolean;
  autoWidths: number[];
  setAutoWidths: React.Dispatch<React.SetStateAction<number[]>>;
  viewRowIndices: Int32Array;
  getDefaultColumnTitle: (actualCol: number) => string;
  appendRowsToOrder: (appendedDataRows: number[]) => void;
  scheduleMetaSave: (nextText: string) => void;
  setDirtyCsv: (dirty: boolean) => void;
  setDataVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatusMsg: (msg: string) => void;
  onDocumentEdit?: (label: string) => void;
  nativeClipboard?: NativeClipboardBridge;
}

export function useColumnClipboard({
  csvData,
  setCsvData,
  meta,
  metaTextRef,
  rowsRef,
  copiedColumnRef,
  isReadOnly,
  autoWidths,
  setAutoWidths,
  viewRowIndices,
  getDefaultColumnTitle,
  appendRowsToOrder,
  scheduleMetaSave,
  setDirtyCsv,
  setDataVersion,
  setStatusMsg,
  onDocumentEdit,
  nativeClipboard,
}: UseColumnClipboardParams) {
  const handleCopyColumns = useCallback(
    async (actualCols: number[], colKeys: string[]) => {
      if (!csvData || actualCols.length === 0) return;
      const colMetas: CopiedColumnMeta[] = actualCols.map((ac, i) => {
        const key = colKeys[i]!;
        const title = meta.columns?.[key]?.label ?? getDefaultColumnTitle(ac);
        const colCfg = meta.columns?.[key];
        const resolvedColStyle =
          typeof colCfg?.style === 'string' ? meta.styles?.[colCfg.style] : colCfg?.style;
        return {
          title,
          style: resolvedColStyle,
          align: colCfg?.align,
          wrap: colCfg?.wrap,
          numberFormat: colCfg?.numberFormat,
        };
      });

      const matrix: string[][] = new Array(viewRowIndices.length);
      for (let r = 0; r < viewRowIndices.length; r++) {
        const dr = viewRowIndices[r]!;
        const row = rowsRef.current[dr];
        matrix[r] = actualCols.map((ac) => row?.[ac] ?? '');
      }

      const payload = await writeColumnsToClipboard(
        { columns: colMetas, matrix },
        nativeClipboard,
      );
      copiedColumnRef.current = payload;
      const label =
        colMetas.length === 1 ? `"${colMetas[0]!.title}"` : `${colMetas.length} columns`;
      setStatusMsg(`Copied ${label} (${matrix.length.toLocaleString()} rows)`);
    },
    [
      csvData,
      meta.columns,
      meta.styles,
      getDefaultColumnTitle,
      viewRowIndices,
      rowsRef,
      copiedColumnRef,
      nativeClipboard,
      setStatusMsg,
    ],
  );

  const handlePasteColumns = useCallback(
    async (startActualCol: number, withStyle: boolean) => {
      if (!csvData || isReadOnly) return;
      const parsed = await readClipboardForColumnPaste(
        withStyle,
        copiedColumnRef.current,
        nativeClipboard,
      );
      if (!parsed || parsed.matrix.length === 0) {
        setStatusMsg('Clipboard is empty');
        return;
      }

      const startColKey = csvData.columnKeys[startActualCol] ?? String(startActualCol);
      const colHeaderName = meta.columns?.[startColKey]?.label ?? csvData.headers[startActualCol];
      const hasExternalHeaderRow =
        parsed.source !== 'internal' &&
        csvData.dialect.hasHeader &&
        parsed.matrix.length === viewRowIndices.length + 1 &&
        Boolean(colHeaderName) &&
        (parsed.matrix[0]?.[0] === colHeaderName ||
          parsed.matrix[0]?.[0] === csvData.headers[startActualCol]);
      const dataMatrix = hasExternalHeaderRow ? parsed.matrix.slice(1) : parsed.matrix;

      const pasteColCount = Math.max(1, ...dataMatrix.map((r) => r.length));
      const nextHeaders = [...csvData.headers];
      const nextKeys = [...csvData.columnKeys];
      const nextWidths = [...autoWidths];
      let headersChanged = false;

      while (startActualCol + pasteColCount > nextKeys.length) {
        const idx = nextKeys.length;
        const name = csvData.dialect.hasHeader
          ? makeUniqueColumnKey(`column_${idx + 1}`, nextKeys)
          : String(idx);
        nextHeaders.push(csvData.dialect.hasHeader ? name : '');
        nextKeys.push(name);
        nextWidths.push(140);
        headersChanged = true;
        for (let r = 0; r < rowsRef.current.length; r++) {
          rowsRef.current[r]!.push('');
        }
      }

      if (csvData.dialect.hasHeader && parsed.columns) {
        for (let c = 0; c < pasteColCount; c++) {
          const targetIdx = startActualCol + c;
          const srcTitle = parsed.columns[c]?.title?.trim();
          const curHeader = (nextHeaders[targetIdx] ?? '').trim();
          if (srcTitle && (curHeader === '' || /^column_\d+$/i.test(curHeader))) {
            const otherKeys = nextKeys.filter((_, idx) => idx !== targetIdx);
            const uniqueTitle = makeUniqueColumnKey(srcTitle, otherKeys);
            nextHeaders[targetIdx] = uniqueTitle;
            nextKeys[targetIdx] = uniqueTitle;
            headersChanged = true;
          }
        }
      }

      const rowsNeeded = dataMatrix.length;
      const existingVisible = viewRowIndices.length;
      const appendedDataRows: number[] = [];
      if (rowsNeeded > existingVisible) {
        const extra = rowsNeeded - existingVisible;
        for (let i = 0; i < extra; i++) {
          const newRow = Array.from({ length: nextKeys.length }, () => '');
          rowsRef.current.push(newRow);
          appendedDataRows.push(rowsRef.current.length - 1);
        }
        appendRowsToOrder(appendedDataRows);
      }

      for (let r = 0; r < rowsNeeded; r++) {
        const dataRowIdx =
          r < existingVisible ? viewRowIndices[r]! : appendedDataRows[r - existingVisible]!;
        const targetRow = rowsRef.current[dataRowIdx];
        if (!targetRow) continue;
        const srcRow = dataMatrix[r]!;
        for (let c = 0; c < srcRow.length; c++) {
          targetRow[startActualCol + c] = srcRow[c] ?? '';
        }
      }

      if (headersChanged) {
        setCsvData({ ...csvData, headers: nextHeaders, columnKeys: nextKeys });
        setAutoWidths(nextWidths);
      }

      if (withStyle && parsed.columns && parsed.columns.length > 0) {
        let text = metaTextRef.current ?? '';
        let patchedAny = false;
        for (let c = 0; c < pasteColCount; c++) {
          const colMetaSrc = parsed.columns[c];
          if (!colMetaSrc) continue;
          const targetKey = nextKeys[startActualCol + c] ?? String(startActualCol + c);
          if (colMetaSrc.style && Object.keys(colMetaSrc.style).length > 0) {
            text = patchMetaJsonc(text, ['columns', targetKey, 'style'], colMetaSrc.style);
            patchedAny = true;
          }
          if (colMetaSrc.align) {
            text = patchMetaJsonc(text, ['columns', targetKey, 'align'], colMetaSrc.align);
            patchedAny = true;
          }
          if (colMetaSrc.wrap) {
            text = patchMetaJsonc(text, ['columns', targetKey, 'wrap'], true);
            patchedAny = true;
          }
          if (colMetaSrc.numberFormat) {
            text = patchMetaJsonc(
              text,
              ['columns', targetKey, 'numberFormat'],
              colMetaSrc.numberFormat,
            );
            patchedAny = true;
          }
        }
        if (patchedAny) {
          scheduleMetaSave(text);
        }
      }

      setDirtyCsv(true);
      setDataVersion((v) => v + 1);
      onDocumentEdit?.(withStyle ? 'Paste column(s) with style' : 'Paste values');
      setStatusMsg(
        `Pasted ${rowsNeeded.toLocaleString()} row${rowsNeeded === 1 ? '' : 's'}${
          pasteColCount > 1 ? ` × ${pasteColCount} cols` : ''
        }${withStyle ? ' (with style)' : ' (values only)'}`,
      );
    },
    [
      csvData,
      isReadOnly,
      copiedColumnRef,
      nativeClipboard,
      meta.columns,
      viewRowIndices,
      autoWidths,
      rowsRef,
      appendRowsToOrder,
      setCsvData,
      setAutoWidths,
      metaTextRef,
      scheduleMetaSave,
      setDirtyCsv,
      setDataVersion,
      onDocumentEdit,
      setStatusMsg,
    ],
  );

  return { handleCopyColumns, handlePasteColumns };
}
