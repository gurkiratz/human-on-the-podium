"use client";

const WS_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
const SAMPLE_RATE = 16000;

export type ScribeStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "muted"
  | "error";

export type ScribeCallbacks = {
  onPartial?: (text: string) => void;
  onCommitted?: (text: string) => void;
  onLevel?: (level: number) => void;
  onStatus?: (status: ScribeStatus) => void;
  onError?: (message: string) => void;
};

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/**
 * Captures the microphone and streams it to ElevenLabs Scribe.
 *
 * We drive the WebSocket ourselves rather than using the `useScribe` hook
 * because we need two things the hook does not expose: picking a specific
 * input device, and hard-muting capture while the roast voice is speaking so
 * the app never transcribes itself.
 */
export class ScribeSession {
  private ws: WebSocket | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private muted = false;
  private stopped = false;
  private lastChunk: ArrayBuffer | null = null;

  constructor(private callbacks: ScribeCallbacks) {}

  get isMuted() {
    return this.muted;
  }

  async start(deviceId?: string) {
    this.stopped = false;
    this.callbacks.onStatus?.("connecting");

    const tokenRes = await fetch("/api/scribe-token", { method: "POST" });
    if (!tokenRes.ok) {
      const body = await tokenRes.json().catch(() => ({}));
      throw new Error(body.error ?? "Could not get a Scribe token");
    }
    const { token } = (await tokenRes.json()) as { token: string };

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    if (this.stopped) return this.stop();

    // Asking for the context at 16 kHz makes the browser resample for us.
    this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await this.context.audioWorklet.addModule("/worklets/pcm-recorder.js");
    if (this.stopped) return this.stop();

    this.source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, "pcm-recorder");
    this.source.connect(this.node);
    // The worklet produces no output, but Chrome will not pull from a node
    // that is not connected to the graph's destination.
    this.node.connect(this.context.destination);

    await this.openSocket(token);

    this.node.port.onmessage = (event) => {
      const data = event.data as { type: string; pcm?: ArrayBuffer; level?: number };
      if (data.type !== "audio" || !data.pcm) return;
      if (typeof data.level === "number") this.callbacks.onLevel?.(data.level);
      this.lastChunk = data.pcm;
      this.send(data.pcm, false);
    };

    this.callbacks.onStatus?.(this.muted ? "muted" : "listening");
  }

  private openSocket(token: string) {
    return new Promise<void>((resolve, reject) => {
      const params = new URLSearchParams({
        model_id: "scribe_v2_realtime",
        audio_format: `pcm_${SAMPLE_RATE}`,
        language_code: "en",
        commit_strategy: "vad",
        // Commit a segment after a short silence so the chunker sees finished
        // text quickly instead of waiting for a long pause.
        vad_silence_threshold_secs: "0.6",
      });
      const ws = new WebSocket(`${WS_URL}?${params}&token=${token}`);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      ws.onopen = () => resolve();
      ws.onerror = () => {
        this.callbacks.onError?.("Scribe connection failed");
        this.callbacks.onStatus?.("error");
        reject(new Error("Scribe connection failed"));
      };
      ws.onclose = () => {
        if (!this.stopped) {
          this.callbacks.onError?.("Scribe connection closed");
          this.callbacks.onStatus?.("error");
        }
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let msg: { message_type?: string; text?: string };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!msg.text) return;
        if (msg.message_type === "partial_transcript") {
          this.callbacks.onPartial?.(msg.text);
        } else if (
          msg.message_type === "committed_transcript" ||
          msg.message_type === "committed_transcript_with_timestamps"
        ) {
          this.callbacks.onCommitted?.(msg.text);
        }
      };
    });
  }

  private send(pcm: ArrayBuffer, commit: boolean) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: toBase64(pcm),
        sample_rate: SAMPLE_RATE,
        ...(commit ? { commit: true } : {}),
      }),
    );
  }

  /**
   * Stops sending audio without tearing the session down. Used while the roast
   * voice speaks, so the app never hears itself.
   */
  setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted && this.lastChunk) {
      // Flush whatever was half-spoken so those words are not stranded in the
      // server's buffer until the speaker resumes.
      this.send(this.lastChunk, true);
    }
    this.node?.port.postMessage({ type: "mute", value: muted });
    if (!this.stopped) this.callbacks.onStatus?.(muted ? "muted" : "listening");
  }

  async stop() {
    this.stopped = true;
    this.node?.port.postMessage({ type: "mute", value: true });
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    this.ws = null;
    if (this.context && this.context.state !== "closed") {
      await this.context.close().catch(() => {});
    }
    this.context = null;
    this.muted = false;
    this.lastChunk = null;
    this.callbacks.onStatus?.("idle");
  }
}

export { SAMPLE_RATE };
