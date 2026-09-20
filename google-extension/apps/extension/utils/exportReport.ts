import type { SessionReport } from "@humanonthepodium/shared";
import { formatTimeMs, labelToRiskText } from "@humanonthepodium/shared";

export function exportReportMarkdown(report: SessionReport): string {
  const lines: string[] = [
    "# HumanonthePodium Session Report",
    "",
    `**Session:** ${report.session.title ?? "Untitled"}`,
    `**Source:** ${report.session.sourceUrl ?? report.session.sourceType}`,
    `**Started:** ${report.session.startedAt}`,
    report.session.endedAt ? `**Ended:** ${report.session.endedAt}` : "",
    "",
    "## Summary",
    report.summary,
    "",
    "## Statistics",
    `- Average AI-written likelihood: ${Math.round(report.session.averageAiLikelihood ?? 0)}%`,
    `- Peak: ${Math.round(report.session.peakAiLikelihood ?? 0)}%`,
    `- Chunks analyzed: ${report.chunks.length}`,
    `- Claims flagged: ${report.claims.filter((c) => c.needsVerification).length}`,
    "",
    "## Top Risk Moments",
  ];

  if (report.topRiskMoments.length === 0) {
    lines.push("_No high-risk moments recorded._");
  } else {
    for (const d of report.topRiskMoments) {
      const chunk = report.chunks.find((c) => c.id === d.chunkId);
      lines.push(
        `- **${d.aiScore}%** (${labelToRiskText(d.label)}) at ${chunk ? formatTimeMs(chunk.startTimeMs) : "?"}`,
      );
      if (chunk) lines.push(`  > ${chunk.text.slice(0, 200)}`);
      if (d.flaggedPhrase) lines.push(`  Flagged: "${d.flaggedPhrase}"`);
    }
  }

  lines.push("", "## Claims");
  if (report.claims.length === 0) {
    lines.push("_No factual claims detected._");
  } else {
    for (const claim of report.claims) {
      lines.push(`- [${claim.claimType}] ${claim.text} — ${claim.supportStatus}`);
    }
  }

  lines.push("", "## Explanations");
  if (report.explanations.length === 0) {
    lines.push("_No explanations generated._");
  } else {
    for (const exp of report.explanations) {
      lines.push(`- ${exp.summary}`);
      if (exp.flaggedSentences.length > 0) {
        lines.push(`  Flagged: ${exp.flaggedSentences.join("; ")}`);
      }
      if (exp.recommendedFollowUp) {
        lines.push(`  Follow-up: ${exp.recommendedFollowUp}`);
      }
    }
  }

  lines.push("", "## Transcript");
  for (const seg of report.segments) {
    lines.push(`[${formatTimeMs(seg.startTimeMs)}] ${seg.text}`);
  }

  lines.push("", "---", "_Probabilistic signal only. This is not definitive._");
  return lines.filter((l) => l !== undefined).join("\n");
}

export function downloadReport(report: SessionReport, format: "markdown" | "json") {
  const content =
    format === "json"
      ? JSON.stringify(report, null, 2)
      : exportReportMarkdown(report);
  const ext = format === "json" ? "json" : "md";
  const mime = format === "json" ? "application/json" : "text/markdown";
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `HumanonthePodium-${report.session.id.slice(0, 8)}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
