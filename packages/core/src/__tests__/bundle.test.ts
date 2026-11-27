import { describe, expect, it } from 'vitest';
import {
  checkZipBombLimits,
  createBundleManifest,
  defaultBundleFileName,
  isMetaTextZipFileName,
  validateBundleManifest,
  validateZipEntryPath,
} from '../bundle';

describe('bundle (.metatext.zip) manifest and security guards', () => {
  it('generates and validates manifest.json cleanly', () => {
    expect(isMetaTextZipFileName('report.csv.metatext.zip')).toBe(true);
    expect(isMetaTextZipFileName('report.csv')).toBe(false);
    expect(defaultBundleFileName('report.csv')).toBe('report.csv.metatext.zip');
    expect(defaultBundleFileName('report.csv.metatext.zip')).toBe('report.csv.metatext.zip');

    const manifest = createBundleManifest({
      fileName: 'report.csv',
      format: 'csv',
      includesHistory: false,
      createdAt: '2026-11-27T00:00:00Z',
    });
    expect(manifest.sourceFile).toBe('data/report.csv');
    expect(manifest.sidecarFile).toBe('data/report.csv.metatext.jsonc');

    const check = validateBundleManifest(manifest);
    expect(check.ok).toBe(true);
  });

  it('rejects Zip Slip path traversal and absolute paths', () => {
    expect(validateZipEntryPath('data/report.csv').ok).toBe(true);
    expect(validateZipEntryPath('../evil.txt').ok).toBe(false);
    expect(validateZipEntryPath('data/../../evil.txt').ok).toBe(false);
    expect(validateZipEntryPath('/etc/passwd').ok).toBe(false);
    expect(validateZipEntryPath('C:\\Windows\\win.ini').ok).toBe(false);

    const badManifest = validateBundleManifest({
      bundleVersion: '0.1',
      format: 'csv',
      sourceFile: 'data/../secret.csv',
      sidecarFile: 'data/secret.csv.metatext.jsonc',
      includesHistory: false,
    });
    expect(badManifest.ok).toBe(false);
  });

  it('enforces Zip Bomb entry count, uncompressed size, and ratio limits', () => {
    const ok = checkZipBombLimits([
      { path: 'manifest.json', compressedSize: 120, uncompressedSize: 240 },
      { path: 'data/big.csv', compressedSize: 3_000_000, uncompressedSize: 18_000_000 },
    ]);
    expect(ok.ok).toBe(true);

    const bombRatio = checkZipBombLimits([
      { path: 'data/bomb.csv', compressedSize: 1000, uncompressedSize: 50_000_000 },
    ]);
    expect(bombRatio.ok).toBe(false);

    const tooBig = checkZipBombLimits(
      [{ path: 'data/huge.csv', compressedSize: 5_000_000, uncompressedSize: 20_000_000 }],
      { maxTotalUncompressedBytes: 10_000_000 },
    );
    expect(tooBig.ok).toBe(false);
  });
});
