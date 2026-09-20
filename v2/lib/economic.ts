import { env } from "./env";

/**
 * Official figures for economic claims, from FRED (St. Louis Fed).
 *
 * This is deliberately a small, curated map rather than a general resolver: picking the right
 * series for an arbitrary sentence is the hard part, and a wrong series is worse than none.
 * We surface the latest published figure; we never assert the claim is right or wrong.
 */

const OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations";

interface Series {
  id: string;
  label: string;
  unit: string;
  /** Lower-case substrings that identify the metric in a sentence. */
  keywords: string[];
  /** Derive a year-over-year percentage instead of showing the raw index. */
  yoy?: boolean;
}

const SERIES: Series[] = [
  { id: "GASREGW", label: "US regular gasoline price", unit: "$/gal", keywords: ["gas price", "gas prices", "gasoline", "price at the pump"] },
  { id: "MORTGAGE30US", label: "30-year fixed mortgage rate", unit: "%", keywords: ["mortgage rate", "mortgage rates", "mortgage"] },
  { id: "DFF", label: "US federal funds rate", unit: "%", keywords: ["interest rate", "interest rates", "fed funds", "federal funds"] },
  { id: "PAYEMS", label: "US total nonfarm payrolls", unit: "thousand jobs", keywords: ["payrolls", "jobs added", "jobs report", "job growth"] },
  { id: "UNRATE", label: "US unemployment rate", unit: "%", keywords: ["unemployment", "jobless"] },
  { id: "CPIAUCSL", label: "US inflation (CPI, year over year)", unit: "%", keywords: ["inflation", "consumer prices", "cost of living", "cpi"], yoy: true },
  { id: "GDPC1", label: "US real GDP", unit: "billion chained 2017 $", keywords: ["gdp", "economic growth", "economy grew"] },
];

export interface DataEvidence {
  seriesId: string;
  label: string;
  /** Observation date, e.g. "2024-12-01". */
  date: string;
  value: number;
  unit: string;
  url: string;
}

function matchSeries(text: string): Series | null {
  const haystack = ` ${text.toLowerCase()} `;
  return SERIES.find((series) => series.keywords.some((keyword) => haystack.includes(keyword))) ?? null;
}

export async function lookupEconomicData(claimText: string): Promise<DataEvidence | null> {
  if (!env.hasFred()) return null;

  const series = matchSeries(claimText);
  if (!series) return null;

  const url = new URL(OBSERVATIONS_URL);
  url.searchParams.set("series_id", series.id);
  url.searchParams.set("api_key", env.fredApiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", series.yoy ? "13" : "1");

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      observations?: Array<{ date?: string; value?: string }>;
    };
    const observations = payload.observations ?? [];
    const latest = observations[0];
    if (!latest?.date) return null;

    const date = latest.date;
    let value = Number(latest.value);

    if (series.yoy) {
      const yearAgo = observations[12];
      const previous = Number(yearAgo?.value);
      if (!Number.isFinite(previous) || previous === 0) return null;
      value = (value / previous - 1) * 100;
    }

    if (!Number.isFinite(value)) return null;

    return {
      seriesId: series.id,
      label: series.label,
      date,
      value: Math.round(value * 100) / 100,
      unit: series.unit,
      url: `https://fred.stlouisfed.org/series/${series.id}`,
    };
  } catch {
    return null;
  }
}
