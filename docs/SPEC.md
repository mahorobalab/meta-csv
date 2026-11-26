# MetaCSV 仕様書（たたき台 v0.1）

> [!NOTE]
> 本ドキュメントはプロトタイプ開発のための暫定仕様（v0.1）です。実装・実運用しながら柔軟に見直す前提で、シンプルさと拡張性のバランスを重視しています。

---

## 1. コンセプト

**「Git フレンドリーなプレーン CSV のまま、JSONC サイドカーファイルで Excel ライクな見た目・入力補助・状態記憶を実現する」**

- **脱・健忘症**: 列幅・行の高さ・表示/非表示・ソート順などを `.metatext.jsonc` に自動記憶し、次回開いた瞬間から前回の状態を復元する。
- **Zero-Config**: メタデータが無い CSV でも即座に開ける（初回は内容から列幅を自動フィット）。ユーザーがレイアウトを変更したタイミングで `.metatext.jsonc` を自動生成する。
- **Git フレンドリー**: CSV 本体はデータのみをクリーンに保ち、見た目や表示設定は隣の `.metatext.jsonc` に分離する。JSONC（コメント・末尾カンマ可）を採用し、人間による手書き編集と GUI からの自動更新を両立する。
- **10 年戦えるパフォーマンス**: 10 万行規模の CSV を想定し、Canvas 描画（Glide Data Grid）＋ Web Worker 分離を初期設計から組み込む。

---

## 2. ターゲット環境と展開戦略

UI とコアロジックを Web 標準技術（TypeScript + React + Vite）で統一し、I/O 層を `FileSystemAdapter` で抽象化する。

| 環境 | 位置づけ | I/O 実装 |
| --- | --- | --- |
| **VS Code / Antigravity 拡張機能** | **最優先・本番ターゲット①** | `VsCodeAdapter`（`CustomEditor` + `postMessage`） |
| **デスクトップアプリ（Win / macOS）** | **本番ターゲット②** | `TauriAdapter`（Tauri `invoke` / FS API） |
| **開発用プレイグラウンド / 将来の Web 版** | 開発デバッグ用（将来的に静的ビルドでオンラインデモ・Web 版へ逆展開可能） | `MemoryAdapter` / `WebFileSystemAdapter` |

### 設計上の鉄則（逆展開の担保）
- `packages/core` および `packages/ui` の中に、`vscode` や `@tauri-apps/*` への依存を**一切持ち込まない**。
- すべてのファイル読み書き・監視・ダイアログ操作は `FileSystemAdapter` 経由で行う。

---

## 3. モノレポ構成案

```text
meta-csv/
├── package.json
├── pnpm-workspace.yaml
├── packages/
│   ├── core/                # CSVパーサ/シリアライザ、方言判定、JSONC管理、Undo/Redo、検索/ソート、Adapter型
│   ├── schema/              # metatext.schema.json および TypeScript 型定義
│   └── ui/                  # React + Glide Data Grid（Canvas描画、テーマ連動、ツールバー、検索UI）
├── apps/
│   ├── playground/          # Vite 開発用アプリ（サンプルCSV・10万行ベンチマーク・将来のオンラインデモ兼用）
│   ├── vscode/              # VS Code / Antigravity 拡張機能
│   └── desktop/             # Tauri (Windows / macOS) ネイティブアプリ
└── docs/
    ├── SPEC.md              # 本仕様書
    ├── schema/              # JSON Schema ドラフト
    └── examples/            # .metatext.jsonc サンプル
```

---

## 4. 技術スタック

| レイヤー | 採用技術 | 選定理由 |
| --- | --- | --- |
| パッケージ管理 | `pnpm workspaces` | 高速・省容量でモノレポ管理が容易 |
| 言語 / UI | TypeScript + React + Vite | VS Code Webview / Tauri / Web すべてで 100% 共通化 |
| テーブル描画 | `@glideapps/glide-data-grid` (+ `glide-data-grid-cells`) | Canvas 描画で 10 万行〜でも 60fps。範囲選択・コピペ・列リサイズ標準装備 |
| CSV パース | `PapaParse`（Web Worker 実行） | RFC 4180 準拠、ストリーミング対応、3 環境で同一挙動 |
| 文字コード変換 | `encoding-japanese` または `TextDecoder` / `iconv-lite` (Node/Rust側) | UTF-8 (BOM有無) / Shift-JIS (CP932) の自動判定と維持 |
| JSONC 編集 | `jsonc-parser` (Microsoft 公式) | `modify` / `applyEdits` により、**コメントや整形を壊さず値だけ部分更新**できる |
| デスクトップ | Tauri v2 | 軽量・高速、Windows / macOS (Apple Silicon & Intel) 両対応 |

---

## 5. 主要な設計方針（v0.1 暫定決定）

### 5.1 メタデータファイルの探索ルールと命名規則
- **v0.1（基本ルール）**: CSV と同じディレクトリにある `<ファイル名>.metatext.jsonc` を紐づける。
  - 例: `spec_setting.csv` ⇔ `spec_setting.csv.metatext.jsonc`
- **将来拡張（v0.2 以降）**: フォルダ共通設定（`.metacsv.jsonc`）や glob パターン（`logs_*.csv`）のフォールバック探索を追加可能な設計にしておく。

### 5.2 列の紐づけ方式（ヘッダーあり / なし両対応）
- `csv.hasHeader` でヘッダー行の有無を制御する（未指定時は 1 行目の型傾向などから推定、デフォルト `true`）。
- **`hasHeader: true` の場合**: 列名（例: `"email"`, `"status"`）をキーにして `columns` に紐づける。列の順序が変わってもメタデータが追従する。
- **`hasHeader: false` の場合**: 0 始まりの列インデックス文字列（`"0"`, `"1"`, `"2"` ...）をキーにする。`label` を設定すれば画面上のヘッダー表示名（例: `"ID"`, `"アプリ名"`, `"説明"`）として表示できる。

### 5.3 CSV 方言（Dialects）の自動判定と維持
読み込み時に以下を自動検出し、メモリ上に「元のファイル属性」として保持する。保存時は原則として元の形式を維持し、余計な Git 差分を出さない。
- **文字コード**: `utf-8`, `utf-8-bom`, `shift-jis` (CP932)
- **改行コード**: `lf` (`\n`), `crlf` (`\r\n`)
- **区切り文字**: `,` (CSV), `\t` (TSV)
- **メタデータでの明示上書き**: 自動判定が外れる特殊なファイル向けに、`.metatext.jsonc` の `csv` セクションで明示指定可能にする。

### 5.4 保存タイミングと dirty（未保存）管理
| 対象 | 保存タイミング | 理由 |
| --- | --- | --- |
| **CSV 本体** | **明示保存（`Ctrl+S` / `Cmd+S`）** | 誤操作によるデータ破壊を防ぎ、Undo/Redo と組み合わせて安全に扱うため |
| **メタデータ（`.metatext.jsonc`）** | **デバウンス自動保存（500ms）** | 列幅ドラッグやソート切り替えをストレスなく即座に記憶するため |

- **初回生成タイミング**: メタデータファイルが存在しない CSV を開いた直後はファイルを自動生成しない。ユーザーが初めて列幅変更・スタイル設定・ソート等を行ったタイミングで生成する。

### 5.5 スタイル・装飾・行の高さのレイヤー構造
Excel の `styles.xml`（辞書正規化）と `sqref`（範囲適用）の仕組みを取り入れつつ、人間が読みやすい JSONC として設計する。

- **名前付きスタイル辞書 (`styles`)**: 再利用する装飾に名前を付けて定義し、各レイヤーから文字列キーで参照できる（インライン直書きも併用可）。
- **5 階層の優先順位**（下ほど優先度が高い）:
  1. **テーブル全体 (`table`)**: フォントファミリー、基本フォントサイズ、デフォルト行高、固定列数 (`freezeColumns`)
  2. **列単位 (`columns[key]`)**: 列幅 (`width`)、表示名 (`label`)、表示/非表示 (`visible`)、折り返し (`wrap`)、配置 (`align`)、読み取り専用 (`readonly`)、型/選択肢 (`type`, `options`)、列スタイル (`style`)
  3. **条件付き書式 (`rules`)**: 特定の列の値が条件（完全一致・部分一致・正規表現・空など）に一致した行またはセルにスタイルを適用する。行の挿入・削除・ソートに強い。
  4. **矩形範囲 (`ranges`)**: ドラッグ選択による一括装飾を `<startRow>:<startCol>..<endRow>:<endCol>` の 1 エントリで保持する。
  5. **行・セル個別指定 (`rows` → `cells`)**: 特定行の高さ (`height`) や個別セルの背景色・太字・イタリック。v0.1 では 0 始まりのデータ行インデックスで保持し、エディタ上での行挿入・削除時にインデックスを自動追従させる。

### 5.6 ソート順の記憶と検索
- **ソート順 (`view.sort`)**: **CSV 本体は書き換えず、「ビュー上の表示順」として記憶する**（インデックス配列 `viewRowIndices: Int32Array` を介して描画する）。これにより Git 差分を汚さずに常に好みの並び順で閲覧・編集できる。
  - ※「現在の表示順で CSV 本体を並び替えて保存する」操作は、明示的なメニューアクションとして分離する。
- **検索**: Web Worker 上で非同期に全文検索を実行し、ヒット件数・次/前へジャンプ・ヒットセルのハイライトを行う。

### 5.7 10 万行対応と Undo / Redo
- **データ保持**: オブジェクト配列ではなく 2 次元配列 `string[][]` で保持しメモリ消費を抑制する。パース・検索・ソートは Web Worker に分離する。
- **Undo / Redo**: コマンドパターンを採用し、変更差分のみを記録する（例: `{ type: 'editCells', changes: [{ row, col, before, after }] }`）。行追加・削除・範囲ペーストも 1 コマンドとしてまとめて元に戻せるようにする。

### 5.8 VS Code 拡張機能での大容量ファイル対策
- VS Code の `CustomTextEditorProvider` は巨大ファイルで `TextDocument` のサイズ制限に引っかかる場合があるため、**`CustomEditorProvider`（バイナリ/ファイルパスベース）** を基本設計とする。
- Node.js 側（Extension Host）がローカルファイルを直接読み書きし、Webview とはメッセージ通信でデータをやり取りする。将来的に数十万行〜数GB級に対応する場合は、同一プロトコル上でチャンク転送へ拡張する。

---

## 6. FileSystemAdapter インターフェース案

`packages/core` に定義する I/O 抽象化インターフェース。

```ts
export interface CsvFilePayload {
  /** ファイル名（例: "spec_setting.csv"） */
  fileName: string;
  /** 生のバイト列（文字コード判定を core 側で行うため） */
  csvBytes: Uint8Array;
  /** 隣接する .metatext.jsonc の生テキスト（存在しない場合は null） */
  metaText: string | null;
}

export interface FileSystemAdapter {
  /** 現在のCSVと隣接メタデータを読み込む */
  load(): Promise<CsvFilePayload>;

  /** CSV本体を保存する（元の文字コードにエンコード済みのバイト列） */
  saveCsv(bytes: Uint8Array): Promise<void>;

  /** メタデータ(.metatext.jsonc)を保存する（存在しない場合は新規作成） */
  saveMeta(jsoncText: string): Promise<void>;

  /** 外部からのファイル変更を購読する（任意） */
  onExternalChange?(callback: (target: 'csv' | 'meta') => void): () => void;

  /** ホスト環境のテーマ変更を購読する（VS Code 連動用・任意） */
  onThemeChange?(callback: () => void): () => void;
}
```

---

## 7. 開発ロードマップ

| Phase | 内容 | 完了の目安 |
| --- | --- | --- |
| **Phase 0** | 仕様設計 & スキーマ策定（現在） | `SPEC.md`・`metatext.schema.json`・サンプルの合意 |
| **Phase 1** | モノレポ構築 + コア + プレイグラウンド MVP | 10万行ダミー CSV が 60fps で動き、列幅・行高変更が `.metatext.jsonc` に反映される |
| **Phase 2** | VS Code / Antigravity 拡張機能化 | 自分の `spec_setting.csv` を IDE 内で開き、普段使い（ドッグフーディング）開始 |
| **Phase 3** | リッチ表現 & エディタ機能拡充 | フォント・太字/イタリック・背景色・条件付き書式・ソート記憶・検索・Undo/Redo・方言維持 |
| **Phase 4** | Tauri デスクトップアプリ化（Win / Mac） | Win / M1 Mac 実機ビルド、OS ショートカット対応、GitHub Actions 自動ビルド |
