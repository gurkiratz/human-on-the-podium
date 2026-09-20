import { hasRecentAlert, raiseAlert } from "@/lib/alerts";
import { env } from "@/lib/env";
import { scoreTranscript } from "@/lib/gptzero";
import { getSpeechMeta, saveAiReport } from "@/lib/reports";
import { deriveSpeechMeta } from "@/lib/speech-meta";
import type { Transcript } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Score a transcript (optionally one speaker's words) with GPTZero. Called on demand from the
 * analytics view so it works for saved transcripts too. For a speech's primary speaker it also
 * labels the speech, records it for the leaderboard, and raises an alert when the reading is high.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    transcript?: Transcript;
    speakerId?: string | null;
    source?: string;
    title?: string;
    videoId?: string | null;
    /** True when this scope is the speech's primary speaker — the row worth keeping. */
    primary?: boolean;
  } | null;

  if (!body?.transcript?.words?.length) {
    return Response.json({ error: "No transcript supplied." }, { status: 400 });
  }

  if (!env.hasGptzero()) {
    return Response.json(
      { error: "GPTZERO_API_KEY is not set, so nothing can be scored yet." },
      { status: 503 },
    );
  }

  try {
    const speakerId = body.speakerId ?? null;
    const report = await scoreTranscript(body.transcript, speakerId);

    if (body.primary === true) {
      const source = body.source?.trim() || body.title?.trim() || "Unknown source";
      const title = body.title?.trim() || "Untitled speech";
      const videoId = body.videoId ?? null;

      try {
        const meta =
          (await getSpeechMeta(videoId, title)) ??
          (await deriveSpeechMeta({
            title,
            channel: source,
            excerpt: body.transcript.text,
          }));

        await saveAiReport({
          transcriptText: body.transcript.text,
          speakerId,
          source,
          title,
          videoId,
          meta,
          report,
        });

        const probability = report.document?.completelyGeneratedProb ?? null;
        if (
          report.scorable &&
          probability !== null &&
          probability >= env.alertAiThreshold &&
          !(await hasRecentAlert("ai_score", title))
        ) {
          await raiseAlert({
            kind: "ai_score",
            severity: probability >= 0.95 ? "high" : "medium",
            title: `${title} reads ${Math.round(probability * 100)}% AI`,
            detail: `${source}${meta.politician ? ` · ${meta.politician}` : ""} — ${report.flaggedCount} of ${report.sentences.length} sentences flagged.`,
            source,
            politician: meta.politician,
            party: meta.party,
            value: probability,
          });
        }
      } catch {
        // A missed leaderboard row or alert is not worth failing the reading over.
      }
    }

    return Response.json(report);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "GPTZero scoring failed." },
      { status: 502 },
    );
  }
}
