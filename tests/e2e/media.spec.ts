// ⑥ メディア評価測定：資料（Excel・PDF）を入れる → 確かめて確定 → 媒体別の評価・合致・AI の補足。
// AI は偽のサーバー（support/fake-ai.ts）。他の会場に入らないこと、閲覧だけの人は変えられないことも確かめる。
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { startFakeAi, type FakeAi } from "./support/fake-ai";
import { admin, seed } from "./support/fixtures";
import { loginFully } from "./support/login";

test.describe.configure({ mode: "serial" });

let ids: Record<string, string> = {};
let fake: FakeAi;
let xlsx: Buffer;

test.beforeAll(async () => {
  ids = await seed();
  fake = await startFakeAi(Number(process.env.E2E_FAKE_AI_PORT));

  // 会場の掲載実績（9月）：tests/e2e/fixtures/media_2026_09.xlsx（媒体・メニュー・金額・来館・目標・成約・昨年の値・合計行・単価の列）。
  // 3行目の「ゼクシィ」は本誌・NET・なびのどれか分からないので、確認画面で選ぶ
  xlsx = readFileSync("tests/e2e/fixtures/media_2026_09.xlsx");

  // ゼクシィ本誌から来館した接客（Dolphin）：10人とも「料理」を重視
  const a = admin();
  const { data: job } = await a
    .from("import_job")
    .insert({
      facility_id: ids.fac_A!,
      kind: "consultation",
      file_name: "e2e.csv",
      file_sha256: "c".repeat(64),
    })
    .select("id")
    .single();
  const { data: sessions } = await a
    .from("consultation_session")
    .insert(
      Array.from({ length: 10 }, (_, i) => ({
        facility_id: ids.fac_A!,
        external_id: `M-${i}`,
        lead_id: `ML-${i}`,
        consulted_at: "2026-09-10T03:00:00Z",
        source: "ゼクシィ本誌",
        cluster_code: "C1",
        age_band: "25-29",
        area_band: "横浜市",
        import_job_id: job!.id,
      })),
    )
    .select("id");
  await a.from("customer_insight").insert(
    sessions!.map((s) => ({
      facility_id: ids.fac_A!,
      consultation_id: s.id,
      kind: "priority",
      label: "料理の美味しさ",
      rank: 1,
    })),
  );
});
test.afterAll(async () => {
  await new Promise((r) => fake.server.close(r));
});

const open = async (page: Page, q = "?from=2026-09&to=2026-09") => {
  await page.goto(`/f/fac_A/media${q}`);
  await expect(page.getByRole("heading", { name: "メディア評価測定", level: 1 })).toBeVisible();
};
const upload = async (page: Page, name: string, mimeType: string, buffer: Buffer) => {
  await page.getByLabel("資料のファイル").setInputFiles({ name, mimeType, buffer });
  await page.getByRole("button", { name: "読み取る" }).click();
};
const row2 = (page: Page, label: string) =>
  page
    .getByTestId("media-eval2")
    .locator("tbody tr", { has: page.locator("th", { hasText: label }) });
const row = (page: Page, label: string) =>
  page
    .getByTestId("media-eval")
    .locator("tbody tr", { has: page.locator("th", { hasText: label }) });

test("Excel の資料を表から読み取り、媒体を選んで確定すると、媒体別の評価が出る", async ({
  page,
}) => {
  await loginFully(page, "mkt");
  await page.getByRole("link", { name: "メディア評価測定" }).click();
  await expect(page).toHaveURL(/\/f\/fac_A\/media$/);
  await expect(page.getByText("この期間の媒体のデータがありません")).toBeVisible();

  await upload(
    page,
    "media_2026_09.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsx,
  );
  await expect(page.locator("#docs .notice[role=status]")).toContainText(
    "表から3行を読み取りました",
  );
  const draft = page.getByTestId("draft");
  await expect(draft.locator("tbody tr")).toHaveCount(3);
  await expect(draft.getByLabel("1行目 媒体")).toHaveValue("zexy_magazine");
  await expect(draft.getByLabel("1行目 掲載金額")).toHaveValue("800000");
  await expect(draft.getByLabel("2行目 来館")).toHaveValue("12");
  await expect(draft.getByLabel("1行目 月")).toHaveValue("2026-09"); // シート名の月
  // 区分の分からない「ゼクシィ」は、選ぶまで確定できない
  await expect(page.getByRole("button", { name: "確定して評価に入れる" })).toBeDisabled();
  await draft.getByLabel("3行目 媒体").selectOption("zexy_net");
  await page.getByRole("button", { name: "確定して評価に入れる" }).click();
  await expect(
    page.locator("#docs .notice[role=status]", { hasText: "確定しました" }),
  ).toContainText("確定しました（媒体×月 5行、エリア平均 0行）");

  await open(page);
  await expect(page.getByTestId("total-visits")).toContainText("34");
  const z = row(page, "ゼクシィ本誌");
  await expect(z).toContainText("800,000円");
  await expect(z).toContainText("80%"); // 目標比 20 ÷ 25
  await expect(z).toContainText("111%"); // 昨年比 20 ÷ 18
  await expect(z).toContainText("40,000円"); // 来館単価
  await expect(z).toContainText("133,333円"); // 成約単価（切り捨て）
  const h = row(page, "ハナユメ");
  await expect(h).toContainText("120%"); // 目標比 12 ÷ 10
  await expect(h).toContainText("25,000円");
  await expect(row(page, "ゼクシィNET")).toContainText("保留（小標本）");
  await expect(page.getByTestId("media-months")).toContainText("来館 20・成約 6");

  // 同じ資料は二重に入らない
  await upload(
    page,
    "media_2026_09.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsx,
  );
  await expect(page.locator("#docs .notice[role=alert]")).toContainText(
    "同じ資料はすでに確定しています",
  );
  // 古い形式は読めないと伝える
  await upload(page, "old.xls", "application/vnd.ms-excel", Buffer.from("x"));
  await expect(page.locator("#docs .notice[role=alert]")).toContainText("古い形式");
});

test("PDF は AI が読み取り（P0 を先頭に付け、連絡先を含めない）、エリア平均比が出る", async ({
  page,
}) => {
  fake.reply.sheet = {
    rows: [
      {
        kind: "area",
        month: "2026-09",
        outlet: "zexy_magazine",
        outlet_text: "ゼクシィ本誌",
        menu: "",
        cost_yen: null,
        visits: null,
        contracts: null,
        target_visits: null,
        last_visits: null,
        last_contracts: null,
        area: "横浜",
        area_avg_visits: 16,
        area_avg_contracts: 4,
      },
      {
        kind: "area",
        month: "2025-09",
        outlet: "zexy_magazine",
        outlet_text: "ゼクシィ本誌",
        menu: "",
        cost_yen: null,
        visits: null,
        contracts: null,
        target_visits: null,
        last_visits: null,
        last_contracts: null,
        area: "横浜",
        area_avg_visits: 18,
        area_avg_contracts: 5,
      },
      {
        kind: "result",
        month: "2026-09",
        outlet: null,
        outlet_text: "みんなのW",
        menu: "",
        cost_yen: 150000,
        visits: 3,
        contracts: 1,
        target_visits: null,
        last_visits: null,
        last_contracts: null,
        area: "",
        area_avg_visits: null,
        area_avg_contracts: null,
      },
    ],
    notes: ["2ページ目は読み取り対象外"],
  };
  await loginFully(page, "mkt");
  await open(page);
  await upload(page, "zexy_area.pdf", "application/pdf", Buffer.from("%PDF-1.4\n% e2e\n"));
  await expect(page.locator("#docs .notice[role=status]")).toContainText(
    "AI が3行を読み取りました",
  );
  const call = fake.calls.at(-1)!;
  expect(call.system.startsWith("あなたはDolphin CREATEのブライダル広告分析・制作支援AIです")).toBe(
    true,
  );
  expect(call.system).toContain("M1｜掲載媒体・掲載金額の資料の読み取り");
  expect(call.contentTypes).toEqual(["document", "text"]);
  expect(call.model).toBe("claude-opus-5-5");

  const draft = page.getByTestId("draft");
  await expect(draft.getByLabel("3行目 媒体")).toHaveValue("minna"); // 「みんなのW」をこちらで当てはめる
  await page.getByRole("button", { name: "確定して評価に入れる" }).click();
  await expect(
    page.locator("#docs .notice[role=status]", { hasText: "確定しました" }),
  ).toContainText("エリア平均 2行");

  await open(page);
  const z = row2(page, "ゼクシィ本誌");
  await expect(z).toContainText("125%"); // 20 ÷ 16
  await expect(z).toContainText("昨年 100%"); // 18 ÷ 18
  await expect(z).toContainText("上昇");
  await expect(z).toContainText("横浜");
  await expect(row(page, "みんなのウェディング")).toContainText("150,000円");

  const { data: logs } = await admin()
    .from("ai_run_log")
    .select("purpose, model, prompt_version, input, schema_valid")
    .eq("facility_id", ids.fac_A!);
  expect(logs).toEqual([
    expect.objectContaining({
      purpose: "M1 媒体資料の読み取り",
      model: "claude-opus-5-5",
      prompt_version: "m1-2026-10-14",
      schema_valid: true,
    }),
  ]);
  expect(JSON.stringify(logs![0]!.input)).not.toContain("%PDF"); // ファイル本体は記録しない
});

test("見出しのない表は AI で読み取り、送る前に連絡先を伏せる", async ({ page }) => {
  fake.reply.sheet = { rows: [], notes: [] };
  await loginFully(page, "mkt");
  await open(page);
  const csv = Buffer.from("9月,10月\n担当 info@zexy.example 03-1234-5678,\n800000,600000\n");
  await upload(page, "plan.csv", "text/csv", csv);
  await expect(page.locator("#docs .notice[role=alert]")).toContainText("読み取れませんでした");
  const sent = fake.calls.at(-1)!.text;
  expect(sent).toContain("800000");
  expect(sent).not.toContain("info@zexy.example");
  expect(sent).not.toContain("03-1234-5678");
});

test("TOP 広告を登録すると、来館メイン顧客との合致が出て、AI が理由と改善案を補足する", async ({
  page,
}) => {
  fake.reply.match = {
    reason: "来館客10人の100%が料理を重視しています。",
    visual_suggestion: "料理の写真をメインにします。",
    catch_suggestions: ["シェフの一皿を試食で", "料理で選ぶ結婚式", "ゲストが喜ぶフルコース"],
    caution: "来館客が30人未満のため参考値です。",
  };
  await loginFully(page, "mkt");
  await open(page);
  const card = page.getByTestId("match-zexy_magazine");
  await expect(card).toContainText("料理・試食 100%");
  await expect(card).toContainText("広告未登録");

  const form = page.locator("#match");
  // TOP 広告がまだないので、登録の欄は最初から開いている
  await form.getByLabel("媒体").selectOption("zexy_magazine");
  await form.getByLabel("TOP 広告のキャッチコピー").fill("シェフこだわりの試食フェア");
  await form.getByRole("button", { name: "キャッチから当てはめる" }).click();
  await expect(form.locator('input[name="catch_axes"][value="cuisine"]')).toBeChecked();
  await form.locator('input[name="visual_axes"][value="chapel"]').check();
  await form.getByLabel("メインビジュアル（画像・任意）").setInputFiles({
    name: "top.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await form.getByRole("button", { name: "TOP 広告を保存" }).click();
  await expect(form.locator(".notice[role=status]")).toContainText(
    "ゼクシィ本誌の TOP 広告を保存しました",
  );

  await open(page);
  await expect(card).toContainText("ビジュアル");
  await expect(card.locator(".pill", { hasText: "不一致" })).toBeVisible(); // ビジュアルはチャペル
  await expect(card.locator(".pill", { hasText: "合致" }).first()).toBeVisible(); // キャッチは料理
  await expect(card.locator("img")).toHaveAttribute("src", /token=/);
  const z = row2(page, "ゼクシィ本誌");
  await expect(z.locator("td").nth(3)).toContainText("不一致");
  await expect(z.locator("td").nth(4)).toContainText("合致");

  await card.getByRole("button", { name: "AI の補足（理由と改善案）" }).click();
  await expect(card.getByTestId("ai-comment")).toContainText("料理で選ぶ結婚式");
  const sent = JSON.parse(fake.calls.at(-1)!.text);
  expect(sent).toMatchObject({
    facility_id: ids.fac_A,
    outlet: "ゼクシィ本誌",
    visitors: { n: 10 },
    system_judgement: { visual: "不一致", catch: "合致" },
  });
  expect(fake.calls.at(-1)!.text).not.toContain("ML-"); // lead_id などの個人単位の値は送らない
});

test("目標などの数値を入力・修正できる（空欄の項目は変えない）", async ({ page }) => {
  await loginFully(page, "mkt");
  await open(page);
  const f = page.locator("section", {
    has: page.getByRole("heading", { name: "数値の入力・修正" }),
  });
  await f.getByLabel("月").fill("2026-09");
  await f.getByLabel("媒体").selectOption("zexy_net");
  await f.getByLabel("目標来館").fill("4");
  await f.getByRole("button", { name: "保存" }).click();
  await expect(f.locator(".notice[role=status]")).toContainText(
    "ゼクシィNET（2026年09月）を保存しました",
  );
  await open(page);
  const n = row(page, "ゼクシィNET");
  await expect(n).toContainText("目標 4");
  await expect(n).toContainText("50%");
  await expect(n).toContainText("100,000円"); // 金額は消えない
});

test("他の会場には入らない。会場担当は見られるが、資料を入れられない", async ({ page }) => {
  const { count } = await admin()
    .from("media_result")
    .select("id", { count: "exact", head: true })
    .eq("facility_id", ids.fac_B!);
  expect(count).toBe(0);
  await loginFully(page, "staffA");
  await open(page);
  await expect(page.getByTestId("total-visits")).toContainText("37");
  await expect(page.getByLabel("資料のファイル")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "数値の入力・修正" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "AI の補足（理由と改善案）" })).toHaveCount(0);
  expect((await page.goto("/f/fac_B/media"))?.status()).toBe(404);
});
