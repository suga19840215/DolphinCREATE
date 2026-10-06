import { expect, test } from "@playwright/test";

test("ログインしていなければログイン画面へ", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});

test("画面はブラウザに保存させない（no-store）", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("稼働確認は ok だけを返す", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});
