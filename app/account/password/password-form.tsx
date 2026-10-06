"use client";

import { useActionState } from "react";
import { setPassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, {});
  return (
    <form action={action} className="stack" style={{ gap: 10 }} noValidate>
      <label className="fld" style={{ margin: 0 }}>
        <span>新しいパスワード（12文字以上）</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </label>
      <label className="fld" style={{ margin: 0 }}>
        <span>確認のためもう一度</span>
        <input name="confirm" type="password" autoComplete="new-password" required />
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
        {pending ? "確認中…" : "パスワードを設定する"}
      </button>
    </form>
  );
}
