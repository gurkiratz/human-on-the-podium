import { saveTranscriptRun } from "@/lib/library";
import { createProject } from "@/lib/projects";
import { parseRecordingId, parseYoutubeId } from "@/lib/recording-id";
import { pickPrimarySpeaker } from "@/lib/speakers";
import { cleanupClip, extractCpacMinuteClip, extractMinuteClip } from "@/lib/sources";
import { transcribeAudioFile } from "@/lib/transcribe";
import { transcriptStats } from "@/lib/types";
import { fetchOEmbed } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Analyze a short clip of a source and open it as a project — the "New analysis" flow. Supports
 * YouTube (yt-dlp) and CPAC (HLS), so CPAC only works here, not through the YouTube-only
 * transcribe route.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: string;
    startSec?: number;
  } | null;
  const url = body?.url?.trim();

  const youtubeId = url ? parseYoutubeId(url) : null;
  const isCpac = url ? !!parseRecordingId(url) && !youtubeId : false;
  if (!url || (!youtubeId && !isCpac)) {
    return Response.json(
      { error: "A valid YouTube or CPAC URL is required." },
      { status: 400 },
    );
  }

  const startSec =
    typeof body?.startSec === "number" && Number.isFinite(body.startSec)
      ? Math.max(0, Math.floor(body.startSec))
      : 0;

  let audioPath: string | null = null;
  try {
    const clip = youtubeId
      ? await extractMinuteClip(url, startSec)
      : await extractCpacMinuteClip(url, startSec);
    audioPath = clip.audioPath;

    const transcript = await transcribeAudioFile(clip.audioPath);
    const stats = transcriptStats(transcript);
    const primary = await pickPrimarySpeaker(transcript, clip.title);

    let channel = "";
    let thumbnail = "";
    if (youtubeId) {
      const meta = await fetchOEmbed(youtubeId);
      channel = meta.channel;
      thumbnail = meta.thumbnail;
    }

    const video = {
      title: clip.title,
      channel,
      url,
      videoId: clip.videoId,
      thumbnail,
    };

    await saveTranscriptRun({
      video,
      stats,
      transcript,
      primarySpeaker: primary.speakerId,
      startSec,
    });
    const project = await createProject({
      name: `${clip.title}${startSec > 0 ? ` @ ${startSec}s` : ""}`,
      video,
      stats,
      transcript,
    });

    return Response.json(project);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not analyze that link." },
      { status: 502 },
    );
  } finally {
    if (audioPath) cleanupClip(audioPath);
  }
}
