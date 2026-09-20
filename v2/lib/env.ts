function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Add it to .env (see .env.example).`,
    );
  }
  return value;
}

export const env = {
  get browserbaseApiKey(): string {
    return required("BROWSERBASE_API_KEY");
  },
  get elevenLabsApiKey(): string {
    return required("ELEVENLABS_API_KEY");
  },
  get openaiApiKey(): string {
    return required("OPENAI_API_KEY");
  },
  get gptzeroApiKey(): string {
    return required("GPTZERO_API_KEY");
  },
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get factCheckApiKey(): string {
    return required("GOOGLE_FACTCHECK_API_KEY");
  },
  get fredApiKey(): string {
    return required("FRED_API_KEY");
  },
  hasGptzero(): boolean {
    return Boolean(process.env.GPTZERO_API_KEY?.trim());
  },
  hasFactCheck(): boolean {
    return Boolean(process.env.GOOGLE_FACTCHECK_API_KEY?.trim());
  },
  hasFred(): boolean {
    return Boolean(process.env.FRED_API_KEY?.trim());
  },
  /** Optional Slack-compatible incoming webhook for alerts. */
  get alertWebhookUrl(): string {
    return process.env.ALERT_WEBHOOK_URL?.trim() ?? "";
  },
  hasAlertWebhook(): boolean {
    return Boolean(process.env.ALERT_WEBHOOK_URL?.trim());
  },
  /** AI probability at or above which a scored speech raises an alert. */
  get alertAiThreshold(): number {
    const value = Number(process.env.ALERT_AI_THRESHOLD);
    return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.8;
  },
  get openaiModel(): string {
    return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
  },
  /** Optional path to a yt-dlp binary; falls back to ./bin/yt-dlp then PATH. */
  get ytDlpPath(): string {
    return process.env.YT_DLP_PATH?.trim() ?? "";
  },
};
