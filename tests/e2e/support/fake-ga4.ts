// テスト用の偽の GA4 サーバー。認証（トークン）と runReport だけを、本物と同じ形で返す。
import { createServer, type Server } from "node:http";

export type FakeGa4 = {
  server: Server;
  calls: { property: string; dimensions: string[]; auth: string }[];
  setVersion: (v: number) => void;
};

const day = (iso: string) => iso.replaceAll("-", "");
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function startFakeGa4(port: number): Promise<FakeGa4> {
  let version = 1;
  const calls: FakeGa4["calls"] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (req.url === "/token") {
        const assertion = new URLSearchParams(body).get("assertion") ?? "";
        if (assertion.split(".").length !== 3) return send(400, { error: "invalid_grant" });
        return send(200, { access_token: "fake-access-token", expires_in: 3600 });
      }
      const m = req.url?.match(/^\/v1beta\/properties\/(\d+):runReport$/);
      if (!m) return send(404, {});
      const auth = req.headers.authorization ?? "";
      if (auth !== "Bearer fake-access-token") return send(401, {});
      const property = m[1]!;
      if (property === "403403403") return send(403, { error: { code: 403 } });
      const q = JSON.parse(body) as {
        dateRanges: { startDate: string; endDate: string }[];
        dimensions: { name: string }[];
      };
      calls.push({ property, dimensions: q.dimensions.map((d) => d.name), auth });
      const end = q.dateRanges[0]!.endDate;
      const dates = [addDays(end, -1), end];
      const row = (dims: string[], ...v: number[]) => ({
        dimensionValues: dims.map((value) => ({ value })),
        metricValues: v.map((x) => ({ value: String(x) })),
      });
      const names = q.dimensions.map((d) => d.name);
      const hasEvent = names.includes("eventName");
      let rows: ReturnType<typeof row>[];
      if (names.includes("sessionManualAdContent")) {
        // 広告×LP（funnel_event）
        rows = hasEvent
          ? dates.flatMap((d) => [
              row([day(d), "AM-01", "/fair/tasting?utm_source=ig", "select_fair"], 20 * version),
              row([day(d), "AM-01", "/fair/tasting", "form_start"], 8),
              row([day(d), "AM-01", "/fair/tasting", "generate_lead"], 3),
              row([day(d), "(not set)", "/", "generate_lead"], 1),
            ])
          : dates.flatMap((d) => [
              row([day(d), "AM-01", "/fair/tasting?utm_source=ig"], 100),
              row([day(d), "(not set)", "/"], 30),
            ]);
      } else {
        // 切り口別（site_metric）。2つ目以降の次元の値の組み合わせを固定で返す
        const values: string[][] = {
          sessionDefaultChannelGroup: [
            ["Paid Search", "google / cpc"],
            ["Paid Social", "instagram / paid_social"],
            ["Referral", "zexy.net / referral"],
            ["Organic Search", "google / organic"],
          ],
          landingPage: [["/"], ["/lp/tasting?utm_source=ig"], ["/fair/tasting"]],
          deviceCategory: [["mobile"], ["desktop"]],
          region: [["Kanagawa"], ["Tokyo"]],
          newVsReturning: [["new"], ["returning"]],
          hour: [["10"], ["21"]],
          pagePath: [["/fair/tasting"], ["/chapel"], ["/cuisine"], ["/access"]],
        }[names[1]!] ?? [["x"]];
        const events: [string, number, number][] = [
          ["view_fair", 60, 50],
          ["select_fair", 24, 20],
          ["form_start", 12, 10],
          ["form_error", 3, 2],
          ["generate_lead", 6, 6],
          ["request_brochure", 2, 2],
          ["contact", 1, 1],
        ];
        rows = dates.flatMap((d) =>
          values.flatMap((v, i) =>
            hasEvent
              ? events.map(([e, c, s]) => row([day(d), ...v, e], c * (i + 1), s * (i + 1)))
              : [
                  row(
                    [day(d), ...v],
                    100 * (i + 1),
                    90 * (i + 1),
                    60 * (i + 1),
                    250 * (i + 1),
                    6000 * (i + 1),
                  ),
                ],
          ),
        );
      }
      return send(200, { rows, rowCount: rows.length });
    });
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, calls, setVersion: (v) => (version = v) }),
    ),
  );
}
