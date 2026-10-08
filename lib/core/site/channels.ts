// 流入元の分け方（⑤ 流入元別の予約成果）。
// GA4 の「デフォルト チャネル グループ」と「参照元 / メディア」から、ブライダルの運用で使う区分にまとめる。

export const CHANNELS = [
  "Google広告",
  "Instagram広告",
  "その他の広告",
  "自然検索",
  "式場紹介サイト",
  "他サイトからのリンク",
  "SNS（広告以外）",
  "直接",
  "メール",
  "その他",
] as const;
export type Channel = (typeof CHANNELS)[number];

/** 式場紹介サイト（ポータル）として扱う参照元。会場ごとの設定で追加できるようにする（M3 以降） */
export const PORTAL_SOURCES = [
  "zexy",
  "weddingpark",
  "hanayume",
  "mwed",
  "mynavi",
  "minna-no-wedding",
  "minnano",
  "goodday",
  "kekkonsikiba",
  "weddingnews",
  "ksj",
];

const PAID_MEDIUM =
  /^(cpc|ppc|paid|paidsearch|paid_search|paid_social|paidsocial|display|cpm|banner|retargeting)$/;
const META_SOURCE = /^(instagram|ig|facebook|fb|meta|l\.instagram\.com|m\.facebook\.com)$/;

export function classifyChannel(channelGroup: string, sourceMedium: string): Channel {
  const [rawSource = "", rawMedium = ""] = sourceMedium
    .split(" / ")
    .map((s) => s.trim().toLowerCase());
  const group = channelGroup.trim().toLowerCase();
  const paid =
    PAID_MEDIUM.test(rawMedium) ||
    group.startsWith("paid") ||
    group === "display" ||
    group === "cross-network";

  if (paid && META_SOURCE.test(rawSource)) return "Instagram広告";
  if (paid && rawSource.includes("google")) return "Google広告";
  if (paid) return "その他の広告";
  if (PORTAL_SOURCES.some((p) => rawSource.includes(p))) return "式場紹介サイト";
  if (group === "organic search") return "自然検索";
  if (group === "organic social" || META_SOURCE.test(rawSource)) return "SNS（広告以外）";
  if (group === "referral") return "他サイトからのリンク";
  if (group === "direct" || rawSource === "(direct)") return "直接";
  if (group === "email" || rawMedium === "email") return "メール";
  return "その他";
}
