"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/youtube", label: "Analyze" },
  { href: "/investigate", label: "Investigate" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/12 bg-black/75 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.025em] text-white">
          Sloppy
        </Link>
        <div className="flex h-full items-center gap-5 sm:gap-7">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative flex h-full items-center text-[12px] font-medium transition-colors sm:text-[13px] ${
                  active ? "text-white" : "text-white/55 hover:text-white"
                }`}
              >
                {l.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#e04420]" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
