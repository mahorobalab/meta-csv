# 履歴管理（Shadow Git / `gix`）設計計画

> 作成日: 2026-11-26  
> 検討メモ出典: [`docs/note/gemini_talk_20261126-3_metatext.txt`](../note/gemini_talk_20261126-3_metatext.txt) / [`docs/note/idea.txt`](../note/idea.txt)  
> 関連計画: [`metatext-and-metalog-plan.md`](./metatext-and-metalog-plan.md) / [`packaging-metatext-zip-plan.md`](./packaging-metatext-zip-plan.md)

---

## 1. 目的と方針

データ編集や調査作業において「さっきの状態に戻したい」「誤編集に気づいた瞬間に巻き戻したい」という要望に応えるため、**Excel の Undo の延長のような感覚で使えつつ、裏側では Git オブジェクト（`gix` / `isomorphic-git`）で本体と `.metatext.jsonc` を 1 セットとして管理する** 履歴機能（Phase C）を導入する。

### 設計上の基本姿勢
1. **シンプル・非複雑主義**: ブランチ分岐やコンフリクトマージのような複雑な Git 操作は UI に持ち込まない。「保存した履歴の一覧から選んで戻せる（あ！というときに助かる）」体験に集中する。
2. **データ本体と `.metatext.jsonc` の一貫性**: 行番号ベースのメタデータ（`markers` / `rows` / `cells` / `ranges`）とデータ本体のズレを防ぐため、両者を同一スナップショットに記録する。
3. **既存 Git を汚さない**: ユーザーの作業ディレクトリ内 `.git` には干渉せず、裏側の専用リポジトリ（Shadow Git）へ静かに積み上げる。

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
  mode: 'count' | 'sizeMb';
  maxCount: number;         // 例: デフォルト 10 回
  maxTotalSizeMb: number;   // 例: デフォルト 10 MB
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

## 3. 保存場所（Shadow Git）と既存 `.git` との非干渉

- **保存先（Shadow Git 方式）**: 作業ディレクトリ内に `.git` を作るとユーザーの既存リポジトリ（入れ子 Git 問題・`git status` 汚染）と衝突するため、OS のアプリデータ領域にファイル識別ハッシュ単位の専用 bare リポジトリを自動生成する。
  - 例（Desktop）: `<app_data_dir>/history/<canonical-path-hash>.git/`
- **既存ワークスペース `.git` との関係**: 作業フォルダ配下の既存 `.git` には一切書き込み（ステージング・コミット）を行わない。
- **外部共有**: 履歴ごと他者へ渡したいときは、[`packaging-metatext-zip-plan.md`](./packaging-metatext-zip-plan.md) の `.metatext.zip`（オプションで `history/` 同梱）を使用する。

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

## 6. 確定方針（オーナー決定済み）

1. **履歴保存のトリガー**: **手動保存（`Ctrl+S`）のタイミング** に絞る（シンプルな構成）。
2. **非同期保存 ＆ 大容量閾値**: 本体保存直後に **完全非同期バックグラウンド** で履歴を保存し、本体スキップ閾値は **デフォルト `20 MB`（設定で変更可能）** とする。
3. **体験コンセプト ＆ 保持上限**: マージ等の複雑な機能は不要（「Excel の Undo の延長で、裏で Git が動いている」体験）。保持上限は設定で **回数（デフォルト `10 回`）または容量（デフォルト `10 MB`）** を選択可能とする。
4. **セル単位 Diff の基準**: メタデータ生成時の列マッピング＋先頭列基準（重複時は行番号フォールバック）で対応付ける。

---

## 7. ロードマップ（チェックリスト）

- [ ] `packages/core` に `HistoryAdapter`・`HistoryRetentionPolicy`・セル単位 Diff ヘルパーを定義
- [ ] Desktop（Rust）側で `gix` を組み込んだ非同期 `HistoryRepository` ラッパー、容量/回数プルーニング、および上記 4 本柱の Cargo 結合テストを実装
- [ ] Web / VS Code 向けに `isomorphic-git` 版 `HistoryAdapter` と互換性テストを実装
- [ ] `packages/ui` に履歴タイムラインドロワー（一覧・差分確認・ワンクリック復元）と非同期ステータス通知を追加
- [ ] App Settings に「スキップ閾値（既定 20 MB）」「保持方式（回数 10 回 / 容量 10 MB）」の設定 UI を追加
