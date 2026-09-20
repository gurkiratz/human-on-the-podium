import { useEffect, useRef } from "react";
import type { DetectionResult, TranscriptSegment } from "@humanonthepodium/shared";
import { formatTimeMs, riskColor } from "@humanonthepodium/shared";

interface TranscriptListProps {
  segments: TranscriptSegment[];
  detections: DetectionResult[];
  chunks: { id: string; startTimeMs: number; endTimeMs: number }[];
  limit?: number;
}

export function TranscriptList({
  segments,
  detections,
  chunks,
  limit,
}: TranscriptListProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const items = limit ? segments.slice(-limit) : segments;

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [items.length]);

  if (items.length === 0) {
    return <p className="empty-state">Transcript will appear as speech is detected.</p>;
  }

  return (
    <div className="transcript-list" ref={listRef}>
      {items.map((segment) => {
        const chunk = chunks.find(
          (c) =>
            segment.startTimeMs >= c.startTimeMs &&
            segment.endTimeMs <= c.endTimeMs,
        );
        const detection = chunk
          ? detections.find((d) => d.chunkId === chunk.id)
          : undefined;

        return (
          <div key={segment.id} className={`transcript-item${segment.id.endsWith("-interim") ? " transcript-item--preview" : ""}`}>
            <div className="transcript-item__meta">
              <time>{formatTimeMs(segment.startTimeMs)}</time>
              {detection && (
                <span
                  className="transcript-item__score"
                  style={{ color: riskColor(detection.label) }}
                >
                  {detection.aiScore}%
                </span>
              )}
            </div>
            <p className="transcript-item__text">{segment.text}</p>
          </div>
        );
      })}
    </div>
  );
}
