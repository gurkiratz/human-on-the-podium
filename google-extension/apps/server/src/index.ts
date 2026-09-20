import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import type { CreateSessionRequest, LiveEvent } from "@humanonthepodium/shared";
import { config } from "./config.js";
import {
  finalizeSession,
  processAudioChunk,
} from "./services/pipelineService.js";
import { startGeminiLiveTranscription } from "./services/geminiLiveTranscriptionService.js";
import { sessionStore } from "./store/sessionStore.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
await app.register(websocket);

const wsClients = new Map<string, Set<(event: LiveEvent) => void>>();
const liveTranscriptionSessions = new Map<
  string,
  ReturnType<typeof startGeminiLiveTranscription>
>();

function broadcast(sessionId: string, event: LiveEvent) {
  const clients = wsClients.get(sessionId);
  if (!clients) return;
  for (const send of clients) {
    send(event);
  }
}

await sessionStore.init();

app.get("/health", async () => ({
  ok: true,
  mockTranscription: config.useMockTranscription,
  mockGptZero: config.useMockGptZero,
  geminiModel: config.geminiModel,
}));

app.post<{ Body: CreateSessionRequest }>("/api/sessions", async (request) => {
  const session = sessionStore.createSession(request.body ?? {
    sourceType: "youtube",
  });
  return session;
});

app.get<{ Params: { sessionId: string } }>(
  "/api/sessions/:sessionId",
  async (request, reply) => {
    const data = sessionStore.getSession(request.params.sessionId);
    if (!data) return reply.code(404).send({ error: "Session not found" });
    return {
      session: data.session,
      segments: data.segments,
      chunks: data.chunks,
      detections: data.detections,
      explanations: data.explanations,
      claims: data.claims,
      overlay: sessionStore.getOverlayState(request.params.sessionId),
    };
  },
);

app.get<{ Params: { sessionId: string } }>(
  "/api/sessions/:sessionId/report",
  async (request, reply) => {
    const report = sessionStore.buildReport(request.params.sessionId);
    if (!report) return reply.code(404).send({ error: "Session not found" });
    return report;
  },
);

app.post<{ Params: { sessionId: string } }>(
  "/api/sessions/:sessionId/end",
  async (request, reply) => {
    const data = sessionStore.getSession(request.params.sessionId);
    if (!data) return reply.code(404).send({ error: "Session not found" });
    liveTranscriptionSessions.get(request.params.sessionId)?.close();
    liveTranscriptionSessions.delete(request.params.sessionId);
    await finalizeSession(request.params.sessionId, broadcast);
    return { ok: true };
  },
);

app.post<{ Params: { sessionId: string } }>(
  "/api/sessions/:sessionId/audio",
  async (request, reply) => {
    const { sessionId } = request.params;
    const data = sessionStore.getSession(sessionId);
    if (!data) return reply.code(404).send({ error: "Session not found" });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "No audio file provided" });

    const fields = file.fields as Record<string, { value?: string }>;
    const startTimeMs = Number(fields.startTimeMs?.value ?? 0);
    const endTimeMs = Number(fields.endTimeMs?.value ?? 0);
    const buffer = await file.toBuffer();

    try {
      await processAudioChunk({
        sessionId,
        startTimeMs,
        endTimeMs,
        buffer,
        mimeType: file.mimetype || "audio/webm",
        broadcast,
      });
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Audio processing failed";
      sessionStore.updateSession(sessionId, {
        status: "error",
        errorMessage: message,
      });
      broadcast(sessionId, { type: "error", payload: { message } });
      return reply.code(500).send({ error: message });
    }
  },
);

app.get<{ Params: { sessionId: string } }>(
  "/api/sessions/:sessionId/audio-live",
  { websocket: true },
  (socket, request) => {
    const { sessionId } = request.params;
    const data = sessionStore.getSession(sessionId);
    if (!data) {
      socket.close();
      return;
    }

    let liveSession = liveTranscriptionSessions.get(sessionId);
    try {
      if (!liveSession) {
        liveSession = startGeminiLiveTranscription({ sessionId, broadcast });
        liveTranscriptionSessions.set(sessionId, liveSession);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start live transcription";
      broadcast(sessionId, { type: "error", payload: { message } });
      socket.close();
      return;
    }

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
        };
        if (message.type === "audio" && message.data) {
          liveSession?.sendAudio(message.data);
        }
        if (message.type === "stop") {
          liveSession?.close();
          liveTranscriptionSessions.delete(sessionId);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid live audio message";
        broadcast(sessionId, { type: "error", payload: { message } });
      }
    });

    socket.on("close", () => {
      liveSession?.close();
      liveTranscriptionSessions.delete(sessionId);
    });
  },
);

app.get<{ Params: { sessionId: string } }>(
  "/api/sessions/:sessionId/live",
  { websocket: true },
  (socket, request) => {
    const { sessionId } = request.params;
    let clients = wsClients.get(sessionId);
    if (!clients) {
      clients = new Set();
      wsClients.set(sessionId, clients);
    }

    const send = (event: LiveEvent) => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(event));
      }
    };
    clients.add(send);

    const overlay = sessionStore.getOverlayState(sessionId);
    if (overlay) {
      send({ type: "overlay", payload: overlay });
    }

    socket.on("close", () => {
      clients?.delete(send);
      if (clients?.size === 0) {
        wsClients.delete(sessionId);
      }
    });
  },
);

try {
  await app.listen({ host: config.host, port: config.port });
  console.log(
    `HumanonthePodium server running at http://${config.host}:${config.port} (mockTranscription=${config.useMockTranscription}, mockGptZero=${config.useMockGptZero})`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
