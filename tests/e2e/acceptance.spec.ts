// 本番設計ドキュメントの受入テスト（docs/auth_design.md「受入テスト」）＝ M1 の完了条件。
// テスト用の2施設（会場A・会場B）と各権限のアカウントで確かめる。
// No.10（AIへの依頼）は AI 機能（M4）で本物の依頼に対して確かめる。M1 では送信前の検査を単体テストで確かめる。
import { expect, test, type Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { USERS, admin, seed, totp } from "./support/fixtures";
import { login, loginFully } from "./support/login";

let ids: Record<string, string> = {};

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (statement: string) =>
  execFileSync("psql", [DB_URL, "-qAtc", statement], { encoding: "utf8" });

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  ids = await seed();
});

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

async function auditEvents(email: string) {
  const { data } = await admin()
    .from("auth_audit")
    .select("event, user:user_id (email)")
    .order("at", { ascending: false })
    .limit(500);
  return (data ?? []).filter((r) => r.user?.email === email).map((r) => r.event);
}

test("クライアント（施設）を選ぶと、その施設のデータだけに切り替わる", async ({ page }) => {
  await loginFully(page, "mkt");
  await expect(page).toHaveURL(/\/f\/fac_A$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("会場A");
  await expect(page.getByText("E2E：fac_A の操作")).toBeVisible();
  await expect(page.getByText("E2E：fac_B の操作")).toHaveCount(0);

  await page.getByLabel("施設（クライアント）を選ぶ").selectOption("fac_B");
  await page.waitForURL(/\/f\/fac_B$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("会場B");
  await expect(page.getByText("E2E：fac_B の操作")).toBeVisible();
  await expect(page.getByText("E2E：fac_A の操作")).toHaveCount(0);
});

test("施設の担当者には、選べる施設が自施設しか出ない", async ({ page }) => {
  await loginFully(page, "staffA");
  await expect(page.getByLabel("施設（クライアント）を選ぶ")).toHaveCount(0);
  await expect(page.locator(".facility-fixed")).toContainText("会場A");
});

test("1. 会場Aの担当者が会場BのURLやデータIDを直接指定しても、会場Bのデータが返らない", async ({
  page,
}) => {
  await loginFully(page, "staffA");
  for (const path of [
    "/f/fac_B",
    "/f/fac_B/operations.csv",
    `/api/f/fac_B/files?path=${ids.fac_B}/assets/fac_B.png`,
  ]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(404);
    expect(await res.text()).not.toContain("E2E：fac_B");
  }
  const res = await page.goto("/f/fac_B");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("会場B")).toHaveCount(0);
});

test("2. 会場Aの担当者のCSV書き出しに、会場Bの行が1行も含まれない", async ({ page }) => {
  await loginFully(page, "faA");
  const ops = await page.request.get("/f/fac_A/operations.csv");
  expect(ops.status()).toBe(200);
  const opsRows = (await ops.text()).trim().split("\r\n").slice(1);
  expect(opsRows.length).toBeGreaterThan(0);
  for (const row of opsRows) expect(row.startsWith("fac_A,")).toBe(true);

  const history = await page.request.get("/accounts/history.csv");
  expect(history.status()).toBe(200);
  const historyRows = (await history.text()).trim().split("\r\n").slice(1);
  expect(historyRows.length).toBeGreaterThan(0);
  for (const row of historyRows) expect(row.startsWith("fac_A,")).toBe(true);
  expect(await history.text()).not.toContain("staff-b@e2e.test");
});

test("3. 会場Aの担当者が会場Bの画像の署名URLを開いても表示されない", async ({ page }) => {
  await loginFully(page, "staffA");
  const own = await page.request.get(`/api/f/fac_A/files?path=${ids.fac_A}/assets/fac_A.png`);
  expect(own.status()).toBe(200);
  const { url } = await own.json();
  expect((await page.request.get(url)).status()).toBe(200);

  // 自施設のコードで会場Bのパスを指定しても、会場Bのコードで指定しても、発行されない
  for (const path of [
    `/api/f/fac_A/files?path=${ids.fac_B}/assets/fac_B.png`,
    `/api/f/fac_B/files?path=${ids.fac_B}/assets/fac_B.png`,
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
});

test("4. ログアウト後に、ブラウザの「戻る」でデータが見えない", async ({ page }) => {
  await loginFully(page, "staffA");
  await expect(page.getByText("E2E：fac_A の操作")).toBeVisible();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.waitForURL("**/login?reason=logout");
  await page.goBack();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("E2E：fac_A の操作")).toHaveCount(0);
});

test("4b. 自動ログアウト（30分操作なし）のあと、データが見えない", async ({ page }) => {
  await loginFully(page, "viewA");
  await expect(page.getByText("E2E：fac_A の操作")).toBeVisible();
  // 最終操作を31分前にずらす（時間を進める代わり。ローカル／CI の使い捨て DB だけ）
  const { data: u } = await admin()
    .from("app_user")
    .select("id")
    .eq("email", USERS.viewA.email)
    .single();
  sql(
    `update app.session_activity set last_seen_at = now() - interval '31 minutes' where user_id = '${u!.id}'`,
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login\?reason=expired/);
  await page.goBack();
  await expect(page.getByText("E2E：fac_A の操作")).toHaveCount(0);
});

test("5. 5回失敗でロックされ、ロック中は正しいパスワードでも入れない", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await login(page, "lockA", "wrong-password-123");
    await expect(page.locator(".notice[role=alert]")).toContainText("ログインできませんでした");
  }
  await login(page, "lockA");
  await expect(page.locator(".notice[role=alert]")).toContainText("ログインできませんでした");
  await expect(page).toHaveURL(/\/login/);

  const { data } = await admin()
    .from("app_user")
    .select("locked_until")
    .eq("email", USERS.lockA.email)
    .single();
  expect(new Date(data!.locked_until!).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
  const events = await auditEvents(USERS.lockA.email);
  expect(events).toContain("locked_out");
  expect(events).toContain("login_locked");
});

test("6. 停止したアカウントは、ログイン中でも次の操作から使えなくなる", async ({
  page,
  browser,
}) => {
  await loginFully(page, "stopA");
  await expect(page.getByText("E2E：fac_A の操作")).toBeVisible();

  const hq = await newPage(browser);
  await loginFully(hq, "hq");
  await hq.goto("/accounts");
  const row = hq.locator(`tr[data-email="${USERS.stopA.email}"]`);
  await row.getByRole("button", { name: "停止" }).click();
  await expect(row.getByText("停止中")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("E2E：fac_A の操作")).toHaveCount(0);
  await login(page, "stopA");
  await expect(page.locator(".notice[role=alert]")).toContainText("ログインできませんでした");
});

test("7. 権限を変えると、ボタンの表示とサーバー側の可否が両方変わる", async ({ page, browser }) => {
  // M1 時点で権限による操作は「月間予算上限の設定（施設管理者だけ）」。承認ボタン（M4）も同じ仕組みを使う。
  await loginFully(page, "roleA");
  const save = page.getByRole("button", { name: "上限を保存" });
  await expect(save).toBeVisible();

  const hq = await newPage(browser);
  await loginFully(hq, "hq");
  await hq.goto("/accounts");
  await hq
    .locator(`tr[data-email="${USERS.roleA.email}"]`)
    .getByRole("link", { name: "編集" })
    .click();
  await hq.getByRole("checkbox", { name: /施設管理者/ }).uncheck();
  await hq.getByRole("checkbox", { name: /会場担当/ }).check();
  await hq.getByRole("button", { name: "保存する" }).click();
  await expect(hq.locator(".notice[role=status]")).toContainText("保存しました");

  // 画面に残っている古いボタンから送っても、サーバーが拒否する
  await page.getByLabel("月間広告費の上限（円）").fill("1");
  await save.click();
  await expect(page.locator(".notice[role=alert]")).toContainText("施設管理者だけ");
  const { data } = await admin()
    .from("facility")
    .select("monthly_budget_cap_yen")
    .eq("code", "fac_A")
    .single();
  expect(data!.monthly_budget_cap_yen).toBe(900000);

  await page.reload();
  await expect(page.getByRole("button", { name: "上限を保存" })).toHaveCount(0);
  expect(await auditEvents(USERS.roleA.email)).toContain("roles_changed");
});

test("8. 本部管理者と施設管理者は、多要素認証なしでは入れない", async ({ page }) => {
  for (const key of ["hq", "faA"] as const) {
    await page.context().clearCookies();
    await login(page, key);
    await page.waitForURL("**/mfa");
    for (const path of ["/", "/f/fac_A", "/accounts"]) {
      await page.goto(path);
      await expect(page, `${key} ${path}`).toHaveURL(/\/mfa$/);
    }
    const csv = await page.request.get("/accounts/history.csv");
    expect(csv.status()).toBe(404);
    await page.getByLabel("確認コード（6桁）").fill("000000");
    await page.getByRole("button", { name: "確認する" }).click();
    await expect(page.locator(".notice[role=alert]")).toContainText("確認コードが違う");
    await page.getByLabel("確認コード（6桁）").fill(totp(key));
    await page.getByRole("button", { name: "確認する" }).click();
    await page.waitForURL("**/f/**");
  }
});

test("9. ログインの成功・失敗・ロック・権限変更が履歴に残る", async ({ page }) => {
  await login(page, "staffB", "wrong-password-123");
  await expect(page.locator(".notice[role=alert]")).toBeVisible();
  await loginFully(page, "staffB");
  const events = await auditEvents(USERS.staffB.email);
  expect(events).toContain("login_failed");
  expect(events).toContain("login_succeeded");
  // ロック（No.5）と権限変更（No.7）は上のテストで確かめている。画面の履歴にも出る：
  const hq = page;
  await hq.context().clearCookies();
  await loginFully(hq, "hq");
  await hq.goto("/accounts");
  await expect(hq.getByText("5回失敗でロック").first()).toBeVisible();
  await expect(hq.getByText("権限変更").first()).toBeVisible();
});
