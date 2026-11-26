# ポータブルパッケージ（`.metatext.zip`）設計計画

> 作成日: 2026-11-26  
> 検討メモ出典: [`docs/note/gemini_talk_20261126-3_metatext.txt`](../note/gemini_talk_20261126-3_metatext.txt)  
> 関連計画: [`metatext-and-metalog-plan.md`](./metatext-and-metalog-plan.md) / [`history-gix-plan.md`](./history-gix-plan.md)

---

## 1. コンセプトと価値

日常の編集・Git 管理は **「生ファイル（`.csv` / `.jsonl` / `.log`）＋ 隣の `.metatext.jsonc`」** の分離構成で爆速・差分クリーンに保ちつつ、**チーム共有・調査結果の引き継ぎ・バックアップ・環境移行（Desktop ⇔ VS Code ⇔ Web）** には、必要な一式を 1 ファイルに固めた **`*.metatext.zip`（例: `report.csv.metatext.zip`）** を利用できるようにする（Phase D）。

### この方式を採用するメリット
1. **1 ファイル完結のポータビリティ**: Chat / Slack / メール / Google ドライブ等で「本体と `.metatext.jsonc` と履歴のどれかが抜けて渡された」という事故が起きない。
2. **開いた ZIP をそのまま編集・保存できる**: 既定の構造と定義が検証できれば、いちいち作業フォルダへ手動展開し直さなくても、ZIP のまま開いて編集・`Ctrl+S` で ZIP へ上書き保存できる。
3. **ロックインなしのオープン性**: 実体は標準 ZIP アーカイブ（`.xlsx` / `.docx` と同じ王道設計）であるため、アプリが無くても OS 標準の解凍で中身の生データと JSONC をそのまま取り出せる。
4. **高い圧縮効率**: CSV・JSONL・ログ・JSONC・Git オブジェクトはすべてテキスト中心で圧縮率が非常に高く、大容量データも軽量にやり取りできる。

---

## 2. ZIP 拡張子と内部構造仕様（v0.1 案）

### 2.1 ファイル名規約
元のファイル拡張子を維持した **`<元ファイル名>.metatext.zip`** を標準とする：
- `report.csv` → `report.csv.metatext.zip`
- `metrics.tsv` → `metrics.tsv.metatext.zip`
- `events.jsonl` → `events.jsonl.metatext.zip`
- `app.log` → `app.log.metatext.zip`

### 2.2 アーカイブ内部レイアウト

```text
report.csv.metatext.zip
├── manifest.json                         # パッケージ構成・作成元・元のファイル名メタ情報
├── data/
│   ├── report.csv                        # 元のデータ本体（ファイル名・文字コード・改行を保持）
│   └── report.csv.metatext.jsonc         # 隣接サイドカーメタデータ
└── history/                              # 【任意】Shadow Git bare リポジトリ（含めるか選択可能）
    ├── HEAD
    ├── objects/...
    └── refs/...
```

### 2.3 `manifest.json` 仕様案

```json
{
  "bundleVersion": "0.1",
  "format": "csv",
  "sourceFile": "data/report.csv",
  "sidecarFile": "data/report.csv.metatext.jsonc",
  "includesHistory": false,
  "createdAt": "2026-11-26T05:00:00Z",
  "createdBy": "MetaText Editor v0.2.0"
}
```

---

## 3. 直接読み書きフローとセキュリティ・プライバシー設計

### 3.1 `.metatext.zip` のダイレクトオープン・保存フロー
1. **オープン時検証**:
   - ファイル名が `*.metatext.zip` 形式であるか確認。
   - ZIP 内の `manifest.json`（または一意な `data/<file>`＋`data/<file>.metatext.jsonc` ペア）の存在と整合性、および Zip Slip / Zip Bomb 制限を検証する。
   - 不正または必須定義欠落がある場合は破損・不正パッケージとしてエラー通知し、安全な読み取りまたは展開キャンセルを行う。
2. **編集・保存（`Ctrl+S`）**:
   - 検証を通過した `.metatext.zip` は、編集後の **`Ctrl+S` で元の `.metatext.zip` へ直接保存** できる（`FileSystemAdapter` の `ZipFileSystemAdapter` 実装として透過的に扱う）。
   - **破損防止のアトミック書き換え（Desktop / VS Code）**: 保存時は一時ファイル `*.metatext.zip.tmp` へ新アーカイブを完全書き出し・検証したうえで元ファイルを置換（rename）し、書き込み途中クラッシュによる ZIP 破損を防ぐ。Web 版では更新済み `.metatext.zip` をダウンロード保存する。
   - （必要に応じて「中の生ファイル＋`.metatext.jsonc` をフォルダへ取り出す（Extract）」操作もメニューから実行可能にする。）

### 3.2 エクスポート時のプライバシー配慮（既定 OFF）
- エクスポートダイアログに **`履歴（history/）を含める`** チェックボックスを設け、**デフォルトは OFF** とする。
- 試行錯誤中の編集内容や作業メモが、意図せず社外やチームへ共有される事故を防ぐ。

### 3.3 セキュリティガード ＆ 暗号化方針
- **Zip Slip 対策**: `manifest.json` および全 ZIP エントリパスに対し、`..`・絶対パス・ドライブレターを完全に拒否する。
- **Zip Bomb 対策**: 展開総サイズ上限・圧縮比異常・最大エントリ数上限をチェックしてからメモリ／一時領域へ展開する。
- **暗号化・パスワード保護について**: 現時点ではアプリ独自のパスワード付き ZIP 暗号化機能は実装せず、**OS や共有ストレージ（Google Drive / SharePoint / Slack 等）側のアクセス制御・暗号化に委ねる** 方針とする（仕様・実装のシンプルさとロックイン防止を優先）。

---

## 4. プラットフォーム別 UX と実装技術

| 環境 | 圧縮・展開エンジン | 主な UX |
| --- | --- | --- |
| **Desktop (Tauri / Rust)** | **`zip` クレート**（Pure Rust / deflate） | `report.csv.metatext.zip` を開いてそのまま編集＆上書き保存、ドラッグ＆ドロップオープン、`Export as .metatext.zip` |
| **Web / PWA** | **`fflate`**（超軽量・高速 JS ライブラリ、Web Worker 実行） | `.metatext.zip` のドラッグ＆ドロップ一発オープン、編集後に `.metatext.zip` をそのままダウンロード保存 |
| **VS Code 拡張** | **`fflate`**（Extension Host / Node.js） | Custom Editor として `.metatext.zip` を直接開いて編集＆保存、およびワークスペース内ファイルからのエクスポート |

---

## 5. 確定方針（オーナー決定済み）

1. **ZIP の直接編集・保存**: ファイル名（`*.metatext.zip`）と必須定義（`manifest.json`・データ本体・`.metatext.jsonc`）を検証して問題なければ、**開いた `.metatext.zip` のまま保存も ZIP 上書き（Web は ZIP ダウンロード）** とする。
2. **拡張子表記**: 元の拡張子を残す **`report.csv.metatext.zip`**（`<filename>.metatext.zip`）を採用する。
3. **暗号化・パスワード保護**: 現時点では実装せず、OS や共有ストレージ（Google Drive / SharePoint / Slack 等）側のアクセス制御・暗号化に委ねる。

---

## 6. ロードマップ（チェックリスト）

- [ ] `metatext-spec` に `.metatext.zip` パッケージ構造（`manifest.json` スキーマ・必須エントリ検証ルール）を追記
- [ ] `packages/core` に `manifest.json` 生成／検証・Zip Slip / Zip Bomb チェック共通ロジックを実装
- [ ] Web / VS Code 向けに `fflate` ベースの `ZipAdapter`（直接オープン・ZIP 保存・Export）を実装
- [ ] Desktop（Rust）向けに `zip` クレートベースのアトミック上書き保存対応 `ZipAdapter`（`history/` 同梱可否対応）を実装
- [ ] エクスポート設定モーダル（「履歴を含める」既定 OFF・想定サイズ表示）を `packages/ui` に実装
