"use client";

import { useActionState, useState } from "react";
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role } from "@/lib/core/permissions";
import { inviteUser, type ActionState } from "./actions";

type Fac = { id: string; code: string; name: string; kind: "hq" | "venue"; assignable: Role[] };

export function InviteForm({
  facilities,
  venues,
}: {
  facilities: Fac[];
  venues: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteUser, {});
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? "");
  const fac = facilities.find((f) => f.id === facilityId);

  return (
    <form action={action} noValidate>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="fld">
          <span>メールアドレス（ログインID）</span>
          <input name="email" type="email" autoComplete="off" required />
        </label>
        <label className="fld">
          <span>氏名</span>
          <input name="displayName" required />
        </label>
      </div>
      <label className="fld">
        <span>所属</span>
        <select
          name="facilityId"
          value={facilityId}
          onChange={(e) => setFacilityId(e.target.value)}
        >
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}（{f.code}）
            </option>
          ))}
        </select>
      </label>
      <fieldset className="fld" style={{ border: 0, padding: 0 }}>
        <span>権限（複数可）</span>
        {fac?.assignable.map((r) => (
          <label
            key={r}
            className="small"
            style={{ display: "flex", gap: 6, alignItems: "baseline" }}
          >
            <input type="checkbox" name="roles" value={r} />
            <b>{ROLE_LABEL[r]}</b>
            <span className="tiny">{ROLE_DESCRIPTION[r]}</span>
          </label>
        ))}
      </fieldset>
      {fac?.kind === "hq" ? (
        <fieldset className="fld" style={{ border: 0, padding: 0 }}>
          <span>担当する施設（マーケ・データ／制作・ブランドに付けます。本部管理者は全施設）</span>
          <div className="row">
            {venues.map((v) => (
              <label key={v.id} className="small">
                <input type="checkbox" name="assigned" value={v.id} /> {v.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="row">
        <button className="btn pri" type="submit" disabled={pending}>
          招待メールを送る
        </button>
        {state.error ? (
          <span className="notice bad" role="alert">
            {state.error}
          </span>
        ) : null}
        {state.ok ? (
          <span className="notice good" role="status">
            {state.ok}
          </span>
        ) : null}
      </div>
      <p className="tiny" style={{ marginBottom: 0 }}>
        本人が招待メールのリンクからパスワードを設定します。仮パスワードを人が伝えることはありません。
      </p>
    </form>
  );
}
