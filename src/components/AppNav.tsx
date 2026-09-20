"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/youtube", label: "Analyze" },
  { href: "/investigate", label: "Investigate" },
] as const;

/**
 * Analyze reads on paper, so a solid black bar above it lands as a hard edge.
 * The chrome takes the weight of the page underneath it instead — a light
 * material there, the dark one over the capture view and the archive's photo.
 */
const PAPER_ROUTES = ["/youtube"];

export function AppNav() {
  const pathname = usePathname();
  const paper = PAPER_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 border-b backdrop-blur-xl ${
        paper
          ? "border-[rgba(17,18,15,0.1)] bg-[rgba(250,250,248,0.78)]"
          : "border-white/12 bg-black/75"
      }`}
    >
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className={`focus-ring shrink-0 rounded-[4px] text-[14px] font-semibold tracking-[-0.02em] sm:text-[15px] ${
            paper ? "text-[#11120f]" : "text-white"
          }`}
        >
          Human on the Podium
        </Link>
        <div className="flex h-full items-center gap-5 sm:gap-7">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            const tone = paper
              ? active
                ? "text-[#11120f]"
                : "text-[#60615b] hover:text-[#11120f]"
              : active
                ? "text-white"
                : "text-white/55 hover:text-white";
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`focus-ring relative flex h-full items-center text-[12px] font-medium transition-colors sm:text-[13px] ${tone}`}
              >
                {l.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-[#e04420]"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
