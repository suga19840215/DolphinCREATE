-- M2b：施設ごとの外部接続（GA4 から始め、Meta・Google 広告・Dolphin も同じ表に入れる）と、GA4 の自動取込。

create type app.provider as enum ('ga4', 'meta', 'google_ads', 'dolphin');
grant usage on type app.provider to authenticated, service_role;

create table public.facility_connection (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  provider app.provider not null,
  account_ref text not null check (length(account_ref) between 1 and 100), -- GA4 プロパティ ID、広告アカウント ID など（秘密ではない）
  external_facility_id text,      -- Dolphin 側の施設 ID が違う場合の対応表
  secret_encrypted text,          -- トークンなどの秘密（暗号化済み）。画面からは読めない
  secret_expires_at timestamptz,
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_status text check (last_status in ('ok', 'error')),
  last_error text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_user (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_user (id),
  unique (facility_id, provider)
);

alter table public.facility_connection enable row level security;
revoke all on public.facility_connection from anon, authenticated;

-- 画面から読めるのは、秘密以外の列だけ
grant select (id, facility_id, provider, account_ref, external_facility_id, enabled, last_synced_at,
  last_status, last_error, created_at, updated_at) on public.facility_connection to authenticated;
-- 接続の登録・変更（秘密以外）：マーケ・データ（Aさん）と施設管理者
grant insert (facility_id, provider, account_ref, external_facility_id, enabled, created_by, updated_by, updated_at)
  on public.facility_connection to authenticated;
grant update (account_ref, external_facility_id, enabled, updated_by, updated_at, last_status, last_error)
  on public.facility_connection to authenticated;

create policy facility_connection_select on public.facility_connection
  for select to authenticated using (app.has_role(facility_id));
create policy facility_connection_insert on public.facility_connection
  for insert to authenticated
  with check (app.has_role(facility_id, array['marketing', 'facility_admin']::app.role[]) and created_by = auth.uid());
create policy facility_connection_update on public.facility_connection
  for update to authenticated
  using (app.has_role(facility_id, array['marketing', 'facility_admin']::app.role[]))
  with check (app.has_role(facility_id, array['marketing', 'facility_admin']::app.role[]) and updated_by = auth.uid());

-- 取込の確定：自動実行（日次）は人がいないので、run_label（「自動（日次）」など）を残せるようにする。
-- 人が実行したときは、これまでどおり run_by = ログインした人（行ごとのアクセス制限で確認）。
create or replace function public.commit_import(job jsonb, rows jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  job_id uuid;
  fid uuid := (job ->> 'facility_id')::uuid;
  k app.import_kind := (job ->> 'kind')::app.import_kind;
  r jsonb;
  cid uuid;
  label text;
  n integer;
begin
  insert into public.import_job (
    facility_id, kind, media, file_name, file_sha256, encoding, mapping,
    rows_total, rows_ok, rows_updated, rows_duplicate, rows_missing, rows_no_consent,
    rows_wrong_facility, rows_invalid, pii_columns_dropped, masked_count, run_by, run_label
  ) values (
    fid, k, nullif(job ->> 'media', '')::app.media, job ->> 'file_name', job ->> 'file_sha256',
    job ->> 'encoding', coalesce(job -> 'mapping', '{}'::jsonb),
    (job ->> 'rows_total')::int, (job ->> 'rows_ok')::int, (job ->> 'rows_updated')::int,
    (job ->> 'rows_duplicate')::int, (job ->> 'rows_missing')::int, (job ->> 'rows_no_consent')::int,
    (job ->> 'rows_wrong_facility')::int, (job ->> 'rows_invalid')::int,
    coalesce(array(select jsonb_array_elements_text(job -> 'pii_columns_dropped')), '{}'),
    (job ->> 'masked_count')::int, auth.uid(), nullif(job ->> 'run_label', '')
  ) returning id into job_id;

  if k = 'consultation' then
    for r in select * from jsonb_array_elements(rows) loop
      insert into public.consultation_session (
        facility_id, external_id, lead_id, consulted_at, source, ad_id, outcome, staff_code,
        age_band, area_band, cluster_code, visit_motive, decision_factor, noncontract_reason,
        competitor_name, import_job_id
      ) values (
        fid, r ->> 'external_id', r ->> 'lead_id', (r ->> 'consulted_at')::timestamptz, r ->> 'source',
        r ->> 'ad_id', (r ->> 'outcome')::app.outcome, r ->> 'staff_code', r ->> 'age_band',
        r ->> 'area_band', r ->> 'cluster_code', r ->> 'visit_motive', r ->> 'decision_factor',
        r ->> 'noncontract_reason', r ->> 'competitor_name', job_id
      ) returning id into cid;

      insert into public.consent_record (facility_id, consultation_id, ad_improvement, import_job_id)
      values (fid, cid, true, job_id);

      n := 0;
      for label in select jsonb_array_elements_text(coalesce(r -> 'priorities', '[]'::jsonb)) loop
        n := n + 1;
        insert into public.customer_insight (facility_id, consultation_id, kind, label, rank)
        values (fid, cid, 'priority', label, n);
      end loop;
      if coalesce(r ->> 'visit_motive', '') <> '' then
        insert into public.customer_insight (facility_id, consultation_id, kind, label)
        values (fid, cid, 'visit_motive', r ->> 'visit_motive');
      end if;
      if coalesce(r ->> 'decision_factor', '') <> '' then
        insert into public.customer_insight (facility_id, consultation_id, kind, label)
        values (fid, cid, 'decision_factor', r ->> 'decision_factor');
      end if;
      if coalesce(r ->> 'noncontract_reason', '') <> '' then
        insert into public.customer_insight (facility_id, consultation_id, kind, label)
        values (fid, cid, 'noncontract_reason', r ->> 'noncontract_reason');
      end if;
      if coalesce(r ->> 'quote_masked', '') <> '' then
        insert into public.transcript_segment (facility_id, consultation_id, speaker, text_masked)
        values (fid, cid, nullif(r ->> 'speaker', ''), r ->> 'quote_masked');
      end if;
    end loop;

  elsif k = 'crm' then
    insert into public.crm_lead as c (
      facility_id, lead_id, reserved_at, is_valid, cancelled_at, visited_at, outcome, contracted_at,
      lost_reason, revenue_yen, gross_profit_yen, channel, utm_source, utm_medium, utm_campaign,
      utm_content, utm_term, click_id, ga4_client_id, ad_id, import_job_id, updated_at
    )
    select fid, x.lead_id, x.reserved_at, x.is_valid, x.cancelled_at, x.visited_at, x.outcome, x.contracted_at,
           x.lost_reason, x.revenue_yen, x.gross_profit_yen, x.channel, x.utm_source, x.utm_medium,
           x.utm_campaign, x.utm_content, x.utm_term, x.click_id, x.ga4_client_id, x.ad_id, job_id, now()
      from jsonb_to_recordset(rows) as x(
        lead_id text, reserved_at timestamptz, is_valid boolean, cancelled_at timestamptz,
        visited_at timestamptz, outcome app.outcome, contracted_at timestamptz, lost_reason text,
        revenue_yen bigint, gross_profit_yen bigint, channel text, utm_source text, utm_medium text,
        utm_campaign text, utm_content text, utm_term text, click_id text, ga4_client_id text, ad_id text)
    on conflict (facility_id, lead_id) do update set
      reserved_at = excluded.reserved_at, is_valid = excluded.is_valid, cancelled_at = excluded.cancelled_at,
      visited_at = excluded.visited_at, outcome = excluded.outcome, contracted_at = excluded.contracted_at,
      lost_reason = excluded.lost_reason, revenue_yen = excluded.revenue_yen,
      gross_profit_yen = excluded.gross_profit_yen, channel = excluded.channel,
      utm_source = excluded.utm_source, utm_medium = excluded.utm_medium, utm_campaign = excluded.utm_campaign,
      utm_content = excluded.utm_content, utm_term = excluded.utm_term, click_id = excluded.click_id,
      ga4_client_id = excluded.ga4_client_id, ad_id = excluded.ad_id,
      import_job_id = excluded.import_job_id, updated_at = now();

  elsif k = 'ads' then
    insert into public.media_daily_metric (
      facility_id, date, media, campaign, ad_group, ad_id, ad_name, asset_code,
      impressions, clicks, cost_yen, media_reported_cv, source, import_job_id, updated_at
    )
    select fid, x.date, (job ->> 'media')::app.media, x.campaign, x.ad_group, x.ad_id, x.ad_name, x.asset_code,
           x.impressions, x.clicks, x.cost_yen, x.media_reported_cv, coalesce(job ->> 'source', 'csv'), job_id, now()
      from jsonb_to_recordset(rows) as x(
        date date, campaign text, ad_group text, ad_id text, ad_name text, asset_code text,
        impressions bigint, clicks bigint, cost_yen bigint, media_reported_cv numeric)
    on conflict (facility_id, date, media, ad_id) do update set
      campaign = excluded.campaign, ad_group = excluded.ad_group, ad_name = excluded.ad_name,
      asset_code = excluded.asset_code, impressions = excluded.impressions, clicks = excluded.clicks,
      cost_yen = excluded.cost_yen, media_reported_cv = excluded.media_reported_cv,
      source = excluded.source, import_job_id = excluded.import_job_id, updated_at = now();

  elsif k = 'ga4' then
    insert into public.funnel_event (
      facility_id, date, ad_id, landing_page, lp_sessions, view_fair, select_fair,
      form_start, form_error, generate_lead, import_job_id, updated_at
    )
    select fid, x.date, x.ad_id, coalesce(x.landing_page, ''), x.lp_sessions, x.view_fair, x.select_fair,
           x.form_start, x.form_error, x.generate_lead, job_id, now()
      from jsonb_to_recordset(rows) as x(
        date date, ad_id text, landing_page text, lp_sessions bigint, view_fair bigint,
        select_fair bigint, form_start bigint, form_error bigint, generate_lead bigint)
    on conflict (facility_id, date, ad_id, landing_page) do update set
      lp_sessions = excluded.lp_sessions, view_fair = excluded.view_fair, select_fair = excluded.select_fair,
      form_start = excluded.form_start, form_error = excluded.form_error,
      generate_lead = excluded.generate_lead, import_job_id = excluded.import_job_id, updated_at = now();

  elsif k = 'images' then
    insert into public.asset (
      facility_id, code, title, kind, source, storage_path, rights_status, approval_status,
      expires_on, gen_prompt, gen_target, import_job_id
    )
    select fid, x.code, x.title, 'generated', 'Dolphin生成', x.storage_path, 'checking', 'unapproved',
           x.expires_on, x.gen_prompt, x.gen_target, job_id
      from jsonb_to_recordset(rows) as x(
        code text, title text, storage_path text, expires_on date, gen_prompt text, gen_target text);

  elsif k = 'market_report' then
    insert into public.market_report (
      facility_id, report_id, version, period_start, period_end, report_created_at, area, sample_size,
      data_source, market_weddings, avg_guests, avg_spend_yen, payload, notes, origin, import_job_id
    )
    select fid, x.report_id, x.version, x.period_start, x.period_end, x.report_created_at, x.area,
           x.sample_size, x.data_source, x.market_weddings, x.avg_guests, x.avg_spend_yen,
           coalesce(x.payload, '{}'::jsonb), x.notes, 'json', job_id
      from jsonb_to_recordset(rows) as x(
        report_id text, version int, period_start date, period_end date, report_created_at timestamptz,
        area text, sample_size int, data_source text, market_weddings int, avg_guests numeric,
        avg_spend_yen bigint, payload jsonb, notes text);
  end if;

  return job_id;
end;
$$;

revoke all on function public.commit_import(jsonb, jsonb) from public, anon;
grant execute on function public.commit_import(jsonb, jsonb) to authenticated, service_role;
