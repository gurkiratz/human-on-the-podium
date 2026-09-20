import type { LiveEvent } from "@humanonthepodium/shared";

export type BackgroundMessage =
  | {
      type: "START_CAPTURE";
      tabId: number;
      streamId: string;
      sourceUrl?: string;
      title?: string;
    }
  | { type: "STOP_CAPTURE" }
  | { type: "GET_STATE" };

export type BackgroundResponse =
  | { ok: true; sessionId?: string; capturing?: boolean }
  | { ok: false; error: string };

export type SidePanelMessage = {
  type: "LIVE_EVENT";
  payload: LiveEvent;
};

export type OffscreenMessage =
  | {
      type: "START_RECORDING";
      streamId: string;
      sessionId: string;
    }
  | { type: "STOP_RECORDING" };

export type OffscreenResponse =
  | { ok: true }
  | { ok: false; error: string };
