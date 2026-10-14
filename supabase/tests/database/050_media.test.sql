-- ⑥ メディア評価測定：自施設の分だけ読み書きできる。会場担当は見るだけ。AI の記録は画面から書けない。
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

delete from public.media_result;
delete from public.media_area_benchmark;
delete from public.media_top_ad;
delete from public.media_doc;
delete from public.ai_run_log;
insert into public.facility (id, code, kind, name) values
  ('00000000-0000-0000-0000-0000000000ea', 'ze_A', 'venue', '会場A'),
  ('00000000-0000-0000-0000-0000000000eb', 'ze_B', 'venue', '会場B');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e2', 'mkt-e@example.test'),
  ('00000000-0000-0000-0000-0000000000e4', 'staff-e@example.test');
insert into public.app_user (id, facility_id, email, display_name, status) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000ea', 'mkt-e@example.test', 'Aさん', 'active'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000ea', 'staff-e@example.test', '会場担当', 'active');
insert into public.user_facility_role (user_id, facility_id, role) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000ea', 'marketing'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000ea', 'venue_staff');
insert into auth.sessions (id, user_id, created_at) values
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', now()),
  ('10000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e4', now());
insert into public.media_result (facility_id, month, outlet, visits) values
  ('00000000-0000-0000-0000-0000000000eb', '2026-09-01', 'hanayume', 99);

create function pg_temp.login_as(uid text, sid text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'session_id', sid, 'aal', 'aal1', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform app.touch_session();
end $$;

select pg_temp.login_as('00000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e2');
select is_empty($$ select 1 from public.media_result $$, 'Aさん：他施設の媒体の結果は見えない');
select lives_ok($$ select public.save_media_rows('00000000-0000-0000-0000-0000000000ea', null,
  '[{"month":"2026-09-01","outlet":"zexy_net","menu":"","cost_yen":500000,"visits":10}]'::jsonb, '[]'::jsonb) $$,
  'Aさん：自施設の結果を保存できる');
select lives_ok($$ select public.save_media_rows('00000000-0000-0000-0000-0000000000ea', null,
  '[{"month":"2026-09-01","outlet":"zexy_net","menu":"","target_visits":12}]'::jsonb, '[]'::jsonb) $$,
  'Aさん：目標だけを足せる');
select results_eq($$ select cost_yen::int, visits, target_visits from public.media_result $$,
  $$ values (500000, 10, 12) $$, '空の値は、入っている値を消さない');
select throws_ok($$ select public.save_media_rows('00000000-0000-0000-0000-0000000000eb', null,
  '[{"month":"2026-09-01","outlet":"zexy_net","menu":"","visits":1}]'::jsonb, '[]'::jsonb) $$,
  '42501', null, 'Aさん：他施設には保存できない');
select throws_ok($$ insert into public.ai_run_log (facility_id, purpose, model, prompt_version, input)
  values ('00000000-0000-0000-0000-0000000000ea', 'x', 'm', 'v', '{}') $$, '42501', null, 'AI の記録は画面から書けない');

select pg_temp.login_as('00000000-0000-0000-0000-0000000000e4', '10000000-0000-0000-0000-0000000000e4');
select results_eq($$ select count(*)::int from public.media_result $$, array[1], '会場担当：自施設の結果は見える');
select throws_ok($$ select public.save_media_rows('00000000-0000-0000-0000-0000000000ea', null,
  '[{"month":"2026-09-01","outlet":"zexy_net","menu":"","visits":1}]'::jsonb, '[]'::jsonb) $$,
  '42501', null, '会場担当：保存できない');

select * from finish();
rollback;
