import OpenAI from "openai";
import { env } from "./env";
import { speakerSummaries, type Transcript } from "./types";

export interface PrimarySpeakerResult {
  speakerId: string | null;
  reason: string;
}

/**
 * Choose which diarized speaker the clip is actually about. Anchors, interviewers and
 * narrators talk a lot, so "most words" is a poor default — the model reads each speaker's
 * opening lines plus what the user asked for, and we fall back to word share if it fails.
 */
export async function pickPrimarySpeaker(
  transcript: Transcript,
  hint?: string,
): Promise<PrimarySpeakerResult> {
  const speakers = speakerSummaries(transcript, 70);
  if (speakers.length === 0) {
    return { speakerId: null, reason: "No speakers were detected in this audio." };
  }
  if (speakers.length === 1) {
    return { speakerId: speakers[0].id, reason: "Only one speaker in this audio." };
  }

  const roster = speakers
    .map(
      (speaker) =>
        `- id="${speaker.id}" (${Math.round(speaker.share * 100)}% of spoken words) says: "${speaker.sample}"`,
    )
    .join("\n");

  try {
    const client = new OpenAI({ apiKey: env.openaiApiKey });
    const completion = await client.chat.completions.create({
      model: env.openaiModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You identify who is actually SPEAKING in a broadcast transcript, not what the segment is about. " +
            "In news packages an anchor, reporter or narrator describes events in the third person " +
            "('President Trump arrived in the city…', 'Danielle Nottingham has the latest'). " +
            "The person the story is about speaks for themselves in the first person about their own actions and feelings " +
            "('I want to thank…', 'our people', 'we will'). " +
            "Never choose an anchor, reporter, host, narrator or bystander being interviewed. " +
            "A speaker who merely mentions the subject's name in the third person is NOT the subject. " +
            "Reply with JSON only.",
        },
        {
          role: "user",
          content:
            `The user asked for: ${hint?.trim() || "(nothing specific)"}\n\n` +
            `Speakers detected:\n${roster}\n\n` +
            `Step 1: for each speaker decide whether they are a narrator/anchor/reporter (third-person narration about someone else) ` +
            `or the subject speaking for themselves (first person: I, we, my, our).\n` +
            `Step 2: return the id of the SUBJECT — the person delivering the speech or statement, not the person describing it. ` +
            `Low word share is fine; a brief clip of the subject still wins over a long narration.\n` +
            `Reply as {"speakerId": "<id>", "reason": "<12 words max>"}.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { speakerId?: string; reason?: string };
    const match = speakers.find((speaker) => speaker.id === parsed.speakerId);
    if (match) {
      return {
        speakerId: match.id,
        reason: parsed.reason?.trim() || "Chosen by the model.",
      };
    }
  } catch {
    // fall through to the word-share default
  }

  return {
    speakerId: speakers[0].id,
    reason: "Fallback: the speaker with the most words.",
  };
}
