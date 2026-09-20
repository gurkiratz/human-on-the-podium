/**
 * Build the error a client should see for an upstream provider failure.
 *
 * Provider response bodies are logged server-side but never echoed back in the returned
 * message — they can contain internal detail, request echoes or account hints.
 */
export function upstreamError(label: string, status: number, detail?: string): Error {
  if (detail) console.error(`${label} failed (${status}): ${detail.slice(0, 800)}`);
  return new Error(`${label} failed (${status}).`);
}
