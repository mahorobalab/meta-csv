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
| **GitHub (`mahorobalab/meta-csv`)** | 信頼の土台・仕様公開・開発拠点 | 無料（OSS） | ソースコード、`docs/SPEC.md`、JSON Schema、セルフビルド手順。<br>**※ GitHub Releases でのバイナリ配布は行わない。** |
| **GitHub Pages（Web / PWA ＋ LP）** | 公式サイト・お試しアプリ・ポリシー・スキーマ配信 | 無料 | 1 つの GitHub Pages 内でパス分割して運用（詳細は 4.1）。Wasm 不要・完全オフライン動作。将来独自ドメイン（`meta-csv.dev` 等）へそのまま移行可能。 |
| **VS Code / Open VSX Marketplace** | 開発者向け集客・普及エンジン | 無料 | `.vsix` 拡張機能（VS Code Marketplace ＋ Antigravity / Cursor 等向け Open VSX）。IDE 内で `.meta.jsonc` の体験を広げ、単体デスクトップ版のファンを増やす。 |
| **Microsoft Store / BOOTH** | 収益化・公式製品版配布 | 有料 | Windows（MSIX / 署名済み `.exe`）・macOS（Universal `.dmg` 等）の公式ビルド。自動アップデート・動作確認済み。 |

### 4.1 GitHub Pages URL・ディレクトリ分割構成（採用方針）
Web 版・製品 LP・MS Store 審査用ページ・JSON Schema 配信を 1 つの GitHub Pages（`https://mahorobalab.github.io/meta-csv/`）内でパス分割して運用する：

```text
https://mahorobalab.github.io/meta-csv/
├── /                    ← 製品トップページ（LP：概要・デモ導線・MS Store / BOOTH / VS Code 拡張リンク）
├── /app/                ← Web / PWA アプリ本体（apps/playground を Web 版としてビルド、PWA スコープを隔離）
├── /schema/             ← metacsv.schema.json の公式配信 URL（.meta.jsonc の "$schema" 参照先）
└── /privacy/            ← プライバシーポリシー（Microsoft Store 申請等で必須）
```

- **メリット**:
  - PWA の Service Worker スコープを `/app/` に閉じられるため、LP やポリシーページの更新と干渉しない。
  - Microsoft Store・VS Code Marketplace が求める「ホームページ URL」「プライバシーポリシー URL」をすべてここで完結できる。
  - `.meta.jsonc` 先頭の `"$schema"` が実在する公開 URL として機能し、拡張機能なしの VS Code でも JSON Schema 補完が効く。
  - 将来独自ドメイン（例: `https://meta-csv.dev/`）を割り当てた際も、同じパス構造でシームレスに移行できる。

**モノレポ内の配置方針**:
- `apps/site/`（または `docs/site/`）: `/`（LP）および `/privacy/` の軽量静的ページ
- `apps/playground/`（将来 `apps/web/` へ整理も可）: Vite の `base` を `/meta-csv/app/`（独自ドメイン時は `/app/`）に設定してビルド
- `docs/schema/metacsv.schema.json`: Pages ビルド時に `/schema/` へ自動コピー

### 4.2 VS Code / Open VSX Marketplace 向け構成
Marketplace の拡張機能ページ自体は Web サイトを別途ホストする必要はなく、`.vsix` パッケージ内に同梱されたファイルがそのまま表示される。リポジトリルートの `README.md` とは役割を分け、`apps/vscode/` 配下に拡張機能専用のドキュメントを配置する：

```text
apps/vscode/
├── package.json     # publisher ("mahorobalab"), icon, homepage (GitHub Pages /), repository, bugs, galleryBanner
├── README.md        # Marketplace 紹介ページ本文（VS Code での使い方・スクショ中心）
├── CHANGELOG.md     # Marketplace の変更履歴タブ
└── assets/
    └── icon.png     # 128x128 以上の公式アイコン
```

- 同一の `.vsix` で **Visual Studio Marketplace** と **Open VSX Registry** の両方に公開可能。

---

## 5. リポジトリ運用・CI/CD 方針

### 5.1 GitHub リポジトリ整備ファイル
公開前に以下をリポジトリルートへ整備する：
- `LICENSE`: MIT License 全文（`Copyright (c) 2026 MahorobaLab`）
- `TRADEMARKS.md`（任意）: ブランド名・ロゴの利用ガイドライン
- `README.md` / `README_ja.md`: 以下のセクションを整備
  - **Download & Official Builds**: 公式ビルドは Microsoft Store / BOOTH で提供予定である旨、および GitHub Releases ではバイナリ配布しない旨を明記
  - **Build from Source**: 開発者向けのセルフビルド手順（`pnpm.cmd install` → `pnpm.cmd build:desktop` 等）
  - **License & Trademarks**: コードライセンスとブランド権利留保の明記

### 5.2 GitHub Actions（CI/CD）
- **常時実行する CI (`ci.yml`)**:
  - トリガー: `push` / `pull_request`
  - 内容: `pnpm typecheck` / `pnpm test` / `pnpm build`
- **GitHub Pages デプロイ (`deploy-pages.yml`)**:
  - トリガー: `main` ブランチへの `push`（および `workflow_dispatch`）
  - 内容: LP（`/`・`/privacy/`）＋ Web/PWA ビルド（`/app/`）＋ `metacsv.schema.json`（`/schema/`）を 1 つの成果物に統合して GitHub Pages へ自動デプロイ
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
- [ ] 公式アプリアイコンの制作と `apps/desktop/src-tauri/icons/` および `apps/vscode/assets/` への組み込み

### Phase 2: GitHub 公開 & CI 構築
- [x] 変更の整理・コミットおよび GitHub リポジトリ `mahorobalab/meta-csv` への初回 Push
- [x] GitHub Actions（`ci.yml`: テスト・型チェック・ビルド検証）の追加

### Phase 3: 普及チャネル展開（無料）
- [x] GitHub Pages 構成の実装（`/` LP・`/privacy/`・`/app/` Web/PWA・`/schema/`）と `deploy-pages.yml` 自動デプロイ構築
- [ ] `apps/vscode/` の Marketplace 向け整備（`README.md` / `CHANGELOG.md` / `icon.png` / `publisher: mahorobalab`）と `.vsix` パッケージ化
- [ ] VS Code Marketplace および Open VSX Registry への公開

### Phase 4: 公式ビルド販売（有料）
- [ ] Windows 向けコード署名・MSIX パッケージ化（既存 MH-Utilities パイプライン流用）
- [ ] macOS 向けビルド・署名（必要に応じて）
- [ ] Microsoft Store / BOOTH 商品ページ公開と README / LP リンク更新

---

## 7. 未決事項（オーナー確認ポイント）

1. **ドメイン取得タイミング**: まずは `https://mahorobalab.github.io/meta-csv/` で公開し、反響を見てから `meta-csv.dev` 等へ切り替えるか、最初から独自ドメインを取るか？
2. **有料版と OSS 版の差分方針**:
   - **完全同一コード（ビルド販売型）**: 機能差なし。署名済み・自動更新・インストーラーの利便性で課金（推奨・最もクリーン）。
   - **オープンコア型**: 将来的に一部高度な機能のみ製品版に限定するか。
3. **VS Code Marketplace の Publisher ID**: 既存の `mahorobalab` アカウントを使うか、新規に作成するか。
