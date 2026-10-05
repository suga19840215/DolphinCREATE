import { expect, test } from "@playwright/test";

test("トップページが日本語で表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dolphin CREATE" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});

test("画面はブラウザに保存させない（no-store）", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("稼働確認は ok だけを返す", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});
