import { useEffect, useRef } from "react";
import type { DetectionResult, TranscriptChunk } from "@humanonthepodium/shared";
import { formatTimeMs, riskColor } from "@humanonthepodium/shared";

interface DebugChunksProps {
  chunks: TranscriptChunk[];
  detections: DetectionResult[];
}

export function DebugChunks({ chunks, detections }: DebugChunksProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [chunks.length, detections.length]);

  if (chunks.length === 0 && detections.length === 0) {
    return (
      <p className="empty-state">
        GPTZero chunks will appear here after enough speech is buffered.
      </p>
    );
  }

  return (
    <div className="debug-chunks" ref={listRef}>
      {chunks.map((chunk, index) => {
        const detection = detections.find((item) => item.chunkId === chunk.id);
        return (
          <article key={chunk.id} className="debug-chunk">
            <header className="debug-chunk__head">
              <span className="debug-chunk__index">Chunk {index + 1}</span>
              <time>
                {formatTimeMs(chunk.startTimeMs)}–{formatTimeMs(chunk.endTimeMs)}
              </time>
            </header>
            <p className="debug-chunk__label">Sent to GPTZero</p>
            <pre className="debug-chunk__text">{chunk.text}</pre>
            <dl className="debug-chunk__meta">
              <div>
                <dt>Words</dt>
                <dd>{chunk.wordCount}</dd>
              </div>
              {detection ? (
                <>
                  <div>
                    <dt>Score</dt>
                    <dd style={{ color: riskColor(detection.label) }}>
                      {detection.aiScore}% · {detection.label}
                    </dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>{detection.provider}</dd>
                  </div>
                  {detection.flaggedPhrase && (
                    <div>
                      <dt>Flagged</dt>
                      <dd>{detection.flaggedPhrase}</dd>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <dt>Result</dt>
                  <dd>Waiting for GPTZero…</dd>
                </div>
              )}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
