"use client";

import { warmupLines, type Line } from "./roast";

/**
 * Plays the roast lines and tells the caller exactly when audio starts and
 * stops, so the microphone can be muted for the duration.
 */
export class Speaker {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private generation = 0;

  constructor(
    private onSpeakingChange: (speaking: boolean) => void,
    private onError?: (message: string) => void,
  ) {}

  /** Synthesizes and caches lines server-side before they are needed. */
  async warm(voiceId: string) {
    await Promise.allSettled(
      warmupLines().map((line) =>
        fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: line.speech, voiceId, warm: true }),
        }),
      ),
    );
  }

  /**
   * Resolves once playback has finished (or failed). The caller keeps the mic
   * muted until then.
   */
  async speak(line: Line, voiceId: string): Promise<void> {
    const generation = ++this.generation;
    this.stop();

    let blob: Blob;
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line.speech, voiceId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Speech failed (${res.status})`);
      }
      blob = await res.blob();
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : "Speech failed");
      return;
    }

    // A newer line was requested while this one was being fetched.
    if (generation !== this.generation) return;

    const url = URL.createObjectURL(blob);
    this.objectUrl = url;
    const audio = new Audio(url);
    this.audio = audio;

    this.onSpeakingChange(true);
    try {
      await audio.play();
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
    } catch (err) {
      this.onError?.(
        err instanceof Error ? err.message : "Could not play audio",
      );
    } finally {
      if (generation === this.generation) {
        this.cleanup();
        this.onSpeakingChange(false);
      }
    }
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
    }
    this.cleanup();
  }

  private cleanup() {
    this.audio = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
