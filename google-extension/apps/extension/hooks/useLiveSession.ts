import { useCallback, useEffect, useState } from "react";
import type {
  Claim,
  DetectionResult,
  Explanation,
  LiveEvent,
  LiveOverlayState,
  PipelineStatus,
  TranscriptChunk,
  TranscriptSegment,
} from "@humanonthepodium/shared";

export interface LiveSessionState {
  sessionId: string | null;
  capturing: boolean;
  status: PipelineStatus;
  statusMessage?: string;
  overlay: LiveOverlayState | null;
  segments: TranscriptSegment[];
  chunks: TranscriptChunk[];
  detections: DetectionResult[];
  explanations: Explanation[];
  claims: Claim[];
  error: string | null;
}

const INITIAL: LiveSessionState = {
  sessionId: null,
  capturing: false,
  status: "idle",
  overlay: null,
  segments: [],
  chunks: [],
  detections: [],
  explanations: [],
  claims: [],
  error: null,
};

function applyEvent(state: LiveSessionState, event: LiveEvent): LiveSessionState {
  switch (event.type) {
    case "status":
      return {
        ...state,
        status: event.payload.status,
        statusMessage: event.payload.message,
      };
    case "transcript":
      if (event.payload.id.endsWith("-interim")) {
        const withoutPreview = state.segments.filter((segment) => !segment.id.endsWith("-interim"));
        return {
          ...state,
          segments: [...withoutPreview, event.payload],
        };
      }
      if (state.segments.some((segment) => segment.id === event.payload.id)) {
        return state;
      }
      return {
        ...state,
        segments: [
          ...state.segments.filter((segment) => !segment.id.endsWith("-interim")),
          event.payload,
        ],
      };
    case "chunk":
      if (state.chunks.some((chunk) => chunk.id === event.payload.id)) {
        return state;
      }
      return {
        ...state,
        chunks: [...state.chunks, event.payload],
      };
    case "detection":
      if (state.detections.some((detection) => detection.id === event.payload.id)) {
        return state;
      }
      return {
        ...state,
        detections: [...state.detections, event.payload],
      };
    case "explanation":
      if (state.explanations.some((explanation) => explanation.id === event.payload.id)) {
        return state;
      }
      return {
        ...state,
        explanations: [...state.explanations, event.payload],
      };
    case "claim":
      if (state.claims.some((claim) => claim.id === event.payload.id)) {
        return state;
      }
      return {
        ...state,
        claims: [...state.claims, event.payload],
      };
    case "overlay":
      return {
        ...state,
        sessionId: event.payload.sessionId,
        overlay: event.payload,
        status: event.payload.status,
        statusMessage:
          event.payload.label === "high"
            ? `Likely AI-written · ${Math.round(event.payload.aiScore)}%`
            : event.payload.label === "medium"
              ? `Possible AI-written · ${Math.round(event.payload.aiScore)}%`
              : state.statusMessage,
      };
    case "error":
      return {
        ...state,
        error: event.payload.message,
        status: "error",
      };
    default:
      return state;
  }
}

export function useLiveSession() {
  const [state, setState] = useState<LiveSessionState>(INITIAL);

  // Background owns the live WebSocket. Side panel only consumes LIVE_EVENT
  // messages so each transcript/chunk/detection is applied once.
  const connect = useCallback((sessionId: string) => {
    setState((prev) => ({
      ...INITIAL,
      sessionId,
      capturing: prev.capturing,
    }));
  }, []);

  const disconnect = useCallback(() => {
    // no-op: background socket lifecycle follows capture start/stop
  }, []);

  const setCapturing = useCallback((capturing: boolean) => {
    setState((prev) => ({ ...prev, capturing }));
  }, []);

  const setSessionId = useCallback((sessionId: string | null) => {
    setState((prev) => ({ ...prev, sessionId }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL);
  }, []);

  useEffect(() => {
    const listener = (message: {
      type?: string;
      payload?: LiveEvent;
      sessionId?: string;
      capturing?: boolean;
      error?: string;
    }) => {
      if (message?.type === "LIVE_EVENT" && message.payload) {
        setState((prev) => applyEvent(prev, message.payload!));
      }
      if (message?.type === "CAPTURE_STATE" && message.sessionId) {
        setState((prev) => ({
          ...prev,
          sessionId: message.sessionId ?? prev.sessionId,
          capturing: Boolean(message.capturing),
          status: message.capturing ? "capturing" : prev.status,
          error: null,
        }));
      }
      if (message?.type === "CAPTURE_ERROR" && message.error) {
        setState((prev) => ({
          ...prev,
          error: message.error ?? "Failed to start capture",
          status: "error",
          capturing: false,
        }));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    setCapturing,
    setSessionId,
    reset,
  };
}
