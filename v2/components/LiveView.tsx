"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LiveCallout } from "@/components/LiveCallout";
import { LiveCapturePanel } from "@/components/LiveCapturePanel";
import { LiveHistoryRail } from "@/components/LiveHistoryRail";
import { LiveSessionView } from "@/components/LiveSessionView";
import { LiveTranscriptPanel } from "@/components/LiveTranscriptPanel";
import { DEFAULT_PREFS, type LivePrefs } from "@/components/LiveSettingsDialog";
import type { PersonaState } from "@/components/ai-elements/persona";
import type { LiveSession } from "@/lib/live";
import { useDetector } from "@/lib/useDetector";
import { useCamera, useDevices } from "@/lib/useDevices";
import { DEFAULT_VOICE_ID } from "@/lib/voices";
import { cn } from "@/lib/utils";

type MobilePane = "capture" | "analysis";

const SPRING = { type: "spring" as const, stiffness: 150, damping: 24 };
const MOBILE_QUERY = "(max-width: 767px)";

/** Keep the subtitle to the last few words so it reads as one caption, not a paragraph. */
function tailWords(text: string, count: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length <= count) return words.join(" ");
  return `… ${words.slice(-count).join(" ")}`;
}

export function LiveView({
  railOpen,
  onRailClose,
}: {
  railOpen: boolean;
  onRailClose: () => void;
}) {
  const [videoOn, setVideoOn] = useState(false);
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  // Phones have no room for both panes at once, so one fills the screen and
  // the switch swaps them. Desktop ignores this and shows both side by side.
  const [pane, setPane] = useState<MobilePane>("capture");
  const [prefs, setPrefs] = useState<LivePrefs>(DEFAULT_PREFS);
  const [selected, setSelected] = useState<LiveSession | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const devices = useDevices();
  const detector = useDetector(voiceId, prefs);
  const camera = useCamera(videoOn, devices.cameraId);

  const onMobile = () =>
    typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;

  useEffect(() => {
    setIsMobile(onMobile());
  }, []);

  // Refresh the rail every time a save lands, so new threads and sessions show up.
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && !detector.saving) setRefreshKey((key) => key + 1);
    wasSaving.current = detector.saving;
  }, [detector.saving]);

  // The camera rides with the session: it comes up on the same click that
  // starts recording and goes down when recording stops. Both getUserMedia
  // calls happen inside this click so they are gesture-backed.
  const toggle = async () => {
    if (detector.running) {
      setVideoOn(false);
      await detector.stop();
      return;
    }
    setVideoOn(true);
    await Promise.allSettled([
      camera.open(),
      detector.start(devices.micId || undefined),
    ]);
    // Labels only become readable after permission is granted once.
    void devices.refresh();
  };

  const toggleCamera = () => {
    if (videoOn) {
      setVideoOn(false);
      return;
    }
    setVideoOn(true);
    // Gesture-backed open, so a browser that refuses effect-driven camera
    // access still lets the user turn it on by hand.
    void camera.open();
  };

  const openSession = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/live/${id}`, { cache: "no-store" });
        if (!response.ok) return;
        setSelected((await response.json()) as LiveSession);
        setPane("analysis");
        if (onMobile()) onRailClose();
      } catch {
        // Leave the current view alone if the session cannot be opened.
      }
    },
    [onRailClose],
  );

  const removeSession = useCallback(async (id: string) => {
    await fetch(`/api/live/${id}`, { method: "DELETE" });
    setSelected(null);
    setRefreshKey((key) => key + 1);
  }, []);

  const handleNewSession = () => {
    setSelected(null);
    void detector.newSession();
  };

  // Subtitle text: the words not yet scored, or the tail of the last scored
  // chunk so the caption stays on screen between checks (like live captions).
  const live = `${detector.pendingText} ${detector.partial}`.trim();
  const lastDetection = detector.detections[detector.detections.length - 1];
  const caption = live
    ? tailWords(live, 28)
    : lastDetection
      ? tailWords(lastDetection.text, 28)
      : "";

  // Map the session onto the orb: red while the roast voice talks, amber while
  // GPTZero scores, teal while listening, dim on error.
  const personaState: PersonaState = !detector.running
    ? "idle"
    : detector.speaking
      ? "speaking"
      : detector.scoring || detector.status === "connecting"
        ? "thinking"
        : detector.status === "error"
          ? "asleep"
          : "listening";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isMobile || detector.saving || detector.restored ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
          {detector.saving ? (
            <span className="text-[11px] text-muted-foreground">Saving…</span>
          ) : detector.restored ? (
            <span className="text-[11px] text-muted-foreground">Restored session</span>
          ) : null}
          <div className="ml-auto md:hidden">
            <PaneSwitch value={pane} onChange={setPane} />
          </div>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <AnimatePresence initial={false}>
          {railOpen ? (
            <motion.aside
              key="rail"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 264, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={SPRING}
              className="min-h-0 shrink-0 overflow-hidden border-r border-border/60 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:bg-sidebar"
            >
              <LiveHistoryRail
                activeId={detector.sessionId}
                selectedId={selected?.id ?? null}
                refreshKey={refreshKey}
                onNew={handleNewSession}
                onSelect={(id) => void openSession(id)}
                onCollapse={onRailClose}
              />
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <div className="grid min-h-0 flex-1 grid-rows-1 md:grid-cols-[minmax(380px,42%)_1fr]">
          <section
            className={cn(
              "min-h-0 min-w-0",
              pane !== "capture" && "hidden md:block",
              "border-border/60 md:border-r",
            )}
          >
            <LiveCapturePanel
              running={detector.running}
              speaking={detector.speaking}
              level={detector.level}
              videoOn={videoOn}
              onCameraToggle={toggleCamera}
              camera={camera}
              mics={devices.mics}
              cameras={devices.cameras}
              micId={devices.micId}
              cameraId={devices.cameraId}
              onMicChange={devices.setMicId}
              onCameraChange={devices.setCameraId}
              voiceId={voiceId}
              onVoiceChange={setVoiceId}
              onToggle={toggle}
              onNewSession={handleNewSession}
              onPreviewVoice={() => void detector.previewVoice()}
              caption={prefs.captions ? caption : ""}
              prefs={prefs}
              onPrefsChange={setPrefs}
              personaState={personaState}
            />
          </section>

          <section className={cn("min-h-0 min-w-0", pane !== "analysis" && "hidden md:block")}>
            {selected ? (
              <LiveSessionView
                session={selected}
                onBack={() => setSelected(null)}
                onDelete={(id) => void removeSession(id)}
              />
            ) : (
              <LiveTranscriptPanel
                detections={detector.detections}
                pendingText={detector.pendingText}
                partial={detector.partial}
                pendingWords={detector.pendingWords}
                scoring={detector.scoring}
                running={detector.running}
                speaking={detector.speaking}
                status={detector.status}
                wordsSent={detector.wordsSent}
              />
            )}
          </section>
        </div>
      </div>

      <LiveCallout callout={detector.callout} speaking={detector.speaking} />

      <AnimatePresence>
        {detector.error && (
          <motion.p
            role="alert"
            className="glass-strong fixed inset-x-4 top-16 z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-center text-[13px] text-warning"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
          >
            {detector.error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function PaneSwitch({
  value,
  onChange,
}: {
  value: MobilePane;
  onChange: (pane: MobilePane) => void;
}) {
  const options: Array<{ id: MobilePane; label: string }> = [
    { id: "capture", label: "Camera" },
    { id: "analysis", label: "Analysis" },
  ];

  return (
    <div className="inline-flex rounded-full border border-border/70 bg-card/50 p-0.5">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
