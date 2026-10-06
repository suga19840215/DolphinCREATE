"use client";

import { useActionState } from "react";
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role } from "@/lib/core/permissions";
import { updateUserRoles, type ActionState } from "../actions";

export function EditForm(props: {
  userId: string;
  displayName: string;
  isHq: boolean;
  assignable: Role[];
  current: Role[];
  venues: { id: string; name: string }[];
  assigned: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateUserRoles, {});
  return (
    <form action={action} noValidate>
      <input type="hidden" name="userId" value={props.userId} />
      <label className="fld">
        <span>氏名</span>
        <input name="displayName" defaultValue={props.displayName} required />
      </label>
      <fieldset className="fld" style={{ border: 0, padding: 0 }}>
        <span>権限（複数可）</span>
        {props.assignable.map((r) => (
          <label
            key={r}
            className="small"
            style={{ display: "flex", gap: 6, alignItems: "baseline" }}
          >
            <input
              type="checkbox"
              name="roles"
              value={r}
              defaultChecked={props.current.includes(r)}
            />
            <b>{ROLE_LABEL[r]}</b>
            <span className="tiny">{ROLE_DESCRIPTION[r]}</span>
          </label>
        ))}
      </fieldset>
      {props.isHq ? (
        <fieldset className="fld" style={{ border: 0, padding: 0 }}>
          <span>担当する施設</span>
          <div className="row">
            {props.venues.map((v) => (
              <label key={v.id} className="small">
                <input
                  type="checkbox"
                  name="assigned"
                  value={v.id}
                  defaultChecked={props.assigned.includes(v.id)}
                />{" "}
                {v.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="row">
        <button className="btn pri" type="submit" disabled={pending}>
          保存する
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
    </form>
  );
}
