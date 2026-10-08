-- 施設ごとのデータ分離（本番設計「施設ごとのデータ分離」・受入テスト1・5〜9 の DB 側）。
-- サーバーの確認を通らずに DB へ直接問い合わせても、他施設の行が見えないことを確かめる。
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

------------------------------------------------------------------------------
-- テスト用の施設・利用者・セッション
------------------------------------------------------------------------------
-- 既にあるデータに左右されないよう、トランザクションの中で空にする（最後に rollback で元に戻る）
delete from public.site_metric;
delete from public.page_category;
delete from public.facility_connection;
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
delete from public.facility;

insert into public.facility (id, code, kind, name) values
  ('00000000-0000-0000-0000-0000000000f0', 'HQ', 'hq', '本部'),
  ('00000000-0000-0000-0000-0000000000fa', 'fac_A', 'venue', '会場A'),
  ('00000000-0000-0000-0000-0000000000fb', 'fac_B', 'venue', '会場B');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'hq@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'mkt@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'fa-a@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'staff-a@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'staff-b@example.test'),
  ('00000000-0000-0000-0000-000000000006', 'stopped-a@example.test');

insert into public.app_user (id, facility_id, email, display_name, status) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f0', 'hq@example.test', '本部管理者', 'active'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f0', 'mkt@example.test', 'Aさん', 'active'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000fa', 'fa-a@example.test', '会場A 施設管理者', 'active'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000fa', 'staff-a@example.test', '会場A 担当', 'active'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000fb', 'staff-b@example.test', '会場B 担当', 'active'),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000fa', 'stopped-a@example.test', '停止中', 'suspended');

insert into public.user_facility_role (user_id, facility_id, role) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f0', 'hq_admin'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000fa', 'hq_admin'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000fb', 'hq_admin'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000fa', 'marketing'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000fa', 'facility_admin'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000fa', 'venue_staff'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000fb', 'venue_staff'),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000fa', 'venue_staff');

-- セッション（id の末尾を利用者と同じにする）
insert into auth.sessions (id, user_id, created_at)
select ('10000000-0000-0000-0000-00000000000' || n)::uuid, ('00000000-0000-0000-0000-00000000000' || n)::uuid, now()
  from generate_series(1, 6) n;

insert into public.operation_log (facility_id, action) values
  ('00000000-0000-0000-0000-0000000000fa', 'A の操作'),
  ('00000000-0000-0000-0000-0000000000fb', 'B の操作');

insert into public.auth_audit (facility_id, user_id, event) values
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-000000000004', 'login_succeeded'),
  ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-000000000005', 'login_succeeded');

insert into storage.objects (bucket_id, name) values
  ('facility-files', '00000000-0000-0000-0000-0000000000fa/assets/a.png'),
  ('facility-files', '00000000-0000-0000-0000-0000000000fb/assets/b.png');

-- n 番の利用者としてログインした状態にする（aal：多要素認証の段階）
create function pg_temp.login_as(n int, aal text default 'aal1') returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000' || n,
    'session_id', '10000000-0000-0000-0000-00000000000' || n,
    'aal', aal, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

------------------------------------------------------------------------------
-- 会場Aの担当者
------------------------------------------------------------------------------
select pg_temp.login_as(4);
select ok(app.touch_session(), '会場A担当：セッション有効');
select results_eq($$ select code from public.facility $$, array['fac_A'], '会場A担当：見える施設は会場Aだけ');
select is_empty($$ select 1 from public.facility where id = '00000000-0000-0000-0000-0000000000fb' $$,
  '会場A担当：会場BのIDを直接指定しても0件');
select results_eq($$ select action from public.operation_log $$, array['A の操作'], '会場A担当：操作の記録は会場Aだけ');
select results_eq($$ select email from public.app_user $$, array['staff-a@example.test'], '会場A担当：利用者は自分だけ');
select is_empty($$ select 1 from public.auth_audit $$, '会場A担当：ログイン履歴は見えない（管理の権限なし）');
select results_eq($$ select name from storage.objects where bucket_id = 'facility-files' $$,
  array['00000000-0000-0000-0000-0000000000fa/assets/a.png'], '会場A担当：ファイルは会場Aのフォルダだけ');
select is_empty($$ update public.facility set monthly_budget_cap_yen = 1 returning 1 $$,
  '会場A担当：月間予算上限は変えられない');
select throws_ok($$ insert into public.auth_audit (facility_id, event) values ('00000000-0000-0000-0000-0000000000fa', 'logout') $$,
  '42501', null, '会場A担当：ログイン履歴を直接書き込めない');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('facility-files', '00000000-0000-0000-0000-0000000000fb/x.png') $$,
  '42501', null, '会場A担当：会場Bのフォルダにファイルを置けない');

------------------------------------------------------------------------------
-- 会場Bの担当者
------------------------------------------------------------------------------
select pg_temp.login_as(5);
select ok(app.touch_session(), '会場B担当：セッション有効');
select results_eq($$ select code from public.facility $$, array['fac_B'], '会場B担当：見える施設は会場Bだけ');
select results_eq($$ select action from public.operation_log $$, array['B の操作'], '会場B担当：操作の記録は会場Bだけ');

------------------------------------------------------------------------------
-- マーケ・データ（担当：会場Aのみ）
------------------------------------------------------------------------------
select pg_temp.login_as(2);
select ok(app.touch_session(), 'Aさん：セッション有効');
select results_eq($$ select code from public.facility $$, array['fac_A'], 'Aさん：担当の会場Aだけ（本部・会場Bは見えない）');

------------------------------------------------------------------------------
-- 施設管理者：多要素認証なし（aal1）では権限が効かない（受入テスト8）
------------------------------------------------------------------------------
select pg_temp.login_as(3, 'aal1');
select ok(app.touch_session(), '施設管理者 aal1：セッションはある');
select is_empty($$ select 1 from public.facility $$, '施設管理者 aal1：施設が1つも見えない');
select is_empty($$ update public.facility set monthly_budget_cap_yen = 1 returning 1 $$, '施設管理者 aal1：予算上限を変えられない');

select pg_temp.login_as(3, 'aal2');
select results_eq($$ select code from public.facility $$, array['fac_A'], '施設管理者 aal2：会場Aが見える');
select results_eq($$ update public.facility set monthly_budget_cap_yen = 900000 returning code $$,
  array['fac_A'], '施設管理者 aal2：会場Aの予算上限だけ変えられる');
select results_eq($$ select email from public.app_user order by email $$,
  array['fa-a@example.test', 'staff-a@example.test', 'stopped-a@example.test'], '施設管理者：自施設の利用者だけ見える');
select results_eq($$ select f.code from public.auth_audit a join public.facility f on f.id = a.facility_id $$,
  array['fac_A'], '施設管理者：ログイン履歴は自施設だけ');

------------------------------------------------------------------------------
-- 本部管理者
------------------------------------------------------------------------------
select pg_temp.login_as(1, 'aal1');
select ok(app.touch_session(), '本部管理者 aal1：セッションはある');
select is_empty($$ select 1 from public.facility $$, '本部管理者 aal1：施設が1つも見えない');
select pg_temp.login_as(1, 'aal2');
select results_eq($$ select code from public.facility order by code collate "C" $$, array['HQ', 'fac_A', 'fac_B'], '本部管理者 aal2：全施設が見える');
select is_empty($$ update public.facility set monthly_budget_cap_yen = 1 returning 1 $$, '本部管理者：予算上限は変えない（承認しない権限）');

------------------------------------------------------------------------------
-- 停止・無操作・最長時間（受入テスト6、自動ログアウト）
------------------------------------------------------------------------------
select pg_temp.login_as(6);
select ok(not app.touch_session(), '停止中の利用者：セッションは無効');
select is_empty($$ select 1 from public.facility $$, '停止中の利用者：何も見えない');

reset role;
update app.session_activity set last_seen_at = now() - interval '31 minutes'
 where session_id = '10000000-0000-0000-0000-000000000004';
select pg_temp.login_as(4);
select ok(not app.touch_session(), '30分操作がない：セッション切れ（更新もしない）');
select is_empty($$ select 1 from public.facility $$, '30分操作がない：何も見えない');

reset role;
update auth.sessions set created_at = now() - interval '13 hours' where id = '10000000-0000-0000-0000-000000000005';
delete from app.session_activity where session_id = '10000000-0000-0000-0000-000000000005';
select pg_temp.login_as(5);
select ok(not app.touch_session(), 'ログインから12時間を超えた：セッション切れ');

select * from finish();
rollback;
