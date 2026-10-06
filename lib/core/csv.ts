// CSV の書き出し（Excel で文字化けしないよう先頭に BOM を付ける）。
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // 先頭が = + - @ の値は Excel が式として扱うので、' を付けて文字として扱わせる
    const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
