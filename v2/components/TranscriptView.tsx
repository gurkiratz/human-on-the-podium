"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ScoredSentence } from "@/lib/gptzero";
import type { Transcript } from "@/lib/types";

interface Chunk {
  start: number;
  text: string;
}

const WORDS_PER_CHUNK = 14;

function buildChunks(transcript: Transcript): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let start = 0;

  for (const word of transcript.words) {
    if (word.type !== "word") continue;
    if (buffer.length === 0) start = word.start;
    buffer.push(word.text);
    const endsSentence = /[.!?]$/.test(word.text);
    if (buffer.length >= WORDS_PER_CHUNK || endsSentence) {
      chunks.push({ start, text: buffer.join(" ") });
      buffer = [];
    }
  }
  if (buffer.length > 0) chunks.push({ start, text: buffer.join(" ") });
  return chunks;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function TranscriptView({
  transcript,
  scores,
}: {
  transcript: Transcript;
  scores?: ScoredSentence[];
}) {
  const chunks = buildChunks(transcript);
  const scoreAt = (time: number) =>
    scores?.find((sentence) => time >= sentence.start && time <= sentence.end) ?? null;

  return (
    <ScrollArea className="scroll-quiet min-h-0 flex-1">
      <ol className="flex flex-col py-2">
        {chunks.map((chunk, index) => {
          const score = scoreAt(chunk.start);
          const flagged = score?.flagged === true;
          const percent =
            score?.generatedProb === null || score?.generatedProb === undefined
              ? null
              : Math.round(score.generatedProb * 100);

          return (
            <li
              key={index}
              className={cn(
                "flex items-start gap-4 border-l-2 border-transparent px-5 py-2 transition-colors hover:bg-muted/60",
                flagged && "border-red-400/70 bg-red-500/[0.06]",
              )}
            >
              <span className="w-10 shrink-0 pt-px text-right text-[11px] tabular-nums text-muted-foreground">
                {formatTime(chunk.start)}
              </span>
              <span
                className={cn(
                  "flex-1 text-[13.5px] leading-relaxed",
                  flagged ? "text-foreground" : "text-foreground/90",
                )}
              >
                {chunk.text}
              </span>
              {percent !== null ? (
                <span
                  className={cn(
                    "shrink-0 pt-px text-right text-[11px] tabular-nums",
                    flagged ? "font-medium text-red-300" : "text-muted-foreground/70",
                  )}
                  title="GPTZero probability this sentence is AI-written"
                >
                  {percent}%
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </ScrollArea>
  );
}
