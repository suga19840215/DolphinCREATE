import type { NextConfig } from "next";

// 画面は認証後のデータを含むため、既定でブラウザに保存させない
// （本番設計 受入テスト4：ログアウト後に「戻る」でデータが見えない）。
const securityHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 取込のファイルを受け取るため（公開先 Vercel の上限 約4.5MB に合わせる）
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
