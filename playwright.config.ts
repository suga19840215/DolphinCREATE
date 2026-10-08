import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
import { defineConfig, devices } from "@playwright/test";

// 開発コンテナには固定版の Chromium が入っているので、あればそれを使う。
// CI では `npx playwright install chromium` で入れたものを使う。
const localChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const executablePath = !process.env.CI && existsSync(localChromium) ? localChromium : undefined;

const port = Number(process.env.E2E_PORT ?? 3100);

// GA4 の取込は、テストでは偽の GA4 サーバー（tests/e2e/support/fake-ga4.ts）へ向ける。
// 鍵はテストのたびに作る使い捨て。本物の Google には一切つながない。
const fakeGa4Port = Number(process.env.E2E_FAKE_GA4_PORT ?? 3199);
process.env.E2E_FAKE_GA4_PORT = String(fakeGa4Port);
process.env.E2E_CRON_SECRET ??= "e2e-cron-secret";
if (!process.env.E2E_GA4_KEY) {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.E2E_GA4_KEY = JSON.stringify({
    client_email: "dolphin-create-e2e@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  });
}

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: 0,
  // 受入テストは同じテスト用アカウントを使うので、1つずつ順に動かす
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    env: {
      APP_URL: `http://127.0.0.1:${port}`,
      BREACHED_PASSWORD_CHECK: "off",
      CRON_SECRET: process.env.E2E_CRON_SECRET!,
      GA4_SERVICE_ACCOUNT_JSON: process.env.E2E_GA4_KEY!,
      GA4_API_BASE: `http://127.0.0.1:${fakeGa4Port}`,
      GOOGLE_TOKEN_URL: `http://127.0.0.1:${fakeGa4Port}/token`,
    },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
