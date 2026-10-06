"use client";

import { useActionState } from "react";
import { verifyMfa, type MfaState } from "./actions";

export function MfaForm({ factorId, mode }: { factorId: string; mode: "enroll" | "verify" }) {
  const [state, action, pending] = useActionState<MfaState, FormData>(verifyMfa, {});
  return (
    <form action={action} className="stack" style={{ gap: 10 }} noValidate>
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="mode" value={mode} />
      <label className="fld" style={{ margin: 0 }}>
        <span>確認コード（6桁）</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
        />
      </label>
      {state.error ? (
        <p className="notice bad" role="alert" style={{ margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      <button
        className="btn pri"
        type="submit"
        disabled={pending}
        style={{ justifyContent: "center" }}
      >
        {pending ? "確認中…" : "確認する"}
      </button>
    </form>
  );
}
