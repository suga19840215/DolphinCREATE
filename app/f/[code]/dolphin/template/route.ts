import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toCsv } from "@/lib/core/csv";
import { FIELDS, type ImportKind } from "@/lib/core/import/fields";
import { serverEnv } from "@/lib/server/env";
import { getSession, selectableFacilities } from "@/lib/server/session";

// 取込テンプレート（見出しだけ）。開発・テスト環境では、接客データに試作版と同じサンプル行を入れる。
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await getSession();
  if (!ctx || ctx === "expired" || !ctx.mfaSatisfied)
    return new Response("Not Found", { status: 404 });
  if (!selectableFacilities(ctx).some((f) => f.code === code))
    return new Response("Not Found", { status: 404 });

  const kind = new URL(request.url).searchParams.get("kind") as ImportKind | null;
  if (!kind || !(kind in FIELDS)) return new Response("Not Found", { status: 404 });

  let body: string;
  const sample = new URL(request.url).searchParams.get("sample") === "1";
  if (kind === "consultation" && sample && serverEnv().APP_ENV !== "production") {
    const text = readFileSync(
      join(process.cwd(), "seed/samples/dolphin_consult_sample_fac_A.csv"),
      "utf8",
    );
    body = "﻿" + text.replaceAll(",fac_A,", `,${code},`);
  } else {
    body = toCsv([FIELDS[kind].map((f) => f.key)]);
  }
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}_${sample ? "sample" : "template"}_${code}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
