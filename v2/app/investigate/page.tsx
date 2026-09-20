import { InvestigateArchive } from "@/components/investigate/InvestigateArchive";
import { listProjectRecords } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function InvestigatePage() {
  const results = await listProjectRecords();
  return <InvestigateArchive results={results} />;
}
