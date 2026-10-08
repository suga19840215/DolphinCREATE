-- GA4 の取込を1つのトランザクションで確定する：取込履歴＋広告×LP（funnel_event）＋切り口別（site_metric）。
-- 途中で失敗したら何も残さない。security invoker なので、行ごとのアクセス制限がそのまま効く。
create function public.commit_ga4(job jsonb, funnel jsonb, site jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  job_id uuid;
begin
  job_id := public.commit_import(job, funnel);
  perform public.upsert_site_metrics((job ->> 'facility_id')::uuid, job_id, site);
  return job_id;
end;
$$;
revoke all on function public.commit_ga4(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.commit_ga4(jsonb, jsonb, jsonb) to authenticated, service_role;
