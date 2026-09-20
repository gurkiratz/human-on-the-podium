import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuid } from "uuid";
import type { TranscriptSegment } from "@humanonthepodium/shared";
import { config } from "../config.js";

const genAI =
  !config.useMockTranscription && config.geminiApiKey
    ? new GoogleGenerativeAI(config.geminiApiKey)
    : null;

const AI_SLOP_PATTERNS = [
  /rapidly evolving digital landscape/i,
  /leveraging innovative solutions/i,
  /seamless collaboration/i,
  /maximizing productivity/i,
];

const HUMAN_PATTERNS = [
  /debugged a next\.js route/i,
  /auth cookie/i,
  /samesite/i,
];

const CLAIM_PATTERNS = [
  /stanford study/i,
  /87% of job candidates/i,
  /\d+% of .* use ai/i,
];

const FALLBACK_GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
];

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim() || "audio/webm";
}

function isQuotaError(message: string) {
  return /429|quota|Too Many Requests/i.test(message);
}

function summarizeGeminiError(message: string) {
  if (isQuotaError(message)) return "quota exceeded";
  if (/503|high demand|Service Unavailable/i.test(message)) return "temporarily unavailable";
  if (/404|not found|no longer available/i.test(message)) return "model unavailable";
  return message.split("\n")[0].slice(0, 220);
}

function mockTranscribe(
  sessionId: string,
  startTimeMs: number,
  endTimeMs: number,
  audioSize: number,
): TranscriptSegment {
  const phase = Math.floor(endTimeMs / 6000) % 3;
  let text: string;

  if (phase === 2) {
    text =
      "A 2025 Stanford study found that 87% of job candidates use AI to cheat in interviews.";
  } else if (phase === 1) {
    text =
      "In today's rapidly evolving digital landscape, leveraging innovative solutions is essential for maximizing productivity and ensuring seamless collaboration across teams.";
  } else if (endTimeMs >= 2000 || audioSize > 5000) {
    text =
      "Last week I debugged a Next.js route where our auth cookie was not being sent because SameSite was set wrong.";
  } else {
    text =
      "Listening to tab audio. Transcription will appear here as speech is detected.";
  }

  return {
    id: uuid(),
    sessionId,
    startTimeMs,
    endTimeMs,
    text,
    createdAt: new Date().toISOString(),
  };
}

async function geminiTranscribe(buffer: Buffer, mimeType: string): Promise<string> {
  if (!genAI) {
    throw new Error("Gemini transcription is not configured");
  }

  const models = [...new Set([...FALLBACK_GEMINI_MODELS, config.geminiModel])];
  const failures: string[] = [];

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        {
          text: "Transcribe the following audio. Return only the spoken words with no commentary, labels, or extra formatting.",
        },
        {
          inlineData: {
            mimeType: normalizeMimeType(mimeType),
            data: buffer.toString("base64"),
          },
        },
      ]);

      const text = result.response.text().trim();
      if (text) {
        if (modelName !== config.geminiModel) {
          console.warn(
            `Configured Gemini model ${config.geminiModel} failed; transcribed with ${modelName}.`,
          );
        }
        return text;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${modelName}: ${summarizeGeminiError(message)}`);
    }
  }

  throw new Error(
    `Gemini transcription failed for all models (${models.join(", ")}). ${failures.join(" | ")}`,
  );
}

export async function transcribeAudioChunk(params: {
  sessionId: string;
  startTimeMs: number;
  endTimeMs: number;
  buffer: Buffer;
  mimeType: string;
}): Promise<TranscriptSegment> {
  const { sessionId, startTimeMs, endTimeMs, buffer, mimeType } = params;

  if (config.useMockTranscription || !genAI) {
    return mockTranscribe(sessionId, startTimeMs, endTimeMs, buffer.length);
  }

  let text: string;
  try {
    text = await geminiTranscribe(buffer, mimeType);
  } catch (error) {
    if (config.forceMockApis) {
      return mockTranscribe(sessionId, startTimeMs, endTimeMs, buffer.length);
    }
    throw error;
  }

  return {
    id: uuid(),
    sessionId,
    startTimeMs,
    endTimeMs,
    text,
    createdAt: new Date().toISOString(),
  };
}

export function detectMockScore(text: string): { score: number; flaggedPhrase?: string } {
  for (const pattern of AI_SLOP_PATTERNS) {
    if (pattern.test(text)) {
      return { score: 86, flaggedPhrase: "rapidly evolving digital landscape" };
    }
  }
  for (const pattern of CLAIM_PATTERNS) {
    if (pattern.test(text)) {
      return { score: 62, flaggedPhrase: "unsupported factual claim detected" };
    }
  }
  for (const pattern of HUMAN_PATTERNS) {
    if (pattern.test(text)) {
      return { score: 18 };
    }
  }
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 10) return { score: 25 };
  return { score: 42 };
}
