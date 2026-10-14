// ⑥ メディア評価測定の計算と判定。画面・Excel・AI への入力のどこから使っても同じ結果にする。
// 指標：来館件数（目標比・昨年比）、来館単価、成約単価、エリア平均比（昨年の割合との差）、TOP広告と来館客の合致。
import { appConfig } from "../../../config/app";
import { ratio } from "../format";
import type { MatchLevel } from "./match";
import { MEDIA_OUTLETS, OUTLET_LABEL, type OutletCode } from "./outlets";

export type ResultRow = {
  month: string; // YYYY-MM-01
  outlet: string;
  menu: string;
  cost_yen: number | null;
  visits: number | null;
  contracts: number | null;
  target_visits: number | null;
};
export type AreaRow = {
  month: string;
  area: string;
  outlet: string; // '' = 媒体を問わない
  avg_visits: number | null;
  avg_contracts: number | null;
};

export type Tone = "good" | "warn" | "bad" | "neutral";
export type Judge = { tone: Tone; label: string };

const T = appConfig.mediaEvaluation;
const NONE: Judge = { tone: "neutral", label: "—" };

/** 月（YYYY-MM-01）の1年前 */
export const lastYearMonth = (m: string) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;

type Sum = {
  cost: number | null;
  visits: number | null;
  contracts: number | null;
  target: number | null;
};
const emptySum = (): Sum => ({ cost: null, visits: null, contracts: null, target: null });
const plus = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);
function addRow(s: Sum, r: ResultRow) {
  s.cost = plus(s.cost, r.cost_yen);
  s.visits = plus(s.visits, r.visits);
  s.contracts = plus(s.contracts, r.contracts);
  s.target = plus(s.target, r.target_visits);
}

const higherBetter = (v: number | null, th: { good: number; warn: number }): Judge =>
  v === null
    ? NONE
    : v >= th.good
      ? { tone: "good", label: "良好" }
      : v >= th.warn
        ? { tone: "warn", label: "注意" }
        : { tone: "bad", label: "要改善" };

/** 単価：全媒体の平均単価との比で判定（低いほど良い） */
function unitCostJudge(cost: number | null, count: number | null, avg: number | null): Judge {
  if (cost === null || count === null) return NONE;
  if (count === 0) return cost > 0 ? { tone: "bad", label: "0件" } : NONE;
  if (avg === null || avg === 0) return NONE;
  const r = cost / count / avg;
  return r <= T.unitCost.good
    ? { tone: "good", label: "良好" }
    : r <= T.unitCost.warn
      ? { tone: "warn", label: "注意" }
      : { tone: "bad", label: "要改善" };
}

function shareJudge(now: number | null, before: number | null): Judge {
  if (now === null || before === null) return NONE;
  const d = now - before;
  return d >= 0
    ? { tone: "good", label: "上昇" }
    : d >= T.areaShare.warn
      ? { tone: "warn", label: "やや低下" }
      : { tone: "bad", label: "低下" };
}

const MATCH_JUDGE: Record<MatchLevel, Judge> = {
  match: { tone: "good", label: "合致" },
  partial: { tone: "warn", label: "一部合致" },
  mismatch: { tone: "bad", label: "不一致" },
  insufficient: { tone: "neutral", label: "参考外" },
  no_ad: { tone: "neutral", label: "広告未登録" },
  unknown: { tone: "neutral", label: "判定できない" },
};

/** エリア平均比：自会場の件数 ÷ エリア平均（両方そろった月だけで計算） */
function areaShare(
  results: readonly ResultRow[],
  areas: readonly AreaRow[],
  months: readonly string[],
  outlet: string | null, // null = 全媒体の合計
  field: "visits" | "contracts",
) {
  const key = outlet ?? "";
  const avgField = field === "visits" ? "avg_visits" : "avg_contracts";
  let own = 0;
  let avg = 0;
  let used = 0;
  let areaName = "";
  for (const m of months) {
    const b = areas.filter((a) => a.month === m && a.outlet === key && a[avgField] !== null);
    if (!b.length) continue;
    const rows = results.filter(
      (r) => r.month === m && (outlet === null || r.outlet === outlet) && r[field] !== null,
    );
    if (!rows.length) continue;
    own += rows.reduce((s, r) => s + (r[field] ?? 0), 0);
    avg += b[0]![avgField]!;
    areaName ||= b[0]!.area;
    used++;
  }
  return { share: used ? ratio(own, avg) : null, area: areaName };
}

export type OutletEvaluation = {
  outlet: OutletCode | "total";
  label: string;
  menus: string[];
  cost: number | null;
  visits: number | null;
  contracts: number | null;
  target: number | null;
  targetRate: number | null;
  lastVisits: number | null;
  lastContracts: number | null;
  lastYearRate: number | null;
  visitCost: number | null;
  lastVisitCost: number | null;
  contractCost: number | null;
  lastContractCost: number | null;
  areaName: string;
  areaVisitShare: number | null;
  lastAreaVisitShare: number | null;
  areaContractShare: number | null;
  lastAreaContractShare: number | null;
  visualMatch: MatchLevel | null;
  catchMatch: MatchLevel | null;
  judges: {
    target: Judge;
    lastYear: Judge;
    visitCost: Judge;
    contractCost: Judge;
    areaVisit: Judge;
    areaContract: Judge;
    visual: Judge;
    catch: Judge;
  };
  overall: Judge;
};

/**
 * 期間（months：YYYY-MM-01 の並び）の媒体ごとの評価。昨年は同じ月の1年前。
 * matches は媒体ごとの TOP 広告と来館客の合致（match.ts で判定したもの）。
 */
export function evaluateMedia(input: {
  results: readonly ResultRow[];
  areas: readonly AreaRow[];
  months: readonly string[];
  matches?: Partial<Record<string, { visual: MatchLevel; catch: MatchLevel }>>;
}) {
  const months = new Set(input.months);
  const lastMonths = new Set(input.months.map(lastYearMonth));
  const now = input.results.filter((r) => months.has(r.month));
  const last = input.results.filter((r) => lastMonths.has(r.month));

  const nowBy = new Map<string, Sum>();
  const lastBy = new Map<string, Sum>();
  const menus = new Map<string, Set<string>>();
  const totalNow = emptySum();
  const totalLast = emptySum();
  for (const r of now) {
    addRow(nowBy.get(r.outlet) ?? nowBy.set(r.outlet, emptySum()).get(r.outlet)!, r);
    addRow(totalNow, r);
    if (r.menu) (menus.get(r.outlet) ?? menus.set(r.outlet, new Set()).get(r.outlet)!).add(r.menu);
  }
  for (const r of last) {
    addRow(lastBy.get(r.outlet) ?? lastBy.set(r.outlet, emptySum()).get(r.outlet)!, r);
    addRow(totalLast, r);
  }

  // 単価の比較基準：金額と件数がそろっている媒体だけで出した、全媒体の平均単価
  const avgOf = (field: "visits" | "contracts") => {
    let cost = 0;
    let n = 0;
    for (const s of nowBy.values()) {
      if (s.cost !== null && s[field] !== null) {
        cost += s.cost;
        n += s[field]!;
      }
    }
    return ratio(cost, n);
  };
  const avgVisitCost = avgOf("visits");
  const avgContractCost = avgOf("contracts");
  const lastMonthList = [...lastMonths];

  const evaluate = (outlet: OutletCode | null, s: Sum, l: Sum): OutletEvaluation => {
    const visitCost = s.cost !== null && s.visits !== null ? ratio(s.cost, s.visits) : null;
    const contractCost =
      s.cost !== null && s.contracts !== null ? ratio(s.cost, s.contracts) : null;
    const areaV = areaShare(input.results, input.areas, input.months, outlet, "visits");
    const areaVL = areaShare(input.results, input.areas, lastMonthList, outlet, "visits");
    const areaC = areaShare(input.results, input.areas, input.months, outlet, "contracts");
    const areaCL = areaShare(input.results, input.areas, lastMonthList, outlet, "contracts");
    const m = outlet ? input.matches?.[outlet] : undefined;
    const small = (s.visits ?? 0) < T.minVisits;
    const judges = {
      target: higherBetter(s.visits !== null && s.target ? s.visits / s.target : null, T.target),
      lastYear: higherBetter(
        s.visits !== null && l.visits ? s.visits / l.visits : null,
        T.lastYear,
      ),
      visitCost: unitCostJudge(s.cost, s.visits, avgVisitCost),
      // 成約は件数が少ないので、来館が少ない媒体の成約単価は判定しない
      contractCost: small
        ? s.contracts === null
          ? NONE
          : { tone: "neutral" as Tone, label: "保留" }
        : unitCostJudge(s.cost, s.contracts, avgContractCost),
      areaVisit: shareJudge(areaV.share, areaVL.share),
      areaContract: shareJudge(areaC.share, areaCL.share),
      visual: m ? MATCH_JUDGE[m.visual] : NONE,
      catch: m ? MATCH_JUDGE[m.catch] : NONE,
    };
    const tones = Object.values(judges).map((j) => j.tone);
    const bad = tones.filter((t) => t === "bad").length;
    const good = tones.filter((t) => t === "good").length;
    const judged = tones.filter((t) => t !== "neutral").length;
    const overall: Judge =
      s.visits === null
        ? NONE
        : small && (l.visits ?? 0) < T.minVisits
          ? { tone: "neutral", label: "保留（小標本）" }
          : bad >= 3
            ? { tone: "bad", label: "見直し候補" }
            : bad === 0 && judged > 0 && good * 2 >= judged
              ? { tone: "good", label: "良好" }
              : { tone: "warn", label: "要改善" };
    return {
      outlet: outlet ?? "total",
      label: outlet ? OUTLET_LABEL[outlet] : "合計",
      menus: outlet ? [...(menus.get(outlet) ?? [])] : [],
      cost: s.cost,
      visits: s.visits,
      contracts: s.contracts,
      target: s.target,
      targetRate: s.visits !== null && s.target ? s.visits / s.target : null,
      lastVisits: l.visits,
      lastContracts: l.contracts,
      lastYearRate: s.visits !== null && l.visits ? s.visits / l.visits : null,
      visitCost,
      lastVisitCost: l.cost !== null && l.visits !== null ? ratio(l.cost, l.visits) : null,
      contractCost,
      lastContractCost: l.cost !== null && l.contracts !== null ? ratio(l.cost, l.contracts) : null,
      areaName: areaV.area || areaC.area,
      areaVisitShare: areaV.share,
      lastAreaVisitShare: areaVL.share,
      areaContractShare: areaC.share,
      lastAreaContractShare: areaCL.share,
      visualMatch: m?.visual ?? null,
      catchMatch: m?.catch ?? null,
      judges,
      overall,
    };
  };

  const outlets = MEDIA_OUTLETS.map((o) => o.code).filter(
    (c) => nowBy.has(c) || lastBy.has(c) || input.matches?.[c],
  );
  return {
    rows: outlets.map((c) => evaluate(c, nowBy.get(c) ?? emptySum(), lastBy.get(c) ?? emptySum())),
    total: evaluate(null, totalNow, totalLast),
    avgVisitCost,
    avgContractCost,
    hasData: now.length > 0 || last.length > 0,
  };
}

export type MediaEvaluation = ReturnType<typeof evaluateMedia>;
