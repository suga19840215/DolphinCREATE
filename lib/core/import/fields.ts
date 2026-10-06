// 取込の種類ごとの項目と、見出しの自動対応付けに使う別名。
// 接客データの項目は試作版（IMPORT_FIELDS・autoMap）と同じ。ほかは仕様書5.2・5.3・12章から。

export type ImportKind = "consultation" | "crm" | "ads" | "ga4" | "images";

export type FieldDef = {
  key: string;
  label: string;
  required: boolean;
  synonyms: string[];
};

const f = (key: string, label: string, required: boolean, synonyms: string[] = []): FieldDef => ({
  key,
  label,
  required,
  synonyms: [key, ...synonyms],
});

export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  consultation: "接客データ（Dolphin）",
  crm: "予約・来館・成約（CRM）",
  ads: "広告実績（Google広告・Meta）",
  ga4: "LP・予約フォームの計測（GA4）",
  images: "Dolphin生成画像（情報CSV）",
};

export const FIELDS: Record<ImportKind, FieldDef[]> = {
  consultation: [
    f("consultation_id", "接客ID", true, ["接客id", "session_id"]),
    f("lead_id", "リードID", true, ["リードid"]),
    f("facility_id", "施設ID", true, ["施設id"]),
    f("consent_ad", "広告改善への同意", true, ["広告改善同意", "consent_ad_improvement"]),
    f("consult_date", "接客日時", false, ["接客日時", "date"]),
    f("source", "流入元", false, ["流入元", "utm_source"]),
    f("priorities", "重視点（|区切り）", false, ["重視点"]),
    f("visit_motive", "来館理由", false, ["来館理由", "来館動機"]),
    f("decision_factor", "成約の決め手", false, ["決め手", "成約の決め手"]),
    f("noncontract_reason", "非成約理由", false, ["非成約理由", "失注理由"]),
    f("contract", "成約（1/0・成約/非成約/見積中）", false, ["成約", "outcome", "成約結果"]),
    f("quote", "根拠発言", false, ["根拠発言", "発言"]),
    f("speaker", "話者（本人/担当者）", false, ["話者"]),
    f("staff_id", "担当者ID", false, ["担当者id", "staff"]),
    f("age_band", "年齢帯", false, ["年齢帯", "年齢"]),
    f("area", "エリア", false, ["エリア", "地域"]),
    f("cluster", "関心クラスタ", false, ["クラスタ", "cluster_id"]),
    f("competitor", "比較した競合", false, ["競合", "比較した競合"]),
  ],
  crm: [
    f("lead_id", "リードID", true, ["リードid"]),
    f("facility_id", "施設ID", true, ["施設id"]),
    f("reserved_at", "予約日時", false, ["予約日時", "reservation_date"]),
    f("is_valid", "有効予約（1/0）", false, ["有効予約", "valid"]),
    f("cancelled_at", "キャンセル日時", false, ["キャンセル日時"]),
    f("visited_at", "来館日時", false, ["来館日時", "visit_date"]),
    f("outcome", "成約結果（成約/非成約/見積中）", false, ["成約結果", "contract", "成約"]),
    f("contracted_at", "成約確定日", false, ["成約確定日", "成約日"]),
    f("lost_reason", "失注理由", false, ["失注理由", "非成約理由"]),
    f("revenue", "成約額（円）", false, ["成約額", "売上"]),
    f("gross_profit", "粗利（円）", false, ["粗利"]),
    f("channel", "予約経路", false, ["予約経路", "経路"]),
    f("utm_source", "utm_source", false),
    f("utm_medium", "utm_medium", false),
    f("utm_campaign", "utm_campaign", false),
    f("utm_content", "utm_content（広告ID）", false, ["ad_id", "広告id"]),
    f("utm_term", "utm_term", false),
    f("click_id", "クリックID（gclid・fbclid）", false, ["gclid", "fbclid", "クリックid"]),
    f("ga4_client_id", "GA4 client_id", false, ["client_id"]),
  ],
  ads: [
    f("date", "日付", true, ["日", "day", "日付", "レポート開始日", "reporting starts"]),
    f("campaign", "キャンペーン", false, ["キャンペーン", "キャンペーン名", "campaign name"]),
    f("ad_group", "広告グループ／広告セット", false, [
      "広告グループ",
      "広告セット名",
      "ad group",
      "ad set name",
    ]),
    f("ad_id", "広告ID", true, ["広告id", "ad id", "広告 id"]),
    f("ad_name", "広告名", false, ["広告名", "ad name", "広告"]),
    f("asset_id", "画像ID", false, ["画像id", "アセットid", "asset id"]),
    f("impressions", "表示回数", true, ["表示回数", "インプレッション", "impr.", "impressions"]),
    f("clicks", "クリック数", true, ["クリック数", "クリック", "リンクのクリック", "link clicks"]),
    f("cost", "使用額（円・Fee抜き）", true, [
      "費用",
      "コスト",
      "消化金額",
      "消化金額 (jpy)",
      "amount spent (jpy)",
      "使用額",
    ]),
    f("conversions", "獲得数（媒体報告）", false, ["コンバージョン", "結果", "results", "獲得数"]),
  ],
  ga4: [
    f("date", "日付", true, ["日付"]),
    f("ad_id", "広告ID（utm_content）", true, [
      "utm_content",
      "セッションの手動広告コンテンツ",
      "広告id",
    ]),
    f("landing_page", "ランディングページ", false, ["ランディング ページ", "landing page"]),
    f("lp_sessions", "LPセッション", false, ["セッション", "sessions"]),
    f("view_fair", "view_fair", false),
    f("select_fair", "select_fair（CTAクリック）", false),
    f("form_start", "form_start", false),
    f("form_error", "form_error", false),
    f("generate_lead", "generate_lead（予約完了）", false),
  ],
  images: [
    f("file_name", "ファイル名", true, ["ファイル名"]),
    f("asset_id", "画像ID", true, ["画像id"]),
    f("title", "タイトル", false, ["タイトル"]),
    f("prompt", "生成指示", false, ["生成指示"]),
    f("target", "対象ターゲット", false, ["ターゲット"]),
    f("rights", "権利の状態", false, ["権利"]),
    f("expiry", "利用期限", false, ["期限", "利用期限"]),
  ],
};

/** 見出しの自動対応付け（大文字小文字・前後の空白は無視）。個人情報の列には対応付けない。 */
export function autoMap(
  kind: ImportKind,
  headers: readonly string[],
  isExcluded: (h: string) => boolean = () => false,
): Record<string, number> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const map: Record<string, number> = {};
  for (const field of FIELDS[kind]) {
    map[field.key] = norm.findIndex(
      (h, i) => !isExcluded(headers[i]!) && field.synonyms.some((s) => s.toLowerCase() === h),
    );
  }
  return map;
}
