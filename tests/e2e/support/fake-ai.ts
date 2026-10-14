// テスト用の偽の Claude API。/v1/messages に、本物と同じ形の応答（JSON の文字列）を返す。本物の AI には一切つながない。
import { createServer, type Server } from "node:http";

export type FakeAiCall = {
  system: string;
  contentTypes: string[];
  text: string;
  model: string;
  body: Record<string, unknown>;
};
export type FakeAi = {
  server: Server;
  calls: FakeAiCall[];
  reply: { sheet: unknown; match: unknown };
};

export function startFakeAi(port: number): Promise<FakeAi> {
  const calls: FakeAiCall[] = [];
  const reply: FakeAi["reply"] = {
    sheet: { rows: [], notes: [] },
    match: { reason: "", visual_suggestion: "", catch_suggestions: [], caution: "" },
  };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!req.url?.startsWith("/v1/messages") || req.headers["x-api-key"] !== "e2e-fake-key") {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(raw) as {
        model: string;
        system: string;
        messages: { content: { type: string; text?: string }[] }[];
      };
      const content = body.messages[0]?.content ?? [];
      calls.push({
        system: body.system,
        contentTypes: content.map((c) => c.type),
        text: content.map((c) => c.text ?? "").join("\n"),
        model: body.model,
        body,
      });
      const out = body.system.includes("M2｜") ? reply.match : reply.sheet;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_fake",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: JSON.stringify(out) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      );
    });
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve({ server, calls, reply })),
  );
}
