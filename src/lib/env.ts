/**
 * The project's .env uses `11LABS_API_KEY`, which is not a valid shell
 * identifier, so it can only be read via index access. We accept the
 * conventional name too, in case the key is moved later.
 */
export function elevenLabsKey(): string {
  const key =
    process.env["11LABS_API_KEY"] ??
    process.env.ELEVENLABS_API_KEY ??
    process.env.ELEVEN_LABS_API_KEY;
  if (!key) throw new Error("Missing 11LABS_API_KEY in .env");
  return key;
}

export function gptZeroKey(): string {
  const key = process.env.GPT_ZERO_API_KEY ?? process.env.GPTZERO_API_KEY;
  if (!key) throw new Error("Missing GPT_ZERO_API_KEY in .env");
  return key;
}
