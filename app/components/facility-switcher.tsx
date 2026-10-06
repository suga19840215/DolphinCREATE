"use client";

import { usePathname, useRouter } from "next/navigation";

type Option = { code: string; name: string; sub: string | null };

/**
 * クライアント（施設）を選ぶボタン。選ぶと、同じ画面のまま別の施設のデータに切り替わる。
 * 選択肢は、ログインした人が権限を持つ施設だけ（権限のない施設は表示もしない）。
 */
export function FacilitySwitcher({ current, options }: { current: string; options: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();

  if (options.length <= 1) {
    const only = options[0];
    return (
      <div className="facility-fixed" aria-label="施設（クライアント）">
        <span className="tiny">施設（クライアント）</span>
        <b>{only ? `${only.name}${only.sub ? `｜${only.sub}` : ""}` : current}</b>
      </div>
    );
  }

  return (
    <label>
      施設（クライアント）
      <select
        aria-label="施設（クライアント）を選ぶ"
        value={current}
        onChange={(e) => {
          // /f/<code>/<画面> の <code> だけを入れ替える
          const rest = pathname.split("/").slice(3).join("/");
          router.push(`/f/${encodeURIComponent(e.target.value)}${rest ? `/${rest}` : ""}`);
        }}
      >
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
            {o.sub ? `｜${o.sub}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
