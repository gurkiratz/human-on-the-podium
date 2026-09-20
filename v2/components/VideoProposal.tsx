"use client";

/* eslint-disable @next/next/no-img-element */

import { ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { VideoProposal as VideoProposalType } from "@/lib/types";

export function VideoProposal({
  video,
  onConfirm,
  onReject,
  disabled,
}: {
  video: VideoProposalType;
  onConfirm: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.div
      data-testid="video-proposal"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-2xl backdrop-blur-xl"
    >
      {video.thumbnail ? (
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${video.title} on YouTube`}
          className="block"
        >
          <img
            src={video.thumbnail}
            alt=""
            className="aspect-video w-full border-b border-border object-cover transition-opacity hover:opacity-90"
          />
        </a>
      ) : null}

      <div className="flex flex-col gap-2 p-4">
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          className="group/source inline-flex items-start gap-1.5"
        >
          <h3 className="text-[14px] font-medium leading-snug text-foreground decoration-muted-foreground/50 underline-offset-2 group-hover/source:underline">
            {video.title}
          </h3>
          <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        </a>
        {video.channel ? (
          <p className="text-xs text-muted-foreground">{video.channel}</p>
        ) : null}
        <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
          {video.reason}
        </p>

        {/* The source itself, so it can be opened without creating a project. */}
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <ExternalLink className="size-3 shrink-0" />
          <span className="truncate">{video.url}</span>
        </a>

        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" onClick={onConfirm} disabled={disabled}>
            Create project
          </Button>
          <Button size="sm" variant="ghost" onClick={onReject} disabled={disabled}>
            Find another
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
