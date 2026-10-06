-- M1：施設・利用者・権限・ログイン履歴・操作の記録と、行ごとのアクセス制限（RLS）。
-- 正本：docs/auth_design.md（本番設計）、docs/spec_v2.md 3章・10章、docs/plan.md 3章。

------------------------------------------------------------------------------
-- 型
------------------------------------------------------------------------------
create type app.role as enum (
  'hq_admin',        -- 本部管理者
  'marketing',       -- マーケ・データ（Aさん）
  'creative',        -- 制作・ブランド（Bさん）
  'facility_admin',  -- 施設管理者
  'venue_staff',     -- 会場担当
  'viewer'           -- 閲覧のみ
);

create type app.facility_kind as enum ('hq', 'venue');

create type app.user_status as enum ('invited', 'active', 'suspended');

------------------------------------------------------------------------------
-- テーブル
------------------------------------------------------------------------------

-- 施設。本部（HQ）も1行として持つ。facility_id は自分の id（全テーブル共通の決まりに合わせる）。
create table public.facility (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid generated always as (id) stored not null,
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{2,32}$'),
  kind app.facility_kind not null default 'venue',
  name text not null check (length(name) between 1 and 100),
  sub text,
  region text,
  lp_domain text,
  fee_rate_bp integer not null default 2000 check (fee_rate_bp between 0 and 10000),
  monthly_budget_cap_yen bigint check (monthly_budget_cap_yen >= 0),
  min_n integer not null default 10 check (min_n between 3 and 100),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index facility_single_hq on public.facility (kind) where kind = 'hq';
comment on table public.facility is '施設（クライアント）。本部も kind=hq の1行';

-- 利用者。パスワードは認証サービスだけが持ち、ここには持たない。削除せず停止にする。
create table public.app_user (
  id uuid primary key references auth.users (id) on delete restrict,
  facility_id uuid not null references public.facility (id),
  email text not null unique check (email = lower(email)),
  display_name text not null check (length(display_name) between 1 and 100),
  status app.user_status not null default 'invited',
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  lock_count integer not null default 0,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index app_user_facility on public.app_user (facility_id);
comment on table public.app_user is '利用者（所属施設＝facility_id）。施設コードはメールから自動判定';

-- 誰が、どの施設で、何の権限を持つか。
create table public.user_facility_role (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_user (id) on delete cascade,
  facility_id uuid not null references public.facility (id),
  role app.role not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (user_id, facility_id, role)
);
create index user_facility_role_user on public.user_facility_role (user_id);
create index user_facility_role_facility on public.user_facility_role (facility_id);

-- ログイン履歴（成功・失敗・ロック・権限変更など）。1年保存。追加のみ。
create table public.auth_audit (
  id bigint generated always as identity primary key,
  facility_id uuid not null references public.facility (id),
  user_id uuid references public.app_user (id),
  actor_id uuid references public.app_user (id),
  email_entered text,
  event text not null check (event in (
    'login_succeeded', 'login_failed', 'login_locked', 'locked_out',
    'logout', 'auto_logout', 'mfa_enrolled', 'mfa_verified', 'mfa_failed',
    'password_changed', 'password_reset_sent',
    'invited', 'roles_changed', 'profile_changed', 'suspended', 'resumed', 'unlocked'
  )),
  detail jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  at timestamptz not null default now()
);
create index auth_audit_facility_at on public.auth_audit (facility_id, at desc);
create index auth_audit_user_at on public.auth_audit (user_id, at desc);

-- 操作の記録（承認・入稿・書き出し・設定変更など）。追加のみ。
create table public.operation_log (
  id bigint generated always as identity primary key,
  facility_id uuid not null references public.facility (id),
  actor_id uuid references public.app_user (id),
  action text not null,
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index operation_log_facility_at on public.operation_log (facility_id, at desc);

-- セッションの最終操作時刻（無操作30分・最長12時間の確認用）。画面からは直接読めない。
create table app.session_activity (
  session_id uuid primary key,
  user_id uuid not null references public.app_user (id) on delete cascade,
  started_at timestamptz not null,
  last_seen_at timestamptz not null
);

------------------------------------------------------------------------------
-- 権限確認の関数
------------------------------------------------------------------------------

-- いまのセッションが有効か（ログインから12時間以内・最終操作から30分以内・利用者が有効）。
create function app.session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from app.session_activity s
      join public.app_user u on u.id = s.user_id
     where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
       and s.user_id = auth.uid()
       and u.status = 'active'
       and s.started_at > now() - interval '12 hours'
       and s.last_seen_at > now() - interval '30 minutes'
  );
$$;

-- サーバーが操作のたびに呼ぶ。有効なら最終操作時刻を更新して true、切れていれば false（更新しない）。
create function app.touch_session()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  uid uuid := auth.uid();
  created timestamptz;
  ok boolean;
begin
  if sid is null or uid is null then
    return false;
  end if;
  if not exists (select 1 from public.app_user where id = uid and status = 'active') then
    return false;
  end if;
  select s.created_at into created from auth.sessions s where s.id = sid and s.user_id = uid;
  if created is null or created <= now() - interval '12 hours' then
    return false;
  end if;
  insert into app.session_activity as a (session_id, user_id, started_at, last_seen_at)
  values (sid, uid, created, now())
  on conflict (session_id) do update
     set last_seen_at = now()
   where a.last_seen_at > now() - interval '30 minutes'
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

-- 本部管理者・施設管理者の権限は、多要素認証を通したセッション（aal2）でだけ有効。
create function app.role_requires_mfa(r app.role)
returns boolean
language sql
immutable
set search_path = ''
as $$ select r in ('hq_admin', 'facility_admin') $$;

-- ログイン中の人が、その施設に指定の権限のどれかを持つか（roles が null なら、何かの権限を持つか）。
create function app.has_role(fid uuid, roles app.role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.session_ok() and exists (
    select 1
      from public.user_facility_role r
     where r.user_id = auth.uid()
       and r.facility_id = fid
       and (roles is null or r.role = any (roles))
       and (not app.role_requires_mfa(r.role) or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
  );
$$;

-- 文字列を uuid に。形が違えば null（Storage のパスから施設IDを取り出すときに使う）。
create function app.try_uuid(t text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- 1年より古いログイン履歴を消す（日次処理から呼ぶ）。
create function app.purge_old_auth_audit()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with d as (delete from public.auth_audit where at < now() - interval '1 year' returning 1)
  select count(*)::integer from d;
$$;

revoke all on function app.session_ok() from public;
revoke all on function app.touch_session() from public;
revoke all on function app.has_role(uuid, app.role[]) from public;
revoke all on function app.purge_old_auth_audit() from public;
grant execute on function app.session_ok() to authenticated;
grant execute on function app.touch_session() to authenticated;
grant execute on function app.has_role(uuid, app.role[]) to authenticated;
grant execute on function app.role_requires_mfa(app.role) to authenticated;
grant execute on function app.try_uuid(text) to authenticated;
grant execute on function app.purge_old_auth_audit() to service_role;
grant usage on type app.role, app.facility_kind, app.user_status to authenticated, service_role;

------------------------------------------------------------------------------
-- 行ごとのアクセス制限
------------------------------------------------------------------------------
alter table public.facility enable row level security;
alter table public.app_user enable row level security;
alter table public.user_facility_role enable row level security;
alter table public.auth_audit enable row level security;
alter table public.operation_log enable row level security;
alter table app.session_activity enable row level security;

-- 画面（ログインした人）からの書き込みは、ここで許した列・行だけ。
-- それ以外（利用者の発行・権限変更・履歴の追加）はサーバーが権限を確かめてから全権限キーで行う。
revoke all on public.facility, public.app_user, public.user_facility_role,
  public.auth_audit, public.operation_log from anon, authenticated;
revoke all on app.session_activity from anon, authenticated;

grant select on public.facility, public.app_user, public.user_facility_role,
  public.auth_audit, public.operation_log to authenticated;
grant update (monthly_budget_cap_yen, updated_at, updated_by) on public.facility to authenticated;

-- 施設：権限のある施設だけ見える。月間予算上限は施設管理者だけが変えられる（仕様書3章）。
create policy facility_select on public.facility
  for select to authenticated
  using (app.has_role(id));

create policy facility_update_budget on public.facility
  for update to authenticated
  using (app.has_role(id, array['facility_admin']::app.role[]))
  with check (app.has_role(id, array['facility_admin']::app.role[]));

-- 利用者：自分自身と、アカウント管理の権限がある施設の利用者だけ見える。
create policy app_user_select on public.app_user
  for select to authenticated
  using (
    (id = auth.uid() and app.session_ok())
    or app.has_role(facility_id, array['hq_admin', 'facility_admin']::app.role[])
  );

create policy user_facility_role_select on public.user_facility_role
  for select to authenticated
  using (
    (user_id = auth.uid() and app.session_ok())
    or app.has_role(facility_id, array['hq_admin', 'facility_admin']::app.role[])
  );

-- ログイン履歴：アカウント管理の権限がある施設のものだけ見える。
create policy auth_audit_select on public.auth_audit
  for select to authenticated
  using (app.has_role(facility_id, array['hq_admin', 'facility_admin']::app.role[]));

-- 操作の記録：権限のある施設のものだけ見える。
create policy operation_log_select on public.operation_log
  for select to authenticated
  using (app.has_role(facility_id));

------------------------------------------------------------------------------
-- ファイル保管：施設ごとのフォルダ（パスの先頭が施設ID）。表示は期限付きの署名URLだけ。
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('facility-files', 'facility-files', false)
on conflict (id) do nothing;

create policy facility_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'facility-files'
    and app.has_role(app.try_uuid((storage.foldername(name))[1]))
  );

create policy facility_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'facility-files'
    and app.has_role(
      app.try_uuid((storage.foldername(name))[1]),
      array['marketing', 'creative', 'facility_admin', 'venue_staff']::app.role[]
    )
  );
