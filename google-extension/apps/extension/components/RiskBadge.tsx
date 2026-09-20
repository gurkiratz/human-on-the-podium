import type { RiskLabel } from "@humanonthepodium/shared";
import { labelToRiskText, riskColor } from "@humanonthepodium/shared";

interface RiskBadgeProps {
  label: RiskLabel;
  score?: number;
  compact?: boolean;
}

export function RiskBadge({ label, score, compact }: RiskBadgeProps) {
  return (
    <span
      className={`risk-badge risk-badge--${label}${compact ? " risk-badge--compact" : ""}`}
      style={{ color: riskColor(label) }}
    >
      {score !== undefined && (
        <strong className="risk-badge__score">{Math.round(score)}%</strong>
      )}
      <span className="risk-badge__label">{labelToRiskText(label)}</span>
    </span>
  );
}
