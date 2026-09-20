import { DatabaseArchive } from "@/components/database/DatabaseArchive";
import { listYoutubeScores } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function DatabasePage() {
  const results = listYoutubeScores(1000);
  return <DatabaseArchive results={results} />;
}
