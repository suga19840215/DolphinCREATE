"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { key: "", n: "◎", label: "施設の概要", ready: true },
  { key: "dolphin", n: "1", label: "Dolphinデータ連携", ready: true },
  { key: "analysis", n: "2", label: "Dolphinデータを分析", ready: false },
  { key: "creative", n: "3", label: "広告クリエイティブ案", ready: false },
  { key: "adreport", n: "4", label: "広告分析レポート", ready: false },
  { key: "funnel", n: "5", label: "予約・来館・成約", ready: true },
] as const;

export function SideNav({ code, showAccounts }: { code: string; showAccounts: boolean }) {
  const pathname = usePathname();
  const base = `/f/${code}`;
  return (
    <nav className="nav" aria-label="メニュー">
      {MENU.map((m) => {
        const href = m.key ? `${base}/${m.key}` : base;
        if (!m.ready) {
          return (
            <span key={m.key} className="soon" title="準備中（次の段階で作ります）">
              <span className="n">{m.n}</span>
              {m.label}
            </span>
          );
        }
        return (
          <Link key={m.key} href={href} aria-current={pathname === href ? "page" : undefined}>
            <span className="n">{m.n}</span>
            {m.label}
          </Link>
        );
      })}
      <div className="sep" />
      {showAccounts ? (
        <Link href="/accounts" aria-current={pathname.startsWith("/accounts") ? "page" : undefined}>
          <span className="n">ID</span>
          アカウント管理
        </Link>
      ) : null}
    </nav>
  );
}
