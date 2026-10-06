import type { Page } from "@playwright/test";
import { E2E_PASSWORD } from "./env";
import { USERS, totp, type UserKey } from "./fixtures";

export async function login(page: Page, key: UserKey, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(USERS[key].email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

export async function loginFully(page: Page, key: UserKey) {
  await login(page, key);
  if (USERS[key].mfa) {
    await page.waitForURL("**/mfa");
    await page.getByLabel("確認コード（6桁）").fill(totp(key));
    await page.getByRole("button", { name: "確認する" }).click();
  }
  await page.waitForURL("**/f/**");
}
