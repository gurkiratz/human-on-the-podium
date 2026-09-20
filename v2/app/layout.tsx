import type { Metadata } from "next";
import "./globals.css";
import "@designcodeio/threeui/style.css";
import { Geist } from "next/font/google";
import { AppBackground } from "@/components/AppBackground";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Human on the Podium",
  description:
    "Find a political speech, transcribe it, and see how much of it reads as machine-written.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable)}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <AppBackground />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
