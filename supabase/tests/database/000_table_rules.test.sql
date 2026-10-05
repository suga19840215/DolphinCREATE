-- すべてのテーブルに共通する決まり（CLAUDE.md 5章）を、テーブルを足すたびに自動で確かめる。
--  1. public スキーマの全テーブルで行ごとのアクセス制限（RLS）が有効
--  2. public スキーマの全テーブルに facility_id（NOT NULL）がある
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is_empty(
  $$ select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'public の全テーブルで RLS が有効'
);

select is_empty(
  $$ select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (
          select 1 from pg_attribute a
           where a.attrelid = c.oid and a.attname = 'facility_id'
             and a.attnotnull and not a.attisdropped
        ) $$,
  'public の全テーブルに facility_id（NOT NULL）がある'
);

select * from finish();
rollback;
