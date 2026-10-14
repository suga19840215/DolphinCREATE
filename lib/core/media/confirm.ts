// ⑥ 確認画面で確定した下書きを、保存する形（媒体×月の結果・エリア平均）にする。
import { lastYearMonth } from "./evaluate";
import { OUTLET_LABEL } from "./outlets";
import { DraftRowSchema, type DraftRow } from "./sheet";

export type SaveResult = {
  month: string;
  outlet: string;
  menu: string;
  cost_yen: number | null;
  visits: number | null;
  contracts: number | null;
  target_visits: number | null;
};
export type SaveArea = {
  month: string;
  area: string;
  outlet: string;
  avg_visits: number | null;
  avg_contracts: number | null;
};

export function toSavePayload(input: unknown[]): {
  results: SaveResult[];
  areas: SaveArea[];
  problems: string[];
} {
  const results = new Map<string, SaveResult>();
  const areas: SaveArea[] = [];
  const problems: string[] = [];
  input.forEach((raw, i) => {
    const parsed = DraftRowSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(`${i + 1}行目：値の形が正しくありません`);
      return;
    }
    const r: DraftRow = parsed.data;
    if (!r.month)
      problems.push(`${i + 1}行目（${r.outlet_text || "媒体不明"}）：月を選んでください`);
    if (!r.outlet && r.kind === "result")
      problems.push(`${i + 1}行目（${r.outlet_text || "媒体不明"}）：媒体を選んでください`);
    if (!r.month || (!r.outlet && r.kind === "result")) return;
    const month = `${r.month}-01`;
    if (r.kind === "area") {
      areas.push({
        month,
        area: r.area,
        outlet: r.outlet ?? "",
        avg_visits: r.area_avg_visits,
        avg_contracts: r.area_avg_contracts,
      });
      return;
    }
    // 同じ媒体×月×メニューが資料に2回出てきたら、後の行を使う
    results.set(`${month}|${r.outlet}|${r.menu}`, {
      month,
      outlet: r.outlet!,
      menu: r.menu,
      cost_yen: r.cost_yen,
      visits: r.visits,
      contracts: r.contracts,
      target_visits: r.target_visits,
    });
    if (r.last_visits !== null || r.last_contracts !== null) {
      const lm = lastYearMonth(month);
      const key = `${lm}|${r.outlet}|${r.menu}`;
      const prev = results.get(key);
      results.set(key, {
        month: lm,
        outlet: r.outlet!,
        menu: r.menu,
        cost_yen: prev?.cost_yen ?? null,
        visits: r.last_visits ?? prev?.visits ?? null,
        contracts: r.last_contracts ?? prev?.contracts ?? null,
        target_visits: prev?.target_visits ?? null,
      });
    }
  });
  return { results: [...results.values()], areas, problems };
}

export const outletName = (code: string | null, text: string) =>
  code ? OUTLET_LABEL[code as keyof typeof OUTLET_LABEL] : text || "媒体不明";
