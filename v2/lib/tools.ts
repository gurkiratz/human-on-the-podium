import type OpenAI from "openai";
import { findBestVideo } from "./findVideo";
import { saveTranscriptRun } from "./library";
import { pickPrimarySpeaker } from "./speakers";
import { createProject } from "./projects";
import { transcribeYoutube } from "./transcribe";
import { canonicalWatchUrl, fetchOEmbed } from "./youtube";
import {
  transcriptStats,
  toVideoProposal,
  youtubeVideoId,
  type VideoProposal,
} from "./types";
import type { AgentEvent } from "./events";

export type Emit = (event: AgentEvent) => void;

export interface ToolState {
  proposal?: { video: VideoProposal; sessionId?: string };
}

export const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "resolve_input",
      description:
        "Classify the user's raw input. Returns whether it is already a YouTube link or a free-text description that needs searching.",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "The user's raw input, verbatim." },
        },
        required: ["input"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_video",
      description:
        "Find the single best YouTube video for a description (or verify a specific link) and return it. Does not transcribe. Pass either a natural-language \"query\" or a specific \"url\" — at least one is required. The query must be a short topic-style search (e.g. \"Trump speech\"), not the user's sentence.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Short YouTube search query: subject plus any named event/venue/year. Omit when passing a url. Never a full sentence, and never containing recency words like \"latest\" or \"last\".",
          },
          url: {
            type: "string",
            description:
              "A specific YouTube URL (youtube.com/watch, youtu.be, /shorts, /embed) to use instead of searching.",
          },
          recency: {
            type: "string",
            enum: ["latest", "relevant"],
            description:
              'Use "latest" when the user wants the newest/most recent/last video; otherwise "relevant". Defaults to "relevant".',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description:
        "Transcribe a YouTube video the user has approved, save the transcript to the library, and open it as a new project. Only call this after the user chooses to create a project.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The approved YouTube watch URL." },
          name: {
            type: "string",
            description:
              "Project name. Defaults to the video title when omitted.",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
];

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  state: ToolState,
  emit: Emit,
): Promise<unknown> {
  switch (name) {
    case "resolve_input":
      return resolveInput(String(args.input ?? ""));
    case "find_video":
      return findVideo(args, state, emit);
    case "create_project":
      return createProjectTool(args, state, emit);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function resolveInput(input: string) {
  const trimmed = input.trim();
  const videoId =
    youtubeVideoId(trimmed) ?? trimmed.match(/^[\w-]{11}$/)?.[0] ?? null;
  if (videoId) {
    return { kind: "url", url: canonicalWatchUrl(videoId), videoId };
  }
  return { kind: "description", query: trimmed };
}

async function findVideo(args: Record<string, unknown>, state: ToolState, emit: Emit) {
  const urlArg = typeof args.url === "string" && args.url.trim() ? args.url.trim() : undefined;
  const query =
    typeof args.query === "string" && args.query.trim() ? args.query.trim() : urlArg ?? "";

  if (urlArg) {
    const videoId = youtubeVideoId(urlArg);
    if (!videoId) return { error: "That does not look like a valid YouTube URL." };
    emit({ type: "step", label: "Loading the video details…" });
    const meta = await fetchOEmbed(videoId);
    const video: VideoProposal = {
      title: meta.title,
      channel: meta.channel,
      url: canonicalWatchUrl(videoId),
      videoId,
      thumbnail: meta.thumbnail,
      reason: "You provided this link directly.",
      candidates: [],
    };
    state.proposal = { video };
    emit({ type: "proposal", video });
    return summary(video);
  }

  if (!query) return { error: "I need a description or a link to find a video." };

  const recency = args.recency === "latest" ? "latest" : "relevant";
  const { pick, sessionId } = await findBestVideo(query, {
    recency,
    onStep: (label) => emit({ type: "step", label }),
  });
  const video = toVideoProposal(pick);
  state.proposal = { video, sessionId };
  emit({ type: "proposal", video, sessionId });
  return { ...summary(video), otherCandidates: pick.candidates.map((c) => c.title) };
}

async function createProjectTool(args: Record<string, unknown>, state: ToolState, emit: Emit) {
  const url = (typeof args.url === "string" && args.url.trim()) || state.proposal?.video.url;
  if (!url) return { error: "There is no video to create a project from yet." };

  emit({ type: "step", label: "Transcribing audio with ElevenLabs (Scribe)…" });
  const transcript = await transcribeYoutube(url);
  const stats = transcriptStats(transcript);

  emit({ type: "step", label: "Working out who is speaking…" });
  const primary = await pickPrimarySpeaker(transcript, state.proposal?.video.title);

  emit({
    type: "transcript",
    transcript,
    stats,
    primarySpeaker: primary.speakerId,
    primarySpeakerReason: primary.reason,
  });

  const videoId = youtubeVideoId(url) ?? "";
  const video = state.proposal?.video ?? {
    title: url,
    channel: "",
    url,
    videoId,
    thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "",
  };

  await saveTranscriptRun({ video, stats, transcript, primarySpeaker: primary.speakerId });

  const name = typeof args.name === "string" && args.name.trim() ? args.name.trim() : video.title;
  const project = await createProject({ name, video, stats, transcript });
  emit({ type: "project", project });

  return {
    ok: true,
    id: project.id,
    name: project.name,
    language: stats.language,
    words: stats.words,
    durationSeconds: Math.round(stats.duration),
    preview: transcript.text.slice(0, 300),
  };
}

function summary(video: VideoProposal) {
  return {
    title: video.title,
    channel: video.channel,
    url: video.url,
    reason: video.reason,
  };
}
