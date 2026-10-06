"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="stack" style={{ gap: 10 }} noValidate>
      <label className="fld" style={{ margin: 0 }}>
        <span>メールアドレス</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email ?? ""}
          required
          autoFocus
        />
      </label>
      <label className="fld" style={{ margin: 0 }}>
        <span>パスワード</span>
        <input name="password" type="password" autoComplete="current-password" required />
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
        {pending ? "確認中…" : "ログイン"}
      </button>
    </form>
  );
}
