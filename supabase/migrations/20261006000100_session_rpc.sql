-- 画面のサーバー処理から呼ぶための入口（API で公開するのは public スキーマだけのため）。
-- 中身は app スキーマの関数。ログインした人の権限で動く。
create function public.touch_session()
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$ select app.touch_session() $$;

revoke all on function public.touch_session() from public, anon;
grant execute on function public.touch_session() to authenticated;
