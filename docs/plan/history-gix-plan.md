# 履歴管理（Shadow Git / `gix`）設計計画

> 作成日: 2026-11-26  
> 検討メモ出典: [`docs/note/gemini_talk_20261126-3_metatext.txt`](../note/gemini_talk_20261126-3_metatext.txt) / [`docs/note/idea.txt`](../note/idea.txt)  
> 関連計画: [`metatext-and-metalog-plan.md`](./metatext-and-metalog-plan.md) / [`packaging-metatext-zip-plan.md`](./packaging-metatext-zip-plan.md)

---

## 1. 目的と方針

データ編集や調査作業において「さっきの状態に戻したい」「誤編集に気づいた瞬間に巻き戻したい」という要望に応えるため、**Photoshop の操作履歴パネルのような直感的な履歴体験** と、**裏側で Git オブジェクト（`gix` / `isomorphic-git`）により本体と `.metatext.jsonc` を 1 セットとして永続管理する仕組み** を組み合わせた **2 層履歴アーキテクチャ** を導入する。

### 2 層履歴モデル

| 層 | 名称 | トリガー・記録 | 役割・カバー範囲 |
| --- | --- | --- | --- |
| **Layer 1** | **インメモリ操作履歴（Undo / Redo）** | **常時有効・ディスク記録不要**（Shadow Git が OFF でも動作） | 人間の誤操作を即座に戻すフルセット Undo/Redo（セル編集・一括貼付/クリア・行挿入/削除/複製・列挿入/削除/リネーム・スタイル/マーカー等の `.metatext.jsonc` 変更）。履歴パネルから任意のステップをクリックしてジャンプ可能。 |
| **Layer 2** | **永続スナップショット（Shadow Git）** | **手動保存（`Ctrl+S`）時のみ**（App Settings で **記録 OFF** に設定可能） | 再起動をまたいだ巻き戻し・セル単位 Diff 比較・ビジネス利用時の変更監査ログ（短縮コミットハッシュ・タイムスタンプ・変更サマリ付き）。 |

### 設計上の基本姿勢
1. **シンプル・非複雑主義（Photoshop ヒストリー型）**: ブランチ分岐やコンフリクトマージのような複雑な Git 操作は UI に持ち込まない。リストからクリックして表示をその時点に戻す体験に集中する。
2. **復元はメモリ反映のみ（非破壊）**: 履歴リストの項目をクリックしてもディスクへ即座に書き戻さない。エディタの編集バッファ（表示）をその時点の状態に巻き戻し（未保存状態）、確定したいときだけ `Ctrl+S` で保存する。
3. **データ本体と `.metatext.jsonc` の一貫性**: 行番号ベースのメタデータ（`markers` / `rows` / `cells` / `ranges`）とデータ本体のズレを防ぐため、Layer 1 / Layer 2 ともに両者をセットで扱う。
4. **既存 Git を汚さない**: ユーザーの作業ディレクトリ内 `.git` には干渉せず、裏側の専用リポジトリ（Shadow Git）へ静かに積み上げる。
5. **記録 OFF の尊重**: 「そもそも履歴を記録したくない」ケースに備え、App Settings で Shadow Git の自動記録を OFF にできるようにする（OFF 時でも Layer 1 の Undo/Redo はフル機能で利用可能）。

---

## 2. プラットフォーム横断アーキテクチャ（`HistoryAdapter`）

既存の `FileSystemAdapter` と同じく、**UI とコアロジックは 100% 共通化し、履歴ストレージの実装だけを環境ごとに差し替える**。

### 2.1 トリガーと非同期実行フロー

- **スナップショットのトリガー**: **手動保存（`Ctrl+S`）のタイミングのみ** とする（自動保存タイマー等による頻繁・複雑な履歴生成は行わない）。
- **完全非同期バックグラウンド保存**:
  1. ユーザーが `Ctrl+S` を押すと、まずデータ本体（＋`.metatext.jsonc`）の保存を最優先で完了させ、即座に UI の操作を返す。
  2. 直後にバックグラウンド（Desktop/Rust: `tokio::spawn_blocking` 等の非同期タスク、Web: Web Worker）でスナップショット作成と保持上限のプルーニングを実行する。
  3. 履歴書き込みの完了・スキップ状態は控えめなステータス表示に留め、作業の「爆速」感を一切ブロックしない。

### 2.2 共通インターフェース（`packages/core`）

```ts
export interface HistoryRetentionPolicy {
  enabled: boolean;          // デフォルト true（false 時は Shadow Git への記録を一切行わない。インメモリ Undo は常時有効）
  mode: 'count' | 'sizeMb';
  maxCount: number;          // 例: デフォルト 10 回
  maxTotalSizeMb: number;    // 例: デフォルト 10 MB
  maxDataFileSizeMb: number; // 本体スナップショット対象の上限（デフォルト 20 MB、設定変更可）
}

export interface HistorySnapshotMeta {
  id: string;              // Commit OID (hex)
  timestamp: string;       // ISO 8601
  message: string;
  includesData: boolean;   // 大容量スキップ時は false（.metatext.jsonc のみ）
  dataBytes?: number;
  metaBytes: number;
}

export interface HistoryAdapter {
  saveSnapshot(input: {
    message: string;
    dataBytes?: Uint8Array;
    metaText: string;
    policy: HistoryRetentionPolicy;
  }): Promise<HistorySnapshotMeta>;
  listSnapshots(limit?: number): Promise<HistorySnapshotMeta[]>;
  restoreSnapshot(id: string): Promise<{
    dataBytes?: Uint8Array;
    metaText: string;
  }>;
}
```

### 2.3 プラットフォーム別バックエンド

| 環境 | 採用技術 | 特徴・選定理由 |
| --- | --- | --- |
| **Desktop (Win / macOS)** | **`gix`（gitoxide / Pure Rust）** | C/OpenSSL 依存がなく `cargo build` 一発で Windows / macOS 両方のビルドが通り、非常に高速 |
| **VS Code 拡張 (Node.js)** | **`isomorphic-git`** | 同じ標準 Git オブジェクト形式で Shadow Repo を読み書きし、デスクトップ版と互換性を保つ |
| **Web / PWA (Browser)** | **`isomorphic-git` + OPFS** | ブラウザ高速ストレージ（OPFS）上にローカル完結の履歴ストアを構築 |

### 2.4 `gix` の最小構成スコープ
`gix`（0.x 系）は読み取り・オブジェクト書き込みが高速で成熟している一方、マージやワークツリー系 API は変化が大きい。そのため Desktop 側は以下のみに絞る：

- **ワークツリーを持たない bare リポジトリ** として扱う。
- 書き込み時は **`blob` → `tree`（`data` と `sidecar.metatext.jsonc` の 2 エントリ）→ `commit`** を直接生成し、ブランチ参照（`refs/heads/main`）を進める。
- 複雑なマージ機能は持たせず、タイムライン一覧・差分比較・特定時点への復元に徹する。

---

## 3. 保存場所（隣接サイドカーフォルダ方式）と既存 `.git` との非干渉

- **保存先（ファイルと同じ場所・隣接フォルダ）**: 見えない AppData にゴミが溜まって肥大化するのを防ぎ、ファイルの移動・削除・パッケージングをシンプルにするため、対象ファイルと同じフォルダに `<filename>.metatext.history/`（bare Git リポジトリ）を生成する。
  - 例: `spec_setting.csv` / `spec_setting.csv.metatext.jsonc` / `spec_setting.csv.metatext.history/`
  - `.git` という名前を使わないため入れ子 Git 衝突は起きない。既存 Git 管理下フォルダでは `.gitignore` に `*.metatext.history/` を 1 行追加するだけで綺麗に除外でき、VS Code の File Nesting でも `*.metatext.*` として折りたたみ表示できる。
- **既存ワークスペース `.git` との関係**: 作業フォルダ配下の既存 `.git` には一切書き込み（ステージング・コミット）を行わない。
- **外部共有**: 同一フォルダ内の `<filename>` + `<filename>.metatext.jsonc` + `<filename>.metatext.history/` をそのまま [`packaging-metatext-zip-plan.md`](./packaging-metatext-zip-plan.md) の `.metatext.zip` へシンプルに同梱できる。

---

## 4. 大容量ファイル対策・保持上限・セル Diff 設計

### 4.1 本体スキップ閾値（デフォルト `20 MB`、設定で変更可）
`gix` は CLI `git` のように自動で `git gc`（delta pack 圧縮）を行わないため、100 MB 級のファイルに対して保存のたびに本体 `blob` を作るとディスク消費が大きくなる。以下のルールを採る：

| 対象ファイルの状態 | 履歴保存の挙動 | 理由 |
| --- | --- | --- |
| **閾値以下**（デフォルト **`20 MB` 以下**、変更可） | **本体 ＋ `.metatext.jsonc` の両方を非同期保存** | 数十 ms 以内で終わり、セル内容もレイアウトも完全復元できる |
| **閾値超過**（デフォルト **`20 MB` 超**） | **`.metatext.jsonc` のみ保存**（UI 上で本体スキップを通知） | 180 MB 級保存時のディスク増大を防ぐ |
| **Read-Only モード中**（JSONL / Log） | **`.metatext.jsonc` のみ保存** | 原本は不変であり、調査フィルタ・マーカー・メモの履歴だけで有用 |

### 4.2 保持上限ポリシー（`回数` または `容量` を設定で選択）
履歴が際限なく増えるのを防ぐため、App Settings で以下のどちらかを選べるようにする：

- **回数制限モード**: 直近 **`N` 回**（デフォルト **`10 回`**）を保持し、古い履歴を自動整理する。
- **容量制限モード**: 1 ファイル（または Shadow Git 全体）の合計上限を **`M` MB**（デフォルト **`10 MB`**）とし、超過分を古い順に自動整理する（最新の 1 件は必ず保持）。
- 整理方式はシンプルに「保持対象コミットから最新の到達可能オブジェクトだけを残す／世代カットする」軽量方式とする。

### 4.3 セル単位 Diff の対応付けルール
スナップショット同士を比較する際の行・列マッピングは、シンプルさと汎用性のバランスから以下の方針とする：

- **列の対応付け**: メタデータ生成時点の **列キー（ヘッダー名／JSONL キー／0 始まり列番号）マッピング** を基準に普遍対応させる。
- **行の対応付け**:
  - 原則として **先頭列（または明示指定された主キー列）** の値をキーに行を対応づけて比較する（メタデータ生成時に先頭列を基準にした対応マッピング情報を持たせる）。
  - ただし先頭列がユニークでない場合（重複値や空欄を含むログ・明細等）は破綻を防ぐため、自動的に **行番号ベースの比較** へフォールバックするハイブリッド方式を採る。

### 4.4 `gix` 0.x 系の保守方針
- `HistoryRepository` トレイト 1 ファイル内に `gix` 呼び出しを完全に閉じ込め、`Cargo.lock` でバージョンを固定する。
- 更新時はラッパー 1 箇所のみを追従させ、結合テスト群と定期的な `rustup update`（MSRV 確認）で安全に運用する。

---

## 5. 重点結合テスト戦略（4 本柱）

`gix` のバージョンアップやプラットフォーム間の非互換を一発で検知できるよう、実装と同時に以下のブラックボックステストを整備する：

1. **ライフサイクル一気通貫テスト**
   - 一時ディレクトリに `data.csv` + `data.csv.metatext.jsonc` を生成 → スナップショット v1 保存 → 内容を編集して v2 保存 → 履歴一覧が 2 件返ること → v1 へ復元して両ファイルが 1 バイトの狂いもなく元に戻ること。
2. **既存 `.git` リポジトリとの非干渉テスト**
   - `git init` 済みの作業フォルダ配下で CSV 編集・Shadow Git スナップショット作成・復元を実行しても、作業フォルダの `.git` の `git log`・`git status`・HEAD が一切変化しないこと。
3. **非同期保存・閾値・保持上限（10 回 / 10 MB / 20 MB）境界テスト**
   - 大容量（20 MB 超）入力時に `.metatext.jsonc` のみ保存へ切り替わること、回数上限（10 回）や容量上限（10 MB）を超えた際に古い履歴が安全に整理されること、日本語ファイル名・CRLF/LF 混在でコケないこと。
4. **プラットフォーム間（`gix` ⇔ `isomorphic-git`）データ互換テスト**
   - Rust (`gix`) が書き出した Shadow Git bare リポジトリを Node/JS 側 (`isomorphic-git`) で `log` / `readBlob` でき、逆も成立することを検証（Phase D の `.metatext.zip` 共有の前提保証）。

---

## 6. UI 設計（右サイドパネル・排他表示）

- **配置と排他制御**: 既存の右側メタデータ表示パネル（`MetaJsoncSidePanel`）と同じ右サイド領域に **排他表示（`'none' | 'meta' | 'history'`）** で切り替えて表示する。
- **Photoshop ヒストリー風の操作感**:
  - **操作履歴（Layer 1）**: 現在の編集セッションの操作（セル編集、行・列操作、スタイル/マーカー変更など）を時系列リスト表示し、クリックするだけでその時点へジャンプ（Undo/Redo 一括適用）できる。
  - **保存スナップショット（Layer 2）**: Shadow Git に記録された各保存点を **短縮ハッシュ ID（例: `a3f9c12`）・タイムスタンプ・変更サマリ（＋セル単位 Diff 展開）** 付きの技術的かつビジネス監査ログとしても見やすいリストで表示し、クリックでその時点の表示へ巻き戻せる（ディスク上書きは `Ctrl+S` で確定）。
- **App Settings 連携**: 「履歴の自動記録（ON/OFF）」「本体スキップ閾値（既定 20 MB）」「保持方式（回数 10 回 / 容量 10 MB）」を設定可能とする。

---

## 7. 確定方針（オーナー決定済み）

1. **2 層モデル & フルセット Undo**: 保存や履歴記録をしなくても使える **インメモリ Undo/Redo（Layer 1）** は、セル編集・一括貼付/クリア・行/列操作・スタイル/マーカー変更を含む **フルセット** で対応する。
2. **履歴記録の ON/OFF**: App Settings で Shadow Git の記録自体を **OFF（記録しない）** に設定可能とする（OFF 時も Layer 1 の Undo/Redo は常時有効）。
3. **履歴保存のトリガー**: Shadow Git への記録は **手動保存（`Ctrl+S`）のタイミング** に絞る。
4. **非同期保存 ＆ 大容量閾値**: 本体保存直後に **完全非同期バックグラウンド** で履歴を保存し、本体スキップ閾値は **デフォルト `20 MB`（設定で変更可能）** とする。
5. **体験コンセプト ＆ 復元挙動**: Photoshop の操作履歴のようにリストクリックで表示をその時点へ巻き戻す（ディスクへの即書き戻しや複雑なマージは行わない）。保持上限は **回数（デフォルト `10 回`）または容量（デフォルト `10 MB`）** を選択可能とする。
6. **UI 表示**: 右側のメタデータパネルと **排他で表示** する履歴サイドパネルを設け、短縮ハッシュ ID・タイムスタンプ等を表示する（ビジネス利用時の操作/変更ログとしても有用な視認性）。
7. **セル単位 Diff の基準**: メタデータ生成時の列マッピング＋先頭列基準（重複時は行番号フォールバック）で対応付ける。
8. **着手順**: Desktop（`gix`）＋共通 UI を先行して一気通貫で完成させ、続けて VS Code / Web（`isomorphic-git`）＋プラットフォーム間互換テストを実装する。

---

## 8. ロードマップ（段階的チェックリスト）

- [x] **Step 0**: 仕様確定・2 層モデル・UI 方針を本計画書へ反映
- [x] **Step 1（Layer 1 強化）**: `packages/core/src/history.ts` のフルセットコマンド拡張（セル・一括編集・行/列操作・メタデータ変更＋任意インデックスへのジャンプ）と `packages/ui` 各操作フックへの接続・ユニットテスト
- [x] **Step 2（Layer 2 コア）**: `packages/core` に `HistoryAdapter`・`HistoryRetentionPolicy`（`enabled` 含む）・セル単位 Diff ヘルパーとユニットテストを実装
- [x] **Step 3（Desktop / `gix`）**: `apps/desktop/src-tauri/src/history.rs` に `gix` を完全隔離した非同期 `HistoryRepository`、閾値/プルーニング、および結合テスト（4 本柱の 1〜3）を実装
- [x] **Step 4（共通 UI・右パネル統合）**: `packages/ui` に右サイド履歴パネル（メタデータパネルと排他表示、操作履歴＋短縮ハッシュ/タイムスタンプ付きスナップショット一覧、クリック巻き戻し、セル Diff 表示）と App Settings UI を追加
- [x] **Step 5（VS Code / Web & 互換テスト）**: `isomorphic-git` 版 `HistoryAdapter` と `gix` ⇔ `isomorphic-git` 相互互換テスト（4 本柱の 4）を実装
