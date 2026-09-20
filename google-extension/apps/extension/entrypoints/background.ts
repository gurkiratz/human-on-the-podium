import type { LiveEvent, SourceType } from "@humanonthepodium/shared";
import {
  connectLive,
  createSession,
  endSession,
  reportUrl,
} from "../utils/api";
import type {
  BackgroundMessage,
  BackgroundResponse,
  OffscreenMessage,
  OffscreenResponse,
} from "../utils/messages";

const OFFSCREEN_URL = "offscreen.html";

interface CaptureState {
  sessionId: string;
  tabId: number;
  capturing: boolean;
  ws: WebSocket | null;
}

let state: CaptureState | null = null;

async function restoreState() {
  if (state) return state;

  const stored = await chrome.storage.local.get([
    "activeSessionId",
    "activeTabId",
    "capturing",
  ]);
  if (typeof stored.activeSessionId !== "string" || typeof stored.activeTabId !== "number") {
    return null;
  }

  state = {
    sessionId: stored.activeSessionId,
    tabId: stored.activeTabId,
    capturing: Boolean(stored.capturing),
    ws: null,
  };
  return state;
}

function inferSourceType(url?: string): SourceType {
  if (!url) return "youtube";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("twitch.tv")) return "twitch";
  if (url.includes("meet.google.com")) return "meet";
  if (url.includes("zoom.us")) return "zoom-web";
  return "youtube";
}

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Record tab audio for HumanonthePodium transcription pipeline.",
  });
}

async function sendToOffscreen(
  message: OffscreenMessage,
): Promise<OffscreenResponse> {
  return chrome.runtime.sendMessage(message);
}

function broadcastLiveEvent(event: LiveEvent) {
  if (!state) return;

  chrome.runtime
    .sendMessage({ type: "LIVE_EVENT", payload: event })
    .catch(() => {});
}

function getTabStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError || !id) {
        reject(new Error(chrome.runtime.lastError?.message ?? "Tab capture failed"));
        return;
      }
      resolve(id);
    });
  });
}

async function startCapture(
  tabId: number,
  streamId: string,
  sourceUrl?: string,
  title?: string,
) {
  if (state?.capturing) {
    throw new Error("Capture already in progress");
  }

  if (!sourceUrl || /^(chrome|edge|brave|about|chrome-extension):\/\//.test(sourceUrl)) {
    throw new Error(
      "Open a normal web page with audible tab audio first. Chrome internal pages and extension pages cannot be captured.",
    );
  }

  const session = await createSession({
    sourceType: inferSourceType(sourceUrl),
    sourceUrl,
    title,
  });

  await ensureOffscreenDocument();

  const offscreenResult = await sendToOffscreen({
    type: "START_RECORDING",
    streamId,
    sessionId: session.id,
  });
  if (!offscreenResult.ok) {
    throw new Error(offscreenResult.error);
  }

  const ws = connectLive(session.id, broadcastLiveEvent);

  state = {
    sessionId: session.id,
    tabId,
    capturing: true,
    ws,
  };

  await chrome.storage.local.set({
    activeSessionId: session.id,
    activeTabId: tabId,
    capturing: true,
  });

  chrome.runtime
    .sendMessage({
      type: "CAPTURE_STATE",
      sessionId: session.id,
      capturing: true,
    })
    .catch(() => {});

  return session.id;
}

async function stopCapture() {
  await restoreState();
  if (!state) return;

  await sendToOffscreen({ type: "STOP_RECORDING" });
  await endSession(state.sessionId);
  state.ws?.close();
  state.capturing = false;

  await chrome.storage.local.set({
    activeSessionId: state.sessionId,
    capturing: false,
  });

  const sessionId = state.sessionId;
  state = null;
  return sessionId;
}

async function handleActionClick(tab: chrome.tabs.Tab) {
  if (!tab.id) return;

  void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});

  if (state?.capturing) {
    chrome.runtime
      .sendMessage({
        type: "CAPTURE_STATE",
        sessionId: state.sessionId,
        capturing: true,
      })
      .catch(() => {});
    return;
  }

  try {
    if (!tab.url || /^(chrome|edge|brave|about|chrome-extension):\/\//.test(tab.url)) {
      throw new Error(
        "Open a normal web page with audible tab audio first. Chrome internal pages and extension pages cannot be captured.",
      );
    }

    const streamId = await getTabStreamId(tab.id);
    await startCapture(tab.id, streamId, tab.url, tab.title);
  } catch (error) {
    chrome.runtime
      .sendMessage({
        type: "CAPTURE_ERROR",
        error: error instanceof Error ? error.message : "Failed to start capture",
      })
      .catch(() => {});
  }
}

export default defineBackground(() => {
  chrome.action.onClicked.addListener((tab) => {
    void handleActionClick(tab);
  });

  chrome.runtime.onMessage.addListener(
    (
      message: BackgroundMessage,
      _sender,
      sendResponse: (response: BackgroundResponse) => void,
    ) => {
      if (
        message.type !== "START_CAPTURE" &&
        message.type !== "STOP_CAPTURE" &&
        message.type !== "GET_STATE"
      ) {
        return false;
      }

      void (async () => {
        try {
          if (message.type === "START_CAPTURE") {
            const sessionId = await startCapture(
              message.tabId,
              message.streamId,
              message.sourceUrl,
              message.title,
            );
            sendResponse({ ok: true, sessionId, capturing: true });
            return;
          }
          if (message.type === "STOP_CAPTURE") {
            const sessionId = await stopCapture();
            sendResponse({ ok: true, sessionId, capturing: false });
            return;
          }
          if (message.type === "GET_STATE") {
            const currentState = await restoreState();
            sendResponse({
              ok: true,
              sessionId: currentState?.sessionId,
              capturing: currentState?.capturing ?? false,
            });
            return;
          }
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      })();
      return true;
    },
  );

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "OPEN_REPORT" && message.sessionId) {
      const url = reportUrl(message.sessionId);
      void chrome.tabs.create({ url });
    }
  });
});
