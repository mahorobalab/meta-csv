#!/usr/bin/env node
/**
 * Codebase metrics collector for MetaText Editor monorepo.
 *
 * Usage:
 *   node scripts/metrics.mjs             # Human-readable report
 *   node scripts/metrics.mjs --json      # Machine-readable JSON
 *   node scripts/metrics.mjs --save-baseline <path>
 *   node scripts/metrics.mjs --compare <baseline.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SOURCE_ROOTS = [
  'packages/schema/src',
  'packages/core/src',
  'packages/ui/src',
  'apps/desktop/src',
  'apps/desktop/src-tauri/src',
  'apps/playground/src',
  'apps/vscode/src',
  'apps/vscode/webview',
];

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.rs']);
const WARN_LINES = 500;
const ERROR_LINES = 800;
const HARD_LIMIT_LINES = 1000;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function countMetrics(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const totalLines = lines.length;
  let codeLines = 0;
  let blankLines = 0;
  let commentLines = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      blankLines++;
      continue;
    }
    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('//')) {
      commentLines++;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      commentLines++;
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    codeLines++;
  }

  // Approximate function / component / hook declaration count
  const fnMatches = raw.match(
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\s+[A-Za-z0-9_]+|const\s+[A-Za-z0-9_]+\s*=\s*(?:React\.forwardRef|React\.memo|useCallback|useMemo|\([^)]*\)\s*(?::[^=]+)?=>|async\s*\([^)]*\)\s*=>)|pub\s+(?:async\s+)?fn\s+[a-z0-9_]+|fn\s+[a-z0-9_]+)/g
  );

  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const pkgMatch = relPath.match(/^((?:packages|apps)\/[^/]+)/);
  const pkg = pkgMatch ? pkgMatch[1] : 'root';
  const isTest = /(__tests__|\.test\.|\.spec\.)/.test(relPath);

  return {
    path: relPath,
    package: pkg,
    isTest,
    totalLines,
    codeLines,
    blankLines,
    commentLines,
    functionsApprox: fnMatches ? fnMatches.length : 0,
    bytes: Buffer.byteLength(raw, 'utf8'),
  };
}

function collectBundleSizes() {
  const targets = [
    { name: 'playground', dir: path.join(ROOT, 'apps/playground/dist/assets') },
    { name: 'desktop', dir: path.join(ROOT, 'apps/desktop/dist/assets') },
    { name: 'vscode-ext', dir: path.join(ROOT, 'apps/vscode/dist') },
  ];
  const result = {};
  for (const t of targets) {
    if (!fs.existsSync(t.dir)) {
      result[t.name] = null;
      continue;
    }
    let totalBytes = 0;
    let jsBytes = 0;
    let cssBytes = 0;
    const files = fs.readdirSync(t.dir, { withFileTypes: true }).filter((e) => e.isFile());
    for (const f of files) {
      const ext = path.extname(f.name);
      if (ext === '.map') continue;
      const sz = fs.statSync(path.join(t.dir, f.name)).size;
      totalBytes += sz;
      if (ext === '.js' || ext === '.cjs' || ext === '.mjs') jsBytes += sz;
      if (ext === '.css') cssBytes += sz;
    }
    result[t.name] = { totalBytes, jsBytes, cssBytes };
  }
  return result;
}

function collectReport() {
  const allFiles = [];
  for (const rel of SOURCE_ROOTS) {
    walk(path.join(ROOT, rel), allFiles);
  }
  const metrics = allFiles.map(countMetrics);
  const prod = metrics.filter((m) => !m.isTest);
  const tests = metrics.filter((m) => m.isTest);

  const totalProdLines = prod.reduce((s, m) => s + m.totalLines, 0);
  const totalProdCode = prod.reduce((s, m) => s + m.codeLines, 0);
  const totalTestLines = tests.reduce((s, m) => s + m.totalLines, 0);
  const maxFile = prod.reduce((a, b) => (b.totalLines > a.totalLines ? b : a), {
    path: '-',
    totalLines: 0,
  });

  const over1000 = prod.filter((m) => m.totalLines > HARD_LIMIT_LINES).sort((a, b) => b.totalLines - a.totalLines);
  const over800 = prod.filter((m) => m.totalLines > ERROR_LINES).sort((a, b) => b.totalLines - a.totalLines);
  const over500 = prod.filter((m) => m.totalLines > WARN_LINES).sort((a, b) => b.totalLines - a.totalLines);

  const byPackage = {};
  for (const m of prod) {
    if (!byPackage[m.package]) {
      byPackage[m.package] = { files: 0, totalLines: 0, codeLines: 0, maxLines: 0, over500: 0, over1000: 0 };
    }
    const p = byPackage[m.package];
    p.files++;
    p.totalLines += m.totalLines;
    p.codeLines += m.codeLines;
    if (m.totalLines > p.maxLines) p.maxLines = m.totalLines;
    if (m.totalLines > WARN_LINES) p.over500++;
    if (m.totalLines > HARD_LIMIT_LINES) p.over1000++;
  }

  return {
    timestamp: new Date().toISOString(),
    summary: {
      prodFiles: prod.length,
      prodTotalLines: totalProdLines,
      prodCodeLines: totalProdCode,
      avgLinesPerProdFile: prod.length ? Math.round(totalProdLines / prod.length) : 0,
      maxProdFile: { path: maxFile.path, lines: maxFile.totalLines },
      over1000Count: over1000.length,
      over800Count: over800.length,
      over500Count: over500.length,
      testFiles: tests.length,
      testTotalLines: totalTestLines,
    },
    byPackage,
    over500: over500.map((m) => ({ path: m.path, totalLines: m.totalLines, codeLines: m.codeLines, functionsApprox: m.functionsApprox })),
    top15: [...prod]
      .sort((a, b) => b.totalLines - a.totalLines)
      .slice(0, 15)
      .map((m) => ({ path: m.path, totalLines: m.totalLines, codeLines: m.codeLines, functionsApprox: m.functionsApprox })),
    bundles: collectBundleSizes(),
  };
}

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function fmtDelta(after, before, lowerIsBetter = true) {
  const diff = after - before;
  if (diff === 0) return '0';
  const sign = diff > 0 ? '+' : '';
  const mark = lowerIsBetter ? (diff < 0 ? ' (improved)' : ' (regressed)') : (diff > 0 ? ' (improved)' : ' (regressed)');
  return `${sign}${diff}${mark}`;
}

function printReport(report, baseline = null) {
  const s = report.summary;
  console.log('=== MetaText Editor Codebase Metrics ===');
  console.log(`Production files : ${s.prodFiles}${baseline ? ` (was ${baseline.summary.prodFiles}, ${fmtDelta(s.prodFiles, baseline.summary.prodFiles, false)})` : ''}`);
  console.log(`Production lines : ${s.prodTotalLines} (code: ${s.prodCodeLines})${baseline ? ` (was ${baseline.summary.prodTotalLines})` : ''}`);
  console.log(`Avg lines / file : ${s.avgLinesPerProdFile}${baseline ? ` (was ${baseline.summary.avgLinesPerProdFile}, ${fmtDelta(s.avgLinesPerProdFile, baseline.summary.avgLinesPerProdFile)})` : ''}`);
  console.log(`Max file         : ${s.maxProdFile.lines} lines (${s.maxProdFile.path})${baseline ? ` (was ${baseline.summary.maxProdFile.lines}, ${fmtDelta(s.maxProdFile.lines, baseline.summary.maxProdFile.lines)})` : ''}`);
  console.log(`Files > 1000 LOC : ${s.over1000Count}${baseline ? ` (was ${baseline.summary.over1000Count}, ${fmtDelta(s.over1000Count, baseline.summary.over1000Count)})` : ''}`);
  console.log(`Files >  800 LOC : ${s.over800Count}${baseline ? ` (was ${baseline.summary.over800Count}, ${fmtDelta(s.over800Count, baseline.summary.over800Count)})` : ''}`);
  console.log(`Files >  500 LOC : ${s.over500Count}${baseline ? ` (was ${baseline.summary.over500Count}, ${fmtDelta(s.over500Count, baseline.summary.over500Count)})` : ''}`);
  console.log(`Test files / LOC : ${s.testFiles} files / ${s.testTotalLines} lines${baseline ? ` (was ${baseline.summary.testFiles} / ${baseline.summary.testTotalLines})` : ''}`);

  console.log('\n--- By Package ---');
  console.log('Package                  Files    Lines     Code      Max   >500  >1000');
  for (const [pkg, p] of Object.entries(report.byPackage).sort()) {
    console.log(
      `${pkg.padEnd(24)} ${String(p.files).padStart(5)} ${String(p.totalLines).padStart(8)} ${String(p.codeLines).padStart(8)} ${String(p.maxLines).padStart(8)} ${String(p.over500).padStart(6)} ${String(p.over1000).padStart(6)}`
    );
  }

  console.log('\n--- Top 15 Largest Production Files ---');
  for (const f of report.top15) {
    const flag = f.totalLines > HARD_LIMIT_LINES ? '[>1000]' : f.totalLines > ERROR_LINES ? '[>800] ' : f.totalLines > WARN_LINES ? '[>500] ' : '       ';
    console.log(`${flag} ${String(f.totalLines).padStart(5)} lines (${String(f.codeLines).padStart(5)} code, ~${String(f.functionsApprox).padStart(3)} fns)  ${f.path}`);
  }

  console.log('\n--- Bundle Sizes (dist) ---');
  for (const [name, b] of Object.entries(report.bundles)) {
    if (!b) {
      console.log(`  ${name.padEnd(12)}: (not built)`);
    } else {
      console.log(`  ${name.padEnd(12)}: total ${fmtKb(b.totalBytes)} (JS ${fmtKb(b.jsBytes)}, CSS ${fmtKb(b.cssBytes)})`);
    }
  }
}

const args = process.argv.slice(2);
const report = collectReport();

const saveIdx = args.indexOf('--save-baseline');
if (saveIdx !== -1 && args[saveIdx + 1]) {
  const outPath = path.resolve(process.cwd(), args[saveIdx + 1]);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Saved metrics baseline to ${outPath}`);
}

const cmpIdx = args.indexOf('--compare');
const baseline =
  cmpIdx !== -1 && args[cmpIdx + 1] && fs.existsSync(path.resolve(process.cwd(), args[cmpIdx + 1]))
    ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args[cmpIdx + 1]), 'utf8'))
    : null;

if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report, baseline);
}
