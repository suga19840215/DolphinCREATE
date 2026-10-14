// ⑥ メディア評価測定の掲載媒体。コードは保存と集計で使うので、使い始めたら変えない（名前は変えてよい）。
// aliases は資料・接客データの「媒体名」「流入元」を当てはめる手がかり（長いものから順に照合する）。

export const MEDIA_OUTLETS = [
  {
    code: "zexy_magazine",
    label: "ゼクシィ本誌",
    aliases: ["ゼクシィ本誌", "ゼクシィ誌面", "ゼクシィ誌", "ゼクシィ雑誌"],
  },
  {
    code: "zexy_net",
    label: "ゼクシィNET",
    aliases: ["ゼクシィnet", "ゼクシィネット", "ゼクシィweb", "zexy.net", "zexynet"],
  },
  {
    code: "zexy_navi",
    label: "ゼクシィなび",
    aliases: ["ゼクシィなび", "ゼクシィ花嫁カウンター", "ゼクシィカウンター"],
  },
  {
    code: "wpark",
    label: "ウエディングパーク",
    aliases: ["ウエディングパーク", "ウェディングパーク", "weddingpark", "wパーク"],
  },
  {
    code: "minna",
    label: "みんなのウェディング",
    aliases: [
      "みんなのウェディング",
      "みんなのウエディング",
      "みんなのw",
      "minnano-wedding",
      "mwed",
    ],
  },
  {
    code: "mynavi",
    label: "マイナビウエディング",
    aliases: ["マイナビウエディング", "マイナビウェディング", "マイナビw", "mynavi"],
  },
  { code: "hanayume", label: "ハナユメ", aliases: ["ハナユメ", "hanayume"] },
  {
    code: "wnews",
    label: "ウエディングニュース",
    aliases: ["ウエディングニュース", "ウェディングニュース", "wニュース", "weddingnews"],
  },
  { code: "tokihana", label: "トキハナ", aliases: ["トキハナ", "tokihana"] },
  { code: "placole", label: "プラコレ", aliases: ["プラコレ", "placole", "dressy"] },
  {
    code: "hankyu",
    label: "阪急ウエディング",
    aliases: ["阪急ウエディング", "阪急ウェディング", "阪急w"],
  },
  {
    code: "official",
    label: "公式HP",
    aliases: ["公式hp", "公式ホームページ", "公式サイト", "自社hp", "ホームページ", "hp"],
  },
  { code: "other", label: "その他", aliases: [] },
] as const;

export type OutletCode = (typeof MEDIA_OUTLETS)[number]["code"];

export const OUTLET_LABEL = Object.fromEntries(
  MEDIA_OUTLETS.map((o) => [o.code, o.label]),
) as Record<OutletCode, string>;

export const isOutlet = (v: unknown): v is OutletCode =>
  typeof v === "string" && MEDIA_OUTLETS.some((o) => o.code === v);

/** 全角・半角・大文字小文字・空白の違いをそろえる */
export const normalizeName = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・･\-－_]/g, "")
    .replace(/ウェ/g, "ウエ");

const ALIASES = MEDIA_OUTLETS.flatMap((o) =>
  o.aliases.map((a) => ({ code: o.code as OutletCode, key: normalizeName(a) })),
).sort((a, b) => b.key.length - a.key.length);

/**
 * 名前から媒体を当てはめる。「ゼクシィ」だけのように区分が分からないものは null（確認画面で選んでもらう）。
 * 「hp」のような短い手がかりは、名前全体が一致したときだけ使う。
 */
export function matchOutlet(name: string | null | undefined): OutletCode | null {
  if (!name) return null;
  const n = normalizeName(name);
  if (!n) return null;
  for (const a of ALIASES) {
    if (a.key.length <= 3 ? n === a.key : n.includes(a.key)) return a.code;
  }
  return null;
}
