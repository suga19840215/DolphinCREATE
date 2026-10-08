-- ⑤ ホームページでの予約獲得（GA4）：切り口別の値とページの分類は、自施設の分だけ読み書きできる。
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

delete from public.site_metric;
delete from public.page_category;
insert into public.facility (id, code, kind, name) values
  ('00000000-0000-0000-0000-0000000000da', 'zd_A', 'venue', '会場A'),
  ('00000000-0000-0000-0000-0000000000db', 'zd_B', 'venue', '会場B');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d2', 'mkt-d@example.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'staff-d@example.test');
insert into public.app_user (id, facility_id, email, display_name, status) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000da', 'mkt-d@example.test', 'Aさん', 'active'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000da', 'staff-d@example.test', '会場担当', 'active');
insert into public.user_facility_role (user_id, facility_id, role) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000da', 'marketing'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000da', 'venue_staff');
insert into auth.sessions (id, user_id, created_at) values
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2', now()),
  ('10000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d4', now());
insert into public.site_metric (facility_id, date, dimension, key, sessions) values
  ('00000000-0000-0000-0000-0000000000da', '2026-10-01', 'device', 'mobile', 100),
  ('00000000-0000-0000-0000-0000000000db', '2026-10-01', 'device', 'mobile', 999);
insert into public.page_category (facility_id, prefix, label, kind) values
  ('00000000-0000-0000-0000-0000000000db', '/fair', '会場Bのフェア', 'fair');

create function pg_temp.login_as(uid text, sid text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'session_id', sid, 'aal', 'aal1', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform app.touch_session();
end $$;

select pg_temp.login_as('00000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-0000000000d2');
select results_eq($$ select sessions from public.site_metric $$, array[100::bigint], 'Aさん：自施設の GA4 の値だけ見える');
select is_empty($$ select 1 from public.page_category $$, 'Aさん：他施設のページの分類は見えない');
select lives_ok($$ insert into public.page_category (facility_id, prefix, label, kind, created_by)
  values ('00000000-0000-0000-0000-0000000000da', '/chapel', 'チャペル', 'content', auth.uid()) $$, 'Aさん：自施設のページを分類できる');
select throws_ok($$ insert into public.page_category (facility_id, prefix, label, kind, created_by)
  values ('00000000-0000-0000-0000-0000000000db', '/chapel', 'チャペル', 'content', auth.uid()) $$,
  '42501', null, 'Aさん：他施設のページは分類できない');
select throws_ok($$ select public.upsert_site_metrics('00000000-0000-0000-0000-0000000000db', null,
  '[{"date":"2026-10-01","dimension":"device","key":"mobile","sessions":1,"users":0,"new_users":0,"page_views":0,"engagement_sec":0}]'::jsonb) $$,
  '42501', null, 'Aさん：他施設に GA4 の値を書き込めない');

select pg_temp.login_as('00000000-0000-0000-0000-0000000000d4', '10000000-0000-0000-0000-0000000000d4');
select results_eq($$ select count(*)::int from public.page_category $$, array[1], '会場担当：自施設の分類は見える');
select is_empty($$ delete from public.page_category returning 1 $$, '会場担当：分類は消せない');

select * from finish();
rollback;
