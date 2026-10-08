// ページの分類（⑤ 最初に訪れたページ別・フェア・プラン別・コンテンツ別）。
// 会場ごとに「URL の始まり → 名前と種類」を登録し、いちばん長く一致したものを使う（前方一致）。

export const PAGE_KINDS = ["top", "landing", "fair", "plan", "content", "form", "other"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const PAGE_KIND_LABEL: Record<PageKind, string> = {
  top: "TOP",
  landing: "広告LP",
  fair: "フェア",
  plan: "プラン",
  content: "コンテンツ",
  form: "予約フォーム",
  other: "その他",
};

export type PageRule = { prefix: string; label: string; kind: PageKind };
export type PageMatch = { label: string; kind: PageKind; matched: boolean };

/** パスの形をそろえる（クエリ・# を外し、末尾の / をそろえる） */
export function normalizePath(path: string): string {
  let p = (path || "").split("?")[0]!.split("#")[0]!.trim();
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p.toLowerCase();
}

export function matchPage(path: string, rules: readonly PageRule[]): PageMatch {
  const p = normalizePath(path);
  let best: PageRule | null = null;
  for (const r of rules) {
    const prefix = normalizePath(r.prefix);
    const hit = prefix === "/" ? p === "/" : p === prefix || p.startsWith(prefix + "/");
    if (hit && (!best || normalizePath(best.prefix).length < prefix.length)) best = r;
  }
  if (best) return { label: best.label, kind: best.kind, matched: true };
  if (p === "/") return { label: "TOP", kind: "top", matched: false };
  return { label: p, kind: "other", matched: false };
}

/** 登録の決まり：/ で始まる・200字まで・名前は50字まで */
export function validRule(r: { prefix: string; label: string; kind: string }): string | null {
  if (!/^\/[\w\-./%~]*$/.test(r.prefix) || r.prefix.length > 200)
    return "URL は / で始まるパスで入力してください（例：/fair/tasting）。";
  if (!r.label.trim() || r.label.length > 50) return "名前を50字以内で入力してください。";
  if (!(PAGE_KINDS as readonly string[]).includes(r.kind)) return "種類を選んでください。";
  return null;
}
