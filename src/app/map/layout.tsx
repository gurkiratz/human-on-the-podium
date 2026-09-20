import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import "../paper.css";
import "./map.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Map — Human on the Podium",
  description:
    "Every analyzed record placed by meaning and coloured by how much of it reads as machine-written.",
};

export const viewport: Viewport = {
  themeColor: "#edf5f7",
  viewportFit: "cover",
};

export default function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${newsreader.variable} paper-root map-root`}>{children}</div>
  );
}
