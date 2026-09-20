import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import "./paper.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Analyze — Human on the Podium",
  description:
    "Analyze a sixty-second excerpt from a speech or talk by an MP and read the transcript, the AI share, and the sentence-level evidence behind it.",
};

export const viewport: Viewport = {
  themeColor: "#f7f7f4",
  viewportFit: "cover",
};

export default function AnalyzeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${newsreader.variable} paper-root`}>{children}</div>
  );
}
