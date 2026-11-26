import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const siteDir = path.join(rootDir, 'docs', 'site');
const appDistDir = path.join(rootDir, 'apps', 'playground', 'dist');
const schemaFile = path.join(rootDir, 'docs', 'schema', 'metatext.schema.json');
const outDir = path.join(rootDir, 'dist-pages');

if (!fs.existsSync(path.join(appDistDir, 'index.html'))) {
  throw new Error(
    `Missing built Web/Playground bundle at ${appDistDir}. Run "pnpm --filter @metatext-editor/playground build" first.`,
  );
}

if (!fs.existsSync(schemaFile)) {
  throw new Error(`Missing schema file at ${schemaFile}.`);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// 1. Copy static LP (/) and Privacy Policy (/privacy/)
fs.cpSync(siteDir, outDir, { recursive: true });

// 2. Copy built Web / PWA app (/app/)
const outAppDir = path.join(outDir, 'app');
fs.mkdirSync(outAppDir, { recursive: true });
fs.cpSync(appDistDir, outAppDir, { recursive: true });

// 3. Copy official JSON Schema (/schema/metatext.schema.json)
const outSchemaDir = path.join(outDir, 'schema');
fs.mkdirSync(outSchemaDir, { recursive: true });
fs.copyFileSync(schemaFile, path.join(outSchemaDir, 'metatext.schema.json'));

// 4. Disable Jekyll processing on GitHub Pages
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

console.log('Assembled GitHub Pages output at:', outDir);
console.log(' - /                      (LP)');
console.log(' - /privacy/              (Privacy Policy)');
console.log(' - /app/                  (Web / PWA App)');
console.log(' - /schema/metatext.schema.json');
