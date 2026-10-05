# Dolphin CREATE 第1段階 実装計画（承認待ち）

作成：2026-10-05／改訂：仕様書（第3版）との突き合わせを反映
対象：`CLAUDE.md` 第1段階
状態：**承認待ち。承認をいただくまでコードは書きません。**

この文書は `CLAUDE.md` 1章で求められている4点をまとめたものです。

1. 実装計画（マイルストーンごとの作業と順番）
2. 技術構成の提案（未決事項への推奨案と理由）
3. データベースの設計（テーブル・主な列・行ごとのアクセス制限）
4. 不明点・決めてほしいこと

---

## 0. 参照資料の状態

| 資料 | 状態 |
|---|---|
| `CLAUDE.md`（開発指示書） | 配置済み・全文確認済み |
| `docs/spec_v2.md`（仕様書） | 配置済み・全文確認済み。**中身は第3版（2026-10-06）**。ファイル名は `CLAUDE.md` の参照に合わせて `spec_v2.md` のまま |
| `docs/prototype.html`（試作版） | 配置済み。画面・計算・判定・文言・プロンプトをコードから確認済み |
| `docs/auth_design.md`（本番設計ドキュメント） | **未着**。受入テスト10項目はここにある |
| `docs/Dolphin_マーケットレポートAPI連携_要件表.xlsx` | **未着**。第2段階で使う。第1段階では `market_report` の取込形式だけ合わせる |

優先順位は `CLAUDE.md` 9章のとおり「仕様書 ＞ 試作版」。ログインとデータ分離は本番設計ドキュメントが正本なので、届いたら M1 の内容と終わりの条件をもう一度突き合わせます。

### 仕様書の取り込みで変わったこと（前回の計画から）

| 項目 | 前回の計画 | 仕様書に合わせた今回の計画 |
|---|---|---|
| パスワード | 試作版どおり10文字以上・英字と数字 | **12文字以上**、漏えい済みパスワードの照合、認証サービスの方式で保管 |
| 初回ログイン | 仮パスワード→初回変更 | **招待メールのリンクから本人が設定** |
| ロック | 5回失敗でロック、解除は管理者 | **5回失敗で15分ロック**、繰り返すと管理者が解除 |
| 自動ログアウト | 無操作30分 | 無操作30分＋**ログインから最長12時間** |
| 履歴 | 記録のみ | 成功・失敗・ロック・権限変更を**1年保存** |
| 権限 | 6権限の案（要確認） | 仕様書3章で確定。**同じ人が承認欄の2つ以上を承認できない** |
| アカウント発行 | 本部だけを推奨 | 本部管理者に加え、**施設管理者が自施設の担当者を発行・停止できる** |
| 接続情報 | — | 広告・GA4・Dolphin の接続情報を**施設ごとに暗号化して保管**、画面に出さない |
| 取込 | Dolphin CSV | Dolphin **CSV／JSON** |
| AI | P1・P2・コピー案・P4・P4b | **P2c（キャッチコピー案）** の正式プロンプトを使う。P4・P4b の出力項目が増えた |
| 判定ルール | 試作版から | 仕様書7章に集約。**検索語句の除外候補、DMG の年齢の偏り、好調画像、差別化候補**を追加 |
| クリエイティブ作成 | 画像×キャッチ、PNG | 生成画像の取込と状態件数、「※写真はイメージです」の自動付加、**未承認素材の透かし**、1.91:1 を追加 |
| テーブル | — | **`market_report`** を追加 |
| Dolphin 返却CSV（⑩） | 範囲か要確認 | 第1段階に含む（仕様書9章） |
| Fee | 要確認 | Fee込み＝使用額×(1＋Fee率)、円未満切り捨て、初期値20%、施設ごとの設定 |

---

## 1. 実装計画

### 進め方の方針

- マイルストーンは M0 → M6 の順。各 M は小さなプルリクエストに分け、M の終わりに「作ったもの／確認方法と結果／未解決の点」を報告します。
- 計算・判定ロジック（仕様書7章）は、画面から切り離した純粋な関数（`lib/core/`）にまとめ、**試作版と同じ入力で同じ結果になることを単体テストで固定**します。試作版のコードは流用せず作り直します。数値の突き合わせ用に、試作版のデモデータと同じ形の `seed` を用意します。
- 施設ごとのデータ分離は「データベースの行ごとのアクセス制限（RLS）」と「サーバー側の権限確認」の二重で守ります。M1 以降、テーブルを足すたびに **RLS の自動テスト（他施設の行が読めない・書けない）を必ず追加**します。

### M0：雛形・環境・CI

| 作業 | 内容 |
|---|---|
| リポジトリ構成 | Next.js（App Router）＋TypeScript（strict）。`app/`（画面とサーバー処理）、`lib/core/`（計算・判定・検査）、`lib/server/`（DB・認証・AI・ファイル）、`supabase/migrations/`（SQL）、`prompts/`（P0〜P5・P2c の固定部分）、`seed/`（架空デモデータ）、`tests/`（単体・RLS・画面） |
| 品質 | ESLint、Prettier、型検査、Vitest、Playwright |
| 環境分け | 開発（ローカルの Supabase）／テスト（CI 用の使い捨て DB）／本番。環境ごとに別プロジェクト・別キー |
| CI | GitHub Actions：lint → 型検査 → 単体テスト → DB を起動してマイグレーション → RLS テスト → Playwright |
| 秘密情報 | `.env.example` のみコミット。`.env*` は `.gitignore`。CI にシークレット検査を入れる |
| 画面の土台 | 配色（ネイビー #12324A、スカイブルー #43A7D5、背景 #EAF6F8）、ライト・ダーク両対応、文言を1か所に集める |

終わりの条件：push で全テストが自動で走る／秘密情報がリポジトリにない。

### M1：認証・権限・施設ごとのデータ分離・アカウント管理

| 作業 | 内容 |
|---|---|
| テーブル | `facility`、`app_user`、`user_facility_role`、`auth_audit`、`operation_log`、`facility_connection` |
| RLS の土台 | 「ログイン中の人がその施設に何の権限を持つか」を返す関数を作り、全テーブルのポリシーから使う（3章） |
| ログイン（仕様書10章） | 12文字以上、漏えい済みパスワードの照合、招待メールからの初回設定、5回失敗で15分ロック（繰り返すと管理者が解除）、無操作30分・最長12時間で自動ログアウト、どの項目が違うか示さないエラー、多要素認証（本部管理者・施設管理者は必須） |
| 画面 | ログイン、パスワード変更、アカウント管理（一覧・招待・編集・再発行・ロック解除・停止/再開・ログイン履歴）、施設の切替（権限のない施設は選べない） |
| 権限 | 本部管理者は全アカウント、施設管理者は自施設の担当者だけを発行・停止できる |
| サーバー側の確認 | すべてのサーバー処理の入口で「施設IDと必要な権限」を確認する共通関数を通す |
| 履歴 | 成功・失敗・ロック・権限変更を `auth_audit` に記録し、1年保存（古いものを消す日次処理） |
| テスト | 本番設計ドキュメントの受入テスト10項目を Playwright＋RLS テストで自動化 |

### M2：① Dolphinデータ連携（取込）と取込履歴

| 作業 | 内容 |
|---|---|
| 取込の共通処理 | アップロード → 文字コード判定（UTF-8/BOM・Shift_JIS）→ 見出しの自動対応付け → 画面で対応付けを修正 → 検証プレビュー → 確定 |
| 検証（試作版と同じ順） | ①必須（接客ID・lead_id・施設ID・広告改善の同意）欠け → ②施設IDが自施設でない → ③重複（ファイル内・登録済み）→ ④広告改善の同意なし。個人情報の列は対応付けの候補から外し、保存しない。発言内の連絡先は伏せ字にしてから保存 |
| 取込の種類 | 接客データ（CSV／JSON）、予約/来館/成約（CRM）CSV、Dolphin 生成画像（画像＋情報CSV：file_name、asset_id、title、prompt、target、rights、expiry）、広告実績CSV（Google広告・Meta・GA4） |
| 生成画像の状態 | 取り込んだ画像は「権利確認中・未承認」から始める |
| 冪等性 | 同じファイル（内容のハッシュ）を二度取り込んでも行が増えない。広告実績は「施設×日×媒体×広告」単位で上書き |
| 取込履歴 | 日時・ファイル・種別・行数・取込・重複・欠損・同意外・他施設・個人情報の列・伏せ字の件数・実行者を `import_job` に記録 |
| 画面 | 接続状況、Dolphin連携データ①〜⑩と一緒に必要な項目の表、CSV取込、同意範囲、照合結果（計測紐付け率）、取込履歴 |
| テスト | 試作版の「サンプルCSVで試す」と同じCSVで、取込可・重複・欠損・同意なし・他施設・個人情報の列・伏せ字の件数が試作版と一致 |

### M3：② 分析、④ 広告分析レポート（全タブ）、⑤ 予約・来館・成約

| 作業 | 内容 |
|---|---|
| 計算関数（仕様書7章） | 各指標、分母0は「算出不可」、金額切り捨て、Fee込み、確度、継続/修正/停止候補/保留、広告の診断、ファネルの詰まり（目安の80%未満）、検索語句の除外候補（クリック3件以上・獲得0件）、DMG の年齢の偏り（表示の50%超が55歳以上）、好調画像、改善画像、差別化候補 |
| ② 分析 | 流入元で絞り込み。①〜⑨の区分で成約群と非成約群を比較、偏りの注意（流入元構成・担当者差・期間）、ペルソナと広告仮説、AI要約（P1）。母数・確度・根拠発言、最小母数未満は「参考外」 |
| ④ レポート | サマリー（週次の広告費と有効予約、提案、P4）、媒体別配信結果（当期・前期・前期比）、日毎集計（土日を区別、曜日別）、クリエイティブ毎（並べ替え・絞り込み・③へ移動）、検索広告詳細、DMG 詳細、所見・次月施策（好調画像・改善画像）。Fee込み表示の切替。媒体別と日毎の表に「Dolphin CREATE 有効予約」を並べる |
| ⑤ ファネル | 9段階の通過率と目安、詰まっている段階、3つの計測値（媒体報告・GA4・lead_id 実績）の並記、広告別ファネルと診断、AI原因診断（P4b） |
| 画面の明示（仕様書7章） | 有効/無効の条件、売上・粗利の確定時点、対象期間、Asia/Tokyo、帰属ルール、更新時刻、遅延・欠損件数 |
| テスト | `seed` のデモデータで、主要数値が試作版と一致 |

### M4：③ 広告クリエイティブ案と AI 機能

| 作業 | 内容 |
|---|---|
| 作成の考え方 | ①ターゲットと声 ②好まれる画像 ③会場の強み ④競合との差別化 ⑤広告実績 を自動集計して各案に表示 |
| 媒体別の案 | Google検索、Instagram、YouTube（仕様書8.2の項目） |
| クリエイティブ作成 | 生成画像の取込と「生成→権利確認待ち→承認待ち→使える」の件数。画像×キャッチ：画像は成約群の選択率の差が大きい順、キャッチは Dolphin 提案・既存の案・AI（P2c、5案）。位置・書体・色・サイズ（4:5／9:16／1:1／1.91:1）。生成画像に「※写真はイメージです」、未承認素材に「下書き・未承認素材」の透かしを自動で入れる。簡易チェック、おすすめ上位6案、PNG保存、「Instagram広告の案にする」 |
| ほかのタブ | おすすめハッシュタグ、競合Instagram（差別化候補の判定）、画像庫、施設事実・LP、承認・公開履歴 |
| 公開前チェック（P5） | 事実の裏付け、条件表記、媒体仕様、実写/生成の区分、素材の権利・承認・期限、広告とLPの一致、予約導線、計測URL、期間と予算をサーバーで機械検査 |
| 3者承認と版管理 | データ（Aさん）・表現（Bさん）・会場（会場担当または施設管理者）。**同じ人は2つの欄を承認できない**。編集で版を上げ、承認をすべて取り消す |
| 入稿用CSV | 3者承認済みかつブロッカー0件の版だけ。冪等キーで二重に書き出さない。**媒体の公開APIは呼ばない** |
| AI | P1、P2、P2c、P4、P4b。サーバーからのみ呼び、P0 を先頭に付ける。入力は1施設分の匿名集計と伏せ字の短い根拠発言だけ。応答を JSON スキーマで検証し、合わなければ「AIの応答を読めませんでした」。送った内容・モデル・プロンプトの版・出力を `ai_run_log` に保存 |
| テスト | 未承認・ブロッカーありの案が入稿CSVに出ない／編集で承認が外れる／同じ人が2欄を承認できない／冪等キーで二重書き出しにならない |

### M5：Excel・CSV 出力、広告 API 取込

| 作業 | 内容 |
|---|---|
| Excel | 月次レポート14シート（仕様書9章）。Fee抜き／Fee込みの表示設定に従う |
| CSV | 広告分析レポート、入稿用CSV、Dolphin 返却用CSV（⑩。画像・広告単位の集計値のみ） |
| API 取込 | 権限が用意できた媒体から、**読み取り専用**のレポートAPIで日次取込。接続情報は `facility_connection` に暗号化して保管。2回動かしても重複しない |
| テスト | 出力の合計が画面と一致／API 取込が冪等 |

### M6：受入と試験運用

- 仕様書13章の受入条件①〜⑦を確認できる手順書とテストを用意し、1施設で試験運用。人間の受入確認を待つ。

---

## 2. 技術構成の提案

| 項目 | 推奨 | 理由 |
|---|---|---|
| 言語 | TypeScript（決定） | — |
| フロントエンド・サーバー | Next.js（App Router）。書き込みはサーバーアクション／Route Handler のみ | 秘密情報をブラウザに出さない |
| データベース | PostgreSQL＋RLS（決定）。**Supabase の Postgres** を推奨 | 認証と同じ基盤で、ログイン中の人の ID を RLS から直接参照できる |
| 認証サービス【要確認】 | **Supabase Auth を推奨** | ①ログイン中の人の ID を RLS でそのまま使える（Identity Platform では毎回のDB接続で利用者情報を設定する仕組みを自作する必要があり、設定漏れがそのまま漏えいになる）②招待メール、TOTP の多要素認証、漏えい済みパスワードの照合（Have I Been Pwned 連携）がある ③ファイル保管も同じ権限で守れる |
| 仕様書10章で足りない部分 | 「15分ロック」「最長12時間」「無操作30分」は認証サービスの設定だけでは足りないため、ログインをサーバー処理経由にして、失敗回数・ロック・セッション開始時刻を `app_user`／`auth_audit` で管理する | 仕様どおりの動きにするため |
| 公開先【要確認】 | 社内のクラウドが決まっていなければ **Vercel（東京）＋Supabase（東京）** | Next.js との相性、手間の少なさ、データを国内に置く |
| ファイル保管（決定） | Supabase Storage。非公開バケット、パスは `施設ID/種類/ファイル`。表示は期限付き署名URL（例：10分）のみ | Storage の RLS で他施設を拒否 |
| 接続情報の暗号化 | Supabase Vault（またはアプリ側の AES-GCM、鍵は公開先のシークレット）で施設ごとに暗号化。画面には「接続済み」などの状態だけを出す | 仕様書10章 |
| 定期実行 | 取込・集計・履歴の削除の日次処理を、公開先の定期実行から秘密トークン付きで呼ぶ | 公開先に合わせる |
| DB の変更管理 | Supabase CLI の SQL マイグレーション。型は DB から自動生成 | RLS ポリシーを SQL のまま管理・レビューできる |
| DB へのアクセス | 画面からの処理は「ログイン中の人の権限」で接続し、RLS を必ず効かせる。全権限キーは日次処理など限られた場所だけで使い、施設IDを必ず条件に入れ、テストで確認 | 二重に守る |
| 入力検証 | zod（フォーム、CSV/JSON の行、AI の応答） | 1つの定義で型と検証を兼ねる |
| CSV | papaparse＋iconv-lite（Shift_JIS 対応） | 社内システムの CSV は Shift_JIS のことが多い |
| AI（決定） | Anthropic 公式 SDK をサーバーからのみ使用。モデル名は設定で変更可。プロンプトの固定部分は `prompts/` にファイルで置き、版番号を付ける | 仕様書11章・`CLAUDE.md` 7章 |
| Excel 出力 | exceljs（サーバー側） | 14シート、書式・列幅・数値形式を指定できる |
| 画像の書き出し（PNG） | ブラウザの canvas で生成し、保存時にサーバーへアップロードして画像庫に記録 | 文字の配置を画面で確認するため |
| テスト | Vitest（計算・検査・取込）、RLS テスト、Playwright（画面） | 推奨どおり |
| 時刻 | DB は UTC、表示は Asia/Tokyo。日次の値は「東京の日付」を `date` 列で持つ | 仕様書・`CLAUDE.md` 5章 |

---

## 3. データベースの設計

### 3.1 共通の決まり

- **すべてのテーブルに `facility_id`（NOT NULL）を持たせます。** 本部も `facility` の1行（種類＝本部、コード `HQ`）として持ちます。
- 主キーは `uuid`。施設内で人が見る番号（`CR-1`、`C01` など）は `code` 列、`(facility_id, code)` で一意。
- 金額は円の整数（`bigint`、列名は `_yen`）。率は保存せず件数から計算。
- 日時は `timestamptz`（UTC）。
- 作成・更新の日時と実行者を全テーブルに持たせます（記録系は作成のみ）。
- 架空デモデータは `seed/` の別スクリプトだけで投入し、本番では実行しません（デモ施設は `facility.is_demo = true`）。

### 3.2 権限（仕様書3章）

| 値 | 名前 | 見られる施設 | 承認 | アカウント管理 |
|---|---|---|---|---|
| `hq_admin` | 本部管理者 | 全施設 | なし | 全アカウントの発行・変更・停止・再発行・ロック解除 |
| `marketing` | マーケ・データ（Aさん） | 担当施設 | データ・計測 | なし |
| `creative` | 制作・ブランド（Bさん） | 担当施設 | 表現・ブランド、素材の権利確認 | なし |
| `facility_admin` | 施設管理者 | 自施設 | 事実・素材・予算（会場欄）、月間予算上限の設定 | 自施設の担当者の発行・停止 |
| `venue_staff` | 会場担当 | 自施設 | 事実・素材・予算（会場欄） | なし |
| `viewer` | 閲覧のみ | 自施設 | なし | なし |

承認欄は3つ（データ／表現／会場）。承認を記録するとき、同じ版のほかの欄を同じ人が承認済みなら拒否します（DB の制約とサーバーの両方で）。

### 3.3 RLS の仕組み

```sql
-- ログイン中の人が、その施設に指定の権限のどれかを持つか
create function app.has_role(fid uuid, roles app.role[] default null)
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.user_facility_role r
    join public.app_user u on u.id = r.user_id
    where r.user_id = auth.uid()
      and r.facility_id = fid
      and u.status = 'active'
      and (roles is null or r.role = any(roles))
  );
$$;
```

- **読み取り**：`using (app.has_role(facility_id))`。権限のある施設の行だけ見える。
- **書き込み**：テーブルごとに必要な権限を指定。例：`creative_version` の追加は `app.has_role(facility_id, '{creative,marketing}')`。
- **記録系**（`auth_audit`、`operation_log`、`approval_audit`、`ai_run_log`、`import_job`）：追加のみ。更新・削除のポリシーは作らない（1年経った履歴の削除は日次処理だけが行う）。
- **本部管理者の全施設閲覧**：本部管理者には全施設分の `user_facility_role` を作る（施設を追加したら自動で追加）。RLS の式は1つに保ちます。
- **接続情報**（`facility_connection`）：画面からは状態の列だけ読める。暗号化された値はサーバーの専用処理以外から読めない。
- **Storage**：オブジェクトのパスの先頭（施設ID）に同じ `app.has_role` を使う。
- サーバー側でも入口で同じ確認を行い、RLS テストで「他施設の行が0件」「他施設への書き込みが拒否」を全テーブル分確認します。

### 3.4 テーブル一覧

（追加）と付いたものは、仕様書のテーブル一覧にはなく、この計画で足したものです。

**認証・権限・記録**

| テーブル | 主な列 |
|---|---|
| `facility` | `id`、`code`（`fac_A`、本部は `HQ`）、`kind`（本部/会場）、`name`、`sub`、`region`、`lp_domain`、`fee_rate_bp`（Fee率。初期値2000＝20%）、`monthly_budget_cap_yen`、`min_n`（初期値10）、`is_demo`。`facility_id` は自分の `id` |
| `app_user` | `id`（認証の利用者ID）、`facility_id`（所属）、`email`、`login_id`（Q3 次第）、`display_name`、`status`（招待中/有効/停止）、`failed_login_count`、`locked_until`、`lock_count`、`session_started_at`、`last_login_at` |
| `user_facility_role` | `user_id`、`facility_id`、`role`。一意：`(user_id, facility_id, role)` |
| `auth_audit` | `facility_id`、`user_id`（不明なら空）、`login_id_entered`、`event`（成功/失敗/ロック/ロック解除/パスワード変更/招待/再発行/権限変更/停止/再開）、`ip`、`user_agent`、`at`。1年保存 |
| `operation_log`（追加） | `facility_id`、`actor_id`、`action`（入稿CSV・Excel・CSVの書き出し、取込、設定変更、AI実行など）、`target_type`、`target_id`、`detail`、`at` |
| `facility_connection`（追加） | `facility_id`、`provider`（Google広告/Meta/GA4/Dolphin）、`account_ref`、`secret_encrypted`、`status`、`last_synced_at`。仕様書10章の「接続情報を施設ごとに暗号化」 |

**① Dolphin・CRM 取込**

| テーブル | 主な列 |
|---|---|
| `import_job` | `facility_id`、`kind`（接客/CRM/生成画像/Google広告/Meta/GA4/マーケットレポート）、`format`（CSV/JSON）、`file_name`、`file_sha256`、`mapping`、`rows_total`、`rows_ok`、`rows_dup`、`rows_missing`、`rows_no_consent`、`rows_wrong_facility`、`pii_columns_dropped`、`masked_count`、`status`、`run_by`、`at` |
| `consent_record` | `facility_id`、`consultation_id`、`recording`、`transcription`、`analysis`、`ad_improvement`、`text_version`、`given_at`、`withdrawn_at` |
| `consultation_session` | `facility_id`、`external_id`（接客ID）、`lead_id`、`anon_customer_id`、`consulted_at`、`staff_code`、`source`、`ad_id`（判定できたときだけ）、`outcome`（成約/非成約/見積中）、`outcome_fixed_at`、`cluster_code`、`age_band`、`area_band`、`plan_period`・`plan_headcount_band`・`plan_budget_band`・`plan_style`、`visit_motive`、`decision_factor`、`noncontract_reason`、`competitor_name`、`import_job_id`。一意：`(facility_id, external_id)` |
| `transcript_segment` | `facility_id`、`session_id`、`speaker`（本人/担当者）、`start_sec`、`end_sec`、`text_masked`（伏せ字済みのみ）、`confidence`。第1段階は根拠発言の範囲だけ（Q12） |
| `customer_insight` | `facility_id`、`session_id`、`kind`（planning/priorities/visit_motive/visual_preference/positive_trigger/unresolved_objection/decision_factor/noncontract_reason）、`category_code`、`rank`、`explicit_or_inferred`、`confidence`、`segment_id` |
| `insight_category`（追加） | `facility_id`、`kind`、`code`、`label`、`theme`、`dolphin_summary`。重視点などの区分の定義 |
| `cluster_definition`（追加） | `facility_id`、`code`、`label`、`description`、`from_categories`、`version`、`valid_from`。定義の変更履歴（仕様書5.2） |
| `visual_survey` | `facility_id`、`session_id`、`presented_asset_ids`、`presented_order`、`selected_asset_id`、`reason_masked` |
| `crm_lead` | `facility_id`、`lead_id`、`reserved_at`、`is_valid`、`cancelled_at`、`visited_at`、`outcome`、`outcome_fixed_at`、`lost_reason`、`revenue_yen`、`gross_profit_yen`、`channel`（広告/電話/外部予約サイト/UTM欠損）、`utm_source`〜`utm_term`、`click_id`、`ga4_client_id`、`ad_id`（判定できたときだけ。**判定できない予約はどの広告にも割り振らない**）、`import_job_id`。一意：`(facility_id, lead_id)` |
| `funnel_event` | `facility_id`、`date`、`ad_id`、`landing_page_id`、`lp_sessions`、`view_fair`、`select_fair`（CTA）、`form_start`、`form_error`、`generate_lead`、`import_job_id`。GA4 由来の値だけ |
| `market_report` | `facility_id`、`period_start`、`period_end`、`payload`（jsonb）、`source`（CSV/API）、`import_job_id`。項目は要件表 xlsx が届いてから確定 |

**③ クリエイティブ**

| テーブル | 主な列 |
|---|---|
| `venue_claim`（施設事実） | `facility_id`、`code`、`text`、`evidence`、`status`、`condition_text`、`condition_key`、`value_text`、`value_key`、`keywords`、`category_code`、`valid_until` |
| `landing_page`（追加） | `facility_id`、`code`、`path`、`title`、`keywords`、`values`（特典額など） |
| `asset`（画像庫） | `facility_id`、`code`（共通の画像ID）、`title`、`kind`（実写/生成）、`source`、`storage_path`、`rights_status`（確認中/確認済）、`approval_status`（未承認/承認済）、`expires_on`、`allowed_media`、`survey_note`、`gen_prompt`、`gen_target`、`edit_history`、`import_job_id` |
| `creative`（追加） | `facility_id`、`code`、`media`（Google検索/Instagram/YouTube）、`current_version` |
| `creative_version` | `facility_id`、`creative_id`、`version`、`format`、`name`、`content`（媒体別の見出し・説明文・キャッチ・シーンなど）、`claim_ids`、`asset_ids`、`lp_id`、`image_label`、`budget_month_yen`、`why`（①〜⑤）、`hypothesis`、`main_kpi`、`check_result`（P5）、`is_ai_generated`、`ai_run_id`。過去の版は変更しない |
| `approval_audit` | `facility_id`、`target_type`（クリエイティブ/施設事実/素材/予算上限）、`target_id`、`version`、`slot`（データ/表現/会場）、`action`（承認/取消/編集による自動取消）、`actor_id`、`at`。現在の承認状態はここから求める |
| `campaign_mapping` | `facility_id`、`creative_version_id`、`media`、`idempotency_key`（一意）、`utm_content`、`external_campaign_id`、`external_ad_group_id`、`external_ad_id`、`exported_at`、`exported_by`。入稿用CSVの書き出し記録を兼ねる |
| `competitor_account` | `facility_id`、`name`、`hp_url`、`instagram_url`、`state`、`post_count`、`theme_share`、`format_share`、`note` |
| `hashtag_suggestion` | `facility_id`、`tag`、`category`、`reason`、`target_cluster`、`source`（Dolphin/手入力） |
| `copy_suggestion`（追加） | `facility_id`、`text`、`sub`、`category_code`、`target`、`basis`、`source`（Dolphin/AI P2c/既存の案） |

**④⑤ 広告実績・レポート・AI**

| テーブル | 主な列 |
|---|---|
| `media_daily_metric` | `facility_id`、`date`、`media`、`account_id`、`campaign`、`ad_group`、`ad_id`、`ad_name`、`asset_code`、`impressions`、`clicks`、`cost_yen`（Fee抜き）、`media_reported_cv`、`source`（CSV/API）、`import_job_id`。一意：`(facility_id, date, media, ad_id)` で上書き |
| `media_breakdown_metric`（追加） | `facility_id`、`date`、`media`、`ad_id`、`dimension`（キーワード/検索語句/広告グループ/プレースメント/エリア/性別/年齢/時間帯）、`key`、`match_type`、`ad_score`、`impressions`、`clicks`、`cost_yen`、`media_reported_cv`。検索広告詳細・DMG 詳細・Excel 用 |
| `audience_insight_aggregate` | `facility_id`、`period_start`、`period_end`、`source_filter`、`dimension`、`key`、`n`、`contract_n`、`computed_at` |
| `report_note` | `facility_id`、`period_start`、`period_end`、`whole`、`detail`、`next_actions`（媒体ごとの選択＋補足）、`good_images`、`improve_images` |
| `ai_run_log`（追加） | `facility_id`、`purpose`（P1/P2/P2c/P4/P4b）、`model`、`prompt_version`、`input`、`output`、`schema_valid`、`error`、`run_by`、`at` |
| `setting_change_log`（追加） | `facility_id`、`key`（最小母数・月間上限・Fee率など）、`before`、`after`、`changed_by`、`at`。AIルール・設定の「変更履歴」 |

**3つの計測値を混ぜない**：媒体報告は `media_daily_metric.media_reported_cv`、GA4 は `funnel_event.generate_lead`、Dolphin CREATE の実績は `crm_lead`（lead_id で結合）と、テーブルも列も分けて持ちます。

---

## 4. 不明点・決めてほしいこと

### A. 資料

- **Q1.** 本番設計ドキュメント（`docs/auth_design.md`）と要件表 xlsx をください。とくに受入テスト10項目は、M1 を終えたと言える条件そのものです。

### B. 未決事項（`CLAUDE.md` 10章・仕様書14章）

| No. | 質問 | 推奨 |
|---|---|---|
| Q2 | 認証サービスと公開先 | Supabase Auth＋Supabase（東京）＋Vercel（東京）。Google Cloud が必須なら教えてください |
| Q3 | ログインID：メールアドレスか「施設コード＋ID」か。仕様書4章は「施設コード・ログインID・パスワード（本番はメールアドレスも可）」、10章は「メールアドレス（推奨）または施設コード＋ID【要確認】」 | **メールアドレスだけ**。招待メールでの初回設定（仕様書10章）とも合う。両方を受け付けると、ログイン画面と照合の作りが複雑になる |
| Q4 | 多要素認証：本部管理者・施設管理者のほかは「推奨」のままか | 仕様書どおり（管理者は必須、他は任意） |
| Q5 | 最初の1施設と、その施設管理者 | — |
| Q6 | Dolphin の接客データ（CSV／JSON）と CRM CSV の実際の列（サンプル） | 届くまでは試作版の列で作り、届いたら対応付けを追加 |
| Q7 | Google広告・Meta・GA4 の権限を用意する時期 | M5 の時点で用意できた媒体から接続 |
| Q8 | 月次レポートの集計単位 | 仕様書14章どおり、レポートは暦月・前月比。②⑤の画面は任意の期間＋同じ長さの前期間 |

### C. 仕様書の中での食い違い

- **Q9. タブの数**：③は「8タブ」とありますが、表には9つ（Google検索・Instagram・YouTube・クリエイティブ作成・ハッシュタグ・競合・画像庫・施設事実・履歴）あります。④も「8タブ」とありますが、表は7つです（試作版も7つ）。表の内容どおりに作る（③は9、④は7）でよいですか。
- **Q10. P1 の入力と、AIに渡してよい範囲**：仕様書の P1 は入力に `diarized_transcripts`（話者別の文字起こし）を含め、AI に発言から項目を抽出させる形です。一方で `CLAUDE.md` 7章と仕様書10章は「AIに渡すのは1施設分の匿名集計と、伏せ字にした短い根拠発言だけ」です。第1段階では抽出は Dolphin 側の結果（CSV／JSON）を使い、**P1 には集計値と短い根拠発言だけを渡す**（試作版と同じ）、でよいですか。
- **Q11. 会場欄の承認**：仕様書1章は会場担当が「素材利用権と公開可否を承認」、3章は Bさんが「素材の権利確認」、会場担当・施設管理者が「事実・素材・予算の承認」です。素材は「Bさんの権利確認 → 会場担当の承認」の2段階（仕様書4章の生成画像の流れ）と読んでよいですか。

### D. 第1段階の範囲

- **Q12. 文字起こし・音声**：仕様書6章は Dolphin の音声取得・話者分離・文字起こし・マスキングを流れに含めていますが、13章の第1段階は「Dolphin CSV／JSON」です。第1段階では**音声も文字起こし全文も扱わず**、Dolphin の分析結果と伏せ字済みの根拠発言だけを受け取る、でよいですか。
- **Q13. 媒体の範囲**：仕様書8.2には Googleディスプレイ・DMG の素材と TikTok（拡張）もありますが、③の案の作り分けは Google検索・Instagram・YouTube の3つ（`CLAUDE.md` どおり）にし、DMG はクリエイティブ作成の 1.91:1 の書き出しまで、TikTok は対象外、でよいですか。
- **Q14. マーケットレポート**：`market_report` は第1段階ではテーブルと手動取込の口だけ用意し、画面での表示は要件表を見てから決める、でよいですか。

### E. 試作版にしかない判定・細部

- **Q15. 「差は小さい」**：試作版は、最小母数以上でも平均との差が3pt未満なら「差は小さい」と表示します。仕様書の確度は「参考外／低／中」の3つだけです。（推奨：確度とは別の補足として残す）
- **Q16. 公開前チェックの細目**：試作版には仕様書の項目に加え、警告として「ターゲット検索案」「テキスト量」「ハッシュタグ3個以内」「冒頭のフック15字以内」、ブロッカーとして「YouTube の音源の権利」があります。「予約導線」の検査は試作版にないので、LP にフェア予約の導線（CTA とフォーム）があるかを LP の登録情報で確認する形で足します。この形でよいですか。
- **Q17. 予算上限の判定**：試作版は「入稿済みの他の案の月額＋この案の月額 ≦ 施設の月間上限」です。月をまたぐ案や、配信を止めた案の扱いも決めたいです。
- **Q18. 素材の期限**：試作版は判定日が固定です。本番は「書き出す日」に有効期限内かを判定します。配信予定の終了日まで有効であることも求めますか。
- **Q19. 伏せ字の範囲**：試作版はメールと電話だけです。（推奨：URL、郵便番号＋住所らしい文字列、@から始まるアカウント名も伏せる。氏名は自動判定の誤りが多いので、取込時の注意表示にとどめる）
- **Q20. 見積中**：成約/非成約の比較から見積中を除き、件数は別に表示する、でよいですか（仕様書5.2「未確定を非成約と混ぜない」）。

---

## 5. 承認いただきたいこと

1. 1章の実装計画とマイルストーンの順番
2. 2章の技術構成（とくに Q2）
3. 3章のデータベース設計と RLS の方式
4. 4章の質問への回答（M0〜M1 に影響するのは Q1〜Q4、Q11）

承認後、M0 から始めます。M0 は Q2 の回答がなくても、雛形・CI・テストの枠組みから着手できます。
