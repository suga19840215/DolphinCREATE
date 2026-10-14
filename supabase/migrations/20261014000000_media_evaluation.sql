-- ⑥ メディア評価測定：掲載媒体（ゼクシィ・ハナユメ・公式HP など）ごとの掲載金額・来館・成約を、
-- アップロードした資料（Excel・CSV・Word・PDF）から取り込み、目標比・昨年比・単価・エリア平均比・広告との合致で評価する。

-- 編集できる人：マーケ・データ（Aさん）と施設管理者（取込と同じ）
create function app.can_edit_media(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role(fid, array['marketing', 'facility_admin']::app.role[]);
$$;
grant execute on function app.can_edit_media(uuid) to authenticated;

-- アップロードした資料。読み取った結果（下書き）は確認するまで本番の表に入れない
create table public.media_doc (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  file_name text not null check (length(file_name) <= 300),
  content_type text not null check (length(content_type) <= 200),
  size_bytes integer not null check (size_bytes >= 0),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null,
  status text not null default 'parsed' check (status in ('parsed', 'confirmed', 'failed', 'discarded')),
  method text check (method in ('table', 'ai')),
  draft jsonb not null default '[]'::jsonb,
  message text,
  uploaded_by uuid not null references public.app_user (id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.app_user (id),
  confirmed_at timestamptz,
  check (storage_path like facility_id::text || '/media-docs/%')
);
create index media_doc_facility on public.media_doc (facility_id, created_at desc);

-- 媒体×月×掲載メニューの結果（確定した値）。昨年比は1年前の月の行と比べる
create table public.media_result (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  month date not null check (extract(day from month) = 1),
  outlet text not null check (outlet ~ '^[a-z_]{2,30}$'),
  menu text not null default '' check (length(menu) <= 100),
  cost_yen bigint check (cost_yen >= 0), -- 掲載金額（円・税抜で統一）
  visits integer check (visits >= 0),
  contracts integer check (contracts >= 0),
  target_visits integer check (target_visits >= 0),
  note text check (length(note) <= 300),
  source_doc_id uuid references public.media_doc (id),
  updated_by uuid references public.app_user (id),
  updated_at timestamptz not null default now(),
  unique (facility_id, month, outlet, menu)
);

-- エリア平均（媒体社の資料から）。媒体を問わない値は outlet = ''
create table public.media_area_benchmark (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  month date not null check (extract(day from month) = 1),
  area text not null default '' check (length(area) <= 50),
  outlet text not null default '' check (outlet = '' or outlet ~ '^[a-z_]{2,30}$'),
  avg_visits numeric(10, 2) check (avg_visits >= 0),
  avg_contracts numeric(10, 2) check (avg_contracts >= 0),
  source_doc_id uuid references public.media_doc (id),
  updated_by uuid references public.app_user (id),
  updated_at timestamptz not null default now(),
  unique (facility_id, month, area, outlet)
);

-- 媒体ごとの TOP 広告（掲載中のメインビジュアルとキャッチコピー）と、その訴求の分類
create table public.media_top_ad (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  outlet text not null check (outlet ~ '^[a-z_]{2,30}$'),
  catch_text text not null default '' check (length(catch_text) <= 200),
  visual_path text,
  visual_axes text[] not null default '{}',
  catch_axes text[] not null default '{}',
  updated_by uuid references public.app_user (id),
  updated_at timestamptz not null default now(),
  unique (facility_id, outlet),
  check (visual_path is null or visual_path like facility_id::text || '/media-ads/%')
);

-- AI に送った内容・モデル・プロンプトの版・出力の記録（CLAUDE.md 7章・仕様書4章）
create table public.ai_run_log (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility (id),
  purpose text not null check (length(purpose) <= 50),
  model text not null,
  prompt_version text not null,
  input jsonb not null,
  output jsonb,
  schema_valid boolean not null default false,
  error text,
  run_by uuid references public.app_user (id),
  at timestamptz not null default now()
);
create index ai_run_log_facility on public.ai_run_log (facility_id, at desc);

alter table public.media_doc enable row level security;
alter table public.media_result enable row level security;
alter table public.media_area_benchmark enable row level security;
alter table public.media_top_ad enable row level security;
alter table public.ai_run_log enable row level security;
revoke all on public.media_doc, public.media_result, public.media_area_benchmark, public.media_top_ad, public.ai_run_log
  from anon, authenticated;

grant select on public.media_doc, public.media_result, public.media_area_benchmark, public.media_top_ad to authenticated;
grant insert on public.media_doc to authenticated;
grant update (status, method, draft, message, confirmed_by, confirmed_at) on public.media_doc to authenticated;
grant insert, update, delete on public.media_result, public.media_area_benchmark, public.media_top_ad to authenticated;
grant select on public.ai_run_log to authenticated; -- 書き込みはサーバー（全権限キー）だけ

create policy media_doc_select on public.media_doc for select to authenticated using (app.has_role(facility_id));
create policy media_doc_insert on public.media_doc for insert to authenticated
  with check (app.can_edit_media(facility_id) and uploaded_by = auth.uid());
create policy media_doc_update on public.media_doc for update to authenticated
  using (app.can_edit_media(facility_id)) with check (app.can_edit_media(facility_id));

create policy media_result_select on public.media_result for select to authenticated using (app.has_role(facility_id));
create policy media_result_insert on public.media_result for insert to authenticated
  with check (app.can_edit_media(facility_id) and updated_by = auth.uid());
create policy media_result_update on public.media_result for update to authenticated
  using (app.can_edit_media(facility_id)) with check (app.can_edit_media(facility_id) and updated_by = auth.uid());
create policy media_result_delete on public.media_result for delete to authenticated using (app.can_edit_media(facility_id));

create policy media_area_select on public.media_area_benchmark for select to authenticated using (app.has_role(facility_id));
create policy media_area_insert on public.media_area_benchmark for insert to authenticated
  with check (app.can_edit_media(facility_id) and updated_by = auth.uid());
create policy media_area_update on public.media_area_benchmark for update to authenticated
  using (app.can_edit_media(facility_id)) with check (app.can_edit_media(facility_id) and updated_by = auth.uid());
create policy media_area_delete on public.media_area_benchmark for delete to authenticated using (app.can_edit_media(facility_id));

create policy media_top_ad_select on public.media_top_ad for select to authenticated using (app.has_role(facility_id));
create policy media_top_ad_insert on public.media_top_ad for insert to authenticated
  with check (app.can_edit_media(facility_id) and updated_by = auth.uid());
create policy media_top_ad_update on public.media_top_ad for update to authenticated
  using (app.can_edit_media(facility_id)) with check (app.can_edit_media(facility_id) and updated_by = auth.uid());
create policy media_top_ad_delete on public.media_top_ad for delete to authenticated using (app.can_edit_media(facility_id));

create policy ai_run_log_select on public.ai_run_log for select to authenticated
  using (app.has_role(facility_id, array['hq_admin', 'marketing', 'creative', 'facility_admin']::app.role[]));
