"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { APPEAL_AXES } from "@/lib/content/appeal-axes";
import { axesFromText } from "@/lib/core/media/match";
import { MEDIA_OUTLETS } from "@/lib/core/media/outlets";
import type { DraftRow } from "@/lib/core/media/sheet";
import {
  commentOnMatch,
  confirmMediaDoc,
  saveMediaValues,
  saveTopAd,
  uploadMediaDoc,
  type MatchCommentState,
  type MediaState,
} from "./actions";

function Notice({ state }: { state: MediaState }) {
  if (state.error)
    return (
      <p className="notice bad" role="alert">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p className="notice good" role="status">
        {state.ok}
      </p>
    );
  return null;
}

/** 資料を入れる箱（ドラッグ＆ドロップ、またはファイルを選ぶ） */
export function UploadBox({ code }: { code: string }) {
  const [state, action, pending] = useActionState<MediaState, FormData>(uploadMediaDoc, {});
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [over, setOver] = useState(false);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="code" value={code} />
      <label
        className={`dropbox${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && input.current) {
            const dt = new DataTransfer();
            dt.items.add(f);
            input.current.files = dt.files;
            setName(f.name);
          }
        }}
      >
        <b>掲載媒体・掲載金額の資料をここに入れる</b>
        <span className="small muted">
          Excel（.xlsx）・CSV・Word（.docx）・PDF（4MBまで）。ドラッグするか、押して選んでください。
        </span>
        <input
          ref={input}
          type="file"
          name="file"
          aria-label="資料のファイル"
          accept=".xlsx,.csv,.docx,.pdf"
          onChange={(e) => setName(e.target.files?.[0]?.name ?? "")}
        />
        {name ? <span className="small">選んだファイル：{name}</span> : null}
      </label>
      <div className="row">
        <button className="btn pri" type="submit" disabled={pending}>
          {pending ? "読み取り中…" : "読み取る"}
        </button>
        <span className="tiny">
          表は見出しから読み取ります。見出しのない表・PDF は AI
          が読み取り、確定の前に人が確かめます。
        </span>
      </div>
      <Notice state={state} />
    </form>
  );
}

const outletOptions = (
  <>
    <option value="">選んでください</option>
    {MEDIA_OUTLETS.map((o) => (
      <option key={o.code} value={o.code}>
        {o.label}
      </option>
    ))}
  </>
);

type NumKey =
  | "cost_yen"
  | "visits"
  | "contracts"
  | "target_visits"
  | "last_visits"
  | "last_contracts"
  | "area_avg_visits"
  | "area_avg_contracts";

/** 読み取った下書きを確かめて直し、確定する */
export function DraftReview({
  code,
  docId,
  rows: initial,
}: {
  code: string;
  docId: string;
  rows: DraftRow[];
}) {
  const [rows, setRows] = useState<DraftRow[]>(initial);
  const [state, action, pending] = useActionState<MediaState, FormData>(confirmMediaDoc, {});
  const set = (i: number, patch: Partial<DraftRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const num = (i: number, k: NumKey, v: string) => {
    const n = v.trim() === "" ? null : Number(v.replace(/,/g, ""));
    set(i, {
      [k]: n === null || Number.isNaN(n) ? null : k.startsWith("area_avg") ? n : Math.floor(n),
    } as Partial<DraftRow>);
  };
  const missing = rows.filter((r) => !r.month || (r.kind === "result" && !r.outlet)).length;
  const cell = (i: number, k: NumKey, label: string) => (
    <td>
      <input
        className="numin"
        inputMode="decimal"
        aria-label={`${i + 1}行目 ${label}`}
        value={rows[i]![k] ?? ""}
        onChange={(e) => num(i, k, e.target.value)}
      />
    </td>
  );
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="doc" value={docId} />
      <input type="hidden" name="rows" value={JSON.stringify(rows)} />
      <div className="tw">
        <table className="draft" data-testid="draft">
          <thead>
            <tr>
              <th>種類</th>
              <th>月</th>
              <th>媒体（資料の表記）</th>
              <th>掲載メニュー／エリア</th>
              <th className="r">掲載金額</th>
              <th className="r">来館</th>
              <th className="r">成約</th>
              <th className="r">目標来館</th>
              <th className="r">昨年来館</th>
              <th className="r">昨年成約</th>
              <th className="r">エリア平均来館</th>
              <th className="r">エリア平均成約</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={!r.month || (r.kind === "result" && !r.outlet) ? "needs" : undefined}
              >
                <td className="small">{r.kind === "area" ? "エリア平均" : "掲載・実績"}</td>
                <td>
                  <input
                    type="month"
                    aria-label={`${i + 1}行目 月`}
                    value={r.month ?? ""}
                    onChange={(e) => set(i, { month: e.target.value || null })}
                  />
                </td>
                <td>
                  <select
                    aria-label={`${i + 1}行目 媒体`}
                    value={r.outlet ?? ""}
                    onChange={(e) =>
                      set(i, { outlet: (e.target.value || null) as DraftRow["outlet"] })
                    }
                  >
                    {r.kind === "area" ? <option value="">媒体を問わない</option> : outletOptions}
                    {r.kind === "area"
                      ? MEDIA_OUTLETS.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.label}
                          </option>
                        ))
                      : null}
                  </select>
                  {r.outlet_text ? <span className="tiny"> {r.outlet_text}</span> : null}
                </td>
                <td>
                  {r.kind === "area" ? (
                    <input
                      aria-label={`${i + 1}行目 エリア`}
                      value={r.area}
                      onChange={(e) => set(i, { area: e.target.value.slice(0, 50) })}
                    />
                  ) : (
                    <input
                      aria-label={`${i + 1}行目 メニュー`}
                      value={r.menu}
                      onChange={(e) => set(i, { menu: e.target.value.slice(0, 100) })}
                    />
                  )}
                </td>
                {cell(i, "cost_yen", "掲載金額")}
                {cell(i, "visits", "来館")}
                {cell(i, "contracts", "成約")}
                {cell(i, "target_visits", "目標来館")}
                {cell(i, "last_visits", "昨年来館")}
                {cell(i, "last_contracts", "昨年成約")}
                {cell(i, "area_avg_visits", "エリア平均来館")}
                {cell(i, "area_avg_contracts", "エリア平均成約")}
                <td>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    aria-label={`${i + 1}行目を外す`}
                  >
                    外す
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="btn pri" type="submit" disabled={pending || missing > 0 || !rows.length}>
          確定して評価に入れる
        </button>
        {missing ? (
          <span className="small warnink">
            月・媒体が決まっていない行が{missing}行あります（色の付いた行）。
          </span>
        ) : null}
      </div>
      <Notice state={state} />
    </form>
  );
}

/** 数値の入力・修正（目標来館など） */
export function ValuesForm({ code, defaultMonth }: { code: string; defaultMonth: string }) {
  const [state, action, pending] = useActionState<MediaState, FormData>(saveMediaValues, {});
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="code" value={code} />
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="fld" style={{ margin: 0 }}>
          <span>月</span>
          <input type="month" name="month" defaultValue={defaultMonth} required />
        </label>
        <label className="fld" style={{ margin: 0 }}>
          <span>媒体</span>
          <select name="outlet" required defaultValue="">
            {outletOptions}
          </select>
        </label>
        <label className="fld" style={{ margin: 0 }}>
          <span>掲載メニュー（任意）</span>
          <input name="menu" maxLength={100} />
        </label>
        {(
          [
            ["cost_yen", "掲載金額（円）"],
            ["visits", "来館"],
            ["contracts", "成約"],
            ["target_visits", "目標来館"],
          ] as const
        ).map(([n, l]) => (
          <label key={n} className="fld" style={{ margin: 0 }}>
            <span>{l}</span>
            <input name={n} inputMode="numeric" className="numin" />
          </label>
        ))}
        <button className="btn pri" type="submit" disabled={pending}>
          保存
        </button>
      </div>
      <span className="tiny">空欄の項目は、すでに入っている値を変えません。</span>
      <Notice state={state} />
    </form>
  );
}

const axisChecks = (
  name: string,
  selected: readonly string[],
  onToggle: (code: string) => void,
) => (
  <div className="checks">
    {APPEAL_AXES.map((a) => (
      <label key={a.code} className="check">
        <input
          type="checkbox"
          name={name}
          value={a.code}
          checked={selected.includes(a.code)}
          onChange={() => onToggle(a.code)}
        />
        {a.label}
      </label>
    ))}
  </div>
);

/** 媒体の TOP 広告（メインビジュアル・キャッチコピー）と、その訴求の分類 */
export function TopAdForm({
  code,
  ads,
}: {
  code: string;
  ads: { outlet: string; catch_text: string; visual_axes: string[]; catch_axes: string[] }[];
}) {
  const [state, action, pending] = useActionState<MediaState, FormData>(saveTopAd, {});
  const [outlet, setOutlet] = useState("");
  const current = useMemo(() => ads.find((a) => a.outlet === outlet), [ads, outlet]);
  const [catchText, setCatchText] = useState("");
  const [visual, setVisual] = useState<string[]>([]);
  const [catchAxes, setCatchAxes] = useState<string[]>([]);
  const toggle = (list: string[], set: (v: string[]) => void) => (c: string) =>
    set(list.includes(c) ? list.filter((x) => x !== c) : [...list, c]);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="code" value={code} />
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="fld" style={{ margin: 0 }}>
          <span>媒体</span>
          <select
            name="outlet"
            value={outlet}
            onChange={(e) => {
              const o = e.target.value;
              setOutlet(o);
              const a = ads.find((x) => x.outlet === o);
              setCatchText(a?.catch_text ?? "");
              setVisual(a?.visual_axes ?? []);
              setCatchAxes(a?.catch_axes ?? []);
            }}
            required
          >
            {outletOptions}
          </select>
        </label>
        <label className="fld" style={{ margin: 0, flex: "1 1 260px" }}>
          <span>TOP 広告のキャッチコピー</span>
          <input
            name="catch_text"
            value={catchText}
            maxLength={200}
            onChange={(e) => setCatchText(e.target.value)}
          />
        </label>
        <label className="fld" style={{ margin: 0 }}>
          <span>メインビジュアル（画像・任意）</span>
          <input type="file" name="visual" accept="image/png,image/jpeg,image/webp" />
        </label>
      </div>
      {outlet && current ? (
        <span className="tiny">登録済みの内容を表示しています。保存すると上書きします。</span>
      ) : null}
      <div>
        <h3>ビジュアルの訴求（写っているもの・伝えていること）</h3>
        {axisChecks("visual_axes", visual, toggle(visual, setVisual))}
      </div>
      <div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>キャッチコピーの訴求</h3>
          <button
            className="btn"
            type="button"
            onClick={() => setCatchAxes([...new Set([...catchAxes, ...axesFromText(catchText)])])}
          >
            キャッチから当てはめる
          </button>
        </div>
        {axisChecks("catch_axes", catchAxes, toggle(catchAxes, setCatchAxes))}
      </div>
      <div className="row">
        <button className="btn pri" type="submit" disabled={pending || !outlet}>
          TOP 広告を保存
        </button>
      </div>
      <Notice state={state} />
    </form>
  );
}

/** AI の補足（理由と改善案） */
export function MatchCommentButton({
  code,
  outlet,
  from,
  to,
}: {
  code: string;
  outlet: string;
  from: string;
  to: string;
}) {
  const [state, action, pending] = useActionState<MatchCommentState, FormData>(commentOnMatch, {});
  return (
    <form action={action} className="stack" style={{ gap: 6 }}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="outlet" value={outlet} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "AI が考えています…" : "AI の補足（理由と改善案）"}
        </button>
      </div>
      {state.error ? (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.comment ? (
        <div className="aibox" data-testid="ai-comment">
          <p className="small" style={{ margin: 0 }}>
            <b>理由：</b>
            {state.comment.reason}
          </p>
          <p className="small" style={{ margin: 0 }}>
            <b>ビジュアル：</b>
            {state.comment.visual_suggestion}
          </p>
          <p className="small" style={{ margin: 0 }}>
            <b>キャッチ案：</b>
            {state.comment.catch_suggestions.join("／")}
          </p>
          {state.comment.caution ? (
            <p className="tiny" style={{ margin: 0 }}>
              {state.comment.caution}
            </p>
          ) : null}
          <span className="tiny">AI の提案です。広告の差し替えは人が判断します。</span>
        </div>
      ) : null}
    </form>
  );
}
