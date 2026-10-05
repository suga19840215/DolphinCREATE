# Dolphin CREATE 第1段階 実装計画（承認待ち）

作成：2026-10-05／対象：`CLAUDE.md` 第1段階
状態：**承認待ち。承認をいただくまでコードは書きません。**

この文書は `CLAUDE.md` 1章で求められている4点をまとめたものです。

1. 実装計画（マイルストーンごとの作業と順番）
2. 技術構成の提案（未決事項への推奨案と理由）
3. データベースの設計（テーブル・主な列・行ごとのアクセス制限）
4. 不明点・決めてほしいこと

---

## 0. 前提と、まだ読めていない資料

| 資料 | 状態 |
|---|---|
| `CLAUDE.md`（開発指示書） | リポジトリに配置済み。全文確認済み |
| `docs/prototype.html`（試作版） | リポジトリに配置済み。画面・計算・判定・文言・AIプロンプト（P0〜P5）をコードから確認済み |
| `docs/spec_v2.md`（要件の正本） | **リポジトリにありません** |
| 本番設計ドキュメント「施設別ログイン 本番設計」（ログイン・データ分離の正本、受入テスト10項目） | **受け取っていません** |
| `docs/Dolphin_マーケットレポートAPI連携_要件表.xlsx` | **リポジトリにありません** |

このため、この計画は「CLAUDE.md＋試作版」から作っています。仕様書と本番設計ドキュメントを受け取ったら突き合わせて、違いがあれば計画を直してから再度承認をお願いします（→ 4章 Q1）。とくに **M1 の終わりの条件（受入テスト10項目）は本番設計ドキュメントがないと確定できません**。

---

## 1. 実装計画

### 進め方の方針

- マイルストーンは M0 → M6 の順。各 M は小さなプルリクエストに分け、M の終わりに「作ったもの／確認方法と結果／未解決の点」を報告します。
- 計算・判定ロジックは、画面から切り離した純粋な関数（`packages/core` 相当）にまとめ、**試作版と同じ入力で同じ結果になることを単体テストで固定**します。試作版のコードは流用せず作り直しますが、数値の突き合わせ用に試作版のデモデータ生成と同じ形の `seed` を用意します。
- 施設ごとのデータ分離は「データベースの行ごとのアクセス制限（RLS）」と「サーバー側の権限確認」の二重で守ります。M1 以降、新しいテーブルを足すたびに **RLS の自動テスト（他施設の行が読めない・書けない）を必ず追加**します。

### M0：雛形・環境・CI

| 作業 | 内容 |
|---|---|
| リポジトリ構成 | Next.js（App Router）＋TypeScript（strict）。`app/`（画面とサーバー処理）、`lib/core/`（計算・判定・検査の純粋関数）、`lib/server/`（DB・認証・AI・ファイル）、`supabase/migrations/`（SQL）、`prompts/`（P0〜P5 の固定部分）、`seed/`（架空デモデータ）、`tests/`（単体・RLS・画面） |
| 品質 | ESLint、Prettier、型検査、Vitest、Playwright |
| 環境分け | 開発（ローカルの Supabase）／テスト（CI 用の使い捨て DB）／本番。環境ごとに別プロジェクト・別キー |
| CI | GitHub Actions：lint → 型検査 → 単体テスト → DB を起動してマイグレーション → RLS テスト → Playwright |
| 秘密情報 | `.env.example` のみコミット。`.env*` は `.gitignore`。CI にシークレット検査（gitleaks 等）を入れる |
| 文言 | 画面文言を1か所（`lib/i18n/ja.ts` 相当）に集め、試作版の言い回しを移す |

終わりの条件：push で全テストが自動で走る／秘密情報がリポジトリにない。

### M1：認証・権限・施設ごとのデータ分離・アカウント管理

| 作業 | 内容 |
|---|---|
| テーブル | `facility`、`app_user`、`user_facility_role`、`auth_audit`、`operation_log` |
| RLS の土台 | 「ログイン中の人がその施設に何の権限を持つか」を返す関数を作り、全テーブルのポリシーから使う（3章） |
| ログイン | 試作版の決まりを移す：10文字以上・英字と数字を含む／仮パスワードは初回変更必須／5回連続失敗でロック（解除は本部管理者）／30分無操作で自動ログアウト／エラーではどの項目が違うか示さない。多要素認証は Q5 の決定に従う |
| 画面 | ログイン、パスワード変更、アカウント管理（一覧・追加・編集・仮パスワード再発行・ロック解除・停止/再開・ログイン履歴）、施設の切替（権限のない施設は選べない） |
| サーバー側の確認 | すべてのサーバー処理の入口で「施設IDと必要な権限」を確認する共通関数を通す |
| テスト | 本番設計ドキュメントの受入テスト10項目を Playwright＋RLS テストで自動化 |

### M2：① Dolphinデータ連携（取込）と取込履歴

| 作業 | 内容 |
|---|---|
| 取込の共通処理 | アップロード → 文字コード判定（UTF-8/BOM・Shift_JIS）→ 見出しの自動対応付け（試作版の同義語表）→ 画面で対応付けを修正 → 検証プレビュー → 確定 |
| 検証（試作版と同じ順） | ①必須（接客ID・lead_id・施設ID・広告改善の同意）欠け → ②施設IDが自施設でない → ③重複（ファイル内・登録済み）→ ④広告改善の同意なし。個人情報の列（氏名・メール・電話・住所に当たる見出し）は対応付けの候補から外し、保存しない。発言内のメール・電話は伏せ字（［メール］［電話］）にしてから保存 |
| 取込の種類 | 接客データCSV、予約/来館/成約（CRM）CSV、Dolphin 生成画像（画像ファイル＋情報CSV）、広告実績CSV（Google広告・Meta・GA4） |
| 冪等性 | 同じファイル（内容のハッシュ）を二度取り込んでも行が増えない。広告実績は「施設×日×媒体×広告」単位で上書き |
| 取込履歴 | 日時・ファイル・種別・行数・取込・重複・欠損・同意外・他施設・実行者を `import_job` に記録 |
| 画面 | 接続状況、Dolphin から受け取るデータ①〜⑩と追加でほしい項目の表、同意範囲、照合結果（計測紐付け率）、取込履歴 |
| テスト | 試作版の「サンプルCSVで試す」と同じCSVで、取込可・重複・欠損・同意なし・他施設・個人情報の列・伏せ字の件数が試作版と一致 |

### M3：② 分析、④ 広告分析レポート（全タブ）、⑤ 予約・来館・成約

| 作業 | 内容 |
|---|---|
| 計算関数 | 試作版の `analyze`／`sumRows`／`linkRate`／`recommend`／`diag`／`improveImages`／`confLabel` に当たる関数を作り直し、分母0は「算出不可」、金額は切り捨て |
| ② 分析 | 流入元で絞り込み。①クラスタ・年齢・エリア、②要因（成約群/非成約群の言及率、Dolphinの要約、伏せ字の根拠発言）、⑤ビジュアルアンケート、⑥重視点、⑦来館動機、⑧決め手と非成約理由、⑨競合、偏りの注意（流入元構成・担当者差15pt超の警告・期間）、ペルソナと広告仮説。母数と確度、最小母数未満は「参考外」 |
| ④ レポート | サマリー（継続/修正/停止/保留の提案）、媒体別配信結果、日毎集計、クリエイティブ毎、検索広告詳細（キーワード・検索クエリ・グループ・オーディエンス）、デマンドジェネレーション詳細（広告・オーディエンス・プレースメント・エリア・性年齢・時間）、所見・次月施策（数値からの下書き、好調画像・改善画像）。Fee抜き／Fee込みの切替（Fee率は施設の設定） |
| ⑤ ファネル | 9段階の通過率と目安、詰まっている段階、3つの計測値（媒体報告・GA4・lead_id 実績）の並記、広告別ファネルと診断、非成約理由 |
| 集計の置き場所 | 画面表示のたびに計算できる規模なら都度計算。重くなったら `audience_insight_aggregate` に日次で保存 |
| テスト | `seed` のデモデータで、主要数値（件数・率・単価・紐付け率・提案・診断）が試作版と一致 |

### M4：③ 広告クリエイティブ案と AI 機能

| 作業 | 内容 |
|---|---|
| 作成の考え方 | ①ターゲットと声 ②好まれる画像 ③会場の強み ④競合との差別化 ⑤広告実績 を自動集計して表示 |
| 媒体別の案 | Google検索（ターゲット検索案・見出し/説明文・パス・幅の換算表示）、Instagram（静止画/カルーセル、キャッチ・主文・見出し・CTA・ハッシュタグ）、YouTube（形式・尺・フック・シーン・音源） |
| タブ | クリエイティブ作成（画像×キャッチ、PNG書き出し）、おすすめハッシュタグ、競合Instagramの登録、画像庫、施設事実・LP、承認・公開履歴 |
| 公開前チェック（P5） | 試作版 `crChecks` と同じ判定をサーバーで実施（事実の裏付け、条件表記、媒体仕様、実写/生成の区分、素材の権利・承認・期限、広告とLPの一致、計測URL、期間と予算） |
| 3者承認と版管理 | データ（Aさん）・表現（Bさん）・会場（会場担当）。内容を編集したら版を上げ、承認をすべて取り消す。承認・取消・編集はすべて記録 |
| 入稿用CSV | 3者承認済みかつブロッカー0件の版だけ書き出せる。冪等キー（施設＋案＋版から作る）で、同じ版を二重に書き出さない。**媒体の公開APIは呼ばない** |
| AI | P1（分析要約）、P2（媒体別クリエイティブ案）、キャッチコピー案、P4・P4b。サーバーからのみ Claude API を呼び、P0 を先頭に付ける。入力は1施設分の匿名集計と伏せ字の短い根拠発言だけ。応答は JSON スキーマで検証し、合わなければ「AIの応答を読めませんでした」。送った内容・モデル・プロンプトの版・出力を `ai_run_log` に保存 |
| テスト | 未承認・ブロッカーありの案が入稿CSVに出ないこと、編集で承認が外れること、冪等キーで二重書き出しにならないことをサーバー側テストで確認 |

### M5：Excel・CSV 出力、広告 API 取込

| 作業 | 内容 |
|---|---|
| Excel | サーバー側で月次レポートを生成（試作版と同じ14シート：表紙、全体数値、日毎集計、クリエイティブ別、検索広告_グループ別／キーワード別／検索クエリ／オーディエンス別、DMG_広告別／オーディエンス別／プレースメント別／エリア別／性・年齢別／時間別） |
| CSV | 広告レポートCSV、入稿用CSV、Dolphin返却用CSV（⑩ Instagram 効果。画像・広告単位の集計値のみ） |
| API 取込 | 権限が用意できた媒体から、**読み取り専用**のレポートAPIで日次取込。「施設×日×媒体×広告」で上書きし、2回動かしても重複しない |
| テスト | 出力ファイルの合計が画面の合計と一致／API 取込を2回実行して件数が変わらない |

### M6：受入と試験運用

- 仕様書7章の受入条件①〜⑦を確認できる手順書とテストを用意し、1施設で試験運用。人間の受入確認を待つ。

### 順番の理由

認証とデータ分離（M1）を先に固めると、以降のテーブルはすべて最初から RLS 付きで作れます。取込（M2）がないと分析・レポートの元データがないため、M3 より前に置きます。クリエイティブ（M4）は分析と実績（M3）の結果を「作成の考え方」に使うため、その後にします。

---

## 2. 技術構成の提案

| 項目 | 推奨 | 理由 |
|---|---|---|
| 言語 | TypeScript（決定） | — |
| フロントエンド・サーバー | Next.js（App Router）。データの書き込みはサーバーアクション／Route Handler のみ | 指示書の推奨どおり。画面とサーバー処理を1つにでき、秘密情報をブラウザに出さない |
| データベース | PostgreSQL＋RLS（決定）。**Supabase の Postgres** を推奨 | 認証と同じ基盤で、ログイン中の人の ID を RLS から直接参照できる |
| 認証サービス【要確認】 | **Supabase Auth を推奨** | ①ログイン中の人の ID が DB の RLS からそのまま使える（Identity Platform だと、毎回のDB接続で利用者情報を設定する仕組みを自作する必要があり、設定漏れが即データ漏えいになる）②多要素認証（TOTP）あり ③ファイル保管（Storage）も同じ権限で守れる。Google Cloud を必須とする社内ルールがある場合は Identity Platform＋Cloud SQL で作れますが、RLS 連携の作り込みが増えます |
| 公開先【要確認】 | 社内のクラウドが決まっていなければ **Vercel（東京リージョン）＋Supabase（東京リージョン）** | Next.js との相性、手間の少なさ。データは国内に置く。Google Cloud を使っている場合は Cloud Run（東京）＋Supabase でも可 |
| ファイル保管（決定） | Supabase Storage。バケットは非公開、パスは `施設ID/種類/ファイル`。表示は期限付き署名URL（例：10分）のみ | 施設IDをパスの先頭に置き、Storage の RLS で他施設を拒否 |
| 定期実行 | 取込・集計の日次処理は、公開先の定期実行（Vercel Cron または Cloud Scheduler）から、サーバーの専用エンドポイントを秘密トークン付きで呼ぶ | 公開先に合わせる（指示書どおり） |
| DB の変更管理 | Supabase CLI の SQL マイグレーション。型は DB から自動生成 | RLS ポリシーを SQL のまま管理でき、レビューしやすい |
| DB へのアクセス | 画面からの処理は「ログイン中の人の権限」で接続し、RLS を必ず効かせる。全権限キーは日次処理と取込確定など限られた場所だけで使い、そこでは施設IDを必ず条件に入れ、テストで確認 | 二重に守る |
| 入力検証 | zod（フォーム、CSV の行、AI の応答） | 1つの定義で型と検証を兼ねる |
| CSV | papaparse＋iconv-lite（Shift_JIS 対応） | 社内システムの CSV は Shift_JIS のことが多い |
| AI（決定） | Anthropic 公式 SDK をサーバーからのみ使用。モデル名は環境変数／設定ファイル（`AI_MODEL`）で変更可。プロンプトの固定部分は `prompts/P0.md` などに分け、版番号を付ける | 指示書7章 |
| Excel 出力 | exceljs（サーバー側） | 書式・列幅・数値形式を指定でき、14シートを作れる |
| 画像の書き出し（PNG） | ブラウザの canvas で生成（試作版と同じ方式）。保存時はサーバーへアップロードして画像庫に記録 | 文字の配置確認を画面で行うため |
| テスト | Vitest（計算・検査・取込）、RLS テスト（施設・権限ごとの読み書き）、Playwright（画面） | 指示書の推奨どおり |
| 時刻 | DB は UTC（`timestamptz`）、表示は Asia/Tokyo。日付単位の集計（広告の日次など）は「東京の日付」を `date` 列で持つ | 指示書5章 |

---

## 3. データベースの設計

### 3.1 共通の決まり

- **すべてのテーブルに `facility_id`（NOT NULL）を持たせます。** 本部も `facility` の1行（種類＝本部）として持ち、本部所属の利用者もこの規則に乗せます。
- 主キーは `uuid`。施設内で人が見る番号（`CR-1`、`C01` など）は `code` 列に持ち、`(facility_id, code)` で一意。
- 金額は円の整数（`bigint`、列名は `_yen`）。率は保存せず、件数から計算。
- 日時は `timestamptz`（UTC）。
- 作成・更新の日時と実行者（`created_at`、`created_by`、`updated_at`、`updated_by`）を全テーブルに持たせます（記録系テーブルは作成のみ）。
- 架空デモデータは `seed/` の別スクリプトでだけ投入し、本番では実行しません（デモ施設は `facility.is_demo = true`）。

### 3.2 権限（Q3〜Q4 で確定）

`user_facility_role.role` の値と、試作版からの対応です。

| 値 | 名前 | 主にできること（案） |
|---|---|---|
| `hq_admin` | 本部管理者 | 全施設の閲覧、アカウント管理。承認はしない（試作版どおり） |
| `marketing` | マーケ・データ（Aさん） | 取込、分析、レポート、AI、データ・計測の承認、予算上限の変更 |
| `creative` | 制作・ブランド（Bさん） | クリエイティブの作成・編集、表現の承認、素材の権利確認 |
| `facility_admin` | 施設管理者 | 自施設の閲覧・会場承認・予算上限、（Q3 次第で）自施設アカウントの発行 |
| `venue_staff` | 会場担当 | 自施設の閲覧、施設事実・素材・予算の会場承認 |
| `viewer` | 閲覧のみ | 自施設の閲覧のみ。書き出しも不可（案） |

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

- **読み取り**：`using (app.has_role(facility_id))` — 権限のある施設の行だけ見える。
- **書き込み**：テーブルごとに必要な権限を指定。例：`creative_version` の追加は `app.has_role(facility_id, '{creative,marketing}')`。
- **記録系（`auth_audit`、`operation_log`、`approval_audit`、`ai_run_log`、`import_job`）**：追加のみ許可。更新・削除のポリシーは作らない。
- **本部管理者の全施設閲覧**：本部管理者を作るときに、全施設分の `user_facility_role` を作る方式（施設を増やしたら自動で追加）。RLS の式は1つに保ちます。
- **Storage**：オブジェクトのパスの先頭（施設ID）に対して同じ `app.has_role` を使う。
- サーバー側でも、処理の入口で同じ確認を行い（二重）、RLS テストで「他施設の行が0件」「他施設への書き込みが拒否」を全テーブル分確認します。

### 3.4 テーブル一覧

**認証・権限・記録**

| テーブル | 主な列 |
|---|---|
| `facility` | `id`、`code`（例 `fac_A`、本部は `HQ`）、`kind`（本部/会場）、`name`、`sub`、`region`、`lp_domain`、`fee_rate_bp`（Fee率。万分率の整数）、`monthly_budget_cap_yen`、`min_n`（最小母数。初期値10）、`is_demo`。※`facility_id` は自分の `id` |
| `app_user` | `id`（認証の利用者IDと同じ）、`facility_id`（所属）、`login_id`、`display_name`、`status`（有効/停止）、`must_change_password`、`failed_login_count`、`locked_at`、`last_login_at` |
| `user_facility_role` | `user_id`、`facility_id`、`role`。一意：`(user_id, facility_id, role)` |
| `auth_audit` | `facility_id`（入力された施設。不明なら本部）、`user_id`（不明なら空）、`login_id_entered`、`event`（ログイン成功/失敗/ロック/パスワード変更/再発行/発行/変更/停止/再開/ロック解除）、`ip`、`user_agent`、`at` |
| `operation_log` | `facility_id`、`actor_id`、`action`（承認・入稿CSV書き出し・Excel書き出し・取込・設定変更など）、`target_type`、`target_id`、`detail`（jsonb）、`at` |

**① Dolphin・CRM 取込**

| テーブル | 主な列 |
|---|---|
| `import_job` | `facility_id`、`kind`（接客/CRM/生成画像/Google広告/Meta/GA4）、`file_name`、`file_sha256`、`mapping`（jsonb）、`rows_total`、`rows_ok`、`rows_dup`、`rows_missing`、`rows_no_consent`、`rows_wrong_facility`、`pii_columns_dropped`（列名の配列）、`masked_count`、`status`、`run_by`（人または「自動（日次）」）、`at` |
| `consent_record` | `facility_id`、`consultation_id`、`recording`、`analysis`、`ad_improvement`（各 boolean）、`text_version`（例 v2.1）、`given_at`、`withdrawn_at` |
| `consultation_session` | `facility_id`、`external_id`（接客ID）、`lead_id`、`consulted_at`、`staff_code`、`source`（流入元）、`ad_id`（判定できたときだけ）、`outcome`（成約/非成約/見積中）、`cluster_code`、`age_band`、`area_band`、`visit_motive`、`decision_factor`、`noncontract_reason`、`competitor_name`、`import_job_id`。一意：`(facility_id, external_id)` |
| `transcript_segment` | `facility_id`、`session_id`、`speaker`（本人/担当者）、`offset_sec`、`text_masked`（伏せ字済みのみ保存）、`confidence`。※第1段階は根拠発言のみ。全文は持たない（案） |
| `customer_insight` | `facility_id`、`session_id`、`kind`（重視点/来館動機/決め手/非成約理由）、`category_code`、`rank`、`is_explicit`（本人発言か担当者の推測か）、`confidence`、`segment_id` |
| `insight_category`（追加） | `facility_id`、`kind`、`code`、`label`、`theme`、`dolphin_summary`。重視点などの区分の定義 |
| `cluster_definition`（追加） | `facility_id`、`code`、`label`、`description`、`from_categories`、`version`、`valid_from`。定義の変更履歴を残す（Dolphin 追加項目「クラスタの定義」） |
| `visual_survey` | `facility_id`、`session_id`、`presented_asset_ids`、`presented_order`、`selected_asset_id`、`reason_masked` |
| `crm_lead` | `facility_id`、`lead_id`、`reserved_at`、`is_valid`、`visited_at`、`outcome`、`contracted_at`、`gross_profit_yen`、`revenue_yen`、`channel`（広告/電話/外部予約サイト/UTM欠損）、`utm_source`〜`utm_content`、`click_id`、`ad_id`（判定できたときだけ。**判定できない予約はどの広告にも割り振らない**）、`import_job_id`。一意：`(facility_id, lead_id)` |
| `funnel_event` | `facility_id`、`date`（東京の日付）、`ad_id`、`lp_sessions`、`cta_clicks`、`form_starts`、`form_errors`、`ga4_generate_lead`、`import_job_id`。GA4 由来の値だけを持つ |

**③ クリエイティブ**

| テーブル | 主な列 |
|---|---|
| `venue_claim`（施設事実） | `facility_id`、`code`、`text`、`evidence`、`status`（承認済/確認待ち）、`condition_text`、`condition_key`、`value_text`、`value_key`、`keywords`、`category_code`、`approved_by`、`approved_at` |
| `landing_page`（追加） | `facility_id`、`code`、`path`、`title`、`keywords`、`values`（jsonb。例：特典額） |
| `asset`（画像庫） | `facility_id`、`code`、`title`、`kind`（実写/生成）、`source`、`storage_path`、`rights_status`、`expires_on`、`approval_status`、`survey_note`、`gen_prompt`、`gen_target`、`gen_declared`、`import_job_id` |
| `creative`（追加） | `facility_id`、`code`、`media`（Google検索/Instagram/YouTube）、`current_version`。案の入れ物 |
| `creative_version` | `facility_id`、`creative_id`、`version`、`format`、`name`、`content`（jsonb：見出し・説明文・キャッチ・シーンなど媒体別）、`claim_ids`、`asset_ids`、`lp_id`、`image_label`（イメージ表記あり）、`budget_month_yen`、`why`（根拠①〜⑤）、`hypothesis`、`main_kpi`、`check_result`（P5 の結果）、`is_ai_generated`、`ai_run_id`。版は追記のみで、過去の版は変更しない |
| `approval_audit` | `facility_id`、`target_type`（クリエイティブ/施設事実/素材/予算上限）、`target_id`、`version`、`slot`（データ/表現/会場）、`action`（承認/取消/編集による自動取消）、`actor_id`、`at`。現在の承認状態はここから求める |
| `campaign_mapping` | `facility_id`、`creative_version_id`、`media`、`idempotency_key`（一意）、`utm_content`、`external_campaign_id`、`external_ad_group_id`、`external_ad_id`（入稿後に分かれば記入）、`exported_at`、`exported_by`。入稿用CSVの書き出し記録を兼ねる |
| `competitor_account` | `facility_id`、`name`、`hp_url`、`instagram_url`、`state`、`post_count`、`theme_share`（jsonb）、`format_share`（jsonb）、`note` |
| `hashtag_suggestion` | `facility_id`、`tag`、`category`、`reason`、`target_cluster`、`source`（Dolphin/手入力） |

**④⑤ 広告実績・レポート**

| テーブル | 主な列 |
|---|---|
| `media_daily_metric` | `facility_id`、`date`、`media`、`account_id`、`campaign`、`ad_group`、`ad_id`、`ad_name`、`impressions`、`clicks`、`cost_yen`（Fee抜き）、`media_reported_cv`、`source`（CSV/API）、`import_job_id`。一意：`(facility_id, date, media, ad_id)` で上書き（冪等） |
| `media_breakdown_metric`（追加） | `facility_id`、`date`、`media`、`ad_id`、`dimension`（キーワード/検索クエリ/オーディエンス/プレースメント/エリア/性年齢/時間）、`key`、`impressions`、`clicks`、`cost_yen`、`media_reported_cv`。検索広告詳細・DMG 詳細・Excel の各シート用 |
| `audience_insight_aggregate` | `facility_id`、`period_start`、`period_end`、`source_filter`、`dimension`、`key`、`n`、`contract_n`、`computed_at`。分析結果の保存（重くなった場合） |
| `report_note` | `facility_id`、`period_start`、`period_end`、`whole`、`detail`、`next_actions`（jsonb：検索/DMG/Meta）、`next_text`、`good_images`、`improve_images` |
| `ai_run_log`（追加） | `facility_id`、`purpose`（P1/P2/コピー/P4/P4b）、`model`、`prompt_version`、`input`（jsonb）、`output`（jsonb）、`schema_valid`、`error`、`run_by`、`at` |

**3つの計測値を混ぜない**：媒体報告は `media_daily_metric.media_reported_cv`、GA4 は `funnel_event.ga4_generate_lead`、Dolphin CREATE の実績は `crm_lead`（lead_id で結合）と、テーブルも列も分けて持ちます。

---

## 4. 不明点・決めてほしいこと

### A. 資料

- **Q1.** `docs/spec_v2.md`、本番設計ドキュメント「施設別ログイン 本番設計」、`docs/Dolphin_マーケットレポートAPI連携_要件表.xlsx` をリポジトリに入れていただけますか。とくに受入テスト10項目と権限の正式な定義は、M1 を始める前に必要です。

### B. 指示書10章の未決事項（推奨案つき）

| No. | 質問 | 推奨 |
|---|---|---|
| Q2 | 認証サービスと公開先 | Supabase Auth＋Supabase（東京）＋Vercel（東京）。社内で Google Cloud が必須なら教えてください |
| Q3 | ログインID：メールアドレスか、試作版と同じ「施設コード＋ID」か | メールアドレス（指示書の推奨どおり）。パスワード再設定をメールでできる |
| Q4 | 施設のアカウント発行を施設管理者に任せるか、本部だけか | 第1段階は本部だけ（施設は1つから始めるため）。施設管理者に任せる場合も、発行できるのは自施設の会場担当・閲覧のみに限る |
| Q5 | 多要素認証を全員必須にするか、管理者だけか | 本部管理者・施設管理者は必須、それ以外は任意で開始 |
| Q6 | 最初の1施設と、その施設管理者 | — |
| Q7 | Dolphin の接客データCSV・CRM CSV の実際の列（サンプル） | 届くまでは試作版の列（`IMPORT_FIELDS`）で作り、届いたら対応付けを追加 |
| Q8 | Google広告・Meta・GA4 の権限を用意する時期 | M5 の時点で用意できた媒体から接続 |

### C. 権限の細部

- **Q9.** 6つの権限それぞれが「できること」は 3.2 の表の案でよいですか（本番設計ドキュメントにあればそちらに合わせます）。とくに：
  - 施設管理者は「会場」の承認ができますか（試作版には施設管理者がありません）。
  - 閲覧のみの人は、Excel・CSV の書き出しができますか。
  - 3者承認で、同じ人が2つの枠（例：データと表現）を兼ねるのを禁止しますか。

### D. 試作版と指示書の食い違い・試作版にしかない判定（どちらに合わせるか）

- **Q10. 確度の表示**：試作版は、最小母数以上でも平均との差が3pt未満なら「差は小さい」と表示します。指示書は「参考外／低／中」の3つだけです。「差は小さい」を残しますか。（推奨：残す。確度とは別の欄に表示）
- **Q11. 粗利ROAS の分母0**：試作版は広告費0のとき「—」を表示します。指示書の決まりに合わせて「算出不可」にします。（推奨：算出不可）
- **Q12. 提案の判定**：試作版は「来館8件未満→保留」のほか、「成約0件→停止候補」「来館率60%未満→修正」「成約単価が平均の0.85倍以下→継続」「1.3倍超→修正」「それ以外→継続」です。この条件と、表示名「停止候補」（指示書では「停止」）をそのまま使いますか。（推奨：条件はそのまま、表示は「停止候補」）
- **Q13. 公開前チェックの項目**：試作版には指示書の8項目に加えて、警告（ブロッカーではない）として「ターゲット検索案」「テキスト量」「ハッシュタグ3個以内」「冒頭のフック15字以内」、ブロッカーとして「YouTube の音源の権利」があります。また P5 プロンプトにある「予約導線」の検査は試作版にありません。試作版どおりにして、「予約導線」は計測URL（lead_id 受け渡し）の検査に含める形でよいですか。
- **Q14. 予算上限の判定**：試作版は「入稿済みの他の案の月額＋この案の月額 ≦ 施設の月間上限」です。これでよいですか。月をまたぐ案や、配信を止めた案の扱いも決めたいです。
- **Q15. 素材の期限**：試作版は判定日が固定（2026-09-23）です。本番は「書き出す日」に有効期限内かを判定します。配信予定の終了日まで有効であることも求めますか。
- **Q16. 伏せ字の範囲**：試作版はメールアドレスと電話番号だけを伏せます。発言内の氏名・住所・SNS アカウント名も伏せますか。（推奨：電話・メールに加え、郵便番号＋住所らしい文字列、URL、@から始まるアカウント名も伏せる。氏名の自動判定は誤りが多いので、取込時の注意表示にとどめる）
- **Q17. 見積中の扱い**：試作版の分析は成約/非成約の2つで、見積中を持ちません（画面の注意書きでは「見積中は非成約に含めない」）。本番では見積中を分析の母数から除きます。よいですか。
- **Q18. 対象期間**：試作版は「直近4週／前4週」の2つです。本番は、②⑤は任意の期間（前期間と比較）、④の月次レポートは暦月、でよいですか。
- **Q19. Fee**：試作版は Fee込み表示の切替（Fee率20%）があります。Fee込みの計算は「Fee抜きの金額×(1＋Fee率)」で切り捨て、でよいですか。

### E. その他

- **Q20.** 「Dolphin へ返す学習データ（⑩）」の CSV 書き出しは第1段階に含めますか（指示書の範囲に明記がありません。試作版にはあります）。
- **Q21.** 「競合Instagramの登録」は、URL と手入力の傾向（テーマ・形式の割合）を保存するだけでよいですか。Instagram からの自動取得は第2段階、の理解です。
- **Q22.** 接客データの文字起こし全文は第1段階では保存せず、伏せ字済みの根拠発言だけを持つ、でよいですか。

---

## 5. 承認いただきたいこと

1. 1章の実装計画とマイルストーンの順番
2. 2章の技術構成（とくに Q2 の認証サービスと公開先）
3. 3章のデータベース設計と RLS の方式
4. 4章の質問への回答（少なくとも Q1〜Q5 と Q9 は M0〜M1 に影響します）

承認後、M0 から始めます。M0 は Q2 の回答がなくても進められる部分（リポジトリの雛形・CI・テストの枠組み）から着手できます。
