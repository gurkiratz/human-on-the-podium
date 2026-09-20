import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SubHeader } from "@/components/SubHeader";

export const metadata: Metadata = {
  title: "Investigate — Human on the Podium",
  description:
    "Search analyzed excerpts from political speeches: verdicts, transcripts, and sentence-level evidence.",
};

export const viewport: Viewport = {
  themeColor: "#0d1114",
  viewportFit: "cover",
};

export default function InvestigateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SubHeader>
        <Link
          href="/map"
          className="hidden underline-offset-4 hover:text-foreground hover:underline sm:inline"
        >
          Map ↗
        </Link>
        <Link
          href="/"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to app
        </Link>
      </SubHeader>
      {children}
    </div>
  );
}
