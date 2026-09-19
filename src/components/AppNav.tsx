"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/youtube", label: "YouTube" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="material fixed left-1/2 top-3 z-40 flex -translate-x-1/2 gap-1 rounded-full p-1">
      {LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              active
                ? "bg-white/15 text-[var(--color-chalk)]"
                : "text-[var(--muted)] hover:text-[var(--color-chalk)]"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
