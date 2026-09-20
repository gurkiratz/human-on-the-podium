/**
 * Buffers the 128-frame render quanta into larger blocks and converts them to
 * signed 16-bit PCM, which is what the Scribe realtime endpoint expects.
 *
 * The AudioContext is created at 16 kHz, so the browser has already resampled
 * the microphone for us and no rate conversion is needed here.
 */
const BLOCK_SAMPLES = 1024; // 64 ms at 16 kHz

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(BLOCK_SAMPLES);
    this.offset = 0;
    this.peak = 0;
    this.muted = false;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "mute") {
        this.muted = Boolean(event.data.value);
        // Drop whatever was mid-block so muted audio never leaks out.
        this.offset = 0;
        this.peak = 0;
      }
    };
  }

  flush() {
    const pcm = new Int16Array(BLOCK_SAMPLES);
    for (let j = 0; j < BLOCK_SAMPLES; j++) {
      const clamped = Math.max(-1, Math.min(1, this.buffer[j]));
      pcm[j] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    // One message per block carries both the audio and the meter value, so the
    // main thread is not woken 125 times a second just to draw a level.
    this.port.postMessage({ type: "audio", pcm: pcm.buffer, level: this.peak }, [
      pcm.buffer,
    ]);
    this.offset = 0;
    this.peak = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || this.muted) return true;

    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      const magnitude = sample < 0 ? -sample : sample;
      if (magnitude > this.peak) this.peak = magnitude;
      this.buffer[this.offset++] = sample;
      if (this.offset === BLOCK_SAMPLES) this.flush();
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
