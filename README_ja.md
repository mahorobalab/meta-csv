<div align="center">

# MetaText Editor

**JSONC サイドカーメタデータ（`.metatext.jsonc`）で駆動する、100 万行対応の高速 CSV エディタ／ビューア**  
*Git フレンドリーなプレーン CSV のまま、VS Code・Windows・macOS で Excel ライクな見た目と状態記憶を実現します。*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white&cacheSeconds=86400)](https://v2.tauri.app/)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?style=for-the-badge)](https://code.visualstudio.com/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-Monorepo-F69220?style=for-the-badge&logo=pnpm&logoColor=white&cacheSeconds=86400)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

[English](README.md) | **日本語 (Japanese)**

</div>

---

## なぜ MetaText Editor なのか？

開発や実務で CSV を扱うとき、従来のツールにはつらいトレードオフがありました：
- **Excel**: `001` が `1` に、`1-2` が日付に勝手に変換され、UTF-8 / LF が壊れたり、大容量ファイルで長時間フリーズする。
- **一般的な CSV エディタ**: 列幅や非表示列・ソート順を調整しても、タブを閉じて開き直すたびにリセットされる（健忘症問題）。

**MetaText Editor** は **データ本体（`data.csv`）** と **見た目・表示設定（`data.csv.metatext.jsonc`）** を分離することでこれを解決します：
- **Zero-Config & 脱・健忘症**: メタデータが無い CSV も自動列幅フィットで即座に開き、列幅ドラッグ・ソート・装飾を行った瞬間に `.metatext.jsonc` を自動生成・記憶します。
- **コメント保持 JSONC**: Microsoft 公式の `jsonc-parser`（`modify` / `applyEdits`）を採用し、人間が書いたコメントや整形を壊さずに GUI から部分更新できます。
- **Git フレンドリー**: 元の文字コード（`UTF-8` / `UTF-8 BOM` / `Shift-JIS`）・改行コード（`LF` / `CRLF`）・区切り文字をそのまま維持し、ソートもビュー上のみで非破壊適用します。
- **マルチ環境で設定を完全共有**: VS Code で調整した列幅・色分け・ソート順を、そのまま Windows / macOS ネイティブアプリでも即座に再現できます。

---

## パフォーマンス実測値

Windows 11 環境にて、日本語・クォートを含む **100 万行 × 10 列（181.27 MB）** の UTF-8 CSV で計測した結果です：

| 指標 | 実測値 |
| --- | --- |
| **行数 × 列数** | `1,000,000 × 10`（1,000 万セル） |
| **ファイルサイズ** | `181.27 MB` |
| **読み込み・パース時間** | **約 1.1 秒**（1,108 ms） |
| **常駐メモリ（Tauri デスクトップ版）** | **約 519 MB**（待機時 CPU 0%） |
| **100 万行ビューソート** | **2 秒未満** |
| **スクロール** | `1,000,000` 行目まで 60fps で滑らかに追従 |

---

## 設計・パフォーマンスの工夫

1. **Canvas 仮想スクロール（`@glideapps/glide-data-grid`）**
   - 画面に見えている範囲だけを 1 枚の `<canvas>` に描画。DOM の肥大化やブラウザの CSS 高さ上限を回避し、100 万行でも 60fps を維持します。
2. **Base64 廃止・生バイナリ IPC 転送（Tauri v2）**
   - `tauri::ipc::Response` / `Request` により Rust ⇔ JS 間を生の `Uint8Array` / `ArrayBuffer` で直接やり取りし、181 MB 読み込み時のプリフリーズと瞬間メモリ消費を大幅に削減しました。
3. **インライン Web Worker パース ＋ スマートプログレスバー**
   - 512 KB 以上のファイルは `ArrayBuffer` ゼロコピー転送で Web Worker にオフロード。150ms 以上かかる巨大ファイルのみ滑らかな進捗バーを表示し、軽いファイルではチラつきゼロで開きます。
4. **データ規模に応じた高速ソート自動切替**
   - `Int32Array` による非破壊ビューソートを採用。5 万行超えのデータでは数値列自動判定（`Float64Array`）とプリミティブ比較へ切り替え、100 万行でも 2 秒未満でソート完了します。
5. **Excel に学んだ 5 階層スタイル解決**
   - 再利用可能な名前付き `styles` 辞書（Excel の `styles.xml` 相当）と矩形範囲 `ranges`（`startRow:startCol..endRow:endCol`）を備え、以下の優先順位で解決します：  
     `table` → `columns` → `rules`（条件付き書式）→ `ranges` → `rows` / `cells`
6. **コマンドパターンによる差分 Undo / Redo**
   - 配列全体のスナップショットではなく変更差分のみを履歴スタックに積むため、100 万行編集時でもメモリを圧迫せず高速に動作します。
7. **厳密な I/O 抽象化（`FileSystemAdapter`）**
   - `packages/core` と `packages/ui` は `vscode` や `@tauri-apps/*` に一切依存せず、VS Code・Tauri・Web の全環境で 100% 共通利用できます。

---

## 技術スタック

| レイヤー | 採用技術 | 役割 |
| --- | --- | --- |
| **モノレポ** | `pnpm workspaces` + TypeScript 5 | 全ターゲットでコアと UI を共通管理 |
| **UI / グリッド** | React 18 + Vite 6 + `@glideapps/glide-data-grid` | 高速 Canvas スプレッドシート UI |
| **CSV エンジン** | `PapaParse` + Web Worker | 方言自動判定・非同期パース・方言維持保存 |
| **メタデータ** | `jsonc-parser` + JSON Schema | コメント保持 JSONC 更新＋IDE 入力補完 |
| **デスクトップ** | Tauri v2 (Rust + WebView2 / WKWebView) | Windows / macOS ネイティブアプリ（生バイナリ I/O） |
| **IDE 拡張** | VS Code Custom Editor API (`Webview`) | IDE 統合＋ライト/ダークテーマ自動追従 |
| **テスト** | Vitest | コア単体テスト（JSONC 更新・方言・スタイル解決・ソート・Undo/Redo） |

---

## リポジトリ構成

```text
metatext-editor/
├── packages/
│   ├── schema/      # .metatext.jsonc の TypeScript 型定義
│   ├── core/        # CSV パーサ/シリアライザ、JSONC パッチ、スタイル解決、ソート/検索、Undo/Redo、FileSystemAdapter
│   └── ui/          # React + Glide Data Grid 共通エディタ & Web Worker パイプライン
├── apps/
│   ├── playground/  # 開発・ベンチマーク用 Vite アプリ（将来の Web 逆展開ベース）
│   ├── vscode/      # VS Code / Antigravity Custom Editor 拡張機能（スキーマ補完同梱）
│   └── desktop/     # Tauri v2 デスクトップアプリ（Windows / macOS）
└── docs/
    ├── SPEC.md
    ├── schema/metatext.schema.json
    └── examples/spec_setting.csv.metatext.jsonc
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
VS Code / Antigravity IDE で本リポジトリを開き **`F5`** を押すと、拡張機能開発ホストが起動します。CSV ファイルを右クリックして **「アプリケーションから開く...」→「MetaText Editor」** を選択してください。

---

## ドキュメント

- 詳細仕様書: [docs/SPEC.md](docs/SPEC.md)
- JSON Schema: [docs/schema/metatext.schema.json](docs/schema/metatext.schema.json)
- サンプルメタデータ: [docs/examples/spec_setting.csv.metatext.jsonc](docs/examples/spec_setting.csv.metatext.jsonc)
- AI エージェント／開発者ガイド: [AGENTS.md](AGENTS.md)

---

## ダウンロード・公式ビルドについて

- **公式の実行版（Windows / macOS 向けコード署名済みビルド・インストーラー）** は **Microsoft Store** および **BOOTH** にて配布（販売）予定です（*Coming Soon*）。
- **GitHub Releases でのバイナリ配布は行いません。** 本リポジトリではソースコード、`.metatext.jsonc` 仕様書、およびセルフビルド手順を公開しています。
- ご自身でビルドして利用される場合は、以下のコマンドでデスクトップ版をビルドできます：

```powershell
pnpm.cmd install
pnpm.cmd build:desktop
```

---

## ライセンス・商標について

- **ソースコードおよび仕様書**: [MIT License](LICENSE)（`Copyright (c) 2026 MahorobaLab`）のもとで公開しています。
- **名称・アイコン等のブランド権利**: **「MetaText Editor」** の名称および公式アプリアイコン・ロゴに関する権利は作者（MahorobaLab）に帰属し、MIT ライセンスの許諾範囲には含まれません。ご自身でビルドしたバイナリや改変版を再配布・公開される場合は、公式ビルドとの混同を避けるため、名称およびアイコンを変更してください。
