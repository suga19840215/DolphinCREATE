// ⑥「来館メイン顧客」と「TOP広告のビジュアル・キャッチ」が合っているかの判定（分類で判定し、AI は理由と改善案の補足だけ）。
// 来館メイン顧客は、その媒体から来館した接客（Dolphin）の重視点・好まれる画像・決め手を訴求軸に当てはめて数える。
import { APPEAL_AXES, type AppealAxisCode } from "../../content/appeal-axes";
import { normalizeName } from "./outlets";

// 名前を「・」で分けた言葉も手がかりにする（どの訴求にも出てくる一般的な言葉は除く）
const TOO_GENERAL = new Set(["安心", "限定", "期間", "見積の安心", "感"]);
const AXIS_KEYS = APPEAL_AXES.map((a) => ({
  code: a.code as AppealAxisCode,
  keys: [...a.label.split(/[・／]/).filter((w) => !TOO_GENERAL.has(w)), ...a.keywords]
    .map(normalizeName)
    .filter((k) => k.length >= 2),
}));

/** 文から当てはまる訴求軸（キャッチコピー・重視点の言葉など） */
export function axesFromText(text: string | null | undefined): AppealAxisCode[] {
  if (!text) return [];
  const n = normalizeName(text);
  return AXIS_KEYS.filter((a) => a.keys.some((k) => n.includes(k))).map((a) => a.code);
}

export type Consultation = {
  cluster_code: string | null;
  age_band: string | null;
  area_band: string | null;
  /** 重視点・好まれる画像・決め手などの言葉 */
  insightLabels: readonly string[];
};

export type Share = { key: string; n: number; share: number };

const top = (values: (string | null)[], total: number, limit = 3): Share[] => {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m]
    .map(([key, n]) => ({ key, n, share: n / total }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
    .slice(0, limit);
};

export type MainCustomer = {
  n: number;
  clusters: Share[];
  ages: Share[];
  areas: Share[];
  /** 来館客の多くが重視している訴求軸（1人1回まで数える。割合15%以上の上位3つ） */
  axes: (Share & { key: AppealAxisCode })[];
};

export function mainCustomer(list: readonly Consultation[]): MainCustomer {
  const n = list.length;
  const axisCount = new Map<AppealAxisCode, number>();
  for (const c of list) {
    const axes = new Set(c.insightLabels.flatMap(axesFromText));
    for (const a of axes) axisCount.set(a, (axisCount.get(a) ?? 0) + 1);
  }
  const axes = [...axisCount]
    .map(([key, k]) => ({ key, n: k, share: n ? k / n : 0 }))
    .filter((a) => a.share >= 0.15)
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
    .slice(0, 3);
  return {
    n,
    clusters: top(
      list.map((c) => c.cluster_code),
      n,
    ),
    ages: top(
      list.map((c) => c.age_band),
      n,
    ),
    areas: top(
      list.map((c) => c.area_band),
      n,
    ),
    axes,
  };
}

export type MatchLevel = "match" | "partial" | "mismatch" | "insufficient" | "no_ad" | "unknown";

export const MATCH_LABEL: Record<MatchLevel, string> = {
  match: "合致",
  partial: "一部合致",
  mismatch: "不一致",
  insufficient: "参考外",
  no_ad: "広告未登録",
  unknown: "判定できない",
};

/**
 * 判定：来館客がいちばん重視する訴求が広告に入っていれば「合致」、上位3つのどれかなら「一部合致」、
 * どれも入っていなければ「不一致」。来館客が最小母数未満なら「参考外」。
 */
export function matchLevel(
  customer: MainCustomer,
  adAxes: readonly string[],
  minN: number,
): MatchLevel {
  if (!adAxes.length) return "no_ad";
  if (customer.n < minN) return "insufficient";
  if (!customer.axes.length) return "unknown";
  if (adAxes.includes(customer.axes[0]!.key)) return "match";
  if (customer.axes.some((a) => adAxes.includes(a.key))) return "partial";
  return "mismatch";
}
