import { useEffect, useState } from "react";
import { ClaimsList } from "../../components/ClaimsList";
import { DebugChunks } from "../../components/DebugChunks";
import { RiskBadge } from "../../components/RiskBadge";
import { ScoreMeter } from "../../components/ScoreMeter";
import { StatusBar } from "../../components/StatusBar";
import { TimelineChart } from "../../components/TimelineChart";
import { TranscriptList } from "../../components/TranscriptList";
import { useLiveSession } from "../../hooks/useLiveSession";
import { fetchReport, reportUrl } from "../../utils/api";
import { downloadReport } from "../../utils/exportReport";
import type { BackgroundMessage, BackgroundResponse } from "../../utils/messages";

function sendBackground(message: BackgroundMessage): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

type Tab = "live" | "report" | "debug";

function isRestrictedTabUrl(url?: string) {
  return !url || /^(chrome|edge|brave|about|chrome-extension):\/\//.test(url);
}

function getTabStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError || !id) {
        reject(new Error(chrome.runtime.lastError?.message ?? "Tab capture failed"));
        return;
      }
      resolve(id);
    });
  });
}

export default function App() {
  const live = useLiveSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("live");

  useEffect(() => {
    void sendBackground({ type: "GET_STATE" }).then((res) => {
      if (res.ok && res.sessionId) {
        live.setSessionId(res.sessionId);
        live.setCapturing(Boolean(res.capturing));
        live.connect(res.sessionId);
      }
    });
  }, []);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) throw new Error("No active tab found");
      if (isRestrictedTabUrl(tab.url)) {
        throw new Error(
          "Open a normal web page with audible tab audio before starting capture.",
        );
      }
      const streamId = await getTabStreamId(tab.id);
      const res = await sendBackground({
        type: "START_CAPTURE",
        tabId: tab.id,
        streamId,
        sourceUrl: tab.url,
        title: tab.title,
      });
      if (!res.ok) throw new Error(res.error);
      if (res.sessionId) {
        live.setSessionId(res.sessionId);
        live.setCapturing(true);
        live.connect(res.sessionId);
        setActiveTab("live");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start capture");
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    setError(null);
    try {
      const res = await sendBackground({ type: "STOP_CAPTURE" });
      if (!res.ok) throw new Error(res.error);
      live.setCapturing(false);
      live.disconnect();
      if (res.sessionId) {
        live.setSessionId(res.sessionId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop capture");
    } finally {
      setLoading(false);
    }
  }

  function openFullReport() {
    if (!live.sessionId) return;
    void chrome.tabs.create({ url: reportUrl(live.sessionId) });
  }

  async function handleExport(format: "markdown" | "json") {
    if (!live.sessionId) return;
    try {
      const report = await fetchReport(live.sessionId);
      downloadReport(report, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  const overlay = live.overlay;
  const score = overlay?.aiScore ?? 0;
  const label = overlay?.label ?? "low";

  return (
    <div className={`app-shell app-shell--${label}`}>
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__logo">HP</div>
          <div>
            <h1>HumanonthePodium</h1>
            <p className="app-header__subtitle">Authenticity analysis</p>
          </div>
        </div>
      </header>

      <div className="app-body">
        <section className="panel">
          <StatusBar
            status={live.status}
            message={live.statusMessage}
            latencyMs={overlay?.latencyMs}
            capturing={live.capturing}
            label={label}
            score={score}
          />

          {(error || live.error) && (
            <div className="error-banner">{error ?? live.error}</div>
          )}

          <div className="controls" style={{ marginTop: 10 }}>
            {!live.capturing ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleStart}
                disabled={loading}
              >
                Start listening
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleStop}
                disabled={loading}
              >
                Stop capture
              </button>
            )}
            {live.sessionId && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={openFullReport}
              >
                Full report
              </button>
            )}
          </div>
        </section>

        <div className="tabs">
          <button
            type="button"
            className={`tab${activeTab === "live" ? " tab--active" : ""}`}
            onClick={() => setActiveTab("live")}
          >
            Live
          </button>
          <button
            type="button"
            className={`tab${activeTab === "report" ? " tab--active" : ""}`}
            onClick={() => setActiveTab("report")}
          >
            Analysis
          </button>
          <button
            type="button"
            className={`tab${activeTab === "debug" ? " tab--active" : ""}`}
            onClick={() => setActiveTab("debug")}
          >
            Debug
          </button>
        </div>

        {activeTab === "live" && (
          <>
            <section className={`panel panel--risk-${label}`}>
              <ScoreMeter score={score} label={label} />
              <RiskBadge label={label} score={score} />
              {overlay?.flaggedPhrase && (
                <p className="flagged-phrase">
                  <strong>Flagged:</strong> &ldquo;{overlay.flaggedPhrase}&rdquo;
                </p>
              )}
              {overlay?.claimWarning && (
                <p className="claim-warning">{overlay.claimWarning}</p>
              )}
            </section>

            <section className="panel">
              <h2 className="panel__title">Score timeline</h2>
              <TimelineChart
                detections={live.detections}
                chunks={live.chunks}
                compact
              />
            </section>

            <section className="panel">
              <h2 className="panel__title">Transcript</h2>
              <TranscriptList
                segments={live.segments}
                detections={live.detections}
                chunks={live.chunks}
                limit={20}
              />
            </section>
          </>
        )}

        {activeTab === "debug" && (
          <section className="panel">
            <h2 className="panel__title">GPTZero chunks</h2>
            <DebugChunks chunks={live.chunks} detections={live.detections} />
          </section>
        )}

        {activeTab === "report" && (
          <>
            {live.claims.length > 0 && (
              <section className="panel">
                <h2 className="panel__title">Claims</h2>
                <ClaimsList claims={live.claims} />
              </section>
            )}

            {live.explanations.length > 0 && (
              <section className="panel">
                <h2 className="panel__title">Explanations</h2>
                {live.explanations.map((exp) => (
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

            {live.detections.length > 0 && (
              <section className="panel">
                <h2 className="panel__title">Top risk moments</h2>
                <ul className="risk-list">
                  {[...live.detections]
                    .sort((a, b) => b.aiScore - a.aiScore)
                    .slice(0, 3)
                    .map((d) => {
                      const chunk = live.chunks.find((c) => c.id === d.chunkId);
                      return (
                        <li key={d.id}>
                          <div className="risk-list__head">
                            <RiskBadge label={d.label} score={d.aiScore} compact />
                          </div>
                          <p className="risk-list__text">
                            {chunk?.text ?? d.flaggedPhrase ?? "No transcript"}
                          </p>
                        </li>
                      );
                    })}
                </ul>
              </section>
            )}

            {live.sessionId && (
              <section className="panel">
                <h2 className="panel__title">Export</h2>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => handleExport("markdown")}
                  >
                    Export Markdown
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => handleExport("json")}
                  >
                    Export JSON
                  </button>
                </div>
              </section>
            )}

            {live.claims.length === 0 &&
              live.explanations.length === 0 &&
              live.detections.length === 0 && (
                <p className="empty-state">
                  Start capture on a tab with audible speech to see analysis results.
                </p>
              )}
          </>
        )}

        <p className="disclaimer">
          Probabilistic signal only. This is not definitive.
        </p>
      </div>
    </div>
  );
}
