import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import "./database.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Database — Human on the Podium",
  description:
    "Search analyzed excerpts from speeches and talks by MPs: verdicts, transcripts, and sentence-level evidence.",
};

export const viewport: Viewport = {
  themeColor: "#14110d",
  viewportFit: "cover",
};

export default function DatabaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${newsreader.variable} database-root`}>{children}</div>;
}
