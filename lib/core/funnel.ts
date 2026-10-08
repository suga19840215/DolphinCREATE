// ⑤「予約後の来館・成約（予約台帳）」：広告クリックから成約までの段階別通過率と、広告別の診断。
// 段階・目安・判定は試作版（STAGES・diag）と同じ。媒体報告・GA4・CRM の値は混ぜずに並べる。
import { ratio } from "./format";

export type AdFunnel = {
  clicks: number; // 媒体
  impressions: number; // 媒体
  cost: number; // 媒体（円・Fee抜き）
  mediaCv: number; // 媒体報告CV
  lp: number; // GA4 LPセッション
  cta: number; // GA4 select_fair
  formStart: number; // GA4 form_start
  formError: number; // GA4 form_error
  lead: number; // GA4 generate_lead
  res: number; // CRM：lead_id で広告と結べた予約
  valid: number; // CRM：有効予約
  visit: number; // CRM：来館
  contract: number; // CRM：成約
  grossProfit: number; // CRM：粗利（円）
};

export const emptyFunnel = (): AdFunnel => ({
  clicks: 0,
  impressions: 0,
  cost: 0,
  mediaCv: 0,
  lp: 0,
  cta: 0,
  formStart: 0,
  formError: 0,
  lead: 0,
  res: 0,
  valid: 0,
  visit: 0,
  contract: 0,
  grossProfit: 0,
});

export function sumFunnels(list: readonly AdFunnel[]): AdFunnel {
  const t = emptyFunnel();
  for (const f of list) for (const k of Object.keys(t) as (keyof AdFunnel)[]) t[k] += f[k];
  return t;
}

/** 段階・計測元・目安（前段階からの通過率）・詰まったときに確かめること（試作版と同じ） */
export const STAGES = [
  { key: "clicks", label: "広告クリック", source: "媒体", bench: null, check: "" },
  {
    key: "lp",
    label: "LPセッション",
    source: "GA4",
    bench: 0.85,
    check: "URL・タグ・同意・ページ速度・計測漏れ",
  },
  {
    key: "cta",
    label: "フェアCTAクリック",
    source: "GA4",
    bench: 0.2,
    check: "訴求と写真・料金・特典・フェアの一致、導線",
  },
  {
    key: "formStart",
    label: "フォーム開始",
    source: "GA4",
    bench: 0.36,
    check: "CTAからフォームまでの距離、日程選択",
  },
  {
    key: "lead",
    label: "予約完了（generate_lead）",
    source: "GA4",
    bench: 0.3,
    check: "必須項目、スマホ操作、日程空き、送信エラー",
  },
  {
    key: "res",
    label: "lead_idで結合した予約",
    source: "CRM",
    bench: 0.9,
    check: "フォームのlead_id・UTM受け渡し",
  },
  {
    key: "valid",
    label: "有効予約",
    source: "CRM",
    bench: 0.8,
    check: "いたずら・重複・条件外の予約の比率",
  },
  {
    key: "visit",
    label: "来館",
    source: "CRM",
    bench: 0.72,
    check: "確認連絡の速度、日程、交通、予約内容との期待差",
  },
  {
    key: "contract",
    label: "成約",
    source: "CRM",
    bench: 0.3,
    check: "価格説明、商品適合、強みの伝わり方、競合比較",
  },
] as const;

/** 段階別通過率。目安の80%未満を「詰まり」とする（仕様書7章） */
export function stageRates(t: AdFunnel) {
  return STAGES.map((s, i) => {
    const value = t[s.key];
    const prev = i ? t[STAGES[i - 1]!.key] : null;
    const rate = prev === null ? null : ratio(value, prev);
    const low = rate !== null && s.bench !== null && rate < s.bench * 0.8;
    return { ...s, value, rate, low };
  });
}

const lt = (a: number | null, b: number | null) => a !== null && b !== null && a < b;
const gt = (a: number | null, b: number | null) => a !== null && b !== null && a > b;

export type Diagnosis = { label: string; note: string; tone: "neutral" | "warn" | "good" };

/** 広告別の診断（仕様書7章「広告の診断」・試作版 diag） */
export function diagnose(c: AdFunnel, t: AdFunnel): Diagnosis {
  if (c.visit < 8) return { label: "保留・小標本", note: "来館8件未満", tone: "neutral" };
  const mul = (v: number | null, k: number) => (v === null ? null : v * k);
  const ctrHi = gt(ratio(c.clicks, c.impressions), mul(ratio(t.clicks, t.impressions), 1.3));
  const resLo = lt(ratio(c.lead, c.lp), mul(ratio(t.lead, t.lp), 0.8));
  const visLo = lt(ratio(c.visit, c.valid), mul(ratio(t.visit, t.valid), 0.8));
  const conLo = lt(ratio(c.contract, c.visit), mul(ratio(t.contract, t.visit), 0.7));
  const valLo = lt(ratio(c.valid, c.res), mul(ratio(t.valid, t.res), 0.85));
  if (visLo || valLo)
    return { label: "予約高・来館低", note: "低意向予約・追客を確認", tone: "warn" };
  if (ctrHi && resLo)
    return { label: "CTR高・予約低", note: "広告・LP・フォームの整合", tone: "warn" };
  if (conLo) return { label: "来館高・成約低", note: "価格説明・競合比較・接客", tone: "warn" };
  if (c.grossProfit && lt(ratio(c.grossProfit, c.cost), mul(ratio(t.grossProfit, t.cost), 0.6))) {
    return { label: "粗利低", note: "値引き・原価を確認", tone: "warn" };
  }
  return { label: "目立つ詰まりなし", note: "", tone: "good" };
}

/** 継続／修正／停止候補／保留の提案（仕様書7章・試作版 recommend）。予算や配信状態は自動で変えない */
export function recommend(c: AdFunnel, avgCostPerContract: number | null): Diagnosis {
  if (c.visit < 8) return { label: "保留", note: "来館n<8", tone: "neutral" };
  if (c.contract === 0) return { label: "停止候補", note: "成約0件", tone: "warn" };
  const cpa = c.cost / c.contract;
  if (lt(ratio(c.visit, c.valid), 0.6))
    return { label: "修正", note: "来館率が低い", tone: "warn" };
  if (avgCostPerContract !== null && cpa <= avgCostPerContract * 0.85)
    return { label: "継続", note: "成約単価が平均より低い", tone: "good" };
  if (avgCostPerContract !== null && cpa > avgCostPerContract * 1.3)
    return { label: "修正", note: "成約単価が高い", tone: "warn" };
  return { label: "継続", note: "", tone: "good" };
}
