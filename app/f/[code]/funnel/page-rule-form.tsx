"use client";

import { useActionState } from "react";
import { PAGE_KINDS, PAGE_KIND_LABEL } from "@/lib/core/site/pages";
import { savePageRule, type RuleState } from "./actions";

export function PageRuleForm({ code, prefix = "" }: { code: string; prefix?: string }) {
  const [state, action, pending] = useActionState<RuleState, FormData>(savePageRule, {});
  return (
    <form action={action} className="row" style={{ alignItems: "flex-end" }}>
      <input type="hidden" name="code" value={code} />
      <label className="fld" style={{ margin: 0 }}>
        <span>URL の始まり</span>
        <input name="prefix" defaultValue={prefix} placeholder="/fair/tasting" required />
      </label>
      <label className="fld" style={{ margin: 0 }}>
        <span>名前</span>
        <input name="label" placeholder="試食フェア" required maxLength={50} />
      </label>
      <label className="fld" style={{ margin: 0 }}>
        <span>種類</span>
        <select name="kind" defaultValue="fair">
          {PAGE_KINDS.map((k) => (
            <option key={k} value={k}>
              {PAGE_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <button className="btn pri" type="submit" disabled={pending}>
        登録
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
