import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HISTORY_RETENTION_POLICY, validateBundleManifest } from '@metatext-editor/core';
import { createNodeIsomorphicHistoryAdapter } from '../isomorphicHistory';
import {
  exportMetaTextBundleNode,
  extractBundleHistoryToTempNode,
  loadMetaTextBundleNode,
  saveMetaTextBundleNode,
  saveMetaTextBundleSnapshotNode,
} from '../bundleExport';

describe('VS Code fflate .metatext.zip bundle export', () => {
  it('exports valid manifest, data, sidecar, and optional history/', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metatext-zip-'));
    try {
      const csvPath = path.join(tmpDir, 'sales.csv');
      const metaPath = `${csvPath}.metatext.jsonc`;
      const csvBody = 'id,amount\r\n1,100\r\n2,250\r\n';
      const metaBody = '{"version":"1","table":{"fontSize":15}}\n';
      await fs.writeFile(csvPath, csvBody, 'utf-8');
      await fs.writeFile(metaPath, metaBody, 'utf-8');

      // Record one snapshot so history/ exists
      const historyAdapter = createNodeIsomorphicHistoryAdapter(csvPath);
      await historyAdapter.saveSnapshot({
        message: 'v1',
        includeDataFromDisk: true,
        metaText: metaBody,
        policy: DEFAULT_HISTORY_RETENTION_POLICY,
      });

      // 1. Export without history (default)
      const zip1 = path.join(tmpDir, 'sales.csv.metatext.zip');
      const res1 = await exportMetaTextBundleNode(csvPath, zip1, false, 'csv');
      expect(res1.includesHistory).toBe(false);
      const unzipped1 = unzipSync(new Uint8Array(await fs.readFile(zip1)));
      const manifest1 = JSON.parse(new TextDecoder().decode(unzipped1['manifest.json']!));
      expect(validateBundleManifest(manifest1).ok).toBe(true);
      expect(new TextDecoder().decode(unzipped1['data/sales.csv']!)).toBe(csvBody);
      expect(new TextDecoder().decode(unzipped1['data/sales.csv.metatext.jsonc']!)).toBe(metaBody);
      expect(unzipped1['history/HEAD']).toBeUndefined();

      // 2. Export with history
      const zip2 = path.join(tmpDir, 'sales_full.csv.metatext.zip');
      const res2 = await exportMetaTextBundleNode(csvPath, zip2, true, 'csv');
      expect(res2.includesHistory).toBe(true);
      const unzipped2 = unzipSync(new Uint8Array(await fs.readFile(zip2)));
      expect(unzipped2['history/HEAD']).toBeDefined();
      expect(unzipped2['history/refs/heads/main']).toBeDefined();

      // 3. Direct open, edit, and atomic save preserves history/
      const loaded = await loadMetaTextBundleNode(zip2);
      expect(loaded.fileName).toBe('sales.csv');
      expect(loaded.includesHistory).toBe(true);
      expect(new TextDecoder().decode(loaded.dataBytes)).toBe(csvBody);
      expect(loaded.metaText).toBe(metaBody);

      const nextCsv = 'id,amount\r\n1,999\r\n2,250\r\n';
      const nextMeta = '{"version":"1","table":{"fontSize":18}}\n';
      await saveMetaTextBundleNode(zip2, { dataBytes: new TextEncoder().encode(nextCsv) });
      await saveMetaTextBundleNode(zip2, { metaText: nextMeta });

      const reloaded = await loadMetaTextBundleNode(zip2);
      expect(new TextDecoder().decode(reloaded.dataBytes)).toBe(nextCsv);
      expect(reloaded.metaText).toBe(nextMeta);
      const unzippedAfter = unzipSync(new Uint8Array(await fs.readFile(zip2)));
      expect(unzippedAfter['history/HEAD']).toBeDefined();

      // 4. Append new snapshot directly inside ZIP's history/
      const appended = await saveMetaTextBundleSnapshotNode(zip2, {
        message: 'v2 inside zip',
        includeData: true,
        metaText: nextMeta,
        policy: DEFAULT_HISTORY_RETENTION_POLICY,
      });
      expect(appended).not.toBeNull();
      const extractedHist = await extractBundleHistoryToTempNode(zip2);
      expect(extractedHist).not.toBeNull();
      const list = await createNodeIsomorphicHistoryAdapter(zip2, extractedHist!).listSnapshots(10);
      expect(list.length).toBe(2);
      expect(list[0]!.message).toBe('v2 inside zip');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
