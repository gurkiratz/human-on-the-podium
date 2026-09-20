import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuid } from "uuid";
import type {
  Claim,
  CreateSessionRequest,
  DetectionResult,
  Explanation,
  LiveOverlayState,
  Session,
  SessionReport,
  TranscriptChunk,
  TranscriptSegment,
} from "@humanonthepodium/shared";
import { labelToRiskText, scoreToLabel } from "@humanonthepodium/shared";
import { buildEnhancedSummary } from "../services/analysisService.js";
import { config } from "../config.js";

interface SessionData {
  session: Session;
  segments: TranscriptSegment[];
  chunks: TranscriptChunk[];
  detections: DetectionResult[];
  explanations: Explanation[];
  claims: Claim[];
  lastAnalysisAt?: string;
  alertPhrase?: string;
}

export class SessionStore {
  private sessions = new Map<string, SessionData>();
  private writeQueue: Promise<void> = Promise.resolve();

  async init() {
    if (!existsSync(config.dataDir)) {
      await mkdir(config.dataDir, { recursive: true });
    }
    const indexPath = join(config.dataDir, "sessions.json");
    if (existsSync(indexPath)) {
      const raw = await readFile(indexPath, "utf-8");
      try {
        const parsed = JSON.parse(raw) as Record<string, SessionData>;
        for (const [id, data] of Object.entries(parsed)) {
          if (!data.claims) data.claims = [];
          if (!data.explanations) data.explanations = [];
          this.sessions.set(id, data);
        }
      } catch (error) {
        console.warn(
          `[HumanonthePodium] Ignoring corrupt sessions.json (${error instanceof Error ? error.message : "parse error"}); starting empty.`,
        );
        await writeFile(indexPath, "{}");
      }
    }
  }

  private persist() {
    this.writeQueue = this.writeQueue
      .then(async () => {
        const indexPath = join(config.dataDir, "sessions.json");
        const tmpPath = `${indexPath}.tmp`;
        const obj = Object.fromEntries(this.sessions.entries());
        const payload = JSON.stringify(obj, null, 2);
        await writeFile(tmpPath, payload);
        try {
          await rename(tmpPath, indexPath);
        } catch {
          await writeFile(indexPath, payload);
          await unlink(tmpPath).catch(() => undefined);
        }
      })
      .catch((error) => {
        console.error("[HumanonthePodium] Failed to persist sessions:", error);
      });
  }

  createSession(input: CreateSessionRequest): Session {
    const session: Session = {
      id: uuid(),
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      title: input.title,
      startedAt: new Date().toISOString(),
      status: "capturing",
    };
    this.sessions.set(session.id, {
      session,
      segments: [],
      chunks: [],
      detections: [],
      explanations: [],
      claims: [],
    });
    void this.persist();
    return session;
  }

  getSession(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId: string, patch: Partial<Session>) {
    const data = this.sessions.get(sessionId);
    if (!data) return;
    data.session = { ...data.session, ...patch };
    void this.persist();
  }

  addSegment(segment: TranscriptSegment) {
    const data = this.sessions.get(segment.sessionId);
    if (!data) return;
    const incoming = segment.text.trim().replace(/\s+/g, " ").toLowerCase();
    const last = data.segments.at(-1)?.text.trim().replace(/\s+/g, " ").toLowerCase();
    if (last && incoming === last) {
      return false;
    }
    data.segments.push(segment);
    void this.persist();
    return true;
  }

  addChunk(chunk: TranscriptChunk) {
    const data = this.sessions.get(chunk.sessionId);
    if (!data) return;
    data.chunks.push(chunk);
    void this.persist();
  }

  addDetection(detection: DetectionResult) {
    const data = this.sessions.get(detection.sessionId);
    if (!data) return;
    data.detections.push(detection);
    const scores = data.detections.map((d) => d.aiScore);
    data.session.averageAiLikelihood =
      scores.reduce((a, b) => a + b, 0) / scores.length;
    data.session.peakAiLikelihood = Math.max(
      data.session.peakAiLikelihood ?? 0,
      ...scores,
    );
    if (detection.flaggedPhrase && detection.aiScore >= (data.session.peakAiLikelihood ?? 0)) {
      data.alertPhrase = detection.flaggedPhrase;
    }
    data.lastAnalysisAt = new Date().toISOString();
    void this.persist();
  }

  raiseAlert(sessionId: string, score: number, flaggedPhrase?: string) {
    const data = this.sessions.get(sessionId);
    if (!data) return false;
    if (score <= (data.session.peakAiLikelihood ?? 0)) return false;
    data.session.peakAiLikelihood = score;
    if (flaggedPhrase) data.alertPhrase = flaggedPhrase;
    data.lastAnalysisAt = new Date().toISOString();
    void this.persist();
    return true;
  }

  addExplanation(explanation: Explanation) {
    const data = this.sessions.get(explanation.sessionId);
    if (!data) return;
    const signature = [
      explanation.summary.trim().toLowerCase(),
      explanation.flaggedSentences.join("|").trim().toLowerCase(),
      explanation.recommendedFollowUp?.trim().toLowerCase() ?? "",
    ].join(":");
    const duplicate = data.explanations.some((existing) => {
      const existingSignature = [
        existing.summary.trim().toLowerCase(),
        existing.flaggedSentences.join("|").trim().toLowerCase(),
        existing.recommendedFollowUp?.trim().toLowerCase() ?? "",
      ].join(":");
      return existingSignature === signature;
    });
    if (duplicate) return;
    data.explanations.push(explanation);
    void this.persist();
  }

  addClaim(claim: Claim) {
    const data = this.sessions.get(claim.sessionId);
    if (!data) return;
    const normalizedText = claim.text.trim().toLowerCase();
    const duplicate = data.claims.some(
      (existing) =>
        existing.claimType === claim.claimType &&
        existing.text.trim().toLowerCase() === normalizedText,
    );
    if (duplicate) return;
    data.claims.push(claim);
    void this.persist();
  }

  endSession(sessionId: string) {
    const data = this.sessions.get(sessionId);
    if (!data) return;
    data.session.endedAt = new Date().toISOString();
    data.session.status = "ready";
    const lastSegment = data.segments.at(-1);
    if (lastSegment) {
      data.session.totalDurationSeconds = Math.ceil(lastSegment.endTimeMs / 1000);
    }
    void this.persist();
  }

  getOverlayState(sessionId: string): LiveOverlayState | undefined {
    const data = this.sessions.get(sessionId);
    if (!data) return undefined;
    const latestSegment = data.segments.at(-1);
    const latestClaim = data.claims.filter((c) => c.needsVerification).at(-1);
    const peakDetection = data.detections.reduce<DetectionResult | undefined>(
      (best, detection) =>
        !best || detection.aiScore > best.aiScore ? detection : best,
      undefined,
    );
    const score = Math.max(
      peakDetection?.aiScore ?? 0,
      data.session.peakAiLikelihood ?? 0,
    );
    const label = scoreToLabel(score);

    let latencyMs: number | undefined;
    if (data.lastAnalysisAt && latestSegment) {
      latencyMs = Date.now() - new Date(data.lastAnalysisAt).getTime();
    }

    return {
      sessionId,
      status: data.session.status,
      aiScore: score,
      label,
      riskText: labelToRiskText(label),
      latestTranscript: latestSegment?.text,
      flaggedPhrase:
        peakDetection && peakDetection.aiScore >= score
          ? peakDetection.flaggedPhrase
          : data.alertPhrase ?? peakDetection?.flaggedPhrase,
      claimWarning: latestClaim
        ? "Citation needed — unsupported claim risk"
        : undefined,
      latencyMs,
      updatedAt: new Date().toISOString(),
    };
  }

  buildReport(sessionId: string): SessionReport | undefined {
    const data = this.sessions.get(sessionId);
    if (!data) return undefined;

    const topRiskMoments = [...data.detections]
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 3);

    const avg = data.session.averageAiLikelihood ?? 0;
    const peak = data.session.peakAiLikelihood ?? 0;
    const highCount = data.detections.filter((d) => d.label === "high").length;
    const uniqueClaims = Array.from(
      new Map(
        data.claims.map((claim) => [
          `${claim.claimType}:${claim.text.trim().toLowerCase()}`,
          claim,
        ]),
      ).values(),
    );
    const uniqueExplanations = Array.from(
      new Map(
        data.explanations.map((explanation) => [
          [
            explanation.summary.trim().toLowerCase(),
            explanation.flaggedSentences.join("|").trim().toLowerCase(),
            explanation.recommendedFollowUp?.trim().toLowerCase() ?? "",
          ].join(":"),
          explanation,
        ]),
      ).values(),
    );
    const claimCount = uniqueClaims.filter((c) => c.needsVerification).length;

    const summary = buildEnhancedSummary({
      chunkCount: data.chunks.length,
      avg,
      peak,
      highCount,
      claimCount,
    });

    return {
      session: data.session,
      segments: data.segments,
      chunks: data.chunks,
      detections: data.detections,
      explanations: uniqueExplanations,
      claims: uniqueClaims,
      topRiskMoments,
      summary,
    };
  }
}

export const sessionStore = new SessionStore();
