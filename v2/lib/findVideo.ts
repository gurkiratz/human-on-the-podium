import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { env } from "./env";
import { VideoPickSchema, youtubeVideoId, type VideoPick } from "./types";

export interface FindVideoResult {
  pick: VideoPick;
  sessionId: string;
}

export interface FindVideoOptions {
  onStep?: (label: string) => void;
  /** When "latest", sort results by upload date and prefer the newest match. */
  recency?: "latest" | "relevant";
}

const RESULTS_SELECTOR = "ytd-video-renderer";

// Pin a Model Gateway model explicitly: the default routes through Azure OpenAI, whose content
// policy rejects ordinary political speech (this app is about political speeches by design).
const MODEL_NAME = "google/gemini-2.5-flash";

function canonicalYoutubeUrl(raw: string): string {
  const id = youtubeVideoId(raw);
  return id ? `https://www.youtube.com/watch?v=${id}` : raw;
}

export async function findBestVideo(
  description: string,
  options: FindVideoOptions = {},
): Promise<FindVideoResult> {
  const step = options.onStep ?? (() => {});
  const recency = options.recency ?? "relevant";

  step("Starting a cloud browser session…");
  const browser = await browserbase.launch({ apiKey: env.browserbaseApiKey });

  try {
    const stagehand = await Stagehand.create({
      browser,
      model: { modelName: MODEL_NAME },
      cache: true,
    });

    try {
      const [page] = await browser.context.pages();
      // `sp=CAI%3D` is YouTube's "Sort by: upload date" filter. When the user asked
      // for the latest video, sort by recency so the newest uploads lead instead of
      // burying them under whatever YouTube considers most relevant.
      const searchUrl =
        `https://www.youtube.com/results?search_query=${encodeURIComponent(description)}` +
        (recency === "latest" ? "&sp=CAI%3D" : "");

      step(
        `Searching YouTube for “${description}”${recency === "latest" ? " (newest first)" : ""}…`,
      );

      // YouTube issues a one-time client-side redirect (adds `themeRefresh=1`), which can
      // abort in-flight CDP evaluations. Wait for `load` and retry the whole navigation.
      let resultsReady = false;
      for (let attempt = 1; attempt <= 3 && !resultsReady; attempt++) {
        try {
          await page.goto(searchUrl, { waitUntil: "load" });
          resultsReady = await page.waitForSelector(RESULTS_SELECTOR, {
            state: "visible",
            timeout: 20_000,
          });
          if (!resultsReady) {
            await stagehand.act(
              "Dismiss any cookie or consent dialog so the video search results are visible",
            );
            resultsReady = await page.waitForSelector(RESULTS_SELECTOR, {
              state: "visible",
              timeout: 20_000,
            });
          }
        } catch (error) {
          if (attempt === 3) throw error;
        }
      }
      if (!resultsReady) {
        throw new Error("No YouTube search results appeared on the page.");
      }

      step("Reading the results and choosing the best match…");

      const { data } = await stagehand.extract(
        `From these YouTube search results, choose the ONE video that best matches this ` +
          `description: "${description}". ` +
          (recency === "latest"
            ? `The user wants the MOST RECENT one: read the "uploaded … ago" line under each ` +
              `result and prefer the smallest age that still matches the description. `
            : "") +
          `It must be a full-length video (never a YouTube Short) ` +
          `in which the person is actually speaking — a speech, interview, remark, or debate — ` +
          `because we will transcribe the audio. Prefer official channels. Return the 5 best ` +
          `candidates you considered.`,
        VideoPickSchema,
      );

      return {
        pick: {
          ...data,
          bestUrl: canonicalYoutubeUrl(data.bestUrl),
          candidates: data.candidates.map((candidate) => ({
            ...candidate,
            url: canonicalYoutubeUrl(candidate.url),
          })),
        },
        sessionId: browser.sessionId ?? "",
      };
    } finally {
      await stagehand.close();
    }
  } finally {
    await browser.close();
  }
}
