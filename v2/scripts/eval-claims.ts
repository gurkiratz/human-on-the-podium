import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractClaims, type Claim } from "../lib/claims";
import type { Transcript } from "../lib/types";

/**
 * Measures claim extraction against a hand-labelled sample, so prompt changes can be judged
 * rather than guessed. Makes real OpenAI calls — run it deliberately:
 *
 *   npm run eval:claims
 *
 * It reports how many labelled claims were found (recall), how often the checkable flag agreed,
 * and how many claims came back that no label accounts for (over-extraction).
 *
 * The model is not deterministic, so claim counts wobble between runs — read the totals as a
 * trend and use the per-claim dump to see what changed, rather than treating one run as a verdict.
 */

interface EvalCase {
  name: string;
  text: string;
  /** How many claims the case should flag checkable; asserted exactly when present. */
  expectedCheckable?: number;
  expected: Array<{ contains: string; checkable: boolean }>;
}

function toTranscript(text: string): Transcript {
  const pieces = text.split(/\s+/).filter(Boolean);
  const words = pieces.map((word, index) => ({
    text: word,
    start: index * 0.4,
    end: (index + 1) * 0.4,
    type: "word",
  }));
  return { language_code: "en", text, words };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matches(claim: Claim, contains: string): boolean {
  const wanted = normalize(contains);
  const quote = normalize(claim.quote);
  const restated = normalize(claim.text);
  return (
    (wanted !== "" && quote.includes(wanted)) ||
    (wanted !== "" && restated.includes(wanted)) ||
    (quote.length > 12 && wanted.includes(quote))
  );
}

async function main(): Promise<void> {
  const fixturePath = path.resolve(process.cwd(), "scripts", "claims-eval.json");
  const cases = JSON.parse(await readFile(fixturePath, "utf8")) as EvalCase[];

  let expectedTotal = 0;
  let foundTotal = 0;
  let agreeTotal = 0;
  let foundWithFlag = 0;
  let producedTotal = 0;
  let spuriousTotal = 0;

  for (const testCase of cases) {
    const report = await extractClaims(toTranscript(testCase.text), null);
    const produced = report.claims;
    producedTotal += produced.length;

    const missed: string[] = [];
    let found = 0;
    let agree = 0;
    let withFlag = 0;

    for (const label of testCase.expected) {
      expectedTotal += 1;
      const hit = produced.find((claim) => matches(claim, label.contains));
      if (!hit) {
        missed.push(label.contains);
        continue;
      }
      found += 1;
      withFlag += 1;
      if (hit.checkable === label.checkable) agree += 1;
    }

    const spurious = produced.filter(
      (claim) => !testCase.expected.some((label) => matches(claim, label.contains)),
    );

    foundTotal += found;
    agreeTotal += agree;
    foundWithFlag += withFlag;
    spuriousTotal += spurious.length;

    console.log(`\n${testCase.name}`);
    const checkableNote =
      testCase.expectedCheckable !== undefined
        ? ` · checkable ${report.checkableCount} (labelled ${testCase.expectedCheckable})`
        : "";
    console.log(
      `  found ${found}/${testCase.expected.length} · checkable agreed ${agree}/${withFlag} · produced ${produced.length} (${spurious.length} unlabelled)${checkableNote}`,
    );
    for (const label of missed) console.log(`  MISSED: "${label}"`);
    for (const claim of produced) {
      const flag = claim.checkable ? "checkable" : "rhetoric";
      const labelled = testCase.expected.some((label) => matches(claim, label.contains));
      console.log(
        `    ${labelled ? " " : "?"} [${claim.type}/${flag}] ${claim.text}`,
      );
    }
    if (!report.scorable) console.log(`  not scorable: ${report.reason ?? "unknown"}`);
  }

  const recall = expectedTotal ? foundTotal / expectedTotal : 1;
  const agreement = foundWithFlag ? agreeTotal / foundWithFlag : 1;
  const precision = producedTotal ? (producedTotal - spuriousTotal) / producedTotal : 1;

  console.log("\n--- totals ---");
  console.log(`recall           ${(recall * 100).toFixed(0)}% (${foundTotal}/${expectedTotal} labelled claims found)`);
  console.log(`checkable agree  ${(agreement * 100).toFixed(0)}% (${agreeTotal}/${foundWithFlag})`);
  console.log(`labelled share   ${(precision * 100).toFixed(0)}% of produced claims matched a label`);
}

main().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
