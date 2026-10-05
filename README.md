# Dolphin CREATE

Dolphin接客データ連動型 広告運用・成果分析システム（第1段階）。

- 開発の指示：[`CLAUDE.md`](CLAUDE.md)
- 実装計画（承認済み）：[`docs/plan.md`](docs/plan.md)
- 仕様書：[`docs/spec_v2.md`](docs/spec_v2.md)／ログインの本番設計：[`docs/auth_design.md`](docs/auth_design.md)／試作版：[`docs/prototype.html`](docs/prototype.html)

## 構成

| 場所                        | 中身                                                     |
| --------------------------- | -------------------------------------------------------- |
| `app/`                      | 画面とサーバー処理（Next.js App Router）                 |
| `lib/core/`                 | 計算・判定・検査（画面から切り離した関数。仕様書7章）    |
| `lib/server/`               | DB・認証・AI・ファイルなどサーバー専用の処理             |
| `config/`                   | 秘密ではない設定値（モデル名の既定値、タイムアウトなど） |
| `supabase/migrations/`      | データベースの定義（SQL）                                |
| `supabase/tests/database/`  | データベースのテスト（RLS など）                         |
| `tests/unit/`、`tests/e2e/` | 単体テスト（Vitest）、画面の自動テスト（Playwright）     |
| `seed/`                     | 架空のデモデータ（本番では使わない。M2 以降）            |

## 環境

| 環境   | DB・認証                       | 画面                     | 秘密情報の置き場所                  |
| ------ | ------------------------------ | ------------------------ | ----------------------------------- |
| 開発   | ローカルの Supabase（Docker）  | `npm run dev`            | `.env.local`（コミットしない）      |
| テスト | CI ごとに作って捨てる Supabase | CI の中でビルド          | GitHub Actions（テスト用の値だけ）  |
| 本番   | Supabase（東京リージョン）     | Vercel（東京リージョン） | Vercel・Supabase のシークレット管理 |

環境ごとに別のプロジェクト・別のキーを使います。本番のキーを開発やテストで使わないでください。

## 開発の始め方

必要なもの：Node.js 22 以上、Docker。

```sh
npm ci
cp .env.example .env.local     # 値は npx supabase start の表示から入れる
npx supabase start             # ローカルの DB・認証を起動（マイグレーションも適用）
npm run dev                    # http://127.0.0.1:3000
```

## テスト

```sh
npm run check      # lint・書式・型検査・単体テスト
npm run test:db    # DB のテスト（npx supabase db start の後）
npm run test:e2e   # 画面の自動テスト（ビルドしてから起動）
```

CI（`.github/workflows/ci.yml`）は push のたびに、上の3つと秘密情報の検査（gitleaks）を実行します。

`supabase/tests/database/000_table_rules.test.sql` は、public スキーマの全テーブルで「行ごとのアクセス制限が有効」「`facility_id` がある」ことを確かめます。テーブルを足してこの決まりを破ると CI が失敗します。
