import type { Verdict } from "./types";

export type Line = {
  /** Sent to ElevenLabs. May contain v3 audio tags in square brackets. */
  speech: string;
  /** Shown on screen. No tags. */
  caption: string;
};

/**
 * The AI lines open with a shush because the point is to cut the speaker off
 * mid-sentence, not to wait politely for a gap.
 */
const AI_LINES: Line[] = [
  {
    speech:
      "[shouting] Shhhhh! Shhhh! Stop talking. You sloppy bitch, that's ChatGPT, that is not you.",
    caption: "SHHHH! Stop talking. You sloppy bitch, that's ChatGPT — that is not you.",
  },
  {
    speech:
      "[shouting] HEY! Shhhh. Shut up. Every single word of that came out of a fucking language model.",
    caption: "HEY! Shut up. Every single word of that came out of a language model.",
  },
  {
    speech:
      "[shouting] Shhh shhh shhh. No. You sloppy bitch, I can hear the em dashes from here.",
    caption: "Shhh shhh shhh. No. You sloppy bitch — I can hear the em dashes from here.",
  },
  {
    speech:
      "[shouting] Nope! Shhhhh. That is AI slop and you know it. Say something real, you coward.",
    caption: "Nope! That is AI slop and you know it. Say something real, you coward.",
  },
  {
    speech:
      "[shouting] HEY! Shhhh. You absolute fraud. That was generated. Use your own damn brain.",
    caption: "HEY! You absolute fraud. That was generated. Use your own damn brain.",
  },
  {
    speech:
      "[shouting] Shhhhhh! Stop. Stop. I have heard a robot say that exact sentence, you sloppy bitch.",
    caption: "SHHHH! Stop. Stop. I have heard a robot say that exact sentence, you sloppy bitch.",
  },
];

const HUMAN_LINES: Line[] = [
  { speech: "Good. Good. That's all you. Keep it up.", caption: "Good. Good. That's all you. Keep it up." },
  { speech: "Yeah, that's real. Nice. Keep going.", caption: "Yeah, that's real. Nice. Keep going." },
  {
    speech: "Clean. That sounded like an actual human being. Keep it up.",
    caption: "Clean. That sounded like an actual human being. Keep it up.",
  },
  { speech: "Good good. No slop detected. Carry on.", caption: "Good good. No slop detected. Carry on." },
];

const MIXED_LINES: Line[] = [
  {
    speech:
      "Alright, some of that was you. But it still sounds like AI. Come back with a better job.",
    caption: "Alright, some of that was you — but it still sounds like AI. Come back with a better job.",
  },
  {
    speech:
      "Half decent. Parts of that were real. The rest sounded generated. Do better.",
    caption: "Half decent. Parts of that were real — the rest sounded generated. Do better.",
  },
  {
    speech:
      "Not bad. But I can still hear the robot in there. Come back sharper.",
    caption: "Not bad — but I can still hear the robot in there. Come back sharper.",
  },
];

const BANK: Record<Verdict, Line[]> = {
  ai: AI_LINES,
  human: HUMAN_LINES,
  mixed: MIXED_LINES,
};

/** Picks a line, avoiding an immediate repeat of `previous`. */
export function pickLine(verdict: Verdict, previous?: string): Line {
  const lines = BANK[verdict];
  const options = lines.length > 1 ? lines.filter((l) => l.speech !== previous) : lines;
  return options[Math.floor(Math.random() * options.length)];
}

/** The lines worth pre-warming before the first verdict lands. */
export function warmupLines(): Line[] {
  return [AI_LINES[0], AI_LINES[1], HUMAN_LINES[0], MIXED_LINES[0]];
}

/** Strips v3 audio tags for models that would read them aloud. */
export function stripTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}
