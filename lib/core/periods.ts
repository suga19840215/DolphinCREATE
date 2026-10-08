// 対象期間（表示は Asia/Tokyo の日付）。M3 で画面の期間選択に置き換える。
export type Period = { start: string; end: string; label: string };

const DAY = 86_400_000;
const tokyoDate = (t: number) => new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);

/** 昨日までの直近4週（28日）と、その前の4週 */
export function lastFourWeeks(now: Date): { current: Period; prior: Period } {
  const end = Date.parse(`${tokyoDate(now.getTime() - DAY)}T00:00:00Z`);
  const mk = (e: number): Period => {
    const s = e - 27 * DAY;
    const fmt = (t: number) => new Date(t).toISOString().slice(0, 10).replaceAll("-", "/");
    return {
      start: new Date(s).toISOString().slice(0, 10),
      end: new Date(e).toISOString().slice(0, 10),
      label: `${fmt(s)}〜${fmt(e).slice(5)}`,
    };
  };
  return { current: mk(end), prior: mk(end - 28 * DAY) };
}

/** 期間の始まり・終わり（日本時間）を UTC の日時にする（終わりは翌日0時の手前まで） */
export function periodRangeUtc(p: Period): { from: string; to: string } {
  return {
    from: new Date(Date.parse(`${p.start}T00:00:00+09:00`)).toISOString(),
    to: new Date(Date.parse(`${p.end}T00:00:00+09:00`) + DAY).toISOString(),
  };
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const fmtShort = (iso: string) => iso.replaceAll("-", "/");

export function makePeriod(start: string, end: string): Period {
  return { start, end, label: `${fmtShort(start)}〜${fmtShort(end).slice(5)}` };
}

/** 同じ長さの、ひとつ前の期間（前期比に使う） */
export function previousPeriod(p: Period): Period {
  const s = Date.parse(`${p.start}T00:00:00Z`);
  const e = Date.parse(`${p.end}T00:00:00Z`);
  const len = e - s + DAY;
  return makePeriod(isoDay(s - len), isoDay(e - len));
}

/** 画面で選べる期間（日本時間の日付） */
export function periodPresets(now: Date) {
  const today = tokyoDate(now.getTime());
  const yesterday = tokyoDate(now.getTime() - DAY);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = isoDay(Date.parse(`${monthStart}T00:00:00Z`) - DAY);
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
  const four = lastFourWeeks(now).current;
  return [
    { id: "4w", label: "直近4週", period: makePeriod(four.start, four.end) },
    {
      id: "90d",
      label: "直近90日",
      period: makePeriod(isoDay(Date.parse(`${yesterday}T00:00:00Z`) - 89 * DAY), yesterday),
    },
    {
      id: "this-month",
      label: `今月（${m}月）`,
      period: makePeriod(monthStart, yesterday < monthStart ? monthStart : yesterday),
    },
    {
      id: "last-month",
      label: `先月（${Number(lastMonthEnd.slice(5, 7))}月）`,
      period: makePeriod(lastMonthStart, lastMonthEnd),
    },
  ].filter(() => y > 0);
}

/** 画面から受け取った期間。形が違う・長すぎる（400日超）ときは null */
export function parsePeriod(from?: string, to?: string): Period | null {
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return null;
  const s = Date.parse(`${from}T00:00:00Z`);
  const e = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || s > e || e - s > 400 * DAY) return null;
  if (isoDay(s) !== from || isoDay(e) !== to) return null;
  return makePeriod(from, to);
}
