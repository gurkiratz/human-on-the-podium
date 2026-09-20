import { randomUUID } from "node:crypto";
import { insertYoutubeScore } from "@/lib/db";
import { scoreChunk } from "@/lib/gptzero";
import { transcribeFile } from "@/lib/stt-file";
import {
  cleanupClip,
  extractCpacMinuteClip,
  extractMinuteClip,
  parseCpacId,
  parseYoutubeId,
} from "@/lib/youtube";
import {
  MAX_YOUTUBE_JOBS,
  releaseYoutubeJob,
  tryAcquireYoutubeJob,
  youtubeJobsInFlight,
} from "@/lib/youtube-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!tryAcquireYoutubeJob()) {
    return Response.json(
      {
        error: `Already running ${MAX_YOUTUBE_JOBS} videos. Wait for one to finish.`,
        inFlight: youtubeJobsInFlight(),
      },
      { status: 429 },
    );
  }

  let audioPath: string | null = null;
  try {
    const body = (await request.json()) as {
      url?: string;
      startSec?: number;
    };
    const url = body.url?.trim();
    const isYt = !!url && !!parseYoutubeId(url);
    const isCpac = !!url && !!parseCpacId(url);
    if (!isYt && !isCpac) {
      return Response.json(
        { error: "Valid YouTube or CPAC URL required" },
        { status: 400 },
      );
    }
    const startSec = Math.max(0, Math.floor(Number(body.startSec) || 0));

    const clip = isYt
      ? await extractMinuteClip(url!, startSec)
      : await extractCpacMinuteClip(url!, startSec);
    audioPath = clip.audioPath;

    const transcript = await transcribeFile(clip.audioPath);
    const detection = await scoreChunk(transcript, 0);

    const row = insertYoutubeScore({
      id: randomUUID(),
      sourceType: "video",
      youtubeUrl: url,
      videoId: clip.videoId,
      title: clip.title,
      startSec: clip.startSec,
      durationSec: clip.durationSec,
      publishedAt: clip.publishedAt,
      sourceDurationSec: clip.sourceDurationSec,
      transcript,
      verdict: detection.verdict,
      probability: detection.probability,
      probs: detection.probs,
      confidence: detection.confidence,
      sentences: detection.sentences,
      words: detection.words,
    });

    return Response.json(row);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  } finally {
    if (audioPath) cleanupClip(audioPath);
    releaseYoutubeJob();
  }
}

export async function GET() {
  return Response.json({
    inFlight: youtubeJobsInFlight(),
    max: MAX_YOUTUBE_JOBS,
  });
}
