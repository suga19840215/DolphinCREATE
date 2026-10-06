import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/core/csv";

describe("toCsv", () => {
  it("BOM 付き・カンマや改行を含む値は囲む", () => {
    expect(
      toCsv([
        ["a", "b,c"],
        ["改\n行", 1],
      ]),
    ).toBe('﻿a,"b,c"\r\n"改\n行",1\r\n');
  });
  it("数値の負数はそのまま", () => expect(toCsv([[-2]])).toBe("\uFEFF-2\r\n"));
  it("式として解釈される値は文字にする", () => {
    expect(toCsv([["=1+1", "-2", "@x"]])).toBe("﻿'=1+1,'-2,'@x\r\n");
  });
});
