# SchemaStore (`json.schemastore.org`) 登録ガイド & PR 準備一式

`*.metatext.jsonc` を [SchemaStore](https://github.com/SchemaStore/schemastore) に登録するための手順・設定エントリ・テストファイル・PR テンプレートのまとめです。

登録されると、MetaText Editor 拡張を入れていない環境の **VS Code / JetBrains IDE / Visual Studio / Neovim (`jsonls`)** 等でも、`*.metatext.jsonc` を開くだけで（`$schema` 未指定でも）入力補完・ホバー解説・バリデーションが自動有効化されます。

---

## 1. 事前チェックリスト

- [x] スキーマ URL が HTTPS で 200 OK を返す: `https://mahorobalab.github.io/metatext-spec/schemas/v1/metatext.schema.json`
- [x] Draft-07 準拠の有効な JSON Schema である
- [x] `fileMatch` (`*.metatext.jsonc`) が既存スキーマと衝突しない
- [x] テスト用サンプルはコメント無しの純粋な JSON 形式で用意する（SchemaStore の CI は標準 JSON パーサーで検証するため）

---

## 2. PR 作成手順

1. https://github.com/SchemaStore/schemastore を GitHub でフォークして clone する
   ```bash
   git clone https://github.com/<your-account>/schemastore.git
   cd schemastore
   git checkout -b add-metatext-schema
   ```
2. `src/api/json/catalog.json` の `schemas` 配列（アルファベット順、`MetaText` の位置）に、同梱の [`catalog-entry.json`](./catalog-entry.json) のオブジェクトを追加する：
   ```json
   {
     "name": "MetaText",
     "description": "Sidecar metadata (.metatext.jsonc) for plain-text tabular and log files (CSV, TSV, Log, JSONL)",
     "fileMatch": ["*.metatext.jsonc"],
     "url": "https://mahorobalab.github.io/metatext-spec/schemas/v1/metatext.schema.json"
   }
   ```
3. テスト用サンプルを SchemaStore リポジトリにコピーする：
   - `docs/plan/json.schemastore.org/test/csv-sample.metatext.jsonc` → `src/test/metatext/csv-sample.metatext.jsonc`
   - `docs/plan/json.schemastore.org/test/log-sample.metatext.jsonc` → `src/test/metatext/log-sample.metatext.jsonc`
4. ローカル検証（任意・SchemaStore の CONTRIBUTING.md に従う）：
   ```bash
   npm ci
   npm test
   ```
5. commit & push して `SchemaStore/schemastore` へ Pull Request を作成する。

---

## 3. PR テンプレート（コピペ用）

### PR Title
```text
Add MetaText sidecar metadata schema (*.metatext.jsonc)
```

### PR Description
```markdown
## Summary
Adds the JSON Schema for **MetaText** sidecar metadata files (`*.metatext.jsonc`).

MetaText is an open JSONC sidecar specification for plain-text tabular and log files (`CSV`, `TSV`, `Log`, `JSONL`, `Text`) that persists column layouts, parsing rules, filter presets, row markers, conditional highlights, and cell styling without modifying raw data files.

## Links
- Specification & Landing Page: https://mahorobalab.github.io/metatext-spec/
- Schema URL (v1, Draft-07): https://mahorobalab.github.io/metatext-spec/schemas/v1/metatext.schema.json
- Spec Repository (MIT): https://github.com/mahorobalab/metatext-spec
- Reference Implementation: https://github.com/mahorobalab/metatext-editor

## Changes
- Added `MetaText` entry to `src/api/json/catalog.json` matching `*.metatext.jsonc`
- Added validation test fixtures under `src/test/metatext/`
```

---

## 4. 同梱ファイル

- `catalog-entry.json` — `src/api/json/catalog.json` に追加する JSON オブジェクト
- `test/csv-sample.metatext.jsonc` — CSV 向け検証用テストファイル（コメント無し純粋 JSON）
- `test/log-sample.metatext.jsonc` — Log 向け検証用テストファイル（コメント無し純粋 JSON）
