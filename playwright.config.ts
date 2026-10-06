import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
import { defineConfig, devices } from "@playwright/test";

// 開発コンテナには固定版の Chromium が入っているので、あればそれを使う。
// CI では `npx playwright install chromium` で入れたものを使う。
const localChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const executablePath = !process.env.CI && existsSync(localChromium) ? localChromium : undefined;

const port = Number(process.env.E2E_PORT ?? 3100);

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
    env: { APP_URL: `http://127.0.0.1:${port}`, BREACHED_PASSWORD_CHECK: "off" },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
