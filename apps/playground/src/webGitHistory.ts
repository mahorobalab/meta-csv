import { Unzlib, unzlibSync, zlibSync } from 'fflate';
import type {
  HistoryAdapter,
  HistoryRestorePayload,
  HistorySnapshotMeta,
  SaveSnapshotInput,
} from '@metatext-editor/core';

const DATA_ENTRY_NAME = 'data';
const META_ENTRY_NAME = 'sidecar.metatext.jsonc';

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

interface GitObject {
  type: 'blob' | 'tree' | 'commit' | 'tag';
  size: number;
  body: Uint8Array;
}

interface ParsedCommit {
  tree: string;
  parents: string[];
  timestampSec: number;
  message: string;
}

interface TreeEntry {
  mode: string;
  name: string;
  oid: string;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function readLooseObject(
  entries: Record<string, Uint8Array>,
  oid: string,
): GitObject | null {
  if (oid.length !== 40) return null;
  const key = `history/objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
  const compressed = entries[key];
  if (!compressed) return null;

  const raw = unzlibSync(compressed);
  const nulIdx = raw.indexOf(0);
  if (nulIdx < 0) return null;

  const header = textDecoder.decode(raw.subarray(0, nulIdx));
  const spaceIdx = header.indexOf(' ');
  if (spaceIdx < 0) return null;

  const type = header.slice(0, spaceIdx) as GitObject['type'];
  const size = Number(header.slice(spaceIdx + 1));
  const body = raw.subarray(nulIdx + 1);
  return { type, size: Number.isFinite(size) ? size : body.byteLength, body };
}

/**
 * Reads only the Git loose object header (`<type> <size>\0`) via streaming Unzlib
 * so listing snapshots does not inflate multi-megabyte data blobs into memory.
 */
function readLooseObjectSize(
  entries: Record<string, Uint8Array>,
  oid: string,
): number | null {
  if (oid.length !== 40) return null;
  const key = `history/objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
  const compressed = entries[key];
  if (!compressed) return null;

  let headerText = '';
  let resolvedSize: number | null = null;
  const uz = new Unzlib((chunk) => {
    if (resolvedSize !== null) return;
    const nulIdx = chunk.indexOf(0);
    if (nulIdx >= 0) {
      headerText += textDecoder.decode(chunk.subarray(0, nulIdx));
      const spaceIdx = headerText.indexOf(' ');
      if (spaceIdx >= 0) {
        const parsed = Number(headerText.slice(spaceIdx + 1));
        if (Number.isFinite(parsed)) {
          resolvedSize = parsed;
        }
      }
    } else if (headerText.length < 64) {
      headerText += textDecoder.decode(chunk);
    }
  });

  const step = 128;
  for (let offset = 0; offset < compressed.byteLength && resolvedSize === null; offset += step) {
    const end = Math.min(offset + step, compressed.byteLength);
    try {
      uz.push(compressed.subarray(offset, end), end >= compressed.byteLength);
    } catch {
      break;
    }
  }

  if (resolvedSize !== null) return resolvedSize;
  const fallback = readLooseObject(entries, oid);
  return fallback ? fallback.size : null;
}

async function writeLooseObject(
  entries: Record<string, Uint8Array>,
  type: 'blob' | 'tree' | 'commit',
  body: Uint8Array,
): Promise<string> {
  const headerBytes = textEncoder.encode(`${type} ${body.byteLength}\0`);
  const raw = new Uint8Array(headerBytes.byteLength + body.byteLength);
  raw.set(headerBytes, 0);
  raw.set(body, headerBytes.byteLength);

  const digest = await crypto.subtle.digest('SHA-1', raw);
  const oid = bytesToHex(new Uint8Array(digest));
  const key = `history/objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
  if (!entries[key]) {
    entries[key] = zlibSync(raw, { level: 6 });
  }
  return oid;
}

function resolveRefOid(
  entries: Record<string, Uint8Array>,
  refPath: string,
): string | null {
  const direct = entries[`history/${refPath}`];
  if (direct) {
    const text = textDecoder.decode(direct).trim();
    if (/^[0-9a-f]{40}$/i.test(text)) return text.toLowerCase();
  }
  const packed = entries['history/packed-refs'];
  if (packed) {
    const lines = textDecoder.decode(packed).split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith('#') || line.startsWith('^')) continue;
      const [oid, name] = line.trim().split(/\s+/);
      if (name === refPath && oid && /^[0-9a-f]{40}$/i.test(oid)) {
        return oid.toLowerCase();
      }
    }
  }
  return null;
}

function resolveHeadOid(entries: Record<string, Uint8Array>): string | null {
  const headBytes = entries['history/HEAD'];
  if (!headBytes) return resolveRefOid(entries, 'refs/heads/main');
  const headText = textDecoder.decode(headBytes).trim();
  if (headText.startsWith('ref:')) {
    const refPath = headText.slice(4).trim();
    return resolveRefOid(entries, refPath);
  }
  if (/^[0-9a-f]{40}$/i.test(headText)) {
    return headText.toLowerCase();
  }
  return null;
}

function parseCommit(body: Uint8Array): ParsedCommit | null {
  const text = textDecoder.decode(body);
  const sepIdx = text.indexOf('\n\n');
  const headerPart = sepIdx >= 0 ? text.slice(0, sepIdx) : text;
  const message = sepIdx >= 0 ? text.slice(sepIdx + 2).trim() : '';

  let tree = '';
  const parents: string[] = [];
  let timestampSec = 0;

  for (const line of headerPart.split('\n')) {
    if (line.startsWith('tree ')) {
      tree = line.slice(5).trim();
    } else if (line.startsWith('parent ')) {
      parents.push(line.slice(7).trim());
    } else if (line.startsWith('committer ') || (timestampSec === 0 && line.startsWith('author '))) {
      const m = line.match(/>\s+(\d+)\s+[+-]\d{4}$/);
      if (m) {
        timestampSec = Number(m[1]) || 0;
      }
    }
  }

  if (!tree) return null;
  return { tree, parents, timestampSec, message };
}

function parseTree(body: Uint8Array): TreeEntry[] {
  const result: TreeEntry[] = [];
  let offset = 0;
  while (offset < body.byteLength) {
    const spaceIdx = body.indexOf(0x20, offset);
    if (spaceIdx < 0) break;
    const nulIdx = body.indexOf(0x00, spaceIdx + 1);
    if (nulIdx < 0 || nulIdx + 21 > body.byteLength) break;

    const mode = textDecoder.decode(body.subarray(offset, spaceIdx));
    const name = textDecoder.decode(body.subarray(spaceIdx + 1, nulIdx));
    const oid = bytesToHex(body.subarray(nulIdx + 1, nulIdx + 21));
    result.push({ mode, name, oid });
    offset = nulIdx + 21;
  }
  return result;
}

function encodeTree(entries: TreeEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  for (const entry of sorted) {
    const prefix = textEncoder.encode(`${entry.mode} ${entry.name}\0`);
    const oidBytes = hexToBytes(entry.oid);
    const chunk = new Uint8Array(prefix.byteLength + oidBytes.byteLength);
    chunk.set(prefix, 0);
    chunk.set(oidBytes, prefix.byteLength);
    chunks.push(chunk);
    totalLen += chunk.byteLength;
  }
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

function buildSnapshotMetaFromEntries(
  entries: Record<string, Uint8Array>,
  oid: string,
): HistorySnapshotMeta | null {
  const commitObj = readLooseObject(entries, oid);
  if (!commitObj || commitObj.type !== 'commit') return null;
  const commit = parseCommit(commitObj.body);
  if (!commit) return null;

  const treeObj = readLooseObject(entries, commit.tree);
  const treeEntries = treeObj && treeObj.type === 'tree' ? parseTree(treeObj.body) : [];

  let dataBytes: number | undefined;
  let metaBytes = 0;
  for (const te of treeEntries) {
    if (te.name === DATA_ENTRY_NAME) {
      const size = readLooseObjectSize(entries, te.oid);
      if (size !== null) dataBytes = size;
    } else if (te.name === META_ENTRY_NAME) {
      const size = readLooseObjectSize(entries, te.oid);
      if (size !== null) metaBytes = size;
    }
  }

  return {
    id: oid,
    shortId: oid.slice(0, 7),
    timestamp: new Date(commit.timestampSec * 1000).toISOString(),
    message: commit.message,
    includesData: dataBytes !== undefined,
    dataBytes,
    metaBytes,
  };
}

export function createWebBundleHistoryAdapter(
  ensureEntries: () => Promise<Record<string, Uint8Array>>,
): HistoryAdapter {
  return {
    async listSnapshots(limit = 100): Promise<HistorySnapshotMeta[]> {
      const entries = await ensureEntries();
      const result: HistorySnapshotMeta[] = [];
      let cur = resolveHeadOid(entries);
      const seen = new Set<string>();
      while (cur && !seen.has(cur) && result.length < limit) {
        seen.add(cur);
        const commitObj = readLooseObject(entries, cur);
        if (!commitObj || commitObj.type !== 'commit') break;
        const commit = parseCommit(commitObj.body);
        if (!commit) break;
        const meta = buildSnapshotMetaFromEntries(entries, cur);
        if (meta) result.push(meta);
        cur = commit.parents[0] ?? null;
      }
      return result;
    },

    async restoreSnapshot(id: string): Promise<HistoryRestorePayload> {
      const entries = await ensureEntries();
      const commitObj = readLooseObject(entries, id);
      if (!commitObj || commitObj.type !== 'commit') {
        throw new Error(`Snapshot commit not found: ${id}`);
      }
      const commit = parseCommit(commitObj.body);
      if (!commit) {
        throw new Error(`Invalid snapshot commit: ${id}`);
      }
      const treeObj = readLooseObject(entries, commit.tree);
      if (!treeObj || treeObj.type !== 'tree') {
        throw new Error(`Snapshot tree not found: ${commit.tree}`);
      }
      const treeEntries = parseTree(treeObj.body);
      let dataBytes: Uint8Array | undefined;
      let metaText = '';
      for (const te of treeEntries) {
        if (te.name === DATA_ENTRY_NAME) {
          const blob = readLooseObject(entries, te.oid);
          if (blob) dataBytes = blob.body.slice();
        } else if (te.name === META_ENTRY_NAME) {
          const blob = readLooseObject(entries, te.oid);
          if (blob) metaText = textDecoder.decode(blob.body);
        }
      }
      return { id, dataBytes, metaText };
    },

    async saveSnapshot(input: SaveSnapshotInput): Promise<HistorySnapshotMeta | null> {
      if (!input.policy.enabled) return null;
      const entries = await ensureEntries();
      if (!entries['history/HEAD']) {
        entries['history/HEAD'] = textEncoder.encode('ref: refs/heads/main\n');
      }
      if (!entries['history/config']) {
        entries['history/config'] = textEncoder.encode(
          '[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = true\n',
        );
      }

      const treeEntries: TreeEntry[] = [];
      const metaBytes = textEncoder.encode(input.metaText);
      const metaOid = await writeLooseObject(entries, 'blob', metaBytes);
      treeEntries.push({ mode: '100644', name: META_ENTRY_NAME, oid: metaOid });

      const maxDataBytes = Math.max(0, input.policy.maxDataFileSizeMb) * 1024 * 1024;
      let includedDataBytes: number | undefined;
      if (input.dataBytes && input.dataBytes.byteLength <= maxDataBytes) {
        const dataOid = await writeLooseObject(entries, 'blob', input.dataBytes);
        treeEntries.push({ mode: '100644', name: DATA_ENTRY_NAME, oid: dataOid });
        includedDataBytes = input.dataBytes.byteLength;
      }

      const treeOid = await writeLooseObject(entries, 'tree', encodeTree(treeEntries));
      const parentOid = resolveHeadOid(entries);
      const tsSec = Math.floor(Date.now() / 1000);
      const lines = [`tree ${treeOid}`];
      if (parentOid) lines.push(`parent ${parentOid}`);
      lines.push(`author MetaText Editor <metatext@local> ${tsSec} +0000`);
      lines.push(`committer MetaText Editor <metatext@local> ${tsSec} +0000`);
      lines.push('');
      lines.push(input.message.trim() || 'Snapshot');
      const commitOid = await writeLooseObject(
        entries,
        'commit',
        textEncoder.encode(lines.join('\n') + '\n'),
      );
      entries['history/refs/heads/main'] = textEncoder.encode(`${commitOid}\n`);

      return {
        id: commitOid,
        shortId: commitOid.slice(0, 7),
        timestamp: new Date(tsSec * 1000).toISOString(),
        message: input.message.trim() || 'Snapshot',
        includesData: includedDataBytes !== undefined,
        dataBytes: includedDataBytes,
        metaBytes: metaBytes.byteLength,
      };
    },

    async getStorageUsageBytes(): Promise<number> {
      const entries = await ensureEntries();
      let total = 0;
      for (const bytes of Object.values(entries)) {
        total += bytes.byteLength;
      }
      return total;
    },
  };
}
