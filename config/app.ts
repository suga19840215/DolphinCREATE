// アプリの設定値（秘密ではないもの）。変えるときはここを直す。
// 秘密情報はここに書かず、環境変数（.env.local／公開先のシークレット）に置く。

export const appConfig = {
  /** 表示のタイムゾーン（保存は UTC） */
  displayTimeZone: "Asia/Tokyo",
  /** 分析の最小母数の初期値（施設ごとに変更可） */
  defaultMinSampleSize: 10,
  /** Fee率の初期値（万分率。2000 = 20%） */
  defaultFeeRateBasisPoints: 2000,
  /** 署名URLの有効期限（秒） */
  signedUrlTtlSeconds: 600,
  /** 自動ログアウト：無操作 */
  idleTimeoutMinutes: 30,
  /** 自動ログアウト：ログインからの最長時間 */
  absoluteSessionHours: 12,
  /** AI のモデル（環境変数 AI_MODEL で上書きできる） */
  aiModel: "claude-opus-5-5",
  /**
   * ⑥ メディア評価測定の判定の目安（2026-10-14 初期値。運用で見直す）。
   * 率は 1 = 100%。単価は全媒体の平均単価に対する倍率。
   */
  mediaEvaluation: {
    target: { good: 1.0, warn: 0.8 }, // 目標比：100%以上は良好、80%以上は注意、それ未満は要改善
    lastYear: { good: 1.0, warn: 0.9 }, // 昨年比
    unitCost: { good: 1.0, warn: 1.3 }, // 来館単価・成約単価：平均以下は良好、平均の1.3倍までは注意
    areaShare: { warn: -0.1 }, // エリア平均比の昨年との差：0以上は良好、-10pt までは注意
    minVisits: 8, // 来館がこれ未満の媒体は「保留（小標本）」
  },
} as const;
