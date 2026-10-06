"use client";

import { useActionState } from "react";
import { createFacility, type ActionState } from "./actions";

export function FacilityForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createFacility, {});
  return (
    <form action={action} className="row" style={{ alignItems: "flex-end" }} noValidate>
      <label className="fld" style={{ margin: 0 }}>
        <span>施設コード（例 fac_C）</span>
        <input name="code" required pattern="[A-Za-z0-9_\-]{2,32}" />
      </label>
      <label className="fld" style={{ margin: 0 }}>
        <span>施設名</span>
        <input name="name" required />
      </label>
      <label className="fld" style={{ margin: 0 }}>
        <span>補足（例 海辺のチャペル）</span>
        <input name="sub" />
      </label>
      <button className="btn pri" type="submit" disabled={pending}>
        施設を追加
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
    </form>
  );
}
