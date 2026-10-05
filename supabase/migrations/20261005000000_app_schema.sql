-- M0：アプリ用の関数を置くスキーマ。
-- テーブル（facility_id と行ごとのアクセス制限つき）は M1 以降のマイグレーションで追加する。
create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

comment on schema app is 'Dolphin CREATE の権限確認などの関数（RLS から使う）';
