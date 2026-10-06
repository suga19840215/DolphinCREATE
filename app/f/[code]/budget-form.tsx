"use client";

import { useActionState } from "react";
import { updateBudgetCap, type BudgetState } from "./actions";

export function BudgetForm({ code, current }: { code: string; current: number | null }) {
  const [state, action, pending] = useActionState<BudgetState, FormData>(updateBudgetCap, {});
  return (
    <form action={action} className="row" style={{ alignItems: "flex-end" }}>
      <input type="hidden" name="code" value={code} />
      <label className="fld" style={{ margin: 0 }}>
        <span>月間広告費の上限（円）</span>
        <input name="cap" inputMode="numeric" defaultValue={current ?? ""} required />
      </label>
      <button className="btn pri" type="submit" disabled={pending}>
        上限を保存
      </button>
      {state.error ? (
        <span className="notice bad" role="alert">
          {state.error}
        </span>
      ) : null}
      {state.ok ? (
        <span className="notice good" role="status">
          保存しました
        </span>
      ) : null}
    </form>
  );
}
