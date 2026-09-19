import fs from "node:fs";
import path from "node:path";
import { elevenLabsKey } from "./env";

/** Transcribe a local audio file with ElevenLabs Scribe. */
export async function transcribeFile(audioPath: string): Promise<string> {
  const buf = fs.readFileSync(audioPath);
  const name = path.basename(audioPath);
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append(
    "file",
    new Blob([new Uint8Array(buf)], { type: "audio/mpeg" }),
    name,
  );
  form.append("tag_audio_events", "false");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": elevenLabsKey() },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs STT ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { text?: string };
  const text = json.text?.trim();
  if (!text) throw new Error("Empty transcript from ElevenLabs");
  return text;
}
