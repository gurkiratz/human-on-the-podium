import { z } from "zod/v4";

export const VideoPickSchema = z.object({
  bestUrl: z
    .url()
    .describe("full https://www.youtube.com/watch?v=... URL of the best-matching video"),
  bestTitle: z.string().describe("title of the best-matching video"),
  bestChannel: z.string().describe("channel that published the best-matching video"),
  reason: z.string().describe("one sentence explaining why this is the best match"),
  candidates: z
    .array(
      z.object({
        title: z.string(),
        url: z.url(),
        channel: z.string(),
      }),
    )
    .describe("at most the 5 best search results that were considered"),
});

export type VideoPick = z.infer<typeof VideoPickSchema>;

export interface VideoCandidate {
  title: string;
  url: string;
  channel: string;
}

/** The identifying details of a video, without the live-pick rationale. */
export interface VideoSummary {
  title: string;
  channel: string;
  url: string;
  videoId: string;
  thumbnail: string;
}

export interface VideoProposal extends VideoSummary {
  reason: string;
  candidates: VideoCandidate[];
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  type: string;
  speaker_id?: string;
}

export interface TranscriptEntity {
  text: string;
  entityType: string;
  /** Character offsets into the transcript text, used to place the entity in time. */
  startChar: number;
  endChar: number;
}

export interface Transcript {
  language_code: string;
  language_probability?: number;
  text: string;
  words: TranscriptWord[];
  /** Populated only when entity detection was requested. */
  entities?: TranscriptEntity[];
}

export interface AudioEvent {
  text: string;
  start: number;
  end: number;
}

/** Non-speech sounds Scribe tagged while transcribing (laughter, applause, music…). */
export function audioEvents(transcript: Transcript): AudioEvent[] {
  return transcript.words
    .filter((word) => word.type === "audio_event")
    .map((word) => ({ text: word.text, start: word.start, end: word.end }));
}

/**
 * Map a character offset in the transcript text back to a moment in time by walking the
 * words and accumulating their lengths. Approximate: Scribe interleaves spacing tokens and
 * entity offsets are over normalised text, so callers must tolerate a null.
 */
export function entitySecondsAt(transcript: Transcript, charOffset: number): number | null {
  let cursor = 0;
  for (const word of transcript.words) {
    const end = cursor + word.text.length;
    if (charOffset < end) return word.start;
    cursor = end;
  }
  return null;
}

export interface TranscriptStats {
  language: string;
  words: number;
  duration: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  steps: string[];
  at: number;
}

/** YouTube ids are exactly 11 characters from [A-Za-z0-9_-]. */
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

export function youtubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOST.test(parsed.hostname)) return null;

  const paramId = parsed.searchParams.get("v");
  if (paramId && VIDEO_ID_PATTERN.test(paramId)) return paramId;
  const pathId = parsed.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})(?:[/?#]|$)/)?.[1];
  if (pathId) return pathId;
  if (parsed.hostname === "youtu.be" || parsed.hostname.endsWith(".youtu.be")) {
    return parsed.pathname.match(/^\/([\w-]{11})(?:[/?#]|$)/)?.[1] ?? null;
  }
  return null;
}

export function toVideoProposal(pick: VideoPick): VideoProposal {
  const videoId = youtubeVideoId(pick.bestUrl) ?? "";
  return {
    title: pick.bestTitle,
    channel: pick.bestChannel,
    url: pick.bestUrl,
    videoId,
    thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "",
    reason: pick.reason,
    candidates: pick.candidates,
  };
}

export function transcriptStats(transcript: Transcript): TranscriptStats {
  const words = transcript.words.filter((word) => word.type === "word");
  const duration = transcript.words.length
    ? transcript.words[transcript.words.length - 1].end
    : 0;
  return {
    language: transcript.language_code,
    words: words.length,
    duration,
  };
}

export interface SpeakerSummary {
  id: string;
  words: number;
  /** Seconds of speech, from word start/end times. */
  seconds: number;
  /** Share of all spoken words, 0-1. */
  share: number;
  /** A short quote, so a human can tell who this is. */
  sample: string;
}

export const UNKNOWN_SPEAKER = "unknown";

/** Group a diarized transcript by speaker, largest first. Empty when nothing was diarized. */
export function speakerSummaries(
  transcript: Transcript,
  sampleWords = 24,
): SpeakerSummary[] {
  const spoken = transcript.words.filter((word) => word.type === "word");
  if (!spoken.some((word) => word.speaker_id)) return [];

  const groups = new Map<string, TranscriptWord[]>();
  for (const word of spoken) {
    const id = word.speaker_id ?? UNKNOWN_SPEAKER;
    const group = groups.get(id) ?? [];
    group.push(word);
    groups.set(id, group);
  }

  return [...groups.entries()]
    .map(([id, words]) => ({
      id,
      words: words.length,
      seconds: words.reduce((total, word) => total + Math.max(word.end - word.start, 0), 0),
      share: spoken.length ? words.length / spoken.length : 0,
      sample: words.slice(0, sampleWords).map((word) => word.text).join(" "),
    }))
    .sort((a, b) => b.words - a.words);
}

/** Keep only one speaker's words. Pass null to get the transcript back unchanged. */
export function filterTranscriptBySpeaker(
  transcript: Transcript,
  speakerId: string | null,
): Transcript {
  if (!speakerId) return transcript;
  const keep = (word: TranscriptWord) => (word.speaker_id ?? UNKNOWN_SPEAKER) === speakerId;
  const words = transcript.words.filter((word) => word.type !== "word" || keep(word));
  return {
    ...transcript,
    words,
    text: words.filter(keep).map((word) => word.text).join(" "),
  };
}

/* ------------------------------------------------------------------------- *
 * Live capture
 *
 * Types for the microphone → Scribe → GPTZero loop in the Live tab. Separate
 * from the transcript types above: a live chunk is raw text with no word
 * timings or speakers, scored on its own before it is ever a Transcript.
 * ------------------------------------------------------------------------- */

export type Verdict = "ai" | "human" | "mixed";

/** Document-level chance for each class (sums ~1). */
export type ClassProbs = {
  ai: number;
  human: number;
  mixed: number;
};

/** One sentence as GPTZero scored it. */
export type LiveScoredSentence = {
  sentence: string;
  /** 0..1, how much this sentence looks like AI text. */
  ai: number;
};

/** The result of scoring one chunk of live transcript. */
export type Detection = {
  id: string;
  /** Monotonic index of the chunk within the session. */
  index: number;
  verdict: Verdict;
  /** Document-level probability of the predicted class, 0..1. */
  probability: number;
  /** Full class split from GPTZero. */
  probs: ClassProbs;
  confidence: "high" | "medium" | "low";
  /** `concatenated` or `polished` when the verdict is `mixed`. */
  subclass?: string;
  sentences: LiveScoredSentence[];
  words: number;
  /**
   * True when the chunk was below the 70-word floor. A thin chunk can miss AI
   * text, but it never invents it — so a thin `ai` verdict is trustworthy and
   * a thin `human` verdict is not.
   */
  thin: boolean;
  text: string;
  at: number;
};

export type ChunkReason = "full" | "pause" | "flush";

export type PendingChunk = {
  text: string;
  words: number;
  reason: ChunkReason;
};
