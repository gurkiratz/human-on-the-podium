import type {
  CreateSessionRequest,
  LiveEvent,
  LiveOverlayState,
  Session,
  SessionReport,
} from "@humanonthepodium/shared";

export const API_BASE = "http://127.0.0.1:3001";

export async function createSession(
  input: CreateSessionRequest,
): Promise<Session> {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json();
}

export async function uploadAudioChunk(params: {
  sessionId: string;
  blob: Blob;
  startTimeMs: number;
  endTimeMs: number;
}) {
  const form = new FormData();
  const extension = params.blob.type.includes("wav") ? "wav" : "webm";
  form.append("startTimeMs", String(params.startTimeMs));
  form.append("endTimeMs", String(params.endTimeMs));
  form.append("audio", params.blob, `chunk.${extension}`);

  const res = await fetch(
    `${API_BASE}/api/sessions/${params.sessionId}/audio`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to upload audio chunk");
  }
}

export async function endSession(sessionId: string) {
  await fetch(`${API_BASE}/api/sessions/${sessionId}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

export async function fetchReport(sessionId: string): Promise<SessionReport> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/report`);
  if (!res.ok) throw new Error("Failed to fetch report");
  return res.json();
}

export function connectLive(
  sessionId: string,
  onEvent: (event: LiveEvent) => void,
): WebSocket {
  const ws = new WebSocket(
    `ws://127.0.0.1:3001/api/sessions/${sessionId}/live`,
  );
  ws.onmessage = (msg) => {
    onEvent(JSON.parse(msg.data) as LiveEvent);
  };
  return ws;
}

export function liveAudioUrl(sessionId: string) {
  return `ws://127.0.0.1:3001/api/sessions/${sessionId}/audio-live`;
}

export function reportUrl(sessionId: string) {
  return chrome.runtime.getURL(`dashboard.html?sessionId=${sessionId}`);
}

export type { LiveOverlayState, SessionReport };
