import { liveAudioUrl } from "../../utils/api";
import type { OffscreenMessage, OffscreenResponse } from "../../utils/messages";

let audioContext: AudioContext | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let processorNode: ScriptProcessorNode | null = null;
let capturedStream: MediaStream | null = null;
let liveAudioSocket: WebSocket | null = null;
let sessionId: string | null = null;
let sampleRate = 48000;

const BUFFER_SIZE = 4096;
const LIVE_TRANSCRIBE_RATE = 16000;

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function resampleTo16k(samples: Float32Array, sourceRate: number) {
  if (sourceRate === LIVE_TRANSCRIBE_RATE) return samples;
  const ratio = sourceRate / LIVE_TRANSCRIBE_RATE;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const resampled = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const sourceIndex = Math.min(samples.length - 1, Math.round(i * ratio));
    resampled[i] = samples[sourceIndex];
  }
  return resampled;
}

function pcm16Base64(samples: Float32Array, sourceRate: number) {
  const resampled = resampleTo16k(samples, sourceRate);
  const buffer = new ArrayBuffer(resampled.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < resampled.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return encodeBase64(new Uint8Array(buffer));
}

function sendLiveAudio(samples: Float32Array) {
  if (!sessionId || liveAudioSocket?.readyState !== WebSocket.OPEN) return;
  liveAudioSocket.send(
    JSON.stringify({
      type: "audio",
      data: pcm16Base64(samples, sampleRate),
    }),
  );
}

async function startRecording(streamId: string, activeSessionId: string) {
  stopRecording();

  sessionId = activeSessionId;
  liveAudioSocket = new WebSocket(liveAudioUrl(activeSessionId));
  liveAudioSocket.onerror = (event) => {
    console.error("Live audio socket error", event);
  };

  capturedStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
    video: false,
  });

  const audioTracks = capturedStream.getAudioTracks();
  if (audioTracks.length === 0) {
    throw new Error("No audio track available from tab capture");
  }

  audioContext = new AudioContext();
  sampleRate = audioContext.sampleRate;
  sourceNode = audioContext.createMediaStreamSource(capturedStream);
  processorNode = audioContext.createScriptProcessor(BUFFER_SIZE, 2, 2);

  processorNode.onaudioprocess = (event) => {
    const inputBuffer = event.inputBuffer;
    const outputBuffer = event.outputBuffer;
    const channelCount = inputBuffer.numberOfChannels;
    const frameCount = inputBuffer.length;
    const mono = new Float32Array(frameCount);

    for (let channel = 0; channel < channelCount; channel += 1) {
      const input = inputBuffer.getChannelData(channel);
      const output = outputBuffer.getChannelData(channel);
      output.set(input);

      for (let i = 0; i < frameCount; i += 1) {
        mono[i] += input[i] / channelCount;
      }
    }

    sendLiveAudio(mono);
  };

  sourceNode.connect(processorNode);
  processorNode.connect(audioContext.destination);
}

function stopRecording() {
  if (liveAudioSocket?.readyState === WebSocket.OPEN) {
    liveAudioSocket.send(JSON.stringify({ type: "stop" }));
  }
  liveAudioSocket?.close();

  processorNode?.disconnect();
  sourceNode?.disconnect();
  capturedStream?.getTracks().forEach((track) => track.stop());
  void audioContext?.close();

  processorNode = null;
  sourceNode = null;
  capturedStream = null;
  audioContext = null;
  liveAudioSocket = null;
  sessionId = null;
}

chrome.runtime.onMessage.addListener(
  (
    message: OffscreenMessage,
    _sender,
    sendResponse: (response: OffscreenResponse) => void,
  ) => {
    if (message.type !== "START_RECORDING" && message.type !== "STOP_RECORDING") {
      return false;
    }

    void (async () => {
      try {
        if (message.type === "START_RECORDING") {
          await startRecording(message.streamId, message.sessionId);
          sendResponse({ ok: true });
          return;
        }
        if (message.type === "STOP_RECORDING") {
          stopRecording();
          sendResponse({ ok: true });
          return;
        }
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Offscreen error",
        });
      }
    })();
    return true;
  },
);
