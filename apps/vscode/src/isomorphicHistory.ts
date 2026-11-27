import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import git from 'isomorphic-git';
import type {
  HistoryAdapter,
  HistoryRestorePayload,
  HistoryRetentionPolicy,
  HistorySnapshotMeta,
  SaveSnapshotInput,
} from '@metatext-editor/core';

const MAIN_REF = 'refs/heads/main';
const DATA_ENTRY_NAME = 'data';
const META_ENTRY_NAME = 'sidecar.metatext.jsonc';

export const DEFAULT_VSCODE_HISTORY_POLICY: HistoryRetentionPolicy = {
  enabled: true,
  mode: 'count',
  maxCount: 10,
  maxTotalSizeMb: 10,
  maxDataFileSizeMb: 20,
};

export function adjacentHistoryDir(targetFilePath: string): string {
  return `${targetFilePath}.metatext.history`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile()) {
      try {
        const st = await fsp.stat(full);
        total += st.size;
      } catch {
        // Ignore transient disappearance
      }
    } else if (entry.isDirectory()) {
      total += await dirSizeBytes(full);
    }
  }
  return total;
}

async function ensureBareRepo(gitdir: string): Promise<void> {
  const headPath = path.join(gitdir, 'HEAD');
  if (await pathExists(headPath)) return;
  await fsp.mkdir(gitdir, { recursive: true });
  await git.init({ fs, gitdir, bare: true, defaultBranch: 'main' });
  // Self-ignore so parent Git repositories never report this history folder as untracked
  await fsp.writeFile(path.join(gitdir, '.gitignore'), '*\n', 'utf-8');
}

async function resolveMainOid(gitdir: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs, gitdir, ref: MAIN_REF });
  } catch {
    return null;
  }
}

async function collectCommitChain(gitdir: string): Promise<string[]> {
  const chain: string[] = [];
  let cur = await resolveMainOid(gitdir);
  while (cur && chain.length < 10_000) {
    chain.push(cur);
    const { commit } = await git.readCommit({ fs, gitdir, oid: cur });
    cur = commit.parent[0] ?? null;
  }
  return chain;
}

async function buildSnapshotMeta(gitdir: string, oid: string): Promise<HistorySnapshotMeta> {
  const { commit } = await git.readCommit({ fs, gitdir, oid });
  const { tree } = await git.readTree({ fs, gitdir, oid: commit.tree });

  let dataBytes: number | undefined;
  let metaBytes = 0;

  for (const entry of tree) {
    if (entry.path === DATA_ENTRY_NAME) {
      const { blob } = await git.readBlob({ fs, gitdir, oid: entry.oid });
      dataBytes = blob.byteLength;
    } else if (entry.path === META_ENTRY_NAME) {
      const { blob } = await git.readBlob({ fs, gitdir, oid: entry.oid });
      metaBytes = blob.byteLength;
    }
  }

  const tsSec = commit.committer.timestamp || commit.author.timestamp || 0;
  return {
    id: oid,
    shortId: oid.slice(0, 7),
    timestamp: new Date(tsSec * 1000).toISOString(),
    message: commit.message.trim(),
    includesData: dataBytes !== undefined,
    dataBytes,
    metaBytes,
  };
}

async function sweepUnreachableLooseObjects(
  gitdir: string,
  reachableOids: Set<string>,
): Promise<void> {
  const objectsDir = path.join(gitdir, 'objects');
  let fanouts: fs.Dirent[];
  try {
    fanouts = await fsp.readdir(objectsDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const fanout of fanouts) {
    if (!fanout.isDirectory() || !/^[0-9a-f]{2}$/i.test(fanout.name)) continue;
    const fanoutPath = path.join(objectsDir, fanout.name);
    let objs: fs.Dirent[];
    try {
      objs = await fsp.readdir(fanoutPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const obj of objs) {
      if (!obj.isFile()) continue;
      const fullHex = `${fanout.name}${obj.name}`.toLowerCase();
      if (!reachableOids.has(fullHex)) {
        await fsp.unlink(path.join(fanoutPath, obj.name)).catch(() => {});
      }
    }
    try {
      const remaining = await fsp.readdir(fanoutPath);
      if (remaining.length === 0) {
        await fsp.rmdir(fanoutPath).catch(() => {});
      }
    } catch {
      // Ignore
    }
  }
}

async function truncateChainAndGc(
  gitdir: string,
  chainNewestFirst: string[],
  keepCount: number,
): Promise<string> {
  const keep = Math.max(1, Math.min(chainNewestFirst.length, keepCount));
  const keptOldestFirst = chainNewestFirst.slice(0, keep).reverse();

  let newParent: string | null = null;
  let newHead = keptOldestFirst[keptOldestFirst.length - 1]!;
  const reachable = new Set<string>();

  for (const oldOid of keptOldestFirst) {
    const { commit } = await git.readCommit({ fs, gitdir, oid: oldOid });
    reachable.add(commit.tree.toLowerCase());
    const { tree } = await git.readTree({ fs, gitdir, oid: commit.tree });
    for (const entry of tree) {
      reachable.add(entry.oid.toLowerCase());
    }

    const nextOid = await git.writeCommit({
      fs,
      gitdir,
      commit: {
        message: commit.message,
        tree: commit.tree,
        parent: newParent ? [newParent] : [],
        author: commit.author,
        committer: commit.committer,
      },
    });
    reachable.add(nextOid.toLowerCase());
    newParent = nextOid;
    newHead = nextOid;
  }

  await git.writeRef({ fs, gitdir, ref: MAIN_REF, value: newHead, force: true });
  await sweepUnreachableLooseObjects(gitdir, reachable);
  return newHead;
}

async function pruneRepo(
  gitdir: string,
  policy: HistoryRetentionPolicy,
): Promise<string | null> {
  const chain = await collectCommitChain(gitdir);
  if (chain.length <= 1) return null;

  if (policy.mode === 'sizeMb') {
    const maxBytes = Math.max(1, policy.maxTotalSizeMb) * 1024 * 1024;
    if ((await dirSizeBytes(gitdir)) <= maxBytes) return null;
    let keep = chain.length - 1;
    let latest = chain[0]!;
    while (keep >= 1) {
      latest = await truncateChainAndGc(gitdir, chain, keep);
      if ((await dirSizeBytes(gitdir)) <= maxBytes || keep === 1) break;
      keep--;
    }
    return latest;
  }

  const maxCount = Math.max(1, policy.maxCount);
  if (chain.length > maxCount) {
    return truncateChainAndGc(gitdir, chain, maxCount);
  }
  return null;
}

/**
 * Node.js + `isomorphic-git` HistoryAdapter for VS Code extension.
 * Writes and reads standard bare Git objects in `<targetFile>.metatext.history/`
 * with 100% format compatibility with Desktop's Rust (`gix`) implementation.
 */
export function createNodeIsomorphicHistoryAdapter(
  targetFilePath: string,
  overrideGitdir?: string,
): HistoryAdapter {
  const gitdir = overrideGitdir ?? adjacentHistoryDir(targetFilePath);

  return {
    readsSavedFileDirectly: true,

    async saveSnapshot(input: SaveSnapshotInput): Promise<HistorySnapshotMeta | null> {
      if (!input.policy.enabled) return null;
      await ensureBareRepo(gitdir);

      const maxDataBytes = Math.max(0, input.policy.maxDataFileSizeMb) * 1024 * 1024;
      let effectiveData: Uint8Array | undefined = input.dataBytes;
      if (!effectiveData && input.includeDataFromDisk && maxDataBytes > 0) {
        try {
          const st = await fsp.stat(targetFilePath);
          if (st.size <= maxDataBytes) {
            effectiveData = new Uint8Array(await fsp.readFile(targetFilePath));
          }
        } catch {
          effectiveData = undefined;
        }
      } else if (effectiveData && effectiveData.byteLength > maxDataBytes) {
        effectiveData = undefined;
      }

      const metaBlobOid = await git.writeBlob({
        fs,
        gitdir,
        blob: new TextEncoder().encode(input.metaText),
      });

      const entries: Array<{ mode: string; path: string; oid: string; type: 'blob' }> = [];
      if (effectiveData) {
        const dataBlobOid = await git.writeBlob({
          fs,
          gitdir,
          blob: effectiveData,
        });
        entries.push({
          mode: '100644',
          path: DATA_ENTRY_NAME,
          oid: dataBlobOid,
          type: 'blob',
        });
      }
      entries.push({
        mode: '100644',
        path: META_ENTRY_NAME,
        oid: metaBlobOid,
        type: 'blob',
      });
      entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

      const treeOid = await git.writeTree({ fs, gitdir, tree: entries });
      const parent = await resolveMainOid(gitdir);
      const nowSec = Math.floor(Date.now() / 1000);
      const author = {
        name: 'MetaText Editor',
        email: 'history@metatext.local',
        timestamp: nowSec,
        timezoneOffset: 0,
      };
      const commitOid = await git.writeCommit({
        fs,
        gitdir,
        commit: {
          message: `${(input.message || 'Snapshot').trim()}\n`,
          tree: treeOid,
          parent: parent ? [parent] : [],
          author,
          committer: author,
        },
      });
      await git.writeRef({ fs, gitdir, ref: MAIN_REF, value: commitOid, force: true });

      const finalHead = (await pruneRepo(gitdir, input.policy)) ?? commitOid;
      return buildSnapshotMeta(gitdir, finalHead);
    },

    async listSnapshots(limit = 50): Promise<HistorySnapshotMeta[]> {
      if (!(await pathExists(path.join(gitdir, 'HEAD')))) return [];
      const chain = await collectCommitChain(gitdir);
      const sliced = chain.slice(0, limit);
      const metas: HistorySnapshotMeta[] = [];
      for (const oid of sliced) {
        metas.push(await buildSnapshotMeta(gitdir, oid));
      }
      return metas;
    },

    async restoreSnapshot(id: string): Promise<HistoryRestorePayload> {
      if (!(await pathExists(path.join(gitdir, 'HEAD')))) {
        throw new Error('No history repository exists for this file');
      }
      const { commit } = await git.readCommit({ fs, gitdir, oid: id });
      const { tree } = await git.readTree({ fs, gitdir, oid: commit.tree });

      let dataBytes: Uint8Array | undefined;
      let metaText = '';

      for (const entry of tree) {
        if (entry.path === DATA_ENTRY_NAME) {
          const { blob } = await git.readBlob({ fs, gitdir, oid: entry.oid });
          dataBytes = new Uint8Array(blob);
        } else if (entry.path === META_ENTRY_NAME) {
          const { blob } = await git.readBlob({ fs, gitdir, oid: entry.oid });
          metaText = new TextDecoder().decode(blob);
        }
      }

      return { id, dataBytes, metaText };
    },

    async getStorageUsageBytes(): Promise<number> {
      if (!(await pathExists(gitdir))) return 0;
      return dirSizeBytes(gitdir);
    },

    async clearHistory(): Promise<void> {
      await fsp.rm(gitdir, { recursive: true, force: true });
    },
  };
}
