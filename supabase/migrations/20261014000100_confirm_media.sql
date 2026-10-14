-- ⑥ 資料の確定・手入力を1つのトランザクションで保存する（ログインした人の権限で。RLS が効く）。
-- 資料にない値（null）は、すでに入っている値を消さない（金額だけの資料と来館だけの資料を合わせられる）。
create function public.save_media_rows(fid uuid, doc uuid, results jsonb, areas jsonb)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  n integer := 0;
  k integer;
begin
  insert into public.media_result as m (
    facility_id, month, outlet, menu, cost_yen, visits, contracts, target_visits, source_doc_id, updated_by, updated_at
  )
  select fid, x.month, x.outlet, coalesce(x.menu, ''), x.cost_yen, x.visits, x.contracts, x.target_visits, doc, auth.uid(), now()
    from jsonb_to_recordset(results) as x(
      month date, outlet text, menu text, cost_yen bigint, visits integer, contracts integer, target_visits integer)
  on conflict (facility_id, month, outlet, menu) do update set
    cost_yen = coalesce(excluded.cost_yen, m.cost_yen),
    visits = coalesce(excluded.visits, m.visits),
    contracts = coalesce(excluded.contracts, m.contracts),
    target_visits = coalesce(excluded.target_visits, m.target_visits),
    source_doc_id = coalesce(excluded.source_doc_id, m.source_doc_id),
    updated_by = auth.uid(),
    updated_at = now();
  get diagnostics k = row_count;
  n := n + k;

  insert into public.media_area_benchmark as a (
    facility_id, month, area, outlet, avg_visits, avg_contracts, source_doc_id, updated_by, updated_at
  )
  select fid, x.month, coalesce(x.area, ''), coalesce(x.outlet, ''), x.avg_visits, x.avg_contracts, doc, auth.uid(), now()
    from jsonb_to_recordset(areas) as x(month date, area text, outlet text, avg_visits numeric, avg_contracts numeric)
  on conflict (facility_id, month, area, outlet) do update set
    avg_visits = coalesce(excluded.avg_visits, a.avg_visits),
    avg_contracts = coalesce(excluded.avg_contracts, a.avg_contracts),
    source_doc_id = coalesce(excluded.source_doc_id, a.source_doc_id),
    updated_by = auth.uid(),
    updated_at = now();
  get diagnostics k = row_count;
  n := n + k;

  if doc is not null then
    update public.media_doc
       set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
     where id = doc and facility_id = fid;
  end if;
  return n;
end;
$$;
revoke all on function public.save_media_rows(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_media_rows(uuid, uuid, jsonb, jsonb) to authenticated;
