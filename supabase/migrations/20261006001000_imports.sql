-- M2：① Dolphin データ連携の取込（接客データ・CRM・広告実績・GA4・生成画像・マーケットレポート）と取込履歴。
-- 全テーブルに facility_id と行ごとのアクセス制限。取込は「ログインした人の権限」で書き込むので、DB でも権限を確かめる。

create type app.import_kind as enum ('consultation', 'crm', 'ads', 'ga4', 'images', 'market_report');
create type app.media as enum ('google_search', 'demand_gen', 'meta');
create type app.outcome as enum ('contracted', 'not_contracted', 'pending');

-- 取込ができる権限（データ：Aさん・施設管理者、画像：Bさんも可）
create function app.can_import(fid uuid, kind app.import_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role(
    fid,
    case when kind = 'images'
      then array['marketing', 'creative', 'facility_admin']::app.role[]
      else array['marketing', 'facility_admin']::app.role[]
    end
  );
$$;
grant execute on function app.can_import(uuid, app.import_kind) to authenticated;
grant usage on type app.import_kind, app.media, app.outcome to authenticated, service_role;

------------------------------------------------------------------------------
-- 取込履歴（追加のみ）
------------------------------------------------------------------------------
create table public.import_job (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  kind app.import_kind not null,
  media app.media,
  file_name text not null check (length(file_name) <= 300),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  encoding text,
  mapping jsonb not null default '{}'::jsonb,
  rows_total integer not null default 0,
  rows_ok integer not null default 0,
  rows_updated integer not null default 0,
  rows_duplicate integer not null default 0,
  rows_missing integer not null default 0,
  rows_no_consent integer not null default 0,
  rows_wrong_facility integer not null default 0,
  rows_invalid integer not null default 0,
  pii_columns_dropped text[] not null default '{}',
  masked_count integer not null default 0,
  run_by uuid references public.app_user (id),
  run_label text, -- 「自動（日次）」など、人以外が実行したとき
  at timestamptz not null default now()
);
create index import_job_facility_at on public.import_job (facility_id, at desc);
-- 同じ内容のファイルを同じ施設・種類に二度取り込まない
create unique index import_job_same_file on public.import_job (facility_id, kind, file_sha256);

------------------------------------------------------------------------------
-- 接客データ（広告改善に同意した接客だけを保存する。同意のない行は取り込まない）
------------------------------------------------------------------------------
create table public.consultation_session (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  external_id text not null check (length(external_id) <= 100),
  lead_id text not null check (length(lead_id) <= 100),
  consulted_at timestamptz,
  source text,
  ad_id text,
  outcome app.outcome,
  staff_code text,
  age_band text,
  area_band text,
  cluster_code text,
  visit_motive text,
  decision_factor text,
  noncontract_reason text,
  competitor_name text,
  import_job_id uuid not null references public.import_job (id),
  created_at timestamptz not null default now(),
  unique (facility_id, external_id)
);
create index consultation_session_lead on public.consultation_session (facility_id, lead_id);

create table public.consent_record (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  consultation_id uuid not null references public.consultation_session (id) on delete cascade,
  recording boolean,
  transcription boolean,
  analysis boolean,
  ad_improvement boolean not null,
  text_version text,
  given_at timestamptz,
  withdrawn_at timestamptz,
  import_job_id uuid not null references public.import_job (id),
  unique (facility_id, consultation_id)
);

-- 重視点・来館動機・決め手・非成約理由など（1つの接客に複数）
create table public.customer_insight (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  consultation_id uuid not null references public.consultation_session (id) on delete cascade,
  kind text not null check (kind in ('priority', 'visit_motive', 'decision_factor', 'noncontract_reason', 'visual_preference', 'unresolved_objection')),
  label text not null check (length(label) <= 200),
  rank integer,
  explicit_or_inferred text check (explicit_or_inferred in ('explicit', 'inferred')),
  confidence numeric(3, 2) check (confidence between 0 and 1)
);
create index customer_insight_consultation on public.customer_insight (facility_id, consultation_id);

-- 根拠発言（伏せ字にしたものだけを保存）
create table public.transcript_segment (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  consultation_id uuid not null references public.consultation_session (id) on delete cascade,
  speaker text check (speaker in ('customer', 'staff')),
  start_sec integer,
  end_sec integer,
  text_masked text not null check (length(text_masked) <= 2000),
  confidence numeric(3, 2)
);

------------------------------------------------------------------------------
-- 予約・来館・成約（CRM）。lead_id で結ぶ。判定できない予約は ad_id を空のままにする。
------------------------------------------------------------------------------
create table public.crm_lead (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  lead_id text not null check (length(lead_id) <= 100),
  reserved_at timestamptz,
  is_valid boolean,
  cancelled_at timestamptz,
  visited_at timestamptz,
  outcome app.outcome,
  contracted_at timestamptz,
  lost_reason text,
  revenue_yen bigint check (revenue_yen >= 0),
  gross_profit_yen bigint,
  channel text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  click_id text,
  ga4_client_id text,
  ad_id text,
  import_job_id uuid not null references public.import_job (id),
  updated_at timestamptz not null default now(),
  unique (facility_id, lead_id)
);

------------------------------------------------------------------------------
-- 広告実績（媒体報告）。施設×日×媒体×広告で上書き（2回取り込んでも重複しない）
------------------------------------------------------------------------------
create table public.media_daily_metric (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  date date not null,
  media app.media not null,
  campaign text,
  ad_group text,
  ad_id text not null,
  ad_name text,
  asset_code text,
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  cost_yen bigint not null default 0 check (cost_yen >= 0), -- Fee抜き・円
  media_reported_cv numeric not null default 0 check (media_reported_cv >= 0),
  source text not null default 'csv' check (source in ('csv', 'api')),
  import_job_id uuid not null references public.import_job (id),
  updated_at timestamptz not null default now(),
  unique (facility_id, date, media, ad_id)
);

-- GA4 の LP・予約フォームの計測（GA4 の値だけ。媒体報告・CRM とは混ぜない）
create table public.funnel_event (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  date date not null,
  ad_id text not null,
  landing_page text not null default '',
  lp_sessions bigint not null default 0,
  view_fair bigint not null default 0,
  select_fair bigint not null default 0,
  form_start bigint not null default 0,
  form_error bigint not null default 0,
  generate_lead bigint not null default 0,
  import_job_id uuid not null references public.import_job (id),
  updated_at timestamptz not null default now(),
  unique (facility_id, date, ad_id, landing_page)
);

------------------------------------------------------------------------------
-- 画像庫（Dolphin 生成画像は「権利確認中・未承認」から始める）
------------------------------------------------------------------------------
create table public.asset (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  code text not null check (length(code) between 1 and 100),
  title text,
  kind text not null check (kind in ('photo', 'generated')),
  source text,
  storage_path text,
  rights_status text not null default 'checking' check (rights_status in ('checking', 'confirmed')),
  approval_status text not null default 'unapproved' check (approval_status in ('unapproved', 'approved')),
  expires_on date,
  gen_prompt text,
  gen_target text,
  import_job_id uuid references public.import_job (id),
  created_at timestamptz not null default now(),
  unique (facility_id, code),
  check (storage_path is null or storage_path like facility_id::text || '/%')
);

------------------------------------------------------------------------------
-- マーケットレポート（要件表「レスポンス項目案」の形）。同じレポートの同じ版は二重に入れない
------------------------------------------------------------------------------
create table public.market_report (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  report_id text not null,
  version integer not null check (version >= 1),
  period_start date not null,
  period_end date not null,
  report_created_at timestamptz not null,
  area text not null,
  sample_size integer not null check (sample_size >= 0),
  data_source text not null,
  market_weddings integer,
  avg_guests numeric,
  avg_spend_yen bigint,
  payload jsonb not null default '{}'::jsonb,
  notes text,
  origin text not null default 'json' check (origin in ('json', 'csv', 'api')),
  import_job_id uuid not null references public.import_job (id),
  unique (facility_id, report_id, version),
  check (period_end >= period_start)
);

------------------------------------------------------------------------------
-- 行ごとのアクセス制限
------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['import_job', 'consultation_session', 'consent_record', 'customer_insight',
    'transcript_segment', 'crm_lead', 'media_daily_metric', 'funnel_event', 'asset', 'market_report']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (app.has_role(facility_id))',
      t || '_select', t);
  end loop;
end $$;

-- 取込履歴：取込の権限がある人だけが、自分の名前で追加できる
create policy import_job_insert on public.import_job
  for insert to authenticated
  with check (app.can_import(facility_id, kind) and run_by = auth.uid());

-- 取り込んだ行：その取込（同じ施設・同じ種類）の権限がある人だけが追加・更新できる
create function app.can_write_import_rows(fid uuid, job uuid, kind app.import_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.import_job j
     where j.id = job and j.facility_id = fid and j.kind = can_write_import_rows.kind and j.run_by = auth.uid()
  ) and app.can_import(fid, kind);
$$;
grant execute on function app.can_write_import_rows(uuid, uuid, app.import_kind) to authenticated;

create policy consultation_session_insert on public.consultation_session for insert to authenticated
  with check (app.can_write_import_rows(facility_id, import_job_id, 'consultation'));
create policy consent_record_insert on public.consent_record for insert to authenticated
  with check (app.can_write_import_rows(facility_id, import_job_id, 'consultation'));
create policy customer_insight_insert on public.customer_insight for insert to authenticated
  with check (app.can_import(facility_id, 'consultation') and exists (
    select 1 from public.consultation_session s where s.id = consultation_id and s.facility_id = customer_insight.facility_id));
create policy transcript_segment_insert on public.transcript_segment for insert to authenticated
  with check (app.can_import(facility_id, 'consultation') and exists (
    select 1 from public.consultation_session s where s.id = consultation_id and s.facility_id = transcript_segment.facility_id));

create policy crm_lead_insert on public.crm_lead for insert to authenticated
  with check (app.can_write_import_rows(facility_id, import_job_id, 'crm'));
create policy crm_lead_update on public.crm_lead for update to authenticated
  using (app.can_import(facility_id, 'crm'))
  with check (app.can_write_import_rows(facility_id, import_job_id, 'crm'));

create policy media_daily_metric_insert on public.media_daily_metric for insert to authenticated
  with check (app.can_write_import_rows(facility_id, import_job_id, 'ads'));
create policy media_daily_metric_update on public.media_daily_metric for update to authenticated
  using (app.can_import(facility_id, 'ads'))
  with check (app.can_write_import_rows(facility_id, import_job_id, 'ads'));

create policy funnel_event_insert on public.funnel_event for insert to authenticated
  with check (app.can_write_import_rows(facility_id, import_job_id, 'ga4'));
create policy funnel_event_update on public.funnel_event for update to authenticated
  using (app.can_import(facility_id, 'ga4'))
  with check (app.can_write_import_rows(facility_id, import_job_id, 'ga4'));

create policy asset_insert on public.asset for insert to authenticated
  with check (app.can_write_import_rows(facility_id, import_job_id, 'images'));

create policy market_report_insert on public.market_report for insert to authenticated
  with check (app.can_write_import_rows(facility_id, import_job_id, 'market_report'));

grant update on public.crm_lead, public.media_daily_metric, public.funnel_event to authenticated;
