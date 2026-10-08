-- ⑤「ホームページでの予約獲得（GA4）」：GA4 の日別×切り口の値と、会場ごとのページ分類。

-- GA4 の日別×切り口（流入元・最初のページ・端末・エリア・新規/再訪・時間帯・閲覧ページ）。
-- GA4 の値だけを持ち、媒体報告・CRM とは混ぜない。施設×日×切り口×キーで上書き（2回取り込んでも重複しない）。
create table public.site_metric (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  date date not null,
  dimension text not null check (dimension in ('channel', 'landing', 'device', 'region', 'newret', 'hour', 'page')),
  key text not null check (length(key) <= 300),
  sub_key text not null default '' check (length(sub_key) <= 300),
  sessions bigint not null default 0 check (sessions >= 0),
  users bigint not null default 0 check (users >= 0),
  new_users bigint not null default 0 check (new_users >= 0),
  page_views bigint not null default 0 check (page_views >= 0),
  engagement_sec bigint not null default 0 check (engagement_sec >= 0),
  events jsonb not null default '{}'::jsonb, -- {"generate_lead": {"c": 件数, "s": そのイベントが起きたセッション数}, ...}
  import_job_id uuid references public.import_job (id),
  updated_at timestamptz not null default now(),
  unique (facility_id, date, dimension, key, sub_key)
);
create index site_metric_facility_date on public.site_metric (facility_id, date);

-- 会場ごとのページ分類（URL の始まり → 名前と種類）。⑤の「最初に訪れたページ別」「フェア・プラン別」「コンテンツ別」で使う。
create table public.page_category (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  prefix text not null check (prefix ~ '^/[A-Za-z0-9_\-./%~]*$' and length(prefix) <= 200),
  label text not null check (length(label) between 1 and 50),
  kind text not null check (kind in ('top', 'landing', 'fair', 'plan', 'content', 'form', 'other')),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_user (id),
  unique (facility_id, prefix)
);

alter table public.site_metric enable row level security;
alter table public.page_category enable row level security;
revoke all on public.site_metric, public.page_category from anon, authenticated;
grant select on public.site_metric, public.page_category to authenticated;
grant insert, update on public.site_metric to authenticated;
grant insert, update (label, kind), delete on public.page_category to authenticated;

create policy site_metric_select on public.site_metric for select to authenticated using (app.has_role(facility_id));
create policy site_metric_insert on public.site_metric for insert to authenticated
  with check (app.can_import(facility_id, 'ga4'));
create policy site_metric_update on public.site_metric for update to authenticated
  using (app.can_import(facility_id, 'ga4')) with check (app.can_import(facility_id, 'ga4'));

create policy page_category_select on public.page_category for select to authenticated using (app.has_role(facility_id));
create policy page_category_insert on public.page_category for insert to authenticated
  with check (app.can_import(facility_id, 'ga4') and created_by = auth.uid());
create policy page_category_update on public.page_category for update to authenticated
  using (app.can_import(facility_id, 'ga4')) with check (app.can_import(facility_id, 'ga4'));
create policy page_category_delete on public.page_category for delete to authenticated
  using (app.can_import(facility_id, 'ga4'));

-- GA4 の切り口別の値を、1つのトランザクションで上書きする（ログインした人の権限、または自動実行）。
create function public.upsert_site_metrics(fid uuid, job uuid, rows jsonb)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.site_metric (
    facility_id, date, dimension, key, sub_key, sessions, users, new_users, page_views, engagement_sec,
    events, import_job_id, updated_at
  )
  select fid, x.date, x.dimension, x.key, coalesce(x.sub_key, ''), x.sessions, x.users, x.new_users,
         x.page_views, x.engagement_sec, coalesce(x.events, '{}'::jsonb), job, now()
    from jsonb_to_recordset(rows) as x(
      date date, dimension text, key text, sub_key text, sessions bigint, users bigint, new_users bigint,
      page_views bigint, engagement_sec bigint, events jsonb)
  on conflict (facility_id, date, dimension, key, sub_key) do update set
    sessions = excluded.sessions, users = excluded.users, new_users = excluded.new_users,
    page_views = excluded.page_views, engagement_sec = excluded.engagement_sec, events = excluded.events,
    import_job_id = excluded.import_job_id, updated_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.upsert_site_metrics(uuid, uuid, jsonb) from public, anon;
grant execute on function public.upsert_site_metrics(uuid, uuid, jsonb) to authenticated, service_role;
