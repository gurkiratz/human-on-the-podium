export type LivePrefs = {
  /** Show the live transcript over the camera like subtitles. */
  captions: boolean;
  /** Speak the roast/praise callouts out loud. */
  voice: boolean;
  /** Mirror the camera preview horizontally. */
  mirror: boolean;
};

export const DEFAULT_PREFS: LivePrefs = {
  captions: true,
  voice: true,
  mirror: true,
};
