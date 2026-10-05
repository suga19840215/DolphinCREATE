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
} as const;
