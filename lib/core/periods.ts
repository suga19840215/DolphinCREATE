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
