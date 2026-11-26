import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourceSchema = path.resolve(
  rootDir,
  '..',
  'metatext-spec',
  'schemas',
  'v0.1',
  'metatext.schema.json',
);

const destinations = [
  path.join(rootDir, 'docs', 'schema', 'metatext.schema.json'),
  path.join(rootDir, 'apps', 'vscode', 'schemas', 'metatext.schema.json'),
];

if (!fs.existsSync(sourceSchema)) {
  const allBundledExist = destinations.every((dest) => fs.existsSync(dest));
  if (allBundledExist) {
    console.log(
      `[sync:schema] Sibling spec repo not found at ${sourceSchema}; keeping existing bundled schemas.`,
    );
    process.exit(0);
  }
  console.error(
    `[sync:schema] Missing source schema at ${sourceSchema} and bundled destinations are incomplete.`,
  );
  process.exit(1);
}

const raw = fs.readFileSync(sourceSchema, 'utf-8');
// Validate JSON syntax before copying
JSON.parse(raw);

for (const dest of destinations) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf-8');
  console.log(`[sync:schema] Synced -> ${path.relative(rootDir, dest)}`);
}
