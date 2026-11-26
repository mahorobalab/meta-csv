# MetaCSV 公開・ライセンス・ブランド・運用計画

> 作成日: 2026-11-26  
> 検討メモ出典: [`docs/note/gemini_talk_20261126-1.txt`](../note/gemini_talk_20261126-1.txt) / [`docs/note/todo.txt`](../note/todo.txt)

---

## 1. 基本戦略（オープンソース × 公式ビルド販売モデル）

MetaCSV は **「ソースコードとフォーマット仕様はオープンソース（OSS）として公開し、コード署名済み・インストーラー付きの公式実行版はストア（Microsoft Store / BOOTH 等）で販売する」** モデルを採用する。

### このモデルを採る理由
- **信頼性と透明性の確保**: 企業・エンジニアがソースコードを確認でき、安心して業務データ（CSV）を扱える。
- **`.meta.jsonc` 仕様の普及（デファクト化）**: 仕様とリファレンス実装を公開することで、他ツール・スクリプトからの採用を促す。
- **持続可能な開発とサポート負荷の最適化**: GitHub Releases での無料バイナリ配布を行わないことで、ライト層からの無制限な導入サポート負荷を抑えつつ、「ビルド不要・署名済み・自動更新付き」の公式ビルドに価値を置くユーザーから収益を得る。
- **既存リリース資産の活用**: 既存の MSIX パッケージ化・コード署名・BOOTH / Microsoft Store 販売パイプラインをそのまま流用できる。

---

## 2. ブランディング・命名規約・商標確認

### 2.1 表記ルール

| 用途 | 表記 | 備考 |
| --- | --- | --- |
| プロダクト表示名・ロゴ | **MetaCSV** | タイトル・UI・ストア表記はパスカルケース |
| GitHub リポジトリ名 | `meta-csv` | ケバブケースで視認性・検索性を確保 |
| 独自ドメイン候補 | `meta-csv.dev` / `meta-csv.app` | リポジトリ名と完全一致 |
| VS Code 拡張機能 ID | `<publisher>.meta-csv` | Marketplace 標準命名 |
| サイドカー拡張子 | `.meta.jsonc` | 例: `spec_setting.csv.meta.jsonc` |

### 2.2 サイドカー拡張子を `.meta.jsonc` とする理由
1. **中立性（アプリ非依存）**: `.metacsv.jsonc` ではなく汎用名にすることで、他アプリやエコシステムが採用しやすい（`.editorconfig` / `tsconfig.json` と同じ立ち位置）。
2. **他形式への横展開**: `.tsv.meta.jsonc` や `.jsonl.meta.jsonc` にもそのまま応用できる。
3. **JSONC の明示**: `.json` にコメントを書くと標準パーサーで壊れるが、`.jsonc` にすることで人間にもツールにも仕様が一目で伝わり、VS Code の標準構文ハイライト・`$schema` 補完もそのまま効く。
4. **共存設計**: `$schema` による仕様明示と、未知プロパティ（他ツール拡張）を保存時に消さず保持する方針を徹底する。

### 2.3 商標調査記録（2026-11-26 時点）

| 対象 | 検索条件 | 結果 |
| --- | --- | --- |
| 日本（J-PlatPat） | `MetaCSV`（商標・特許・意匠） | **0 件（クリア）** |
| 米国（USPTO） | `MetaCSV` / `"Meta CSV"`（Status: Live, Class: 009 / 042） | **0 件（クリア）** |
| ドメイン | `meta-csv.dev` 等 | 空き確認済み |

> **公開前の追加確認項目**
> - [ ] GitHub 上で同名・同機能の既存リポジトリ重複がないか最終確認
> - [ ] VS Code Marketplace / npm で `meta-csv` / `@meta-csv/*` の重複確認

---

## 3. ライセンス設計とブランド権留保

### 3.1 コードライセンスの候補比較

| ライセンス | メリット | 注意点 | 適合度 |
| --- | --- | --- | --- |
| **MIT License（推奨）** | 最もシンプルで普及率が高い。企業導入・`.meta.jsonc` エコシステム拡大の障壁がゼロ | 第三者が自前ビルドを再配布することは法的には可能（※ブランド権留保で差別化） | ◎ |
| **Apache License 2.0（有力）** | MIT の利点に加え、特許権の明示的許諾と**商標の非許諾**が条文に明記されている | ライセンス文が少し長い（`NOTICE` 運用） | ◎ |
| **AGPL v3 / BSL** | クローン商用サービスの抑止力が強い | 企業利用・コントリビュートの心理的ハードルが上がり、`.meta.jsonc` 普及と逆行しやすい | △ |

**決定方針**:
- **ソースコード全体**: **MIT License**（`Copyright (c) 2026 MahorobaLab`）を採用。
- **仕様・スキーマ**（`docs/SPEC.md`, `docs/schema/metacsv.schema.json`）: 誰でも自由にパーサーや対応ツールを作れるよう MIT で公開し、`.meta.jsonc` の普及を最優先する。
- **名称・ロゴ・アイコン（ブランド資産）**: コードライセンスとは明確に分離し、作者（MahorobaLab）に権利を留保する。

### 3.2 ブランド・商標の権利留保ポリシー（Firefox / OBS / VS Code 方式）
`LICENSE` とは別に、`README.md` / `README_ja.md` に以下の方針を明記する。

- ソースコードの複製・改変・個人利用・セルフビルドは MIT ライセンスの範囲内で自由。
- **「MetaCSV」の名称および公式アプリアイコン・ロゴの権利は作者（MahorobaLab）に帰属する。**
- 第三者が独自にビルドしたバイナリや改変版を再配布・公開する場合は、公式ビルドとの混同を避けるため、**アプリ名およびアイコンを別のものに変更すること**。

#### 補足：商標未登録段階での実務的な防御の考え方
- Apache 2.0 の商標非許諾条項であっても、未登録の名称文字列に対して法的差し止め力を新たに生み出すものではない（日本は先願主義）。
- そのため、個人開発の立ち上げ期は無理に商標出願を行わず、**実務上もっとも効果が高い以下の 3 点**で公式ビルドを保護する：
  1. **オリジナルのアプリアイコン・ロゴの著作権**（登録不要で発生し、無断コピーに対して有効）
  2. **コード署名 ＋ 公式ストアアカウント**（発行元表示による明確な識別）
  3. **README / LICENSE でのブランド利用ルール明記**（コミュニティ上の抑止力、および悪質な模倣品が出た際のストア通報根拠）
- 将来的にユーザー数・売上が大きく伸びた段階で、必要に応じて商標出願を検討する。

### 3.3 主要依存ライブラリのライセンス確認
現在利用している主要依存はすべて商用販売・OSS 公開と両立可能なパーミッシブ系ライセンスで構成されている：
- `@glideapps/glide-data-grid`: MIT
- `papaparse`: MIT
- `jsonc-parser`: MIT
- `react` / `vite`: MIT
- `tauri` (v2): MIT / Apache-2.0

---

## 4. プラットフォーム別の役割分担と配布戦略

| チャネル | 役割 | 価格 | 配布物・特徴 |
| --- | --- | --- | --- |
| **GitHub (`meta-csv`)** | 信頼の土台・仕様公開・開発拠点 | 無料（OSS） | ソースコード、`docs/SPEC.md`、JSON Schema、セルフビルド手順。<br>**※ GitHub Releases でのバイナリ配布は行わない。** |
| **Web / PWA (`meta-csv.dev`)** | インストール不要のお試し・導線 | 無料 | `apps/playground` をベースに静的ホスティング（Cloudflare Pages / GitHub Pages）。Wasm 不要・完全オフライン動作。デスクトップ版への導線を設置。 |
| **VS Code / Antigravity Marketplace** | 開発者向け集客・普及エンジン | 無料 | `.vsix` 拡張機能。IDE 内で `.meta.jsonc` の体験を広げ、単体デスクトップ版のファンを増やす。 |
| **Microsoft Store / BOOTH** | 収益化・公式製品版配布 | 有料 | Windows（MSIX / 署名済み `.exe`）・macOS（Universal `.dmg` 等）の公式ビルド。自動アップデート・動作確認済み。 |

---

## 5. リポジトリ運用・CI/CD 方針

### 5.1 GitHub リポジトリ整備ファイル
公開前に以下をリポジトリルートへ整備する：
- `LICENSE`: 選択した OSS ライセンス全文（Copyright 表記含む）
- `TRADEMARKS.md`（任意）: ブランド名・ロゴの利用ガイドライン
- `README.md` / `README_ja.md`: 以下のセクションを追記
  - **Download / Installation**: 公式ビルドは Microsoft Store / BOOTH で提供している旨（準備中は Coming Soon）、および GitHub Releases ではバイナリ配布しない旨を明記
  - **Build from Source**: 開発者向けのセルフビルド手順（`pnpm.cmd install` → `pnpm.cmd build:desktop` 等）
  - **License & Trademarks**: コードライセンスとブランド権利留保の明記

### 5.2 GitHub Actions（CI/CD）
- **常時実行する CI (`ci.yml`)**:
  - トリガー: `push` / `pull_request`
  - 内容: `pnpm typecheck` / `pnpm test` / `pnpm build`
- **Desktop ビルド検証 (`desktop-build.yml`)**:
  - トリガー: 手動実行（`workflow_dispatch`）または特定タグ
  - 内容: Windows / macOS（Apple Silicon / Universal）での Tauri ビルド確認
  - **注意**: ビルド成果物は **Workflow Artifacts のみ**（またはプライベート配布用）に留め、公開 GitHub Releases へは自動アップロードしない運用とする。

### 5.3 Issue / サポート運用
- バグ報告・仕様提案は GitHub Issues で受け付ける。
- 公式ビルド（MS Store / BOOTH）のインストール・購入に関する問い合わせは各ストアの窓口または専用案内へ誘導する。

---

## 6. 公開までのロードマップ（チェックリスト）

### Phase 1: 権利・ドキュメント整備（最優先）
- [x] ライセンス確定（MIT）と Copyright 表記名（`MahorobaLab`）の決定
- [x] `LICENSE` ファイル作成
- [x] `README.md` / `README_ja.md` に `Download` / `Build from Source` / `License & Trademarks` を追記
- [ ] 公式アプリアイコンの制作と `apps/desktop/src-tauri/icons/` への組み込み

### Phase 2: GitHub 公開 & CI 構築
- [ ] GitHub リポジトリ `meta-csv` への初回 Push
- [ ] GitHub Actions（テスト・型チェック・ビルド検証）の追加
- [ ] 現在の未コミット変更（`.vscode/launch.json`, テーマ/ウィンドウ復元設定など）の整理・コミット

### Phase 3: 普及チャネル展開（無料）
- [ ] VS Code / Antigravity 向け `.vsix` パッケージ化・ドッグフーディング・Marketplace 公開
- [ ] Web / PWA 版（`vite-plugin-pwa`）の静的デプロイ（GitHub Pages または Cloudflare Pages）

### Phase 4: 公式ビルド販売（有料）
- [ ] Windows 向けコード署名・MSIX パッケージ化（既存 MH-Utilities パイプライン流用）
- [ ] macOS 向けビルド・署名（必要に応じて）
- [ ] Microsoft Store / BOOTH 商品ページ公開と README リンク更新

---

## 7. 未決事項（オーナー確認ポイント）

1. **コードライセンス**: `MIT` と `Apache 2.0` のどちらにするか？（シンプルさ重視なら MIT、特許・商標条項の明文化重視なら Apache 2.0）
2. **Copyright 表記名**: 個人名・屋号・ブランド名（例: `MH-Utilities` など）のどれを使うか？
3. **ドメイン取得タイミング**: `meta-csv.dev` 等を今押さえるか、Web 版公開時に取るか？
4. **有料版と OSS 版の差分方針**:
   - **完全同一コード（ビルド販売型）**: 機能差なし。署名済み・自動更新・インストーラーの利便性で課金（推奨・最もクリーン）。
   - **オープンコア型**: 将来的に一部高度な機能のみ製品版に限定するか。
