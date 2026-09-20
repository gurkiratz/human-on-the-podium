import { RecordMap, type MapPoint } from "@/components/map/RecordMap";
import { listRecords } from "@/lib/records";

export const dynamic = "force-dynamic";

/** How far apart two AI shares must be before a cluster counts as contested. */
const DISAGREEMENT = 0.5;
const LOCAL = 5;

export default async function MapPage() {
  const records = (await listRecords()).filter((r) => r.point !== null);

  // A dot is "contested" when its nearest neighbours on the map — which for this corpus means
  // rewordings of the same document — got very different readings. O(n^2), which is nothing at
  // this size and stays cheap into the thousands.
  const points: MapPoint[] = records.map((r) => {
    const near = records
      .filter((o) => o.id !== r.id)
      .map((o) => ({
        ai: o.aiShare ?? 0,
        d: Math.hypot(o.point!.x - r.point!.x, o.point!.y - r.point!.y),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, LOCAL);

    const shares = [r.aiShare ?? 0, ...near.map((n) => n.ai)];
    const contested = Math.max(...shares) - Math.min(...shares) >= DISAGREEMENT;

    return {
      id: r.id,
      title: r.title,
      x: r.point!.x,
      y: r.point!.y,
      p3: r.point3,
      ai: r.aiShare ?? 0,
      verdict: r.verdict,
      sourceType: r.sourceType,
      words: r.words,
      url: r.sourceUrl ?? "",
      excerpt: r.body.slice(0, 340),
      contested,
    };
  });

  return <RecordMap points={points} />;
}
