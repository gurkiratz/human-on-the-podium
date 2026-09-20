import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import type { LiveEvent, TranscriptSegment } from "@humanonthepodium/shared";
import { config } from "../config.js";
import { processTranscriptSegment } from "./pipelineService.js";

type BroadcastFn = (sessionId: string, event: LiveEvent) => void;

interface GeminiLiveMessage {
  serverContent?: {
    interimInputTranscription?: {
      text?: string;
    };
    inputTranscription?: {
      text?: string;
    };
  };
  error?: {
    message?: string;
  };
}

interface LiveTranscriptionSession {
  sendAudio(data: string): void;
  close(): void;
}

const GEMINI_LIVE_MODEL = "gemini-3.5-transcribe-live";
const GEMINI_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

function cleanTranscript(text: string | undefined) {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

function readTranscriptionText(content: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!content) return "";
  for (const key of keys) {
    const value = content[key];
    if (value && typeof value === "object" && "text" in value) {
      const text = (value as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        return cleanTranscript(text);
      }
    }
  }
  return "";
}

function transcriptDelta(incoming: string, lastUtterance: string, committed: string) {
  const next = cleanTranscript(incoming);
  if (!next) return "";

  const nextNorm = next.toLowerCase();
  const lastNorm = lastUtterance.toLowerCase();
  const committedNorm = committed.toLowerCase();

  if (nextNorm === lastNorm || nextNorm === committedNorm) return "";

  // Growing session or current-utterance transcript.
  if (committed && nextNorm.startsWith(committedNorm)) {
    return cleanTranscript(next.slice(committed.length));
  }
  if (lastUtterance && nextNorm.startsWith(lastNorm)) {
    return cleanTranscript(next.slice(lastUtterance.length));
  }

  return next;
}

export function startGeminiLiveTranscription(params: {
  sessionId: string;
  broadcast: BroadcastFn;
}): LiveTranscriptionSession {
  const { sessionId, broadcast } = params;
  if (!config.geminiApiKey) {
    throw new Error("Gemini API key is required for live transcription");
  }

  const startedAt = Date.now();
  let lastFinalEndMs = 0;
  let committedText = "";
  let lastUtterance = "";
  let closed = false;
  let processingQueue: Promise<void> = Promise.resolve();
  const pendingAudio: string[] = [];

  const socket = new WebSocket(`${GEMINI_WS_URL}?key=${config.geminiApiKey}`);

  function sendAudioFrame(data: string) {
    if (socket.readyState !== WebSocket.OPEN) {
      pendingAudio.push(data);
      return;
    }
    socket.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data,
            mimeType: "audio/pcm;rate=16000",
          },
        },
      }),
    );
  }

  function enqueueTranscript(text: string) {
    const cleanText = cleanTranscript(text);
    if (!cleanText) return;

    const endTimeMs = Math.max(Date.now() - startedAt, lastFinalEndMs + 1);
    const startTimeMs = lastFinalEndMs;
    lastFinalEndMs = endTimeMs;
    committedText = [committedText, cleanText].filter(Boolean).join(" ");

    const segment: TranscriptSegment = {
      id: uuid(),
      sessionId,
      startTimeMs,
      endTimeMs,
      text: cleanText,
      createdAt: new Date().toISOString(),
    };

    processingQueue = processingQueue
      .then(() => processTranscriptSegment({ sessionId, segment, broadcast }))
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Live transcript processing failed";
        broadcast(sessionId, { type: "error", payload: { message } });
      });
  }

  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        setup: {
          model: `models/${GEMINI_LIVE_MODEL}`,
          generationConfig: {
            responseModalities: ["TEXT"],
          },
          inputAudioTranscription: {
            languageCodes: [],
            mode: "SMART",
          },
        },
      }),
    );

    broadcast(sessionId, {
      type: "status",
      payload: { status: "capturing" },
    });

    while (pendingAudio.length > 0) {
      sendAudioFrame(pendingAudio.shift()!);
    }
  });

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as GeminiLiveMessage;
      if (message.error?.message) {
        broadcast(sessionId, {
          type: "error",
          payload: { message: message.error.message },
        });
        return;
      }

      const content = (message.serverContent ?? undefined) as
        | Record<string, unknown>
        | undefined;
      const interimText = readTranscriptionText(
        content,
        "interimInputTranscription",
        "interim_input_transcription",
      );
      const finalText = readTranscriptionText(
        content,
        "inputTranscription",
        "input_transcription",
      );

      if (interimText) {
        broadcast(sessionId, {
          type: "status",
          payload: { status: "transcribing" },
        });
        broadcast(sessionId, {
          type: "transcript",
          payload: {
            id: `${sessionId}-interim`,
            sessionId,
            startTimeMs: lastFinalEndMs,
            endTimeMs: Math.max(Date.now() - startedAt, lastFinalEndMs + 1),
            text: interimText,
            createdAt: new Date().toISOString(),
          },
        });
      }

      if (finalText) {
        const nextText = transcriptDelta(finalText, lastUtterance, committedText);
        if (nextText) {
          lastUtterance = finalText;
          enqueueTranscript(nextText);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse Gemini live message";
      broadcast(sessionId, { type: "error", payload: { message } });
    }
  });

  socket.on("error", (error) => {
    broadcast(sessionId, {
      type: "error",
      payload: { message: `Gemini Live transcription error: ${error.message}` },
    });
  });

  socket.on("close", () => {
    if (!closed) {
      broadcast(sessionId, {
        type: "status",
        payload: { status: "capturing" },
      });
    }
  });

  return {
    sendAudio(data: string) {
      if (closed) return;
      sendAudioFrame(data);
    },
    close() {
      closed = true;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            realtimeInput: {
              audioStreamEnd: true,
            },
          }),
        );
      }
      socket.close();
    },
  };
}
