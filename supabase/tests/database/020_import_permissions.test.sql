-- 取込の権限と施設ごとの分離（M2）。
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

delete from public.market_report;
delete from public.asset;
delete from public.funnel_event;
delete from public.media_daily_metric;
delete from public.crm_lead;
delete from public.transcript_segment;
delete from public.customer_insight;
delete from public.consent_record;
delete from public.consultation_session;
delete from public.import_job;
delete from public.operation_log;
delete from public.auth_audit;
delete from app.session_activity;
delete from public.user_facility_role;
delete from public.app_user;

insert into public.facility (id, code, kind, name) values
  ('00000000-0000-0000-0000-0000000000fa', 'zz_A', 'venue', '会場A'),
  ('00000000-0000-0000-0000-0000000000fb', 'zz_B', 'venue', '会場B');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000002', 'mkt@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'cr@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'staff-a@example.test');
insert into public.app_user (id, facility_id, email, display_name, status) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000fa', 'mkt@example.test', 'Aさん', 'active'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000fa', 'cr@example.test', 'Bさん', 'active'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000fa', 'staff-a@example.test', '会場A担当', 'active');
insert into public.user_facility_role (user_id, facility_id, role) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000fa', 'marketing'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000fa', 'creative'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000fa', 'venue_staff');
insert into auth.sessions (id, user_id, created_at)
select ('10000000-0000-0000-0000-00000000000' || n)::uuid, ('00000000-0000-0000-0000-00000000000' || n)::uuid, now()
  from generate_series(2, 4) n;

-- 会場Bの取込履歴（Aさんからは見えないはず）
insert into public.import_job (id, facility_id, kind, file_name, file_sha256)
values ('20000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000fb', 'crm', 'b.csv', repeat('b', 64));

create function pg_temp.login_as(n int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000' || n,
    'session_id', '10000000-0000-0000-0000-00000000000' || n,
    'aal', 'aal1', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform app.touch_session();
end $$;

-- Aさん（会場Aのマーケ・データ）
select pg_temp.login_as(2);
select lives_ok($$ insert into public.import_job (id, facility_id, kind, file_name, file_sha256, run_by)
  values ('20000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000fa', 'consultation', 'a.csv', repeat('a', 64),
          '00000000-0000-0000-0000-000000000002') $$, 'Aさん：会場Aの接客データを取り込める');
select throws_ok($$ insert into public.import_job (facility_id, kind, file_name, file_sha256, run_by)
  values ('00000000-0000-0000-0000-0000000000fb', 'crm', 'x.csv', repeat('c', 64), '00000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'Aさん：会場Bには取り込めない');
select throws_ok($$ insert into public.import_job (facility_id, kind, file_name, file_sha256, run_by)
  values ('00000000-0000-0000-0000-0000000000fa', 'crm', 'x.csv', repeat('d', 64), '00000000-0000-0000-0000-000000000004') $$,
  '42501', null, 'Aさん：ほかの人の名前で取込履歴を作れない');
select throws_ok($$ insert into public.import_job (facility_id, kind, file_name, file_sha256, run_by)
  values ('00000000-0000-0000-0000-0000000000fa', 'consultation', 'a2.csv', repeat('a', 64), '00000000-0000-0000-0000-000000000002') $$,
  '23505', null, '同じファイル（同じ内容）は二度取り込めない');
select lives_ok($$ insert into public.consultation_session (facility_id, external_id, lead_id, import_job_id)
  values ('00000000-0000-0000-0000-0000000000fa', 'A-X900', 'L-1', '20000000-0000-0000-0000-0000000000aa') $$,
  'Aさん：自分の取込として会場Aの接客を登録できる');
select throws_ok($$ insert into public.consultation_session (facility_id, external_id, lead_id, import_job_id)
  values ('00000000-0000-0000-0000-0000000000fb', 'B-1', 'L-2', '20000000-0000-0000-0000-0000000000aa') $$,
  '42501', null, 'Aさん：会場Aの取込を使って会場Bに行を入れられない');
select throws_ok($$ insert into public.crm_lead (facility_id, lead_id, import_job_id)
  values ('00000000-0000-0000-0000-0000000000fa', 'L-1', '20000000-0000-0000-0000-0000000000aa') $$,
  '42501', null, '種類の違う取込（接客データ）で CRM の行を入れられない');
select is_empty($$ select 1 from public.import_job where facility_id = '00000000-0000-0000-0000-0000000000fb' $$,
  'Aさん：会場Bの取込履歴は見えない');

-- Bさん（制作・ブランド）：画像だけ
select pg_temp.login_as(3);
select lives_ok($$ insert into public.import_job (facility_id, kind, file_name, file_sha256, run_by)
  values ('00000000-0000-0000-0000-0000000000fa', 'images', 'img.csv', repeat('e', 64), '00000000-0000-0000-0000-000000000003') $$,
  'Bさん：生成画像は取り込める');
select throws_ok($$ insert into public.import_job (facility_id, kind, file_name, file_sha256, run_by)
  values ('00000000-0000-0000-0000-0000000000fa', 'crm', 'c.csv', repeat('f', 64), '00000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'Bさん：CRM は取り込めない');

-- 会場担当：取込はできないが、自施設の取込履歴は見える
select pg_temp.login_as(4);
select throws_ok($$ insert into public.import_job (facility_id, kind, file_name, file_sha256, run_by)
  values ('00000000-0000-0000-0000-0000000000fa', 'ads', 'ads.csv', repeat('0', 64), '00000000-0000-0000-0000-000000000004') $$,
  '42501', null, '会場担当：取り込めない');
select isnt_empty($$ select 1 from public.import_job where facility_id = '00000000-0000-0000-0000-0000000000fa' $$,
  '会場担当：自施設の取込履歴は見える');

select * from finish();
rollback;
