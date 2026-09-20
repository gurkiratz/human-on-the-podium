import { useEffect, useMemo, useState } from "react";
import type { SessionReport } from "@humanonthepodium/shared";
import { formatTimeMs, labelToRiskText, riskColor } from "@humanonthepodium/shared";
import { ClaimsList } from "../../components/ClaimsList";
import { TimelineChart } from "../../components/TimelineChart";
import { fetchReport } from "../../utils/api";
import { downloadReport } from "../../utils/exportReport";
import "../../styles/app.css";
import "./style.css";

export default function DashboardApp() {
  const [report, setReport] = useState<SessionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("sessionId");
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing sessionId");
      return;
    }
    void fetchReport(sessionId)
      .then(setReport)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load report"),
      );
  }, [sessionId]);

  if (error) {
    return (
      <div className="dashboard-page">
        <h1>HumanonthePodium Report</h1>
        <p className="error-banner">{error}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="dashboard-page">
        <h1>HumanonthePodium Report</h1>
        <p className="empty-state">Loading session report…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div>
          <div className="app-header__brand">
            <div className="app-header__logo">HP</div>
            <div>
              <h1>Session Report</h1>
              <p className="app-header__subtitle">
                {report.session.title ?? "Untitled session"}
              </p>
            </div>
          </div>
          <p className="dashboard-source">
            {report.session.sourceUrl ?? report.session.sourceType}
          </p>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-card__label">Average</span>
            <strong className="stat-card__value">
              {Math.round(report.session.averageAiLikelihood ?? 0)}%
            </strong>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Peak</span>
            <strong className="stat-card__value">
              {Math.round(report.session.peakAiLikelihood ?? 0)}%
            </strong>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Chunks</span>
            <strong className="stat-card__value">{report.chunks.length}</strong>
          </div>
        </div>
      </header>

      <div className="dashboard-actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => downloadReport(report, "markdown")}
        >
          Export Markdown
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => downloadReport(report, "json")}
        >
          Export JSON
        </button>
      </div>

      <section className="panel">
        <h2 className="panel__title">Summary</h2>
        <p>{report.summary}</p>
        <p className="disclaimer">Probabilistic signal only. This is not definitive.</p>
      </section>

      <section className="panel">
        <h2 className="panel__title">Score timeline</h2>
        <TimelineChart detections={report.detections} chunks={report.chunks} />
      </section>

      <section className="panel">
        <h2 className="panel__title">Top risk moments</h2>
        {report.topRiskMoments.length === 0 ? (
          <p className="empty-state">No high-risk moments recorded.</p>
        ) : (
          <ul className="risk-list">
            {report.topRiskMoments.map((d) => {
              const chunk = report.chunks.find((c) => c.id === d.chunkId);
              return (
                <li key={d.id}>
                  <div className="risk-list__head">
                    <strong style={{ color: riskColor(d.label) }}>
                      {d.aiScore}% — {labelToRiskText(d.label)}
                    </strong>
                    <span>{chunk ? formatTimeMs(chunk.startTimeMs) : ""}</span>
                  </div>
                  <p className="risk-list__text">
                    {chunk?.text ?? d.flaggedPhrase ?? "No transcript"}
                  </p>
                  {d.flaggedPhrase && (
                    <small style={{ color: "var(--text-muted)" }}>
                      Flagged: {d.flaggedPhrase}
                    </small>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {report.claims.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">Claims</h2>
          <ClaimsList claims={report.claims} />
        </section>
      )}

      {report.explanations.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">Explanations</h2>
          {report.explanations.map((exp) => (
            <div key={exp.id} className="explanation-item">
              <p>{exp.summary}</p>
              {exp.flaggedSentences.length > 0 && (
                <small>Flagged: {exp.flaggedSentences.join("; ")}</small>
              )}
              {exp.recommendedFollowUp && (
                <small>Follow-up: {exp.recommendedFollowUp}</small>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h2 className="panel__title">Transcript timeline</h2>
        <div className="transcript-list" style={{ maxHeight: "none" }}>
          {report.segments.map((segment) => {
            const chunk = report.chunks.find(
              (c) =>
                segment.startTimeMs >= c.startTimeMs &&
                segment.endTimeMs <= c.endTimeMs,
            );
            const detection = chunk
              ? report.detections.find((d) => d.chunkId === chunk.id)
              : undefined;
            return (
              <div key={segment.id} className="transcript-item">
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
      </section>
    </div>
  );
}
