"use client";

import dynamic from "next/dynamic";

// ThreeUI touches WebGL at import time, so keep it client-only. Import the component's own
// subpath rather than the package barrel, which pulls in unrelated components (and their
// asset-loader config) that Next's webpack build rejects.
const PredictiveArcCanvas = dynamic(
  () =>
    import("@designcodeio/threeui/components/PredictiveArcCanvas").then(
      (mod) => mod.PredictiveArcCanvas,
    ),
  { ssr: false },
);

// The predictive preset hardcodes violet RGB values and ignores its own hue/saturation props,
// so the arc is re-coloured here: violet (~270°) rotated to a teal/steel (~185°), slightly
// desaturated and lifted so it reads on a near-black page.
const ARC_COLOR_SHIFT = "hue-rotate(-85deg) saturate(0.75) brightness(1.12)";

export function AppBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 [&>canvas]:size-full" style={{ filter: ARC_COLOR_SHIFT }}>
        <PredictiveArcCanvas mode="dark" />
      </div>

      {/* Scrim: keeps text legible without flattening the arc. */}
      <div className="absolute inset-0 bg-background/30" />
      <div className="absolute inset-0 bg-[radial-gradient(58%_40%_at_50%_42%,color-mix(in_oklch,var(--background)_80%,transparent),transparent_78%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_45%,transparent_45%,var(--background)_100%)]" />
    </div>
  );
}
