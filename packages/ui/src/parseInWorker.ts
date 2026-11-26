/// <reference path="./vite-env.d.ts" />
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
import CsvWorker from './csvWorker?worker&inline';
import type { ParseWorkerRequest, ParseWorkerResponse } from './csvWorker';

export interface WorkerParseResult {
  parsed: ParsedCsvData;
  autoWidths: number[];
  elapsedMs: number;
}

export interface TabularParseOptions {
  format?: MetaTextFormat;
  csv?: CsvDialectConfig;
  jsonl?: JsonlParserConfig;
}

let nextReqId = 1;

function parseSync(bytes: Uint8Array, options: TabularParseOptions, onProgress?: (progress: ParseProgress) => void): WorkerParseResult {
  const t0 = performance.now();
  const parsed =
    options.format === 'jsonl'
      ? parseJsonlBytes(bytes, options.jsonl, onProgress)
      : parseCsvBytes(bytes, options.csv, onProgress);
  const autoWidths = estimateColumnWidths(parsed.headers, parsed.rows);
  return {
    parsed,
    autoWidths,
    elapsedMs: Math.round(performance.now() - t0),
  };
}

/**
 * Parse CSV/TSV/JSONL bytes inside an inline Web Worker (with zero-copy ArrayBuffer transfer),
 * falling back to main-thread parsing if Worker creation is unavailable.
 */
export function parseTabularInWorker(
  bytes: Uint8Array,
  options: TabularParseOptions = {},
  onProgress?: (progress: ParseProgress) => void,
  signal?: AbortSignal,
): Promise<WorkerParseResult> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('File parse aborted', 'AbortError'));
  }

  // Small files (< 512 KB) finish in < 5ms synchronously without worker overhead
  if (bytes.byteLength < 512 * 1024 || typeof Worker === 'undefined') {
    return Promise.resolve(parseSync(bytes, options));
  }

  return new Promise<WorkerParseResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new CsvWorker();
    } catch {
      resolve(parseSync(bytes, options, onProgress));
      return;
    }

    const id = nextReqId++;
    const onAbort = () => {
      worker.terminate();
      reject(new DOMException('File parse aborted', 'AbortError'));
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        onProgress?.(msg.progress);
      } else if (msg.type === 'done') {
        cleanup();
        worker.terminate();
        resolve({
          parsed: msg.parsed,
          autoWidths: msg.autoWidths,
          elapsedMs: msg.elapsedMs,
        });
      } else if (msg.type === 'error') {
        cleanup();
        worker.terminate();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      worker.terminate();
      reject(err instanceof ErrorEvent ? new Error(err.message) : new Error(String(err)));
    };

    // Transfer ownership of the underlying ArrayBuffer if it matches the Uint8Array view
    const transferable =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? [bytes.buffer]
        : [];
    const req: ParseWorkerRequest = {
      id,
      bytes,
      format: options.format,
      override: options.csv,
      jsonlOverride: options.jsonl,
    };
    worker.postMessage(req, transferable);
  });
}

export function parseCsvInWorker(
  bytes: Uint8Array,
  override?: CsvDialectConfig,
  onProgress?: (progress: ParseProgress) => void,
  signal?: AbortSignal,
): Promise<WorkerParseResult> {
  return parseTabularInWorker(bytes, { format: 'csv', csv: override }, onProgress, signal);
}
