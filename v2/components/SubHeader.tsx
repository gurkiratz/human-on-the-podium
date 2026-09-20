import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * The top bar shared by the secondary pages (map, investigate). It mirrors the
 * home toolbar's brand block and link styling so leaving the app view does not
 * change the chrome.
 */
export function SubHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="glass-strong sticky top-0 z-40 border-b border-border/70">
      <div className="mx-auto flex h-12 w-full max-w-[1400px] items-center gap-3 px-3 sm:px-5">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Sparkles className="size-3.5" />
          </span>
          <span className="truncate text-sm font-medium tracking-tight">
            Human on the Podium
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {children}
        </div>
      </div>
    </header>
  );
}
