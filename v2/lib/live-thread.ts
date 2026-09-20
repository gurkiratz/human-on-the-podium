import type { Detection } from "./types";

/** One continuous listening run inside a session. Pausing and resuming adds a thread. */
export interface LiveThread {
  id: string;
  index: number;
  startedAt: number;
  endedAt: number | null;
  /** Every committed transcript segment, in order, whether or not it was scored. */
  segments: string[];
  detections: Detection[];
}

/** Words spoken in a thread, counted from everything it captured. */
export function wordsIn(thread: LiveThread): number {
  return thread.segments.join(" ").trim().split(/\s+/).filter(Boolean).length;
}
