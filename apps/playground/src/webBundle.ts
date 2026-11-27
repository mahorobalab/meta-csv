import { unzipSync, zipSync } from 'fflate';
import {
  METATEXT_ZIP_SUFFIX,
  checkZipBombLimits,
  createBundleManifest,
  defaultBundleFileName,
  detectTargetFormat,
  isMetaTextZipFileName,
  validateBundleManifest,
  type FileSystemAdapter,
  type HistoryAdapter,
  type MetaTextBundleManifest,
} from '@metatext-editor/core';
import { createWebBundleHistoryAdapter } from './webGitHistory';

export interface ParsedWebBundle {
  bundleFileName: string;
  manifest: MetaTextBundleManifest;
  dataBytes: Uint8Array;
  metaText: string;
  historyEntries: Record<string, Uint8Array>;
}

export function stripMetaTextZipSuffix(fileName: string): string {
  if (isMetaTextZipFileName(fileName)) {
    return fileName.slice(0, -METATEXT_ZIP_SUFFIX.length) || 'untitled.csv';
  }
  return fileName || 'untitled.csv';
}

export function parseMetaTextBundleWeb(
  zipBytes: Uint8Array,
  bundleFileName: string,
): ParsedWebBundle {
  const entries = unzipSync(zipBytes);
  const stats = Object.entries(entries).map(([entryPath, bytes]) => ({
    path: entryPath,
    compressedSize: 0,
    uncompressedSize: bytes.byteLength,
  }));
  const bombCheck = checkZipBombLimits(stats);
  if (!bombCheck.ok) {
    throw new Error(bombCheck.reason);
  }

  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) {
    throw new Error('Missing manifest.json in .metatext.zip bundle');
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(new TextDecoder('utf-8').decode(manifestBytes));
  } catch (err) {
    throw new Error(
      `Invalid manifest.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const manifestCheck = validateBundleManifest(parsedJson);
  if (!manifestCheck.ok) {
    throw new Error(`Invalid manifest.json: ${manifestCheck.reason}`);
  }
  const { manifest } = manifestCheck;

  const dataBytes = entries[manifest.sourceFile];
  if (!dataBytes) {
    throw new Error(`Missing sourceFile in bundle: ${manifest.sourceFile}`);
  }
  const sidecarBytes = entries[manifest.sidecarFile];
  if (!sidecarBytes) {
    throw new Error(`Missing sidecarFile in bundle: ${manifest.sidecarFile}`);
  }
  const metaText = new TextDecoder('utf-8').decode(sidecarBytes);

  const historyEntries: Record<string, Uint8Array> = {};
  for (const [entryPath, bytes] of Object.entries(entries)) {
    if (entryPath.startsWith('history/') && bytes.byteLength > 0) {
      historyEntries[entryPath] = bytes;
    }
  }

  return {
    bundleFileName,
    manifest,
    dataBytes,
    metaText,
    historyEntries,
  };
}

export interface BuildWebBundleInput {
  fileName: string;
  dataBytes: Uint8Array;
  metaText: string;
  existingManifest?: MetaTextBundleManifest;
  existingHistoryEntries?: Record<string, Uint8Array>;
  includeHistory?: boolean;
}

export function buildMetaTextBundleWeb(input: BuildWebBundleInput): {
  bundleFileName: string;
  zipBytes: Uint8Array;
} {
  const sourceBaseName = stripMetaTextZipSuffix(input.fileName);
  const bundleFileName = defaultBundleFileName(sourceBaseName);
  const format = input.existingManifest?.format ?? detectTargetFormat(sourceBaseName);

  const historyKeys = Object.keys(input.existingHistoryEntries ?? {});
  const includeHistory = Boolean(input.includeHistory && historyKeys.length > 0);

  const manifest: MetaTextBundleManifest = input.existingManifest
    ? {
        ...input.existingManifest,
        includesHistory: includeHistory,
      }
    : createBundleManifest({
        fileName: sourceBaseName,
        format,
        includesHistory: includeHistory,
        createdBy: 'MetaText Editor Web v0.1.0',
      });

  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    'manifest.json': encoder.encode(JSON.stringify(manifest, null, 2) + '\n'),
    [manifest.sourceFile]: input.dataBytes,
    [manifest.sidecarFile]: encoder.encode(input.metaText),
  };

  if (includeHistory && input.existingHistoryEntries) {
    for (const [entryPath, bytes] of Object.entries(input.existingHistoryEntries)) {
      files[entryPath] = bytes;
    }
  }

  const zipBytes = zipSync(files, { level: 6 });
  return { bundleFileName, zipBytes };
}

export function triggerZipDownload(fileName: string, zipBytes: Uint8Array): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const copy = new Uint8Array(zipBytes.byteLength);
  copy.set(zipBytes);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface WebBundleSession {
  adapter: FileSystemAdapter;
  historyAdapter: HistoryAdapter;
  getHistoryEntries: () => Promise<Record<string, Uint8Array>>;
}

export function createWebBundleSession(
  file: File,
  onMetaLoaded?: (metaText: string) => void,
): WebBundleSession {
  let cached: ParsedWebBundle | null = null;
  let loadPromise: Promise<ParsedWebBundle> | null = null;

  const ensureLoaded = async (): Promise<ParsedWebBundle> => {
    if (cached) return cached;
    if (!loadPromise) {
      loadPromise = file.arrayBuffer().then((buf) => {
        const parsed = parseMetaTextBundleWeb(new Uint8Array(buf), file.name);
        cached = parsed;
        onMetaLoaded?.(parsed.metaText);
        return parsed;
      });
    }
    return loadPromise;
  };

  const adapter: FileSystemAdapter = {
    async load() {
      const bundle = await ensureLoaded();
      return {
        fileName: bundle.bundleFileName,
        csvBytes: bundle.dataBytes.slice(),
        metaText: bundle.metaText,
      };
    },
    async saveCsv(bytes: Uint8Array) {
      const bundle = await ensureLoaded();
      const nextBytes = bytes.slice();
      bundle.dataBytes = nextBytes;
      const { bundleFileName, zipBytes } = buildMetaTextBundleWeb({
        fileName: file.name,
        dataBytes: nextBytes,
        metaText: bundle.metaText,
        existingManifest: bundle.manifest,
        existingHistoryEntries: bundle.historyEntries,
        includeHistory: Object.keys(bundle.historyEntries).length > 0,
      });
      triggerZipDownload(bundleFileName, zipBytes);
    },
    async saveMeta(text: string) {
      if (cached) {
        cached.metaText = text;
      }
    },
  };

  const historyAdapter = createWebBundleHistoryAdapter(async () => {
    const bundle = await ensureLoaded();
    return bundle.historyEntries;
  });

  return {
    adapter,
    historyAdapter,
    getHistoryEntries: async () => (await ensureLoaded()).historyEntries,
  };
}
