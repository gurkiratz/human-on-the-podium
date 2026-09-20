import { saveTranscriptRun } from "@/lib/library";
import { createProject } from "@/lib/projects";
import { pickPrimarySpeaker } from "@/lib/speakers";
import { cleanupClip, extractMinuteClip } from "@/lib/sources";
import { transcribeAudioFile, transcribeYoutube, type TranscribeOptions } from "@/lib/transcribe";
import { transcriptStats } from "@/lib/types";
import { fetchOEmbed, parseVideoId, videoSummaryFromOEmbed } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Coerce the client's options into the shape the transcribe pipeline expects.
 * Without this a `keyterms` string would be iterated character-by-character and
 * an out-of-range `numSpeakers` would be forwarded upstream verbatim.
 */
function parseOptions(raw: unknown): TranscribeOptions | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const input = raw as Record<string, unknown>;
  const options: TranscribeOptions = {};
  if (typeof input.detectEntities === "boolean") options.detectEntities = input.detectEntities;
  if (typeof input.noVerbatim === "boolean") options.noVerbatim = input.noVerbatim;
  if (typeof input.numSpeakers === "number" && Number.isFinite(input.numSpeakers)) {
    options.numSpeakers = Math.min(Math.max(Math.trunc(input.numSpeakers), 1), 32);
  }
  if (Array.isArray(input.keyterms)) {
    options.keyterms = input.keyterms
      .filter((term): term is string => typeof term === "string")
      .slice(0, 1000);
  }
  return options;
}

/**
 * Direct path: the user pastes a link, so we skip discovery entirely. The only AI here is
 * picking which diarized speaker the clip is about; transcription itself is ElevenLabs.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: string;
    options?: TranscribeOptions;
    /** When > 0, analyze a 60-second clip from this point instead of the whole recording. */
    startSec?: number;
  } | null;
  const videoId = parseVideoId(body?.url ?? "");

  if (!videoId) {
    return Response.json(
      { error: "That is not a YouTube link or video id." },
      { status: 400 },
    );
  }

  const options = parseOptions(body?.options);
  if (!options) {
    return Response.json({ error: "Invalid transcription options." }, { status: 400 });
  }

  try {
    const meta = await fetchOEmbed(videoId);
    const video = videoSummaryFromOEmbed(videoId, meta);

    const startSec =
      typeof body?.startSec === "number" && Number.isFinite(body.startSec)
        ? Math.max(0, Math.floor(body.startSec))
        : 0;

    if (startSec > 0) {
      // Cut a 60-second clip and transcribe that, with word timings so it behaves like any
      // other transcript (a clip cannot be transcribed from the source URL).
      let audioPath: string | null = null;
      try {
        const clip = await extractMinuteClip(video.url, startSec);
        audioPath = clip.audioPath;
        const transcript = await transcribeAudioFile(clip.audioPath, options);
        const stats = transcriptStats(transcript);
        const primary = await pickPrimarySpeaker(transcript, video.title);
        await saveTranscriptRun({
          video,
          stats,
          transcript,
          primarySpeaker: primary.speakerId,
          startSec,
        });
        const project = await createProject({
          name: `${video.title} @ ${startSec}s`,
          video,
          stats,
          transcript,
        });
        return Response.json({
          video,
          stats,
          transcript,
          primarySpeaker: primary.speakerId,
          primarySpeakerReason: primary.reason,
          project,
        });
      } finally {
        if (audioPath) cleanupClip(audioPath);
      }
    }

    const transcript = await transcribeYoutube(video.url, options);
    const stats = transcriptStats(transcript);
    const primary = await pickPrimarySpeaker(transcript, video.title);
    await saveTranscriptRun({
      video,
      stats,
      transcript,
      primarySpeaker: primary.speakerId,
    });

    // A pasted link is a project too, not just a saved transcript — otherwise it lands in the
    // Library and never shows up under Projects.
    const project = await createProject({ name: video.title, video, stats, transcript });

    return Response.json({
      video,
      stats,
      transcript,
      primarySpeaker: primary.speakerId,
      primarySpeakerReason: primary.reason,
      project,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not transcribe that link.",
      },
      { status: 502 },
    );
  }
}
