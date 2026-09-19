"use client";

import { useEffect, useRef, useState } from "react";
import { parseYoutubeId } from "@/lib/youtube-id";

type Props = {
  url: string;
  /** Seek here after load when the player allows it. */
  startSec?: number;
};

type YtPlayer = { seekTo?: (sec: number, allowSeekAhead: boolean) => void };
type YtEl = HTMLElement & { load: () => Promise<YtPlayer> };

export function YoutubePreview({ url, startSec = 0 }: Props) {
  const videoId = parseYoutubeId(url);
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("youtube-video-js").then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = Math.max(0, Math.floor(startSec));
  const src =
    videoId &&
    `https://www.youtube.com/watch?v=${videoId}${
      start > 0 ? `&start=${start}` : ""
    }`;

  // youtube-video-js only has getters for src/width/height — React props
  // try to assign properties and crash. Build via setAttribute instead.
  useEffect(() => {
    const host = hostRef.current;
    if (!ready || !src || !host) return;

    host.replaceChildren();
    const el = document.createElement("youtube-video") as YtEl;
    el.setAttribute("src", src);
    el.setAttribute("width", "640");
    el.setAttribute("height", "360");
    el.setAttribute("controls", "");
    el.setAttribute("playsinline", "");
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "block";
    host.appendChild(el);

    let cancelled = false;
    if (start > 0) {
      void el
        .load()
        .then((player) => {
          if (cancelled) return;
          try {
            player.seekTo?.(start, true);
          } catch {
            /* leave at playerVars start / 0 */
          }
        })
        .catch(() => {
          /* ignore */
        });
    }

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [ready, src, start]);

  if (!videoId) return null;
  if (!ready) {
    return (
      <div className="aspect-video w-full animate-pulse bg-white/5" />
    );
  }

  return (
    <div
      ref={hostRef}
      className="aspect-video w-full overflow-hidden border border-white/10 bg-black [&_iframe]:!h-full [&_iframe]:!w-full [&_youtube-video]:block [&_youtube-video]:h-full [&_youtube-video]:w-full"
    />
  );
}
