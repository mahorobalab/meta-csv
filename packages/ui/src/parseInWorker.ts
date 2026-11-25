/// <reference path="./vite-env.d.ts" />
import type { CsvDialectConfig } from '@meta-csv/schema';
import {
  estimateColumnWidths,
  parseCsvBytes,
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

let nextReqId = 1;

/**
 * Parse CSV bytes inside an inline Web Worker (with zero-copy ArrayBuffer transfer),
 * falling back to main-thread parsing if Worker creation is unavailable.
 */
export function parseCsvInWorker(
  bytes: Uint8Array,
  override?: CsvDialectConfig,
  onProgress?: (progress: ParseProgress) => void,
): Promise<WorkerParseResult> {
  // Small files (< 512 KB) finish in < 5ms synchronously without worker overhead
  if (bytes.byteLength < 512 * 1024 || typeof Worker === 'undefined') {
    const t0 = performance.now();
    const parsed = parseCsvBytes(bytes, override);
    const autoWidths = estimateColumnWidths(parsed.headers, parsed.rows);
    return Promise.resolve({
      parsed,
      autoWidths,
      elapsedMs: Math.round(performance.now() - t0),
    });
  }

  return new Promise<WorkerParseResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new CsvWorker();
    } catch {
      const t0 = performance.now();
      const parsed = parseCsvBytes(bytes, override, onProgress);
      const autoWidths = estimateColumnWidths(parsed.headers, parsed.rows);
      resolve({
        parsed,
        autoWidths,
        elapsedMs: Math.round(performance.now() - t0),
      });
      return;
    }

    const id = nextReqId++;
    worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        onProgress?.(msg.progress);
      } else if (msg.type === 'done') {
        worker.terminate();
        resolve({
          parsed: msg.parsed,
          autoWidths: msg.autoWidths,
          elapsedMs: msg.elapsedMs,
        });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err instanceof ErrorEvent ? new Error(err.message) : new Error(String(err)));
    };

    // Transfer ownership of the underlying ArrayBuffer if it matches the Uint8Array view
    const transferable =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? [bytes.buffer]
        : [];
    const req: ParseWorkerRequest = { id, bytes, override };
    worker.postMessage(req, transferable);
  });
}
