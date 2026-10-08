import { describe, expect, it } from "vitest";
import {
  AD_FORMATS,
  APPEAL_AXES,
  COPY_TYPES,
  IMAGE_SUBJECTS,
  IMAGE_TRAITS,
} from "@/lib/content/appeal-axes";

const lists = {
  訴求軸: APPEAL_AXES,
  画像に写っているもの: IMAGE_SUBJECTS,
  コピーの型: COPY_TYPES,
  形式: AD_FORMATS,
  ...Object.fromEntries(Object.entries(IMAGE_TRAITS).map(([k, v]) => [`画像の性質:${k}`, v])),
};

describe("広告案の特徴の分類", () => {
  it.each(Object.entries(lists))("%s：コードと名前が重ならず、コードは英小文字", (_, list) => {
    const codes = list.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(list.map((x) => x.label)).size).toBe(list.length);
    for (const c of codes) expect(c).toMatch(/^[a-z][a-z_]*$/);
  });

  it("訴求軸には説明と手がかりの言葉がある", () => {
    for (const a of APPEAL_AXES) {
      expect(a.description.length).toBeGreaterThan(5);
      expect(a.keywords.length).toBeGreaterThan(0);
    }
  });
});
