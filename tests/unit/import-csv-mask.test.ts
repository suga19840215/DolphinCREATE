import { describe, expect, it } from "vitest";
import { decodeText, parseCsv } from "@/lib/core/import/csv";
import { isPiiHeader, maskContacts } from "@/lib/core/import/mask";

describe("CSV の読み込み", () => {
  it("引用符・カンマ・改行・空行に対応", () => {
    expect(parseCsv('a,b\r\n"x,1","改\n行"\r\n\r\n"say ""hi""",2')).toEqual([
      ["a", "b"],
      ["x,1", "改\n行"],
      ['say "hi"', "2"],
    ]);
  });
  it("UTF-8 の BOM を外す", () => {
    const bytes = new TextEncoder().encode("﻿a,b");
    expect(decodeText(bytes)).toEqual({ text: "a,b", encoding: "utf-8" });
  });
  it("Shift_JIS を読める", () => {
    // 「接客ID」を Shift_JIS で
    const sjis = new Uint8Array([0x90, 0xda, 0x8b, 0x71, 0x49, 0x44]);
    expect(decodeText(sjis)).toEqual({ text: "接客ID", encoding: "shift_jis" });
  });
});

describe("個人情報", () => {
  it("氏名・メール・電話・住所の列を見分ける", () => {
    for (const h of [
      "氏名",
      "email",
      "メールアドレス",
      "電話番号",
      "phone",
      "住所",
      "郵便番号",
      "フリガナ",
    ]) {
      expect(isPiiHeader(h), h).toBe(true);
    }
  });
  it("施設名・キャンペーン名・広告名は個人情報ではない", () => {
    for (const h of [
      "施設名",
      "キャンペーン名",
      "広告名",
      "広告セット名",
      "file_name",
      "title",
      "lead_id",
    ]) {
      expect(isPiiHeader(h), h).toBe(false);
    }
  });
  it("試作版と同じく、メール・電話を伏せ字にする", () => {
    expect(maskContacts("資料は 090-1234-5678 に送ってほしいと話していた")).toBe(
      "資料は ［電話］ に送ってほしいと話していた",
    );
    expect(maskContacts("連絡は taro.y@example.co.jp まで")).toBe("連絡は ［メール］ まで");
  });
  it("URL・アカウント名・郵便番号・番地までの住所も伏せる", () => {
    expect(maskContacts("インスタは @hanako_wed を見て")).toBe("インスタは ［アカウント］ を見て");
    expect(maskContacts("https://example.com/me を参考に")).toBe("［URL］ を参考に");
    expect(maskContacts("〒231-0001 に住んでいる")).toBe("［郵便番号］ に住んでいる");
    expect(maskContacts("神奈川県横浜市中区山下町1-2-3に住んでいる")).toBe("［住所］に住んでいる");
  });
  it("連絡先のない発言は変えない", () => {
    const s = "料理・試食の満足が決め手になったと本人が発言";
    expect(maskContacts(s)).toBe(s);
  });
});
