import Link from "next/link";
import { notFound } from "next/navigation";
import { assignableRoles, canManageUser } from "@/lib/core/permissions";
import { userClient } from "@/lib/server/supabase";
import { loadAccounts, requireAccountManager } from "../data";
import { EditForm } from "./edit-form";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireAccountManager();
  const target = (await loadAccounts()).find((u) => u.id === id);
  if (!target || target.id === ctx.userId) notFound();

  const actorRoles = ctx.rolesByFacility.get(target.facility.id)?.roles ?? [];
  const current = [...new Set(target.roles.map((r) => r.role))];
  if (!canManageUser(actorRoles, current)) notFound();

  const supabase = await userClient();
  const { data: venues } = await supabase
    .from("facility")
    .select("id, name")
    .eq("kind", "venue")
    .order("code");
  const kind = target.facility.kind === "hq" ? "hq" : "venue";

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div>
        <Link href="/accounts" className="small">
          ← アカウント一覧へ
        </Link>
        <h1 style={{ marginTop: 8 }}>{target.display_name}さんの権限</h1>
        <p className="lead">
          {target.email}・所属：{target.facility.name}
          。権限を変えると、承認ボタンの表示とサーバー側の可否が両方すぐに変わります。
        </p>
      </div>
      <section className="panel">
        <EditForm
          userId={target.id}
          displayName={target.display_name}
          isHq={kind === "hq"}
          assignable={assignableRoles(actorRoles, kind)}
          current={current}
          venues={venues ?? []}
          assigned={[
            ...new Set(target.roles.filter((r) => r.role !== "hq_admin").map((r) => r.facility.id)),
          ]}
        />
      </section>
    </div>
  );
}
