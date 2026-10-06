// M2 の終わりの条件：サンプルCSVで、除外・伏せ字・重複判定が試作版と同じ結果になる。
// あわせて、取込の権限・施設ごとの分離・二重取込の防止を画面から確かめる。
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { admin, seed } from "./support/fixtures";
import { loginFully } from "./support/login";

test.describe.configure({ mode: "serial" });

let ids: Record<string, string> = {};
test.beforeAll(async () => {
  ids = await seed();
});

const sample = readFileSync("seed/samples/dolphin_consult_sample_fac_A.csv");
const csv = (name: string, text: string) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});

async function openImport(page: Page, tab: string) {
  await page.goto("/f/fac_A/dolphin");
  await page.getByRole("tab", { name: tab }).click();
}

test("接客データ：サンプルCSVの判定が試作版と同じ（取込可10・重複1・欠損1・同意なし1・他施設1・個人情報の列1・伏せ字1）", async ({
  page,
}) => {
  await loginFully(page, "mkt");
  await openImport(page, "接客データ（Dolphin）");
  await page
    .getByLabel("接客データ（Dolphin）のCSV")
    .setInputFiles({ name: "sample.csv", mimeType: "text/csv", buffer: sample });

  for (const pill of [
    "14行",
    "取込可 10",
    "重複 1",
    "必須欠損 1",
    "広告改善の同意なし 1",
    "他施設のデータ 1",
    "個人情報の列 1（除外）",
    "発言内の連絡先を伏せ字 1",
  ]) {
    await expect(page.getByText(pill, { exact: true })).toBeVisible();
  }
  // プレビューでも、メールの列は「（除外）」、電話番号は伏せ字
  await expect(page.getByText("user0@example.com")).toHaveCount(0);
  await expect(page.getByText("資料は ［電話］ に送ってほしいと話していた")).toBeVisible();

  await page.getByRole("button", { name: "10件を会場Aに取り込む" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText("10件を取り込みました");

  const row = page.locator("tbody tr").filter({ hasText: "sample.csv" });
  await expect(row.locator("td.r")).toHaveText(["14", "10", "0", "1", "1", "1", "1", "0", "1"]);
  await expect(row).toContainText("email（除外）");

  // DB にも個人情報は入っていない
  const { data } = await admin()
    .from("transcript_segment")
    .select("text_masked")
    .eq("facility_id", ids.fac_A!);
  const all = JSON.stringify(data);
  expect(data?.length).toBe(10);
  expect(all).not.toMatch(/@example\.com|090-1234-5678/);
  expect(all).toContain("［電話］");
});

test("同じファイルは二度取り込めない", async ({ page }) => {
  await loginFully(page, "mkt");
  await openImport(page, "接客データ（Dolphin）");
  await page
    .getByLabel("接客データ（Dolphin）のCSV")
    .setInputFiles({ name: "sample.csv", mimeType: "text/csv", buffer: sample });
  await expect(page.getByText("このファイルは取込済みです")).toBeVisible();
  await expect(page.getByRole("button", { name: /件を会場Aに取り込む/ })).toBeDisabled();
});

test("項目の対応付けを変えると数え直す（必須を外すと全行が欠損）", async ({ page }) => {
  await loginFully(page, "mkt");
  await openImport(page, "接客データ（Dolphin）");
  await page
    .getByLabel("接客データ（Dolphin）のCSV")
    .setInputFiles(csv("x.csv", "接客ID,リードID,施設ID,広告改善同意\nZ-1,L-1,fac_A,1\n"));
  await expect(page.getByText("取込可 1", { exact: true })).toBeVisible();
  await page.getByLabel("対応付け：広告改善への同意").selectOption("-1");
  await expect(page.getByText("必須欠損 1", { exact: true })).toBeVisible();
  await expect(page.getByText("取込可 0", { exact: true })).toBeVisible();
});

test("広告実績：2回取り込んでも重複せず、上書きされる", async ({ page }) => {
  await loginFully(page, "mkt");
  await openImport(page, "広告実績（Google広告・Meta）");
  const head = "日,広告 ID,広告名,表示回数,クリック数,費用,コンバージョン\n";
  await page
    .getByLabel("広告実績（Google広告・Meta）のCSV")
    .setInputFiles(
      csv(
        "ads1.csv",
        head +
          '2026/09/01,M-01,前菜と海,1000,10,"1,234",1\n2026/09/02,M-01,前菜と海,900,9,1000,0\n',
      ),
    );
  await expect(page.getByText("取込可 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "2件を会場Aに取り込む" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText("2件を取り込みました");

  await page
    .getByLabel("広告実績（Google広告・Meta）のCSV")
    .setInputFiles(csv("ads2.csv", head + "2026/09/02,M-01,前菜と海,950,12,1100,1\n"));
  await expect(page.getByText("うち更新 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "1件を会場Aに取り込む" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText("登録済みの内容を更新");

  const { data } = await admin()
    .from("media_daily_metric")
    .select("date, clicks, cost_yen")
    .eq("facility_id", ids.fac_A!)
    .order("date");
  expect(data).toEqual([
    { date: "2026-09-01", clicks: 10, cost_yen: 1234 },
    { date: "2026-09-02", clicks: 12, cost_yen: 1100 },
  ]);
});

test("CRM：広告IDのある予約だけを広告に結び、計測紐付け率を出す", async ({ page }) => {
  await loginFully(page, "mkt");
  await openImport(page, "予約・来館・成約（CRM）");
  const d = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const text =
    "lead_id,facility_id,予約日時,utm_source,utm_content,成約結果,氏名\n" +
    `L-1,fac_A,${d(3)} 10:00,instagram,M-01,成約,山田\n` +
    `L-2,fac_A,${d(4)} 10:00,,,見積中,佐藤\n` +
    `L-3,fac_B,${d(4)} 10:00,,,,他施設\n`;
  await page.getByLabel("予約・来館・成約（CRM）のCSV").setInputFiles(csv("crm.csv", text));
  await expect(page.getByText("他施設のデータ 1", { exact: true })).toBeVisible();
  await expect(page.getByText("個人情報の列 1（除外）", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "2件を会場Aに取り込む" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText("2件を取り込みました");
  await page.reload();
  await expect(page.getByTestId("link-rate")).toHaveText("50.0%");
  const { data } = await admin()
    .from("crm_lead")
    .select("lead_id, ad_id, outcome")
    .eq("facility_id", ids.fac_A!)
    .order("lead_id");
  expect(data).toEqual([
    { lead_id: "L-1", ad_id: "M-01", outcome: "contracted" },
    { lead_id: "L-2", ad_id: null, outcome: "pending" },
  ]);
});

test("生成画像：権利確認中・未承認で取り込まれ、施設のフォルダに保存される", async ({ page }) => {
  await loginFully(page, "mkt");
  await openImport(page, "Dolphin生成画像（情報CSV）");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .locator('input[name="images"]')
    .setInputFiles([{ name: "dusk.png", mimeType: "image/png", buffer: png }]);
  await page
    .locator('input[name="info"]')
    .setInputFiles(
      csv(
        "info.csv",
        "file_name,asset_id,title,prompt,expiry\ndusk.png,DOL-201,チャペル夕景,構造は変えない,2026-12-31\n",
      ),
    );
  await page.getByRole("button", { name: "取り込む" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText("1枚を取り込みました");
  const { data } = await admin()
    .from("asset")
    .select("code, kind, rights_status, approval_status, storage_path, expires_on")
    .eq("facility_id", ids.fac_A!);
  expect(data).toEqual([
    {
      code: "DOL-201",
      kind: "generated",
      rights_status: "checking",
      approval_status: "unapproved",
      storage_path: `${ids.fac_A}/assets/dolphin/DOL-201.png`,
      expires_on: "2026-12-31",
    },
  ]);
});

test("マーケットレポート：同じ版は二重に入らない", async ({ page }) => {
  await loginFully(page, "mkt");
  await openImport(page, "マーケットレポート（JSON）");
  const report = {
    report_id: "MR-202609-001",
    facility_id: "fac_A",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    created_at: "2026-10-05T10:00:00+09:00",
    version: 1,
    area: "神奈川県・湘南エリア",
    sample_size: 128,
    source: "自社調査",
    price_bands: [{ band: "300-350万", share: 0.28 }],
  };
  const file = {
    name: "mr.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report)),
  };
  await page.locator('input[name="file"]').setInputFiles(file);
  await page.getByRole("button", { name: "取り込む" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText("1件を取り込みました");
  await page.locator('input[name="file"]').setInputFiles({
    ...file,
    name: "mr-copy.json",
    buffer: Buffer.from(JSON.stringify(report) + "\n"),
  });
  await page.getByRole("button", { name: "取り込む" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("同じレポートの同じ版は取込済み");
});

test("会場担当には取込の画面がなく、取込履歴は自施設だけ見える。会場Bの担当には会場Aの取込が見えない", async ({
  page,
}) => {
  await loginFully(page, "staffA");
  await page.goto("/f/fac_A/dolphin");
  await expect(
    page.getByText("取込は、マーケ・データ（Aさん）と施設管理者が行います"),
  ).toBeVisible();
  await expect(page.getByText("sample.csv")).toBeVisible();

  await page.context().clearCookies();
  await loginFully(page, "staffB");
  await page.goto("/f/fac_B/dolphin");
  await expect(page.getByText("sample.csv")).toHaveCount(0);
  expect((await page.request.get("/f/fac_A/dolphin")).status()).toBe(404);
  expect((await page.request.get("/f/fac_A/dolphin/template?kind=consultation")).status()).toBe(
    404,
  );
});
