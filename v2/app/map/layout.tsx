import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SubHeader } from "@/components/SubHeader";

export const metadata: Metadata = {
  title: "Map — Human on the Podium",
  description:
    "Every analyzed record placed by meaning and coloured by how much of it reads as machine-written.",
};

export const viewport: Viewport = {
  themeColor: "#0d1114",
  viewportFit: "cover",
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SubHeader>
        <Link
          href="/investigate"
          className="hidden underline-offset-4 hover:text-foreground hover:underline sm:inline"
        >
          Investigate ↗
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
