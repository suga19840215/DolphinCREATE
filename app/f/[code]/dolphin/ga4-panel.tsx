"use client";

import { useActionState } from "react";
import { runGa4Now, saveGa4Property, type Ga4State } from "./ga4-actions";

type Conn = {
  account_ref: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_status: string | null;
  last_error: string | null;
} | null;

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

function Notice({ s }: { s: Ga4State }) {
  if (s.error)
    return (
      <span className="notice bad" role="alert">
        {s.error}
      </span>
    );
  if (s.ok)
    return (
      <span className="notice good" role="status">
        {s.ok}
      </span>
    );
  return null;
}

export function Ga4Panel(props: {
  code: string;
  conn: Conn;
  canEdit: boolean;
  serviceAccount: string | null;
  defaultRange: { startDate: string; endDate: string };
}) {
  const [saveState, save, saving] = useActionState<Ga4State, FormData>(saveGa4Property, {});
  const [runState, run, running] = useActionState<Ga4State, FormData>(runGa4Now, {});
  const c = props.conn;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <dl className="kv">
        <dt>GA4 プロパティ ID</dt>
        <dd className="num" data-testid="ga4-property">
          {c?.account_ref ?? "未登録"}
        </dd>
        <dt>状態</dt>
        <dd>
          {!c ? (
            <span className="pill">未接続</span>
          ) : !c.enabled ? (
            <span className="pill">停止中</span>
          ) : c.last_status === "error" ? (
            <span className="pill bad">取込に失敗</span>
          ) : c.last_status === "ok" ? (
            <span className="pill good">接続済み</span>
          ) : (
            <span className="pill sky">登録済み（未取込）</span>
          )}
          {c?.last_error ? (
            <span className="small" style={{ display: "block", color: "var(--bad)" }}>
              {c.last_error}
            </span>
          ) : null}
        </dd>
        <dt>最終取込</dt>
        <dd className="num">{fmt(c?.last_synced_at ?? null)}</dd>
        <dt>自動取込</dt>
        <dd>毎朝 6:00（日本時間）に直近3日分を取り直します（GA4 は数日遅れて値が確定するため）</dd>
      </dl>

      {props.canEdit ? (
        <>
          <form action={save} className="row" style={{ alignItems: "flex-end" }}>
            <input type="hidden" name="code" value={props.code} />
            <label className="fld" style={{ margin: 0 }}>
              <span>GA4 プロパティ ID（数字）</span>
              <input
                name="propertyId"
                inputMode="numeric"
                defaultValue={c?.account_ref ?? ""}
                placeholder="例：123456789"
                required
              />
            </label>
            <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="enabled" defaultChecked={c?.enabled ?? true} />{" "}
              毎朝の自動取込を行う
            </label>
            <button className="btn" type="submit" disabled={saving}>
              接続を保存
            </button>
            <Notice s={saveState} />
          </form>
          {c ? (
            <form action={run} className="row" style={{ alignItems: "flex-end" }}>
              <input type="hidden" name="code" value={props.code} />
              <label className="fld" style={{ margin: 0 }}>
                <span>開始日</span>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={props.defaultRange.startDate}
                  required
                />
              </label>
              <label className="fld" style={{ margin: 0 }}>
                <span>終了日</span>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={props.defaultRange.endDate}
                  required
                />
              </label>
              <button className="btn pri" type="submit" disabled={running}>
                {running ? "取り込んでいます…" : "今すぐ取り込む"}
              </button>
              <Notice s={runState} />
            </form>
          ) : null}
        </>
      ) : (
        <p className="tiny" style={{ margin: 0 }}>
          GA4 の接続は、マーケ・データ（Aさん）と施設管理者が設定します。
        </p>
      )}
      <p className="tiny" style={{ margin: 0 }}>
        準備：会場の GA4 プロパティの「管理 → プロパティのアクセス管理」で、
        {props.serviceAccount ? (
          <b className="num" style={{ userSelect: "all" }}>
            {props.serviceAccount}
          </b>
        ) : (
          "Dolphin CREATE のサービスアカウント（設定待ち）"
        )}
        を「閲覧者」として追加してください。読み取りだけで、GA4 の設定は変わりません。
      </p>
    </div>
  );
}
