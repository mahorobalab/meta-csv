import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { unzipSync, zipSync, type Zippable } from 'fflate';
import type {
  HistoryRetentionPolicy,
  HistorySnapshotMeta,
} from '@metatext-editor/core';
import {
  adjacentHistoryDir,
  createNodeIsomorphicHistoryAdapter,
} from './isomorphicHistory';

const MAX_ZIP_ENTRIES = 10_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;

export interface NodeBundleExportResult {
  destPath: string;
  zipBytes: number;
  includesHistory: boolean;
}

export interface NodeBundleLoaded {
  fileName: string;
  format: string;
  dataBytes: Uint8Array;
  metaText: string;
  includesHistory: boolean;
}

interface ParsedManifest {
  bundleVersion: string;
  format: string;
  sourceFile: string;
  sidecarFile: string;
  includesHistory: boolean;
  createdAt: string;
  createdBy: string;
}

function validateSafeEntryPath(entryPath: string): string {
  if (!entryPath || entryPath.trim().length === 0) {
    throw new Error('Empty ZIP entry path');
  }
  const norm = entryPath.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm) || norm.split('/').includes('..')) {
    throw new Error(`Unsafe ZIP entry path: ${entryPath}`);
  }
  return norm;
}

function unzipAndValidateBundle(rawZip: Uint8Array): {
  entries: Record<string, Uint8Array>;
  manifest: ParsedManifest;
} {
  const entries = unzipSync(rawZip);
  const keys = Object.keys(entries);
  if (keys.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP contains too many entries (${keys.length} > ${MAX_ZIP_ENTRIES})`);
  }
  let totalBytes = 0;
  for (const k of keys) {
    validateSafeEntryPath(k);
    totalBytes += entries[k]!.byteLength;
    if (totalBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error(`ZIP uncompressed size exceeds limit (${totalBytes} bytes)`);
    }
  }
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) {
    throw new Error('Invalid .metatext.zip: missing manifest.json');
  }
  const parsed = JSON.parse(new TextDecoder().decode(manifestBytes)) as Partial<ParsedManifest>;
  if (parsed.bundleVersion !== '0.1') {
    throw new Error(`Unsupported bundleVersion: ${String(parsed.bundleVersion)}`);
  }
  const srcNorm = validateSafeEntryPath(String(parsed.sourceFile ?? ''));
  const sidecarNorm = validateSafeEntryPath(String(parsed.sidecarFile ?? ''));
  if (!srcNorm.startsWith('data/')) {
    throw new Error(`Invalid manifest.sourceFile: ${srcNorm}`);
  }
  if (!sidecarNorm.startsWith('data/') || !sidecarNorm.endsWith('.metatext.jsonc')) {
    throw new Error(`Invalid manifest.sidecarFile: ${sidecarNorm}`);
  }
  return {
    entries,
    manifest: {
      bundleVersion: '0.1',
      format: String(parsed.format ?? 'csv'),
      sourceFile: srcNorm,
      sidecarFile: sidecarNorm,
      includesHistory: Boolean(parsed.includesHistory),
      createdAt:
        typeof parsed.createdAt === 'string' && parsed.createdAt.length > 0
          ? parsed.createdAt
          : new Date().toISOString(),
      createdBy:
        typeof parsed.createdBy === 'string' && parsed.createdBy.length > 0
          ? parsed.createdBy
          : 'MetaText Editor v0.1.0',
    },
  };
}

export async function loadMetaTextBundleNode(zipPath: string): Promise<NodeBundleLoaded> {
  const raw = new Uint8Array(await fs.readFile(zipPath));
  const { entries, manifest } = unzipAndValidateBundle(raw);
  const dataBytes = entries[manifest.sourceFile];
  if (!dataBytes) {
    throw new Error(`Missing data entry '${manifest.sourceFile}' in bundle`);
  }
  const sidecarBytes = entries[manifest.sidecarFile];
  const metaText = sidecarBytes ? new TextDecoder().decode(sidecarBytes) : '';
  const fileName = manifest.sourceFile.replace(/^data\//, '') || path.basename(zipPath);
  return {
    fileName,
    format: manifest.format,
    dataBytes,
    metaText,
    includesHistory: manifest.includesHistory,
  };
}

export async function saveMetaTextBundleNode(
  zipPath: string,
  update: { dataBytes?: Uint8Array; metaText?: string },
): Promise<void> {
  const raw = new Uint8Array(await fs.readFile(zipPath));
  const { entries, manifest } = unzipAndValidateBundle(raw);
  if (update.dataBytes !== undefined) {
    entries[manifest.sourceFile] = update.dataBytes;
  }
  if (update.metaText !== undefined) {
    entries[manifest.sidecarFile] = new TextEncoder().encode(update.metaText);
  }
  const zipped = zipSync(entries as Zippable, { level: 6 });
  const tmpPath = `${zipPath}.tmp`;
  await fs.writeFile(tmpPath, zipped);
  await fs.rename(tmpPath, zipPath);
}

export async function extractBundleHistoryToTempNode(zipPath: string): Promise<string | null> {
  const st = await fs.stat(zipPath);
  const raw = new Uint8Array(await fs.readFile(zipPath));
  const { entries } = unzipAndValidateBundle(raw);
  if (!entries['history/HEAD']) {
    return null;
  }
  const key = crypto
    .createHash('sha1')
    .update(`${zipPath}:${Math.trunc(st.mtimeMs)}`)
    .digest('hex');
  const cacheDir = path.join(os.tmpdir(), 'metatext-bundle-history', key);
  try {
    await fs.access(path.join(cacheDir, 'HEAD'));
    return cacheDir;
  } catch {
    // Extract fresh
  }
  await fs.mkdir(cacheDir, { recursive: true });
  for (const [entryName, bytes] of Object.entries(entries)) {
    if (!entryName.startsWith('history/')) continue;
    const rel = entryName.slice('history/'.length);
    if (!rel || rel.endsWith('/')) continue;
    const outPath = path.join(cacheDir, rel);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, bytes);
  }
  return cacheDir;
}

/**
 * Records a new Shadow Git snapshot directly inside `<zipPath>`'s `history/`
 * entry (setting `manifest.includesHistory = true`) atomically via `.tmp`.
 */
export async function saveMetaTextBundleSnapshotNode(
  zipPath: string,
  options: {
    message: string;
    includeData: boolean;
    metaText: string;
    policy: HistoryRetentionPolicy;
  },
): Promise<HistorySnapshotMeta | null> {
  if (!options.policy.enabled) return null;

  const raw = new Uint8Array(await fs.readFile(zipPath));
  const { entries, manifest } = unzipAndValidateBundle(raw);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metatext-bundle-snap-'));
  try {
    // Extract existing history/ into workDir
    for (const [entryName, bytes] of Object.entries(entries)) {
      if (!entryName.startsWith('history/')) continue;
      const rel = entryName.slice('history/'.length);
      if (!rel || rel.endsWith('/')) continue;
      const outPath = path.join(workDir, rel);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, bytes);
    }

    const dataBytes = options.includeData ? entries[manifest.sourceFile] : undefined;
    const historyAdapter = createNodeIsomorphicHistoryAdapter(zipPath, workDir);
    const saved = await historyAdapter.saveSnapshot({
      message: options.message,
      dataBytes,
      metaText: options.metaText,
      policy: options.policy,
    });
    if (!saved) return null;

    // Rebuild ZIP with updated manifest.json + new history/
    const nextEntries: Record<string, Uint8Array> = {};
    for (const [k, v] of Object.entries(entries)) {
      if (k === 'manifest.json' || k.startsWith('history/')) continue;
      nextEntries[k] = v;
    }
    const updatedManifest = { ...manifest, includesHistory: true };
    nextEntries['manifest.json'] = new TextEncoder().encode(
      `${JSON.stringify(updatedManifest, null, 2)}\n`,
    );
    await collectDirEntries(workDir, workDir, 'history', nextEntries);

    const zipped = zipSync(nextEntries as Zippable, { level: 6 });
    const tmpPath = `${zipPath}.snap.tmp`;
    await fs.writeFile(tmpPath, zipped);
    await fs.rename(tmpPath, zipPath);
    return saved;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

function detectFormatFromName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tsv')) return 'tsv';
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return 'jsonl';
  if (lower.endsWith('.log')) return 'log';
  if (lower.endsWith('.txt')) return 'text';
  return 'csv';
}

async function collectDirEntries(
  rootDir: string,
  currentDir: string,
  zipPrefix: string,
  out: Record<string, Uint8Array>,
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectDirEntries(rootDir, full, zipPrefix, out);
    } else if (entry.isFile()) {
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');
      out[`${zipPrefix}/${rel}`] = new Uint8Array(await fs.readFile(full));
    }
  }
}

async function pathIsDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Exports `<sourceFile>` + `<sourceFile>.metatext.jsonc` + optional `<sourceFile>.metatext.history/`
 * as a standard `.metatext.zip` bundle atomically via a `.tmp` file.
 */
export async function exportMetaTextBundleNode(
  sourceFilePath: string,
  destZipPath: string,
  includeHistory: boolean,
  explicitFormat?: string,
): Promise<NodeBundleExportResult> {
  const fileName = path.basename(sourceFilePath);
  const sidecarPath = `${sourceFilePath}.metatext.jsonc`;
  const historyDir = adjacentHistoryDir(sourceFilePath);
  const actualIncludeHistory = includeHistory && (await pathIsDirectory(historyDir));

  const manifest = {
    bundleVersion: '0.1',
    format: explicitFormat?.trim() || detectFormatFromName(fileName),
    sourceFile: `data/${fileName}`,
    sidecarFile: `data/${fileName}.metatext.jsonc`,
    includesHistory: actualIncludeHistory,
    createdAt: new Date().toISOString(),
    createdBy: 'MetaText Editor v0.1.0',
  };

  const files: Record<string, Uint8Array> = {};
  const enc = new TextEncoder();
  files['manifest.json'] = enc.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  files[manifest.sourceFile] = new Uint8Array(await fs.readFile(sourceFilePath));

  try {
    files[manifest.sidecarFile] = new Uint8Array(await fs.readFile(sidecarPath));
  } catch {
    files[manifest.sidecarFile] = enc.encode('{\n  "version": "1"\n}\n');
  }

  if (actualIncludeHistory) {
    await collectDirEntries(historyDir, historyDir, 'history', files);
  }

  const zipped = zipSync(files as Zippable, { level: 6 });

  await fs.mkdir(path.dirname(destZipPath), { recursive: true });
  const tmpPath = `${destZipPath}.tmp`;
  await fs.writeFile(tmpPath, zipped);
  await fs.rename(tmpPath, destZipPath);

  return {
    destPath: destZipPath,
    zipBytes: zipped.byteLength,
    includesHistory: actualIncludeHistory,
  };
}
