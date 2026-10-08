// ⑤ 予約・来館・成約：GA4 の切り口別レポートと、予約台帳での来館・成約。偽の GA4 サーバーの値で確かめる。
import { expect, test } from "@playwright/test";
import { startFakeGa4, type FakeGa4 } from "./support/fake-ga4";
import { admin, seed } from "./support/fixtures";
import { loginFully } from "./support/login";

test.describe.configure({ mode: "serial" });

let ids: Record<string, string> = {};
let fake: FakeGa4;
const yesterday = new Date(Date.now() + 9 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  ids = await seed();
  fake = await startFakeGa4(Number(process.env.E2E_FAKE_GA4_PORT));

  // 予約台帳と広告実績（Meta の広告 AM-01）を直接入れる
  const a = admin();
  const { data: job, error } = await a
    .from("import_job")
    .insert({
      facility_id: ids.fac_A!,
      kind: "crm",
      file_name: "e2e.csv",
      file_sha256: "f".repeat(64),
    })
    .select("id")
    .single();
  if (error || !job) throw error;
  await a.from("media_daily_metric").insert({
    facility_id: ids.fac_A!,
    date: yesterday,
    media: "meta",
    ad_id: "AM-01",
    ad_name: "試食フェア 縦型",
    impressions: 10000,
    clicks: 200,
    cost_yen: 300000,
    media_reported_cv: 10,
    import_job_id: job.id,
  });
  const at = `${yesterday}T03:00:00Z`;
  await a.from("crm_lead").insert([
    ...Array.from({ length: 12 }, (_, i) => ({
      facility_id: ids.fac_A!,
      lead_id: `L-${i}`,
      reserved_at: at,
      is_valid: true,
      ad_id: "AM-01",
      visited_at: i < 9 ? at : null,
      outcome: i < 3 ? ("contracted" as const) : null,
      gross_profit_yen: i < 3 ? 400000 : null,
      import_job_id: job.id,
    })),
    {
      facility_id: ids.fac_A!,
      lead_id: "L-tel-1",
      reserved_at: at,
      is_valid: true,
      import_job_id: job.id,
    },
    {
      facility_id: ids.fac_A!,
      lead_id: "L-tel-2",
      reserved_at: at,
      is_valid: true,
      import_job_id: job.id,
    },
  ]);
});
test.afterAll(async () => {
  await new Promise((r) => fake.server.close(r));
});

test("GA4 を取り込む前は、接続の案内を出す", async ({ page }) => {
  await loginFully(page, "mkt");
  await page.goto("/f/fac_A/funnel");
  await expect(page.getByRole("heading", { name: "予約・来館・成約" })).toBeVisible();
  await expect(page.getByText("この期間の GA4 のデータがありません")).toBeVisible();
  // 予約台帳の部分は GA4 がなくても出る
  await expect(page.getByTestId("contracts")).toContainText("3");
});

test("GA4 を取り込むと、予約の完了・流入元・途中離脱・端末・時間帯が出る", async ({ page }) => {
  await loginFully(page, "mkt");
  await page.goto("/f/fac_A/dolphin");
  await page.locator("#ga4").getByLabel("GA4 プロパティ ID（数字）").fill("123456789");
  await page.locator("#ga4").getByRole("button", { name: "接続を保存" }).click();
  await expect(page.locator("#ga4 .notice[role=status]")).toContainText("保存しました");
  await page.locator("#ga4").getByRole("button", { name: "今すぐ取り込む" }).click();
  await expect(page.locator("#ga4 .notice[role=status]").last()).toContainText(
    "ホームページの切り口別",
  );

  await page.getByRole("link", { name: "予約・来館・成約" }).click();
  await expect(page).toHaveURL(/\/f\/fac_A\/funnel$/);
  // 端末別の合計：訪問 600・予約完了 36（予約完了セッション割合 6.00%）。資料請求・問い合わせは別に数える
  await expect(page.getByTestId("bookings")).toContainText("36");
  await expect(page.getByTestId("booking-rate")).toHaveText("6.00%");
  const completion = page.getByTestId("completion");
  await expect(completion.locator(".kpi", { hasText: "資料請求" })).toContainText("12");
  await expect(completion.locator(".kpi", { hasText: "問い合わせ" })).toContainText("6");

  const channels = page.getByTestId("channels").locator("tbody tr");
  await expect(channels).toHaveCount(4);
  await expect(channels.nth(0)).toContainText("Google広告");
  await expect(channels.filter({ hasText: "式場紹介サイト" })).toContainText("600");
  await expect(channels.filter({ hasText: "Instagram広告" })).toContainText("6.0%");

  const drop = page.getByTestId("drop");
  await expect(drop).toContainText("予約ボタン");
  await expect(drop).toContainText("60.0%"); // フェア詳細閲覧 300 → 予約ボタン 120

  const sp = page.getByTestId("devices").locator("tr", { hasText: "スマートフォン" });
  await expect(sp.locator("td")).toHaveText([
    "スマートフォン",
    "200",
    "12",
    "6.0%",
    "20",
    "40.0%",
    "20.0%",
  ]);
  await expect(page.getByTestId("newret")).toContainText("再訪問");
  await expect(page.getByTestId("regions")).toContainText("Kanagawa");
  await expect(page.getByTestId("hours").locator("> div")).toHaveCount(24);
  await expect(page.getByText(/^\d+\.\s/)).toHaveCount(0); // 見出しに番号を付けない
});

test("ページの分類を登録すると、フェア・プラン別とコンテンツ別に出る", async ({ page }) => {
  await loginFully(page, "mkt");
  await page.goto("/f/fac_A/funnel");
  await expect(page.getByTestId("fair-plan")).toHaveCount(0);
  const pages = page.locator("#pages");

  await pages.getByLabel("URL の始まり").fill("fair tasting");
  await pages.getByLabel("名前").fill("試食フェア");
  await pages.getByRole("button", { name: "登録" }).click();
  await expect(pages.locator(".notice[role=alert]")).toContainText("/ で始まる");

  await pages.getByLabel("URL の始まり").fill("/fair/tasting/");
  await pages.getByLabel("名前").fill("試食フェア");
  await pages.getByLabel("種類").selectOption("fair");
  await pages.getByRole("button", { name: "登録" }).click();
  await expect(pages.locator(".notice[role=status]")).toContainText(
    "/fair/tasting を「試食フェア」",
  );

  // 未分類ページから「分類する」で URL を入れて登録
  await pages.getByText("分類していないページ").click();
  await page
    .getByTestId("unclassified")
    .locator("tr", { hasText: "/chapel" })
    .getByRole("link", { name: "分類する" })
    .click();
  await expect(pages.getByLabel("URL の始まり")).toHaveValue("/chapel");
  await pages.getByLabel("名前").fill("チャペル");
  await pages.getByLabel("種類").selectOption("content");
  await pages.getByRole("button", { name: "登録" }).click();
  await expect(pages.locator(".notice[role=status]")).toContainText("チャペル");

  await page.reload();
  const fair = page.getByTestId("fair-plan").locator("tr", { hasText: "試食フェア" });
  await expect(fair).toContainText("500"); // 閲覧数 250 × 2日
  await expect(fair).toContainText("48"); // 予約ボタン 24 × 2日
  await expect(page.getByTestId("content").locator("tr", { hasText: "チャペル" })).toContainText(
    "1,000",
  );
  await expect(page.getByTestId("landing")).toContainText("試食フェア");
  await expect(page.getByTestId("rules").locator("tbody tr")).toHaveCount(2);

  const { data: ops } = await admin()
    .from("operation_log")
    .select("action")
    .eq("facility_id", ids.fac_A!);
  expect((ops ?? []).map((o) => o.action)).toEqual(expect.arrayContaining(["ページの分類を登録"]));
});

test("予約台帳：段階別通過率・3つの計測値・広告別の診断", async ({ page }) => {
  await loginFully(page, "mkt");
  await page.goto("/f/fac_A/funnel");
  await expect(page.getByTestId("contracts")).toContainText("3");
  await expect(page.getByTestId("stuck")).toContainText("目安の8割を下回る段階はありません");
  const meta = page.getByTestId("three").locator("tr", { hasText: "Meta" });
  await expect(meta.locator("td")).toHaveText(["Meta（Instagram）", "10", "6", "12"]);
  await expect(
    page.getByTestId("three").locator("tr", { hasText: "広告以外・判定不能" }),
  ).toContainText("2");
  const ad = page.getByTestId("ads").locator("tbody tr").first();
  await expect(ad).toContainText("試食フェア 縦型");
  await expect(ad).toContainText("100,000円"); // 成約単価 300,000 ÷ 3
  await expect(ad).toContainText("目立つ詰まりなし");
  await expect(ad).toContainText("継続");
});

test("他の会場のデータは出ない", async ({ page }) => {
  await loginFully(page, "mkt");
  await page.goto("/f/fac_B/funnel");
  await expect(page.getByText("この期間の GA4 のデータがありません")).toBeVisible();
  await expect(page.getByText("この期間の広告実績・予約台帳のデータがありません")).toBeVisible();
  await expect(page.getByTestId("rules")).toHaveCount(0);
});

test("会場担当は見られるが、ページの分類は登録できない。他の会場は開けない", async ({ page }) => {
  await loginFully(page, "staffA");
  await page.goto("/f/fac_A/funnel");
  await expect(page.getByTestId("bookings")).toContainText("36");
  await expect(page.getByTestId("rules").getByRole("button", { name: /削除/ })).toHaveCount(0);
  await expect(page.locator("#pages").getByRole("button", { name: "登録" })).toHaveCount(0);
  const res = await page.goto("/f/fac_B/funnel");
  expect(res?.status()).toBe(404);
});
