import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HISTORY_RETENTION_POLICY } from '@metatext-editor/core';
import { adjacentHistoryDir, createNodeIsomorphicHistoryAdapter } from '../isomorphicHistory';

function hasGitCli(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('isomorphic-git Shadow Git HistoryAdapter (Pillar 4 compatibility)', () => {
  it('saves, lists, prunes, restores byte-for-byte, and produces standard Git repos readable by git/gix', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metatext-isogit-'));
    try {
      const csvPath = path.join(tmpDir, '日本語_compat.csv');
      const v1Data = 'id,name\r\n1,Alice\r\n2,田中\r\n';
      const v1Meta = '{"version":"1","view":{"markers":[{"row":0,"color":"amber"}]}}';
      await fs.writeFile(csvPath, v1Data, 'utf-8');

      const adapter = createNodeIsomorphicHistoryAdapter(csvPath);

      // Disabled policy skips recording
      const skipped = await adapter.saveSnapshot({
        message: 'ignored',
        includeDataFromDisk: true,
        metaText: v1Meta,
        policy: { ...DEFAULT_HISTORY_RETENTION_POLICY, enabled: false },
      });
      expect(skipped).toBeNull();

      // Save v1 from disk
      const s1 = await adapter.saveSnapshot({
        message: 'v1 save',
        includeDataFromDisk: true,
        metaText: v1Meta,
        policy: { ...DEFAULT_HISTORY_RETENTION_POLICY, maxCount: 2 },
      });
      expect(s1).not.toBeNull();
      expect(s1!.includesData).toBe(true);
      expect(s1!.shortId.length).toBe(7);

      // Save v2 & v3 to exercise count pruning (maxCount: 2)
      const v2Data = 'id,name\r\n1,Alice\r\n2,佐藤\r\n';
      await fs.writeFile(csvPath, v2Data, 'utf-8');
      await adapter.saveSnapshot({
        message: 'v2 save',
        includeDataFromDisk: true,
        metaText: '{"step":2}',
        policy: { ...DEFAULT_HISTORY_RETENTION_POLICY, maxCount: 2 },
      });

      const v3Data = 'id,name\r\n1,Alice\r\n2,鈴木\r\n';
      await fs.writeFile(csvPath, v3Data, 'utf-8');
      const s3 = await adapter.saveSnapshot({
        message: 'v3 save',
        includeDataFromDisk: true,
        metaText: '{"step":3}',
        policy: { ...DEFAULT_HISTORY_RETENTION_POLICY, maxCount: 2 },
      });

      const list = await adapter.listSnapshots(10);
      expect(list.length).toBe(2);
      expect(list[0]!.message).toBe('v3 save');
      expect(list[1]!.message).toBe('v2 save');

      // Restore v2 byte-for-byte
      const restoredV2 = await adapter.restoreSnapshot(list[1]!.id);
      expect(new TextDecoder().decode(restoredV2.dataBytes)).toBe(v2Data);
      expect(restoredV2.metaText).toBe('{"step":2}');

      // Cross-implementation compatibility check via standard git CLI
      if (hasGitCli()) {
        const gitdir = adjacentHistoryDir(csvPath);
        const fsckOut = execFileSync('git', ['--git-dir', gitdir, 'fsck', '--full'], {
          encoding: 'utf-8',
        });
        expect(fsckOut).not.toContain('error:');

        const countOut = execFileSync(
          'git',
          ['--git-dir', gitdir, 'rev-list', '--count', 'refs/heads/main'],
          { encoding: 'utf-8' },
        ).trim();
        expect(countOut).toBe('2');

        const headData = execFileSync(
          'git',
          ['--git-dir', gitdir, 'show', `${s3!.id}:data`],
          { encoding: 'utf-8' },
        );
        expect(headData).toBe(v3Data);

        const headMeta = execFileSync(
          'git',
          ['--git-dir', gitdir, 'show', `${s3!.id}:sidecar.metatext.jsonc`],
          { encoding: 'utf-8' },
        );
        expect(headMeta).toBe('{"step":3}');
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
