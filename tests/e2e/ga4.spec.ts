// M2b：GA4 の自動取込。偽の GA4 サーバーで、取込・上書き・重複しないこと・他施設に入らないことを確かめる。
import { expect, test } from "@playwright/test";
import { startFakeGa4, type FakeGa4 } from "./support/fake-ga4";
import { admin, seed } from "./support/fixtures";
import { loginFully } from "./support/login";

test.describe.configure({ mode: "serial" });

let ids: Record<string, string> = {};
let fake: FakeGa4;
test.beforeAll(async () => {
  ids = await seed();
  fake = await startFakeGa4(Number(process.env.E2E_FAKE_GA4_PORT));
});
test.afterAll(async () => {
  await new Promise((r) => fake.server.close(r));
});

const funnelRows = async (code: string) =>
  (
    await admin()
      .from("funnel_event")
      .select("date, ad_id, landing_page, lp_sessions, select_fair, form_start, generate_lead")
      .eq("facility_id", ids[code]!)
      .order("date")
      .order("ad_id")
  ).data ?? [];

test("GA4 プロパティ ID を登録し、今すぐ取り込む（他施設には入らない）", async ({ page }) => {
  await loginFully(page, "mkt");
  await page.goto("/f/fac_A/dolphin");
  const panel = page.locator("#ga4");
  await expect(panel).toContainText("dolphin-create-e2e@example.iam.gserviceaccount.com");

  await panel.getByLabel("GA4 プロパティ ID（数字）").fill("G-ABC1234");
  await panel.getByRole("button", { name: "接続を保存" }).click();
  await expect(panel.locator(".notice[role=alert]")).toContainText("数字だけ");

  await panel.getByLabel("GA4 プロパティ ID（数字）").fill("123456789");
  await panel.getByRole("button", { name: "接続を保存" }).click();
  await expect(panel.locator(".notice[role=status]")).toContainText("保存しました");
  await page.reload();
  await expect(page.getByTestId("ga4-property")).toHaveText("123456789");

  await page.locator("#ga4").getByRole("button", { name: "今すぐ取り込む" }).click();
  await expect(page.locator("#ga4 .notice[role=status]")).toContainText("GA4 から 4件");
  const rows = await funnelRows("fac_A");
  expect(rows).toHaveLength(4);
  expect(rows.filter((r) => r.ad_id === "AM-01")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        landing_page: "/fair/tasting",
        lp_sessions: 100,
        select_fair: 20,
        form_start: 8,
        generate_lead: 3,
      }),
    ]),
  );
  expect(rows.find((r) => r.ad_id === "(not set)")).toMatchObject({
    lp_sessions: 30,
    generate_lead: 1,
  });
  expect(await funnelRows("fac_B")).toHaveLength(0);
  expect(
    fake.calls.every((c) => c.property === "123456789" && c.auth === "Bearer fake-access-token"),
  ).toBe(true);
});

test("2回取り込んでも重複しない。GA4 の値が変われば上書きする", async ({ page }) => {
  await loginFully(page, "mkt");
  await page.goto("/f/fac_A/dolphin");
  await page.locator("#ga4").getByRole("button", { name: "今すぐ取り込む" }).click();
  await expect(page.locator("#ga4 .notice[role=status]")).toContainText("変わりはありませんでした");
  expect(await funnelRows("fac_A")).toHaveLength(4);

  fake.setVersion(2);
  await page.locator("#ga4").getByRole("button", { name: "今すぐ取り込む" }).click();
  await expect(page.locator("#ga4 .notice[role=status]")).toContainText(
    "うち4件は登録済みの内容を更新",
  );
  const rows = await funnelRows("fac_A");
  expect(rows).toHaveLength(4);
  expect(rows.filter((r) => r.ad_id === "AM-01").every((r) => r.select_fair === 40)).toBe(true);
});

test("毎朝の自動取込：秘密のトークンがなければ動かず、あれば登録した施設を取り込む", async ({
  request,
}) => {
  expect((await request.get("/api/cron/ga4")).status()).toBe(404);
  expect(
    (await request.get("/api/cron/ga4", { headers: { Authorization: "Bearer wrong" } })).status(),
  ).toBe(404);

  fake.setVersion(3);
  const res = await request.get("/api/cron/ga4", {
    headers: { Authorization: `Bearer ${process.env.E2E_CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.results).toEqual([
    expect.objectContaining({ facility: "fac_A", status: "imported" }),
  ]);
  const { data: jobs } = await admin()
    .from("import_job")
    .select("run_label, run_by")
    .eq("facility_id", ids.fac_A!)
    .eq("kind", "ga4");
  expect(jobs).toEqual(expect.arrayContaining([{ run_label: "GA4（自動・日次）", run_by: null }]));
});

test("権限のない GA4 プロパティは、理由を画面に出す", async ({ page }) => {
  await loginFully(page, "mkt");
  await page.goto("/f/fac_B/dolphin");
  await page.locator("#ga4").getByLabel("GA4 プロパティ ID（数字）").fill("403403403");
  await page.locator("#ga4").getByRole("button", { name: "接続を保存" }).click();
  await expect(page.locator("#ga4 .notice[role=status]")).toContainText("保存しました");
  await page.locator("#ga4").getByRole("button", { name: "今すぐ取り込む" }).click();
  await expect(page.locator("#ga4 .notice[role=alert]")).toContainText("閲覧者");
  await page.reload();
  await expect(page.locator("#ga4")).toContainText("取込に失敗");
  expect(await funnelRows("fac_B")).toHaveLength(0);
});

test("会場担当は GA4 の接続を見られるが、設定はできない", async ({ page }) => {
  await loginFully(page, "staffA");
  await page.goto("/f/fac_A/dolphin");
  await expect(page.getByTestId("ga4-property")).toHaveText("123456789");
  await expect(page.locator("#ga4").getByRole("button", { name: "接続を保存" })).toHaveCount(0);
  await expect(page.locator("#ga4").getByRole("button", { name: "今すぐ取り込む" })).toHaveCount(0);
});
