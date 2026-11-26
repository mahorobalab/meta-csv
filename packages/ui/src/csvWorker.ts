import type {
  CsvDialectConfig,
  JsonlParserConfig,
  MetaTextFormat,
} from '@meta-csv/schema';
import {
  estimateColumnWidths,
  parseCsvBytes,
  parseJsonlBytes,
  type ParseProgress,
  type ParsedCsvData,
} from '@meta-csv/core';

export interface ParseWorkerRequest {
  id: number;
  bytes: Uint8Array;
  format?: MetaTextFormat;
  override?: CsvDialectConfig;
  jsonlOverride?: JsonlParserConfig;
}

export type ParseWorkerResponse =
  | { id: number; type: 'progress'; progress: ParseProgress }
  | {
      id: number;
      type: 'done';
      parsed: ParsedCsvData;
      autoWidths: number[];
      elapsedMs: number;
    }
  | { id: number; type: 'error'; message: string };

self.onmessage = (event: MessageEvent<ParseWorkerRequest>) => {
  const { id, bytes, format, override, jsonlOverride } = event.data;
  try {
    const t0 = performance.now();
    const onProgress = (progress: ParseProgress) => {
      const msg: ParseWorkerResponse = { id, type: 'progress', progress };
      self.postMessage(msg);
    };
    const parsed =
      format === 'jsonl'
        ? parseJsonlBytes(bytes, jsonlOverride, onProgress)
        : parseCsvBytes(bytes, override, onProgress);
    const autoWidths = estimateColumnWidths(parsed.headers, parsed.rows);
    const elapsedMs = Math.round(performance.now() - t0);
    const doneMsg: ParseWorkerResponse = {
      id,
      type: 'done',
      parsed,
      autoWidths,
      elapsedMs,
    };
    self.postMessage(doneMsg);
  } catch (err) {
    const errMsg: ParseWorkerResponse = {
      id,
      type: 'error',
      message: String(err),
    };
    self.postMessage(errMsg);
  }
};
