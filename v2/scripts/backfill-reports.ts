import "dotenv/config";
import { query } from "../lib/db";
import { scoreTranscript } from "../lib/gptzero";
import { getSpeechMeta, reportId, saveAiReport, saveSpeechMeta } from "../lib/reports";
import { deriveSpeechMeta } from "../lib/speech-meta";
import type { Transcript, VideoSummary } from "../lib/types";

/**
 * Fill the leaderboard from speeches that were saved before it existed. Scores each stored
 * transcript once (costs GPTZero quota), skips anything already recorded, and does not raise
 * alerts — a backfill should not spam the channel.
 *
 *   npm run backfill:reports
 */

type Row = {
  kind: string;
  transcript: Transcript | null;
  video: VideoSummary | null;
  primary_speaker: string | null;
};

async function main(): Promise<void> {
  const { rows } = await query<Row>(
    `SELECT 'library' AS kind, transcript, video, primary_speaker FROM library_runs
     UNION ALL
     SELECT 'project' AS kind, transcript, video, NULL AS primary_speaker FROM projects
     UNION ALL
     SELECT 'chat' AS kind, transcript, NULL AS video, primary_speaker FROM chats
      WHERE transcript IS NOT NULL`,
  );

  let scored = 0;
  let labelled = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const transcript = row.transcript;
    if (!transcript?.words?.length) {
      continue;
    }

    const title = row.video?.title?.trim() || "Untitled speech";
    const source = row.video?.channel?.trim() || title;
    const videoId = row.video?.videoId?.trim() || null;
    const speakerId = row.primary_speaker ?? null;
    const id = reportId(transcript.text, speakerId);

    const existing = await query<{
      politician: string | null;
      party: string | null;
      topic: string | null;
    }>(`SELECT politician, party, topic FROM ai_reports WHERE id = $1`, [id]);

    if (existing.rowCount) {
      const meta = existing.rows[0];
      if (meta.politician || meta.party || meta.topic) {
        skipped += 1;
        continue;
      }
      // Scored before the ranking dimensions existed — label it without spending GPTZero again.
      const derived =
        (await getSpeechMeta(videoId, title)) ??
        (await deriveSpeechMeta({ title, channel: source, excerpt: transcript.text }));
      await saveSpeechMeta(id, derived);
      console.log(`labelled ${title}${derived.politician ? ` — ${derived.politician}` : ""}`);
      labelled += 1;
      continue;
    }

    try {
      const report = await scoreTranscript(transcript, speakerId);
      const meta =
        (await getSpeechMeta(videoId, title)) ??
        (await deriveSpeechMeta({ title, channel: source, excerpt: transcript.text }));

      await saveAiReport({
        transcriptText: transcript.text,
        speakerId,
        source,
        title,
        videoId,
        meta,
        report,
      });

      const probability = report.document?.completelyGeneratedProb ?? null;
      console.log(
        `scored  ${title} — ${probability === null ? "not scorable" : `${Math.round(probability * 100)}%`}` +
          `${meta.politician ? ` · ${meta.politician}` : ""}${meta.party ? ` (${meta.party})` : ""}`,
      );
      scored += 1;
    } catch (error) {
      failed += 1;
      console.warn(`failed  ${title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    `\nbackfill done — scored ${scored}, labelled ${labelled}, already complete ${skipped}, failed ${failed}`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
