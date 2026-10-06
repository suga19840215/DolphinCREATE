"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import { FIELDS, IMPORT_KIND_LABEL, type ImportKind } from "@/lib/core/import/fields";
import {
  commitImport,
  importImages,
  importMarketReport,
  previewImport,
  type ImportActionState,
} from "./actions";

type TableKind = "consultation" | "crm" | "ads" | "ga4";
type Tab = TableKind | "images" | "market_report";

const MEDIA = [
  ["google_search", "Google検索"],
  ["demand_gen", "デマンドジェネレーション"],
  ["meta", "Meta（Instagram）"],
] as const;

const NOTE: Record<Tab, string> = {
  consultation:
    "氏名・メール・電話などの列は取り込まず、発言内の連絡先は自動で伏せ字にします。広告改善に同意していない接客は取り込みません。",
  crm: "lead_id で予約・来館・成約をつなぎます。登録済みの lead_id は新しい状況で更新します。広告ID（utm_content）がない予約は、どの広告にも割り振りません。",
  ads: "広告マネージャ・Google 広告の管理画面から書き出した日別・広告別の CSV。同じ日・同じ広告は上書きするので、2回取り込んでも重複しません。使用額は Fee抜きの円で取り込みます。",
  ga4: "LP と予約フォームのイベント（page_view・select_fair・form_start・form_error・generate_lead）の日別・広告別の集計。",
  images:
    "Dolphin で生成した画像（PNG・JPEG・WebP）と、任意の情報CSV（file_name・asset_id・title・prompt・target・rights・expiry）。取り込んだ画像は「権利確認中・未承認」から始まります。",
  market_report:
    "Dolphin のマーケットレポート（要件表「レスポンス項目案」の形の JSON）。同じレポートの同じ版は二重に取り込みません。",
};

function Pills({ r }: { r: Extract<ImportActionState, { step: "preview" }>["result"] }) {
  const p = r.preview;
  return (
    <div className="row" style={{ gap: 6 }}>
      <b className="small">{r.fileName}</b>
      <span className="pill">{p.total}行</span>
      <span className="pill good">取込可 {p.ok.length}</span>
      {p.updates.length ? <span className="pill sky">うち更新 {p.updates.length}</span> : null}
      {p.duplicate.length ? <span className="pill warn">重複 {p.duplicate.length}</span> : null}
      {p.missing.length ? <span className="pill bad">必須欠損 {p.missing.length}</span> : null}
      {p.noConsent.length ? (
        <span className="pill warn">広告改善の同意なし {p.noConsent.length}</span>
      ) : null}
      {p.wrongFacility.length ? (
        <span className="pill bad">他施設のデータ {p.wrongFacility.length}</span>
      ) : null}
      {p.invalid.length ? <span className="pill bad">形式の誤り {p.invalid.length}</span> : null}
      {p.piiColumns.length ? (
        <span className="pill bad">個人情報の列 {p.piiColumns.length}（除外）</span>
      ) : null}
      {p.maskedRows ? (
        <span className="pill warn">発言内の連絡先を伏せ字 {p.maskedRows}</span>
      ) : null}
      <span className="tiny">文字コード：{r.encoding === "shift_jis" ? "Shift_JIS" : "UTF-8"}</span>
    </div>
  );
}

function TableImport({
  code,
  kind,
  facilityName,
}: {
  code: string;
  kind: TableKind;
  facilityName: string;
}) {
  const fileRef = useRef<File | null>(null);
  const [mediaValue, setMedia] = useState<string>("meta");
  const [previewState, preview, previewing] = useActionState<ImportActionState, FormData>(
    previewImport,
    { step: "idle" },
  );
  const [commitState, commit, committing] = useActionState<ImportActionState, FormData>(
    commitImport,
    { step: "idle" },
  );
  const [dismissed, setDismissed] = useState(false);

  const send = (action: (f: FormData) => void, map?: Record<string, number>) => {
    if (!fileRef.current) return;
    const fd = new FormData();
    fd.set("code", code);
    fd.set("kind", kind);
    if (kind === "ads") fd.set("media", mediaValue);
    fd.set("file", fileRef.current);
    if (map) fd.set("map", JSON.stringify(map));
    setDismissed(false);
    startTransition(() => action(fd));
  };

  const shown = !dismissed && previewState.step === "preview" ? previewState : null;
  const fields = FIELDS[kind as ImportKind];

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        {kind === "ads" ? (
          <label className="fld" style={{ margin: 0 }}>
            <span>媒体</span>
            <select value={mediaValue} onChange={(e) => setMedia(e.target.value)}>
              {MEDIA.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="fld" style={{ margin: 0 }}>
          <span>CSV ファイル</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label={`${IMPORT_KIND_LABEL[kind]}のCSV`}
            onChange={(e) => {
              fileRef.current = e.target.files?.[0] ?? null;
              send(preview);
            }}
          />
        </label>
        <a className="btn" href={`/f/${code}/dolphin/template?kind=${kind}`} download>
          取込テンプレートを保存
        </a>
      </div>
      {previewing ? <p className="small muted">確認しています…</p> : null}
      {previewState.step === "idle" && previewState.error ? (
        <p className="notice bad" role="alert">
          {previewState.error}
        </p>
      ) : null}
      {commitState.step === "done" && dismissed ? (
        <p className="notice good" role="status">
          {commitState.message}
        </p>
      ) : null}
      {commitState.step === "idle" && commitState.error ? (
        <p className="notice bad" role="alert">
          {commitState.error}
        </p>
      ) : null}

      {shown ? (
        <div className="stack" style={{ gap: 12 }}>
          <Pills r={shown.result} />
          {shown.result.alreadyImported ? (
            <p className="notice warn">
              このファイルは取込済みです。同じ内容を二度取り込むことはできません。
            </p>
          ) : null}
          <div>
            <h3 className="small" style={{ margin: "0 0 6px" }}>
              項目の対応付け
            </h3>
            <div className="grid3">
              {fields.map((fd) => (
                <label key={fd.key} className="fld" style={{ margin: 0 }}>
                  <span>
                    {fd.label}
                    {fd.required ? <b style={{ color: "var(--bad)" }}> 必須</b> : null}
                  </span>
                  <select
                    aria-label={`対応付け：${fd.label}`}
                    value={shown.result.map[fd.key] ?? -1}
                    onChange={(e) =>
                      send(preview, { ...shown.result.map, [fd.key]: Number(e.target.value) })
                    }
                  >
                    <option value={-1}>（使わない）</option>
                    {shown.result.headers.map((h, i) => (
                      <option
                        key={i}
                        value={i}
                        disabled={shown.result.preview.piiColumns.includes(h)}
                      >
                        {h}
                        {shown.result.preview.piiColumns.includes(h)
                          ? "（個人情報・取込不可）"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div>
            <h3 className="small" style={{ margin: "0 0 6px" }}>
              プレビュー（伏せ字後・先頭5行）
            </h3>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    {shown.result.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.result.sampleRows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j} className="small cell-1line" title={c}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="row">
            <button
              className="btn pri"
              type="button"
              disabled={
                committing || !shown.result.preview.ok.length || shown.result.alreadyImported
              }
              onClick={() => {
                send(commit, shown.result.map);
                setDismissed(true);
              }}
            >
              {shown.result.preview.ok.length}件を{facilityName}に取り込む
            </button>
            <button className="btn" type="button" onClick={() => setDismissed(true)}>
              取り消す
            </button>
            <span className="tiny">施設IDが「{code}」と一致する行だけを取り込みます</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FileImport({ code, kind }: { code: string; kind: "images" | "market_report" }) {
  const [state, action, pending] = useActionState<ImportActionState, FormData>(
    kind === "images" ? importImages : importMarketReport,
    { step: "idle" },
  );
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="code" value={code} />
      {kind === "images" ? (
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="fld" style={{ margin: 0 }}>
            <span>画像ファイル（複数可・合計4MBまで）</span>
            <input
              type="file"
              name="images"
              accept="image/png,image/jpeg,image/webp"
              multiple
              required
            />
          </label>
          <label className="fld" style={{ margin: 0 }}>
            <span>情報CSV（任意）</span>
            <input type="file" name="info" accept=".csv,text/csv" />
          </label>
          <a className="btn" href={`/f/${code}/dolphin/template?kind=images`} download>
            情報CSVのテンプレート
          </a>
        </div>
      ) : (
        <label className="fld" style={{ margin: 0 }}>
          <span>JSON ファイル</span>
          <input type="file" name="file" accept=".json,application/json" required />
        </label>
      )}
      <div className="row">
        <button className="btn pri" type="submit" disabled={pending}>
          {pending ? "取り込んでいます…" : "取り込む"}
        </button>
        {state.step === "idle" && state.error ? (
          <span className="notice bad" role="alert">
            {state.error}
          </span>
        ) : null}
        {state.step === "done" ? (
          <span className="notice good" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function ImportPanel({
  code,
  facilityName,
  allowed,
}: {
  code: string;
  facilityName: string;
  allowed: Tab[];
}) {
  const [tab, setTab] = useState<Tab>(allowed[0] ?? "consultation");
  if (!allowed.length) {
    return (
      <p className="small muted">
        取込は、マーケ・データ（Aさん）と施設管理者が行います。画像はBさんも取り込めます。
      </p>
    );
  }
  const label = (t: Tab) =>
    t === "market_report" ? "マーケットレポート（JSON）" : IMPORT_KIND_LABEL[t];
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="tabs" role="tablist">
        {allowed.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {label(t)}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {NOTE[tab]}
      </p>
      {tab === "images" || tab === "market_report" ? (
        <FileImport key={tab} code={code} kind={tab} />
      ) : (
        <TableImport key={tab} code={code} kind={tab} facilityName={facilityName} />
      )}
    </div>
  );
}
