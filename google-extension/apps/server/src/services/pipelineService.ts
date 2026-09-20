import type { LiveEvent } from "@humanonthepodium/shared";
import type { TranscriptSegment } from "@humanonthepodium/shared";
import { sessionStore } from "../store/sessionStore.js";
import { analyzeChunk, earlyAiSignal } from "./analysisService.js";
import { ChunkingBuffer } from "./chunkingService.js";
import { scoreWithGptZero } from "./gptzeroService.js";
import { transcribeAudioChunk } from "./transcriptionService.js";

type BroadcastFn = (sessionId: string, event: LiveEvent) => void;

const chunkBuffers = new Map<string, ChunkingBuffer>();
const pendingScores = new Map<string, Promise<void>>();

function getBuffer(sessionId: string) {
  let buffer = chunkBuffers.get(sessionId);
  if (!buffer) {
    buffer = new ChunkingBuffer(sessionId);
    chunkBuffers.set(sessionId, buffer);
  }
  return buffer;
}

function alertMessage(score: number, label: string) {
  if (label === "high") return `Likely AI-written · ${Math.round(score)}%`;
  if (label === "medium") return `Possible AI-written · ${Math.round(score)}%`;
  return undefined;
}

function broadcastOverlay(sessionId: string, broadcast: BroadcastFn) {
  const overlay = sessionStore.getOverlayState(sessionId);
  if (!overlay) return;
  broadcast(sessionId, { type: "overlay", payload: overlay });
  broadcast(sessionId, {
    type: "status",
    payload: {
      status: overlay.status,
      message: alertMessage(overlay.aiScore, overlay.label),
    },
  });
}

async function runAnalysis(params: {
  sessionId: string;
  chunkId: string;
  text: string;
  detection: Awaited<ReturnType<typeof scoreWithGptZero>>;
  broadcast: BroadcastFn;
}) {
  const { sessionId, chunkId, text, detection, broadcast } = params;
  const analysis = analyzeChunk({ sessionId, chunkId, text, detection });

  sessionStore.addExplanation(analysis.explanation);
  broadcast(sessionId, { type: "explanation", payload: analysis.explanation });

  for (const claim of analysis.claims) {
    sessionStore.addClaim(claim);
    broadcast(sessionId, { type: "claim", payload: claim });
  }
}

async function scoreChunk(params: {
  sessionId: string;
  chunk: { id: string; text: string };
  broadcast: BroadcastFn;
}) {
  const { sessionId, chunk, broadcast } = params;
  const detection = await scoreWithGptZero({
    sessionId,
    chunkId: chunk.id,
    text: chunk.text,
  });
  sessionStore.addDetection(detection);
  broadcast(sessionId, { type: "detection", payload: detection });

  await runAnalysis({
    sessionId,
    chunkId: chunk.id,
    text: chunk.text,
    detection,
    broadcast,
  });

  sessionStore.updateSession(sessionId, { status: "capturing" });
  broadcastOverlay(sessionId, broadcast);
}

function queueChunkScore(params: {
  sessionId: string;
  chunk: { id: string; text: string };
  broadcast: BroadcastFn;
}) {
  const work = scoreChunk(params).catch((error) => {
    const message =
      error instanceof Error ? error.message : "Detection failed";
    params.broadcast(params.sessionId, { type: "error", payload: { message } });
  });
  const previous = pendingScores.get(params.sessionId) ?? Promise.resolve();
  pendingScores.set(
    params.sessionId,
    previous.then(() => work).catch(() => undefined),
  );
}

export async function processAudioChunk(params: {
  sessionId: string;
  startTimeMs: number;
  endTimeMs: number;
  buffer: Buffer;
  mimeType: string;
  broadcast: BroadcastFn;
}) {
  const { sessionId, startTimeMs, endTimeMs, buffer, mimeType, broadcast } =
    params;

  const data = sessionStore.getSession(sessionId);
  if (!data) throw new Error("Session not found");

  sessionStore.updateSession(sessionId, { status: "transcribing" });
  broadcast(sessionId, { type: "status", payload: { status: "transcribing" } });

  const segment = await transcribeAudioChunk({
    sessionId,
    startTimeMs,
    endTimeMs,
    buffer,
    mimeType,
  });

  await processTranscriptSegment({ sessionId, segment, broadcast });
}

export async function processTranscriptSegment(params: {
  sessionId: string;
  segment: TranscriptSegment;
  broadcast: BroadcastFn;
}) {
  const { sessionId, segment, broadcast } = params;

  sessionStore.updateSession(sessionId, { status: "analyzing" });
  broadcast(sessionId, { type: "status", payload: { status: "analyzing" } });

  const added = sessionStore.addSegment(segment);
  if (added === false) return;
  broadcast(sessionId, { type: "transcript", payload: segment });

  const early = earlyAiSignal(segment.text);
  if (early.score >= 45) {
    sessionStore.raiseAlert(sessionId, early.score, early.flaggedPhrase);
  }

  const chunkBuffer = getBuffer(sessionId);
  const chunk = chunkBuffer.addSegment(segment, { force: early.score >= 50 });

  if (chunk) {
    sessionStore.addChunk(chunk);
    broadcast(sessionId, { type: "chunk", payload: chunk });
    queueChunkScore({ sessionId, chunk, broadcast });
  }

  sessionStore.updateSession(sessionId, { status: "capturing" });
  broadcastOverlay(sessionId, broadcast);
}

export async function finalizeSession(
  sessionId: string,
  broadcast: BroadcastFn,
) {
  const chunkBuffer = getBuffer(sessionId);
  const chunk = chunkBuffer.flush();
  if (chunk) {
    sessionStore.addChunk(chunk);
    broadcast(sessionId, { type: "chunk", payload: chunk });
    queueChunkScore({ sessionId, chunk, broadcast });
  }

  await pendingScores.get(sessionId);
  pendingScores.delete(sessionId);

  sessionStore.endSession(sessionId);
  const overlay = sessionStore.getOverlayState(sessionId);
  if (overlay) {
    overlay.status = "ready";
    broadcast(sessionId, { type: "overlay", payload: overlay });
  }
  broadcast(sessionId, {
    type: "status",
    payload: {
      status: "ready",
      message: overlay ? alertMessage(overlay.aiScore, overlay.label) : undefined,
    },
  });
  chunkBuffers.delete(sessionId);
}
