import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import { upstreamError } from "./errors";
import type { Transcript, TranscriptEntity, TranscriptWord } from "./types";
import { fetchYoutubeDurationSeconds, parseVideoId } from "./youtube";

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL_ID = "scribe_v2";

// Only flag a transcript as truncated when it is clearly short, so a few seconds of trailing
// silence or music never triggers a false positive.
const TRUNCATION_TOLERANCE_SECONDS = 20;
const TRUNCATION_TOLERANCE_RATIO = 0.1;

export interface TranscribeOptions {
  /**
   * Detect entities (names, orgs, PII, offensive language…) with timestamps. Adds a 30%
   * surcharge to the transcription cost, so it is a single switch to turn off.
   */
  detectEntities?: boolean;
  /** Upper bound on speakers, 1-32. Helps diarization on crowded audio. */
  numSpeakers?: number;
  /** Terms to bias recognition toward. Adds a 20% surcharge; max 1000, 5 words each. */
  keyterms?: string[];
  /** Strip filler words and false starts. Off by default so the transcript stays verbatim. */
  noVerbatim?: boolean;
}

export const DEFAULT_TRANSCRIBE_OPTIONS: Required<
  Pick<TranscribeOptions, "detectEntities" | "noVerbatim">
> = {
  detectEntities: true,
  noVerbatim: false,
};

interface ElevenLabsEntity {
  text?: string;
  entity_type?: string;
  start_char?: number;
  end_char?: number;
}

interface ElevenLabsResponse {
  language_code?: string;
  language_probability?: number;
  text?: string;
  words?: unknown;
  transcription_id?: string;
  entities?: ElevenLabsEntity[];
}

export async function transcribeYoutube(
  youtubeUrl: string,
  options: TranscribeOptions = {},
): Promise<Transcript> {
  const detectEntities = options.detectEntities ?? DEFAULT_TRANSCRIBE_OPTIONS.detectEntities;

  const form = new FormData();
  form.set("model_id", MODEL_ID);
  form.set("source_url", youtubeUrl);
  form.set("timestamps_granularity", "word");
  // Tag every word with a speaker so anchor/narrator can be told apart from the subject.
  form.set("diarize", "true");
  // Keep the non-speech markers (laughter, applause, music) available for the UI.
  form.set("tag_audio_events", "true");
  if (detectEntities) form.set("entity_detection", "all");
  if (options.numSpeakers) form.set("num_speakers", String(options.numSpeakers));
  if (options.noVerbatim) form.set("no_verbatim", "true");
  for (const term of options.keyterms ?? []) {
    const trimmed = term.trim();
    if (trimmed) form.append("keyterms", trimmed);
  }

  const response = await fetch(ELEVENLABS_STT_URL, {
    method: "POST",
    headers: { "xi-api-key": env.elevenLabsApiKey },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw upstreamError("ElevenLabs transcription", response.status, detail);
  }

  const transcript = toTranscript((await response.json()) as ElevenLabsResponse);
  await assertCoversVideo(youtubeUrl, transcript);
  return transcript;
}

/** Reject responses that are not a usable transcript instead of returning empty word data. */
function toTranscript(raw: ElevenLabsResponse): Transcript {
  if (!Array.isArray(raw.words)) {
    if (raw.transcription_id) {
      throw new Error(
        "ElevenLabs queued this as an asynchronous job instead of returning words inline " +
          `(transcription_id ${raw.transcription_id}). Try a shorter clip.`,
      );
    }
    throw new Error("ElevenLabs returned a transcript without word timestamps.");
  }

  return {
    language_code: raw.language_code ?? "unknown",
    language_probability: raw.language_probability,
    text: typeof raw.text === "string" ? raw.text : "",
    words: raw.words as TranscriptWord[],
    entities: toEntities(raw.entities),
  };
}

/** Keep only entities we can place, normalising Scribe's snake_case into our shape. */
function toEntities(raw: ElevenLabsEntity[] | undefined): TranscriptEntity[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const entities = raw.flatMap((entity) => {
    if (
      typeof entity?.text !== "string" ||
      typeof entity.start_char !== "number" ||
      typeof entity.end_char !== "number"
    ) {
      return [];
    }
    return [
      {
        text: entity.text,
        entityType: entity.entity_type ?? "unknown",
        startChar: entity.start_char,
        endChar: entity.end_char,
      },
    ];
  });

  return entities.length > 0 ? entities : undefined;
}

/** Guard against a silently truncated transcript by comparing its end to the video length. */
async function assertCoversVideo(youtubeUrl: string, transcript: Transcript): Promise<void> {
  const videoId = parseVideoId(youtubeUrl);
  if (!videoId) return;

  const expected = await fetchYoutubeDurationSeconds(videoId);
  const covered = transcript.words.length
    ? transcript.words[transcript.words.length - 1].end
    : 0;
  if (!expected || covered <= 0) return;

  const tolerance = Math.max(TRUNCATION_TOLERANCE_SECONDS, expected * TRUNCATION_TOLERANCE_RATIO);
  if (expected - covered > tolerance) {
    throw new Error(
      `ElevenLabs transcript looks truncated: it ends at ${Math.round(covered)}s but the video ` +
        `is ${Math.round(expected)}s long.`,
    );
  }
}

/**
 * Transcribe a local audio file — a clipped excerpt — with word timings, so it can be treated
 * like any other transcript. No truncation guard: a 60s clip is compared against nothing.
 */
export async function transcribeAudioFile(
  audioPath: string,
  options: TranscribeOptions = {},
): Promise<Transcript> {
  const detectEntities = options.detectEntities ?? DEFAULT_TRANSCRIBE_OPTIONS.detectEntities;
  const buffer = fs.readFileSync(audioPath);

  const form = new FormData();
  form.set("model_id", MODEL_ID);
  form.set(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" }),
    path.basename(audioPath),
  );
  form.set("timestamps_granularity", "word");
  form.set("diarize", "true");
  form.set("tag_audio_events", "true");
  if (detectEntities) form.set("entity_detection", "all");
  if (options.numSpeakers) form.set("num_speakers", String(options.numSpeakers));
  if (options.noVerbatim) form.set("no_verbatim", "true");
  for (const term of options.keyterms ?? []) {
    const trimmed = term.trim();
    if (trimmed) form.append("keyterms", trimmed);
  }

  const response = await fetch(ELEVENLABS_STT_URL, {
    method: "POST",
    headers: { "xi-api-key": env.elevenLabsApiKey },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw upstreamError("ElevenLabs transcription", response.status, detail);
  }

  return toTranscript((await response.json()) as ElevenLabsResponse);
}
