export const VOICES = [
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", blurb: "Husky trickster" },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", blurb: "Fierce warrior" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", blurb: "Dominant, firm" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", blurb: "Energetic creator" },
] as const;

export const DEFAULT_VOICE_ID = VOICES[0].id;

/**
 * v3 understands the `[shouting]` tags the roast lines use. It is slower than
 * Flash, which is why `/api/speak` caches and pre-warms every line.
 */
export const TTS_MODEL_ID = "eleven_v3";
