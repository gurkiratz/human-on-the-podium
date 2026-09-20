import type { RiskLabel } from "@humanonthepodium/shared";
import { labelToRiskText, riskColor } from "@humanonthepodium/shared";

interface ScoreMeterProps {
  score: number;
  label: RiskLabel;
}

export function ScoreMeter({ score, label }: ScoreMeterProps) {
  return (
    <div className={`score-meter score-meter--${label}`}>
      <div className="score-meter__value" style={{ color: riskColor(label) }}>
        {Math.round(score)}
        <span className="score-meter__unit">%</span>
      </div>
      <div className="score-meter__bar-track">
        <div
          className="score-meter__bar-fill"
          style={{
            width: `${Math.min(100, Math.max(0, score))}%`,
            background: riskColor(label),
          }}
        />
      </div>
      <div className="score-meter__caption" style={{ color: riskColor(label) }}>
        {labelToRiskText(label)}
      </div>
    </div>
  );
}
