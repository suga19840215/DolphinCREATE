-- 施設ごとの外部接続（M2b）：秘密の列は画面から読めない／他施設の接続は見えず・変えられない。
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

delete from public.facility_connection;
insert into public.facility (id, code, kind, name) values
  ('00000000-0000-0000-0000-0000000000ca', 'zc_A', 'venue', '会場A'),
  ('00000000-0000-0000-0000-0000000000cb', 'zc_B', 'venue', '会場B');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c2', 'mkt-c@example.test'),
  ('00000000-0000-0000-0000-0000000000c4', 'staff-c@example.test');
insert into public.app_user (id, facility_id, email, display_name, status) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000ca', 'mkt-c@example.test', 'Aさん', 'active'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000ca', 'staff-c@example.test', '会場担当', 'active');
insert into public.user_facility_role (user_id, facility_id, role) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000ca', 'marketing'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000ca', 'venue_staff');
insert into auth.sessions (id, user_id, created_at) values
  ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', now()),
  ('10000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c4', now());
insert into public.facility_connection (facility_id, provider, account_ref, secret_encrypted) values
  ('00000000-0000-0000-0000-0000000000ca', 'meta', 'act_1', 'v1.secret'),
  ('00000000-0000-0000-0000-0000000000cb', 'ga4', '222222222', null);

create function pg_temp.login_as(uid text, sid text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'session_id', sid, 'aal', 'aal1', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform app.touch_session();
end $$;

select pg_temp.login_as('00000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c2');
select results_eq($$ select account_ref from public.facility_connection $$, array['act_1'], 'Aさん：自施設の接続だけ見える');
select throws_ok($$ select secret_encrypted from public.facility_connection $$, '42501', null, '秘密の列は読めない');
select lives_ok($$ insert into public.facility_connection (facility_id, provider, account_ref, created_by, updated_by)
  values ('00000000-0000-0000-0000-0000000000ca', 'ga4', '111111111', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2') $$,
  'Aさん：自施設の GA4 を登録できる');
select throws_ok($$ insert into public.facility_connection (facility_id, provider, account_ref, created_by, updated_by)
  values ('00000000-0000-0000-0000-0000000000cb', 'meta', 'act_2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2') $$,
  '42501', null, 'Aさん：他施設の接続は登録できない');
select is_empty($$ update public.facility_connection set account_ref = '999999999', updated_by = auth.uid()
  where facility_id = '00000000-0000-0000-0000-0000000000cb' returning 1 $$, 'Aさん：他施設の接続は変えられない');
select throws_ok($$ update public.facility_connection set secret_encrypted = 'x' $$, '42501', null, '画面から秘密の列は書き換えられない');

select pg_temp.login_as('00000000-0000-0000-0000-0000000000c4', '10000000-0000-0000-0000-0000000000c4');
select is_empty($$ update public.facility_connection set account_ref = '999999999', updated_by = auth.uid() returning 1 $$,
  '会場担当：接続は変えられない');

select * from finish();
rollback;
