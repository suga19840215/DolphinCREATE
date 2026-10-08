// 広告案の「特徴」の分類（2026-10-08 初期案）。学習の蓄積（docs/plan.md「学習の蓄積と最適化」）で、
// どの特徴の広告がその会場で成果を出したかを集計するために使う。
// コードは集計と AI への入力で使うので、一度使い始めたら変えない（名前・説明は変えてよい）。
// 会場ごとの追加は M4 で画面から登録する（会場の分は facility_id 付きで別に持つ）。

export type Choice = {
  code: string;
  label: string;
  description: string;
  /** 広告文・LP によく出る言葉（AI と自動の当てはめの手がかり） */
  keywords: readonly string[];
};

/** 訴求軸：広告で一番伝えたいこと（1案につき主1つ＋副2つまで） */
export const APPEAL_AXES = [
  {
    code: "cuisine",
    label: "料理・試食",
    description: "料理の味・見た目、試食フェア、シェフ、地元食材、アレルギー対応",
    keywords: ["試食", "フルコース", "シェフ", "料理", "地元食材", "ペアリング"],
  },
  {
    code: "chapel",
    label: "チャペル・挙式",
    description: "チャペルの光・天井・バージンロード、人前式・神前式など挙式の形",
    keywords: ["チャペル", "挙式", "バージンロード", "ステンドグラス", "人前式", "神前式"],
  },
  {
    code: "banquet",
    label: "披露宴会場",
    description: "会場の広さ・天井高・ガーデン・演出、ゲストとの距離",
    keywords: ["披露宴", "パーティ会場", "ガーデン", "天井高", "演出"],
  },
  {
    code: "location",
    label: "ロケーション・景色",
    description: "海・庭園・夜景・季節の景色など、その場所でしか見られない眺め",
    keywords: ["海", "庭園", "夜景", "景色", "絶景", "四季"],
  },
  {
    code: "private",
    label: "貸切・プライベート感",
    description: "一軒家・1日1組・他の組と会わない、自分たちだけの空間",
    keywords: ["貸切", "1日1組", "一軒家", "プライベート"],
  },
  {
    code: "price",
    label: "料金・見積の安心",
    description: "総額の目安、見積の分かりやすさ、追加費用・持込料、支払い方法",
    keywords: ["見積", "総額", "追加費用なし", "持込", "後払い", "費用"],
  },
  {
    code: "benefit",
    label: "特典・フェア限定",
    description: "成約特典・来館特典・期間限定の割引やプレゼント",
    keywords: ["特典", "限定", "割引", "プレゼント", "最大", "万円OFF"],
  },
  {
    code: "small",
    label: "少人数・家族婚",
    description: "家族だけ・少人数の会食や挙式、親族中心の式",
    keywords: ["少人数", "家族婚", "家族挙式", "会食", "親族"],
  },
  {
    code: "hospitality",
    label: "ゲストへのおもてなし",
    description: "ゲストが楽しめる・感謝を伝えられる、家族やゲストの満足",
    keywords: ["おもてなし", "ゲスト", "感謝", "両親", "家族の笑顔"],
  },
  {
    code: "dress",
    label: "衣裳・ドレス",
    description: "ドレス・和装の品揃え、試着、提携ショップ",
    keywords: ["ドレス", "試着", "和装", "白無垢", "衣裳"],
  },
  {
    code: "photo",
    label: "写真・フォト",
    description: "撮影スポット、前撮り・フォトウェディング、写真映え",
    keywords: ["前撮り", "フォト", "撮影", "写真", "映え"],
  },
  {
    code: "planner",
    label: "プランナー・スタッフ",
    description: "担当者の対応、準備のサポート、相談のしやすさ",
    keywords: ["プランナー", "スタッフ", "サポート", "相談", "担当"],
  },
  {
    code: "schedule",
    label: "日程・準備期間",
    description: "空き日程、短期間の準備、人気の季節、直近の日取り",
    keywords: ["空き日程", "短期準備", "3か月", "直近", "日程"],
  },
  {
    code: "maternity",
    label: "マタニティ・子連れ",
    description: "妊娠中・子連れでも安心な設備と配慮",
    keywords: ["マタニティ", "授かり婚", "パパママ婚", "子連れ", "キッズ"],
  },
  {
    code: "access",
    label: "アクセス・宿泊",
    description: "駅からの近さ、駐車場、送迎、遠方ゲストの宿泊",
    keywords: ["駅", "徒歩", "駐車場", "送迎", "宿泊"],
  },
  {
    code: "testimonial",
    label: "実例・先輩カップルの声",
    description: "実際の結婚式の様子、口コミ、先輩カップルの感想",
    keywords: ["実例", "口コミ", "先輩", "レポート", "体験談"],
  },
] as const satisfies readonly Choice[];

/** 画像に写っているもの（複数選べる） */
export const IMAGE_SUBJECTS = [
  { code: "couple", label: "新郎新婦", description: "2人が主役の写真", keywords: [] },
  { code: "guests", label: "ゲスト・家族", description: "ゲストや家族の表情・会話", keywords: [] },
  { code: "food", label: "料理", description: "料理・ケーキ・ドリンク", keywords: [] },
  { code: "chapel", label: "チャペル", description: "チャペルの内観・挙式の場面", keywords: [] },
  { code: "banquet", label: "披露宴会場", description: "会場の内観・装花・テーブル", keywords: [] },
  {
    code: "scenery",
    label: "外観・景色",
    description: "建物の外観・庭・海などの眺め",
    keywords: [],
  },
  { code: "dress", label: "衣裳", description: "ドレス・和装・小物", keywords: [] },
  { code: "staff", label: "スタッフ", description: "プランナー・シェフなどの人物", keywords: [] },
  {
    code: "text",
    label: "文字が主役",
    description: "特典・料金などの文字を大きく見せる画像",
    keywords: [],
  },
] as const satisfies readonly Choice[];

/** 画像の性質（1つずつ選ぶ） */
export const IMAGE_TRAITS = {
  source: [
    { code: "real", label: "実写" },
    { code: "generated", label: "生成" },
  ],
  people: [
    { code: "with_people", label: "人物あり" },
    { code: "no_people", label: "人物なし" },
  ],
  mood: [
    { code: "bright", label: "明るい・自然光" },
    { code: "elegant", label: "落ち着いた・上品" },
    { code: "warm", label: "温かい・家庭的" },
    { code: "dramatic", label: "印象的・夜・演出" },
  ],
} as const;

/** キャッチコピーの型（1つ選ぶ） */
export const COPY_TYPES = [
  {
    code: "question",
    label: "問いかけ型",
    description: "「〜で迷っていませんか？」と悩みに呼びかける",
    keywords: ["？", "ませんか"],
  },
  {
    code: "concrete",
    label: "数字・具体型",
    description: "人数・金額・時間など数字で具体的に示す",
    keywords: ["名", "万円", "分"],
  },
  {
    code: "benefit",
    label: "特典型",
    description: "特典・限定を前面に出す",
    keywords: ["特典", "限定"],
  },
  {
    code: "reassure",
    label: "不安の解消型",
    description: "費用・準備・当日の不安を和らげる",
    keywords: ["安心", "なし", "大丈夫"],
  },
  {
    code: "sensory",
    label: "体験・五感型",
    description: "味・光・空気など体験を言葉で描く",
    keywords: ["味わう", "光", "香り"],
  },
  {
    code: "voice",
    label: "声・実例型",
    description: "先輩カップルの言葉や実例を使う",
    keywords: ["「", "先輩", "実例"],
  },
  {
    code: "deadline",
    label: "期日・残りわずか型",
    description: "日付・残り枠で今動く理由をつくる",
    keywords: ["まで", "残り", "今だけ"],
  },
] as const satisfies readonly Choice[];

/** 広告の形式（媒体ごと） */
export const AD_FORMATS = [
  { code: "search_text", label: "検索広告（テキスト）" },
  { code: "image_feed", label: "静止画（フィード 4:5・1:1）" },
  { code: "image_story", label: "静止画（ストーリーズ・リール 9:16）" },
  { code: "carousel", label: "カルーセル" },
  { code: "video_short", label: "縦型の短い動画（15秒まで）" },
  { code: "video_long", label: "動画（16秒以上）" },
  { code: "display", label: "ディスプレイ・デマンドジェネレーション（1.91:1）" },
] as const;

export type AppealAxisCode = (typeof APPEAL_AXES)[number]["code"];
export type CopyTypeCode = (typeof COPY_TYPES)[number]["code"];
