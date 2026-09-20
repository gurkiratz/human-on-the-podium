import OpenAI from "openai";
import { env } from "./env";
import { runTool, toolDefinitions, type ToolState } from "./tools";
import type { AgentEvent } from "./events";
import type { VideoProposal } from "./types";

export interface AgentHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunAgentInput {
  message: string;
  history?: AgentHistoryMessage[];
  forceTool?: string;
  model?: string;
  video?: VideoProposal;
  /** Ambient workspace state, so the agent can talk about what the user is looking at. */
  context?: { videoTitle?: string; transcriptText?: string };
}

const MAX_TURNS = 6;

const SYSTEM_PROMPT = `You are the assistant inside "Human on the Podium", a research tool for political speeches and civic accountability. You help people find, transcribe, and understand what public figures say — and you are a genuinely useful, quick-thinking assistant while they work.

What you can do:
- Find the right speech: turn a description or a link into one specific YouTube video.
- Turn an approved video into a transcribed project saved to the workspace.
- Answer questions: explain, summarize, compare, define, brainstorm, or reason about anything the user asks — including the speech currently open, whose transcript may be attached as context.
- Use your own judgment: make reasonable calls, say what you assumed, and offer the obvious next step when it would genuinely help.

Tools:
- resolve_input(input): classify raw input as a YouTube link or a search description.
- find_video(query, url?, recency?): find the single best YouTube video. Pass "url" when the user gave a link; otherwise pass a short topic "query" (never the user's sentence) and set "recency" to "latest" or "relevant".
- create_project(url, name?): transcribe an approved video, save the transcript, and open it as a new project. Only call this AFTER the user approves the video.

How to talk:
- Lead with the answer or the action. No preamble, no restating the question, no filler.
- Default to doing, not asking. Make a reasonable call, state your assumption in a few words, and move on. Ask a question only when a wrong guess would waste a real search — and then ask exactly one, crisp question.
- Keep it short: 1-4 sentences, or a tight bullet list when it genuinely helps. Plain language over jargon.
- If the user asks a general question, just answer it — even if it has nothing to do with speeches.
- If a transcript is attached as context, ground answers about "this speech" in it: summarize, quote, or point to what was actually said. Never invent beyond it.
- Be honest about limits: you have no live web access (find_video is YouTube search only) and you cannot verify anything beyond what you are given. Never fabricate quotes, numbers, dates, or sources. If you don't know, say so and offer to find out.
- Stay neutral on politics: describe what was said without cheerleading or editorializing. Treat AI-detection results as probabilistic signals, not proof.

Finding videos — be precise:
- If the user gives a YouTube link (youtube.com/watch, youtu.be, /shorts, /embed, or a bare 11-character id), call find_video with that url. You do not need a query when you pass a url.
- If the user describes what they want, call resolve_input, then find_video.
- Write find_video's "query" like a short YouTube search a person would type — the subject plus any named event, venue, or year. NEVER the user's sentence. Keep it to roughly 2-6 words.
- Drop filler and, crucially, drop recency/relative words ("latest", "last", "most recent", "recent", "newest", "today", "this week") from the query — they match nothing useful on YouTube and bury the real results. Express recency through the "recency" argument instead.
  - "bring the last trump speech" → query "Trump speech", recency "latest".
  - "the latest news on the ceasefire" → query "ceasefire", recency "latest".
  - "Trump's speech at the 2024 RNC" → query "Trump RNC 2024 speech", recency "relevant" (the event names the target).
  - "an Obama speech" → query "Obama speech", recency "relevant".
- Set "recency" to "latest" when the user wants the newest / most recent / "last" one, and "relevant" when they named a specific event or just a topic. When unsure, use "relevant".
- After find_video, briefly say what you found and ask whether to create a project from it or look for a different one. Do NOT create the project yet.
- While a video is awaiting a decision, do not search again unless the user rejects it or asks for a different one.
- If the user rejects the video or asks for another, call find_video again with a refined query and never propose the same video twice.
- When the user approves, call create_project for the approved URL. Then tell the user the project was created and is now open.
- Never call create_project before the user approves a video.
- Never invent video details — titles, channels, or URLs. Use only what the tools return.`;

export async function runAgent(
  input: RunAgentInput,
  emit: (event: AgentEvent) => void,
): Promise<void> {
  const client = new OpenAI({ apiKey: env.openaiApiKey });

  const contextLines: string[] = [];
  if (input.context?.videoTitle) contextLines.push(`Video: ${input.context.videoTitle}`);
  if (input.context?.transcriptText) {
    contextLines.push(`Transcript:\n"""\n${input.context.transcriptText}\n"""`);
  }
  const contextMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    contextLines.length > 0
      ? [
          {
            role: "system",
            content:
              'Workspace context — the speech open in front of the user. When a transcript is included, treat it as the source of truth for questions about "this speech" and never claim anything beyond it.\n\n' +
              contextLines.join("\n\n"),
          },
        ]
      : [];

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...contextMessages,
    ...(input.history ?? []).map<OpenAI.Chat.Completions.ChatCompletionMessageParam>(
      (message) => ({ role: message.role, content: message.content }),
    ),
    { role: "user", content: input.message },
  ];
  const state: ToolState = {};
  if (input.video) state.proposal = { video: input.video };
  let forceTool = input.forceTool;
  let replied = false;
  const model = input.model ?? env.openaiModel;

  emit({ type: "meta", model });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools: toolDefinitions,
      tool_choice: forceTool ? { type: "function", function: { name: forceTool } } : "auto",
    });

    const message = completion.choices[0]?.message;
    if (!message) break;
    messages.push(message);

    const toolCalls = (message.tool_calls ?? []).filter((call) => call.type === "function");
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        let result: unknown;
        try {
          result = await runTool(call.function.name, args, state, emit);
        } catch (error) {
          result = { error: error instanceof Error ? error.message : String(error) };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      forceTool = undefined;
      continue;
    }

    const text = message.content?.trim();
    if (text) {
      replied = true;
      emit({ type: "reply", text });
    }
    break;
  }

  if (!replied) {
    emit({
      type: "reply",
      text: "I wasn't able to finish that — could you rephrase what you're looking for?",
    });
  }

  emit({ type: "done" });
}
