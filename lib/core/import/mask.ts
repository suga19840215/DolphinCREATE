// 個人情報の扱い（CLAUDE.md 5章・仕様書5.3）。
// 氏名・メール・電話・住所の列は取り込まない。発言内の連絡先は伏せ字にしてから保存する。

/** 個人情報の列とみなす見出し（この列は対応付けの候補から外し、保存しない） */
const PII_HEADER =
  /(氏名|名前|姓|名\b|ふりがな|フリガナ|カナ|name|mail|メール|tel|電話|phone|携帯|住所|address|郵便|zip|postal|生年月日|birth)/i;

export function isPiiHeader(header: string): boolean {
  const h = header.trim();
  // 「施設名」「キャンペーン名」「広告名」などは個人情報ではない
  if (
    /(施設|会場|キャンペーン|広告|グループ|セット|ファイル|file|campaign|ad_?name|ad ?set|asset|facility|venue|title|画像)/i.test(
      h,
    )
  ) {
    return false;
  }
  return PII_HEADER.test(h);
}

const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "［メール］"],
  [/https?:\/\/[^\s　、。」』）)]+/g, "［URL］"],
  [/(?<![\w])@[A-Za-z0-9_.]{2,30}/g, "［アカウント］"],
  [/(?<!\d)\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}(?!\d)/g, "［電話］"],
  [/(?<![\d-])0\d{1,4}-?\d{1,4}-?\d{3,4}(?![\d-])/g, "［電話］"],
  [/〒\s?\d{3}-?\d{4}|(?<![\d-])\d{3}-\d{4}(?![\d-])/g, "［郵便番号］"],
  [
    /(東京都|北海道|(?:京都|大阪)府|.{2,3}県).{1,10}?[市区町村郡].{0,20}?\d{1,4}(?:[-－]\d{1,4}){1,3}/g,
    "［住所］",
  ],
];

/** 発言内の連絡先（メール・電話・URL・アカウント名・郵便番号・番地までの住所）を伏せ字にする */
export function maskContacts(text: string): string {
  let out = text;
  for (const [re, label] of RULES) out = out.replace(re, label);
  return out;
}
