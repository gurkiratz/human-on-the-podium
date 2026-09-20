import type { PipelineStatus, RiskLabel } from "@humanonthepodium/shared";
import { labelToRiskText } from "@humanonthepodium/shared";

interface StatusBarProps {
  status: PipelineStatus;
  message?: string;
  latencyMs?: number;
  capturing?: boolean;
  label?: RiskLabel;
  score?: number;
}

const STATUS_LABELS: Record<PipelineStatus, string> = {
  idle: "Idle",
  capturing: "Listening",
  transcribing: "Listening",
  analyzing: "Analyzing",
  ready: "Session complete",
  error: "Error",
};

export function StatusBar({
  status,
  message,
  latencyMs,
  capturing,
  label = "low",
  score = 0,
}: StatusBarProps) {
  const isLive = capturing || status === "capturing" || status === "transcribing" || status === "analyzing";
  const alert = label === "medium" || label === "high";
  const text =
    message ??
    (alert ? `${labelToRiskText(label)} · ${Math.round(score)}%` : STATUS_LABELS[status]);

  return (
    <div className={`status-bar${alert ? ` status-bar--${label}` : ""}`}>
      <span
        className={`status-bar__dot${isLive ? " status-bar__dot--live" : ""}${alert ? ` status-bar__dot--${label}` : ""}`}
      />
      <span className="status-bar__text">{text}</span>
      {latencyMs !== undefined && latencyMs < 60000 && (
        <span className="status-bar__latency">
          {Math.round(latencyMs / 1000)}s ago
        </span>
      )}
    </div>
  );
}
