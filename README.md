# MetaCSV

**Git フレンドリーなプレーン CSV のまま、JSONC サイドカーファイル（`.meta.jsonc`）で Excel ライクな見た目・操作性・状態記憶を実現する高速 CSV エディタ／ビューア**

10 万〜100 万行規模の CSV を 60fps で扱うことを前提に、1 つの共通コア＆UI から **VS Code 拡張機能** と **デスクトップアプリ（Windows / macOS）** を展開するモノレポプロジェクトです。

---

## 主な特徴

- **脱・健忘症**: 列幅・行の高さ・表示/非表示・列固定・ソート順を隣の `<filename>.meta.jsonc` に自動記憶し、次回開いた瞬間から復元
- **Zero-Config**: メタデータが無い CSV も自動列幅フィットで即座に開き、最初のレイアウト変更時に `.meta.jsonc` を自動生成
- **コメント保持 JSONC**: `jsonc-parser` による部分更新のため、人間が書いたコメントや整形を壊さずに GUI から自動保存
- **Git フレンドリー**: CSV 本体は文字コード（UTF-8 / BOM / Shift-JIS）・改行コード（LF / CRLF）・区切り文字を維持し、ソートもビュー上のみで非破壊適用
- **5 階層スタイル解決**: `table` → `columns` → `rules`（条件付き書式）→ `ranges`（矩形範囲）→ `rows` / `cells`（名前付き `styles` 辞書対応）
- **10 万行〜対応**: Glide Data Grid（Canvas 描画）＋ 差分コマンドパターンの Undo/Redo

---

## リポジトリ構成

```text
meta-csv/
├── packages/
│   ├── schema/      # .meta.jsonc の TypeScript 型定義
│   ├── core/        # CSV パーサ/シリアライザ、JSONC パッチ、スタイル解決、ソート/検索、Undo/Redo、FileSystemAdapter
│   └── ui/          # React + Glide Data Grid 共通エディタコンポーネント
├── apps/
│   ├── playground/  # 開発・ベンチマーク用 Vite アプリ（将来の Web 逆展開ベース）
│   ├── vscode/      # VS Code / Antigravity Custom Editor 拡張機能
│   └── desktop/     # Tauri v2 デスクトップアプリ（Windows / macOS）
└── docs/
    ├── SPEC.md
    ├── schema/metacsv.schema.json
    └── examples/spec_setting.csv.meta.jsonc
```

---

## クイックスタート

> Windows PowerShell で実行ポリシーにより `.ps1` が制限されている場合は `pnpm.cmd` を使用してください。

```powershell
# 依存パッケージのインストール
pnpm.cmd install

# 型チェック / 単体テスト / 全パッケージビルド
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build

# 開発用プレイグラウンド起動 (http://127.0.0.1:15173)
pnpm.cmd dev

# デスクトップアプリ起動 (Tauri v2)
pnpm.cmd dev:desktop
```

### VS Code / Antigravity 拡張機能のデバッグ起動
VS Code / Antigravity IDE で本リポジトリを開き **`F5`** を押すと、拡張機能開発ホストが起動します。CSV ファイルを右クリックして **「アプリケーションから開く...」→「MetaCSV Editor」** を選択してください。

---

## ドキュメント

- 詳細仕様書: [docs/SPEC.md](docs/SPEC.md)
- JSON Schema: [docs/schema/metacsv.schema.json](docs/schema/metacsv.schema.json)
- サンプルメタデータ: [docs/examples/spec_setting.csv.meta.jsonc](docs/examples/spec_setting.csv.meta.jsonc)
- AI エージェント向け開発ガイド: [AGENTS.md](AGENTS.md)
