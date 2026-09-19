import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import "./investigate.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Investigate — Sloppy archive",
  description:
    "Search analyzed excerpts from speeches and talks by MPs: verdicts, transcripts, and sentence-level evidence.",
};

export const viewport: Viewport = {
  themeColor: "#14110d",
  viewportFit: "cover",
};

export default function InvestigateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${newsreader.variable} investigate-root`}>{children}</div>;
}
