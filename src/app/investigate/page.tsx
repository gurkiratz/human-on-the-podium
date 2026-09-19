import { InvestigateArchive } from "@/components/investigate/InvestigateArchive";
import { listYoutubeScores } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function InvestigatePage() {
  const results = listYoutubeScores(1000);
  return <InvestigateArchive results={results} />;
}
