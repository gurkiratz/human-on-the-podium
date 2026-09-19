import { MAX_YOUTUBE_JOBS } from "./constants";

export { MAX_YOUTUBE_JOBS };

let inFlight = 0;

export function youtubeJobsInFlight(): number {
  return inFlight;
}

export function tryAcquireYoutubeJob(): boolean {
  if (inFlight >= MAX_YOUTUBE_JOBS) return false;
  inFlight += 1;
  return true;
}

export function releaseYoutubeJob() {
  inFlight = Math.max(0, inFlight - 1);
}
