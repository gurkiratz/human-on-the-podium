import "dotenv/config";
import { findBestVideo } from "../lib/findVideo";
import { saveTranscriptRun } from "../lib/library";
import { transcribeYoutube } from "../lib/transcribe";
import { toVideoProposal, transcriptStats } from "../lib/types";

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

async function main(): Promise<void> {
  const description = process.argv.slice(2).join(" ").trim();
  if (!description) {
    console.error('Usage: npm run cli -- "<description of the video you want>"');
    process.exit(1);
  }

  console.log(`\nFinding a YouTube video for: "${description}"`);
  const { pick, sessionId } = await findBestVideo(description, {
    onStep: (label) => console.log(`  ${label}`),
  });

  console.log(`\nChosen video: ${pick.bestTitle}`);
  console.log(`Channel:      ${pick.bestChannel}`);
  console.log(`URL:          ${pick.bestUrl}`);
  console.log(`\nBrowserbase session: https://www.browserbase.com/sessions/${sessionId}`);

  console.log(`\nTranscribing with ElevenLabs (scribe_v2)...`);
  const transcript = await transcribeYoutube(pick.bestUrl);
  const stats = transcriptStats(transcript);

  console.log(`\nLanguage: ${stats.language}`);
  console.log(`Words:    ${stats.words}`);
  console.log(`Duration: ${formatDuration(stats.duration)}`);
  console.log(`\nTranscript preview:\n${transcript.text.slice(0, 400)}`);

  const { id } = await saveTranscriptRun({
    video: toVideoProposal(pick),
    stats,
    transcript,
  });
  console.log(`\nSaved transcript run ${id} (visible under Existing Content)`);
}

main().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
