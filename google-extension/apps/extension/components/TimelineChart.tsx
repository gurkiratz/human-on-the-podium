import { useEffect, useRef } from "react";
import type { DetectionResult, TranscriptChunk } from "@humanonthepodium/shared";
import { formatTimeMs, riskColor } from "@humanonthepodium/shared";

interface TimelineChartProps {
  detections: DetectionResult[];
  chunks: TranscriptChunk[];
  compact?: boolean;
}

export function TimelineChart({ detections, chunks, compact }: TimelineChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.scrollLeft = chart.scrollWidth;
  }, [detections.length]);

  if (detections.length === 0) {
    return <p className="empty-state">No scores yet.</p>;
  }

  const maxScore = Math.max(100, ...detections.map((d) => d.aiScore), 1);

  return (
    <div
      className={`timeline-chart${compact ? " timeline-chart--compact" : ""}`}
      ref={chartRef}
    >
      {detections.map((d) => {
        const chunk = chunks.find((c) => c.id === d.chunkId);
        return (
          <div key={d.id} className="timeline-chart__bar-wrap">
            <div
              className="timeline-chart__bar"
              style={{
                height: `${(d.aiScore / maxScore) * 100}%`,
                background: riskColor(d.label),
              }}
              title={`${d.aiScore}% at ${chunk ? formatTimeMs(chunk.startTimeMs) : "?"}`}
            />
            {!compact && (
              <span className="timeline-chart__time">
                {chunk ? formatTimeMs(chunk.startTimeMs) : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
