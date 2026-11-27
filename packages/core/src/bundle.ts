import type { MetaTextFormat } from '@metatext-editor/schema';

export const METATEXT_BUNDLE_VERSION = '0.1' as const;
export const METATEXT_ZIP_SUFFIX = '.metatext.zip';

export interface MetaTextBundleManifest {
  bundleVersion: typeof METATEXT_BUNDLE_VERSION;
  format: MetaTextFormat;
  sourceFile: string;
  sidecarFile: string;
  includesHistory: boolean;
  createdAt: string;
  createdBy: string;
}

export interface CreateBundleManifestInput {
  fileName: string;
  format: MetaTextFormat;
  includesHistory: boolean;
  createdBy?: string;
  createdAt?: string;
}

export interface ZipEntryStat {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
}

export interface ZipBombLimits {
  maxEntries?: number;
  maxTotalUncompressedBytes?: number;
  maxCompressionRatio?: number;
}

export const DEFAULT_ZIP_BOMB_LIMITS: Required<ZipBombLimits> = {
  maxEntries: 10_000,
  maxTotalUncompressedBytes: 512 * 1024 * 1024, // 512 MB
  maxCompressionRatio: 100,
};

export function isMetaTextZipFileName(name: string): boolean {
  return name.toLowerCase().endsWith(METATEXT_ZIP_SUFFIX);
}

export function defaultBundleFileName(sourceFileName: string): string {
  const trimmed = sourceFileName.trim() || 'untitled.csv';
  if (isMetaTextZipFileName(trimmed)) return trimmed;
  return `${trimmed}${METATEXT_ZIP_SUFFIX}`;
}

export function validateZipEntryPath(
  entryPath: string,
): { ok: true; normalized: string } | { ok: false; reason: string } {
  if (!entryPath || entryPath.trim().length === 0) {
    return { ok: false, reason: 'Empty ZIP entry path' };
  }
  if (/[\x00-\x1f]/.test(entryPath)) {
    return { ok: false, reason: `Control character in ZIP entry path: ${entryPath}` };
  }
  const normalized = entryPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return { ok: false, reason: `Absolute path or drive letter not allowed: ${entryPath}` };
  }
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (seg === '..') {
      return { ok: false, reason: `Path traversal ('..') not allowed: ${entryPath}` };
    }
  }
  return { ok: true, normalized };
}

export function createBundleManifest(input: CreateBundleManifestInput): MetaTextBundleManifest {
  const safeBaseName = input.fileName.replace(/[\\/]/g, '_') || 'untitled.csv';
  return {
    bundleVersion: METATEXT_BUNDLE_VERSION,
    format: input.format,
    sourceFile: `data/${safeBaseName}`,
    sidecarFile: `data/${safeBaseName}.metatext.jsonc`,
    includesHistory: input.includesHistory,
    createdAt: input.createdAt ?? new Date().toISOString(),
    createdBy: input.createdBy ?? 'MetaText Editor v0.1.0',
  };
}

const VALID_FORMATS = new Set<string>(['csv', 'tsv', 'jsonl', 'log', 'text']);

export function validateBundleManifest(
  raw: unknown,
): { ok: true; manifest: MetaTextBundleManifest } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'manifest.json must be a JSON object' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.bundleVersion !== METATEXT_BUNDLE_VERSION) {
    return { ok: false, reason: `Unsupported bundleVersion: ${String(obj.bundleVersion)}` };
  }
  if (typeof obj.format !== 'string' || !VALID_FORMATS.has(obj.format)) {
    return { ok: false, reason: `Invalid format in manifest: ${String(obj.format)}` };
  }
  if (typeof obj.sourceFile !== 'string' || typeof obj.sidecarFile !== 'string') {
    return { ok: false, reason: 'manifest.json must specify sourceFile and sidecarFile' };
  }

  const srcCheck = validateZipEntryPath(obj.sourceFile);
  if (!srcCheck.ok) return srcCheck;
  const sidecarCheck = validateZipEntryPath(obj.sidecarFile);
  if (!sidecarCheck.ok) return sidecarCheck;

  if (!srcCheck.normalized.startsWith('data/')) {
    return { ok: false, reason: `sourceFile must be under data/: ${obj.sourceFile}` };
  }
  if (!sidecarCheck.normalized.startsWith('data/') || !sidecarCheck.normalized.endsWith('.metatext.jsonc')) {
    return { ok: false, reason: `sidecarFile must be under data/ and end with .metatext.jsonc: ${obj.sidecarFile}` };
  }
  if (typeof obj.includesHistory !== 'boolean') {
    return { ok: false, reason: 'includesHistory must be a boolean' };
  }

  return {
    ok: true,
    manifest: {
      bundleVersion: METATEXT_BUNDLE_VERSION,
      format: obj.format as MetaTextFormat,
      sourceFile: srcCheck.normalized,
      sidecarFile: sidecarCheck.normalized,
      includesHistory: obj.includesHistory,
      createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : '',
      createdBy: typeof obj.createdBy === 'string' ? obj.createdBy : '',
    },
  };
}

export function checkZipBombLimits(
  entries: ZipEntryStat[],
  limits: ZipBombLimits = {},
): { ok: true; totalUncompressedBytes: number } | { ok: false; reason: string } {
  const maxEntries = limits.maxEntries ?? DEFAULT_ZIP_BOMB_LIMITS.maxEntries;
  const maxTotal =
    limits.maxTotalUncompressedBytes ?? DEFAULT_ZIP_BOMB_LIMITS.maxTotalUncompressedBytes;
  const maxRatio = limits.maxCompressionRatio ?? DEFAULT_ZIP_BOMB_LIMITS.maxCompressionRatio;

  if (entries.length > maxEntries) {
    return {
      ok: false,
      reason: `ZIP contains too many entries (${entries.length} > ${maxEntries})`,
    };
  }

  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    const pathCheck = validateZipEntryPath(entry.path);
    if (!pathCheck.ok) return pathCheck;

    totalUncompressedBytes += Math.max(0, entry.uncompressedSize);
    if (totalUncompressedBytes > maxTotal) {
      return {
        ok: false,
        reason: `ZIP uncompressed size exceeds limit (${totalUncompressedBytes} > ${maxTotal} bytes)`,
      };
    }

    // Apply compression ratio guard only on entries >= 1 MB (small repetitive text legitimately compresses > 100x)
    if (entry.uncompressedSize >= 1024 * 1024 && entry.compressedSize > 0) {
      const ratio = entry.uncompressedSize / entry.compressedSize;
      if (ratio > maxRatio) {
        return {
          ok: false,
          reason: `Suspicious compression ratio (${ratio.toFixed(1)}x > ${maxRatio}x) on ${entry.path}`,
        };
      }
    }
  }

  return { ok: true, totalUncompressedBytes };
}
