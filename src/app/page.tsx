"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CapturePanel } from "@/components/CapturePanel";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { SessionRail } from "@/components/SessionRail";
import { Callout } from "@/components/Callout";
import { useDetector } from "@/lib/useDetector";
import { useDevices } from "@/lib/useDevices";
import { DEFAULT_VOICE_ID } from "@/lib/voices";

export default function Home() {
  const [videoOn, setVideoOn] = useState(true);
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  const [railOpen, setRailOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const devices = useDevices();
  const detector = useDetector(voiceId);

  // Re-read the rail whenever a save finishes, so the open session's counters
  // and its position in the list stay current while recording.
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && !detector.saving) setRefreshKey((k) => k + 1);
    wasSaving.current = detector.saving;
  }, [detector.saving]);

  const toggle = async () => {
    if (detector.running) {
      await detector.stop();
    } else {
      await detector.start(devices.micId || undefined);
      // Labels only become readable after permission is granted once.
      void devices.refresh();
    }
  };

  // Phones stack and let the page scroll: splitting an 812px screen in half
  // clipped the record button. Desktop keeps the fixed columns, and the rail
  // takes its width from the capture pane rather than from the transcript.
  const columns = railOpen
    ? "lg:grid-cols-[minmax(340px,34%)_1fr_17rem]"
    : "lg:grid-cols-[minmax(420px,44%)_1fr]";

  return (
    <main
      className={`mx-auto grid min-h-dvh max-w-[1600px] grid-rows-[auto_minmax(340px,1fr)] border-x border-[var(--hairline)] pt-14 lg:h-dvh lg:grid-rows-1 ${columns}`}
    >
      <section className="lg:min-h-0 lg:overflow-y-auto">
        <CapturePanel
          running={detector.running}
          status={detector.status}
          speaking={detector.speaking}
          level={detector.level}
          videoOn={videoOn}
          onVideoToggle={() => setVideoOn((v) => !v)}
          mics={devices.mics}
          cameras={devices.cameras}
          micId={devices.micId}
          cameraId={devices.cameraId}
          onMicChange={devices.setMicId}
          onCameraChange={devices.setCameraId}
          voiceId={voiceId}
          onVoiceChange={setVoiceId}
          onToggle={toggle}
          onPreviewVoice={() => void detector.previewVoice()}
        />
      </section>

      <section className="min-h-0 border-t border-[var(--hairline)] lg:border-l lg:border-t-0">
        <TranscriptPanel
          detections={detector.detections}
          pendingText={detector.pendingText}
          partial={detector.partial}
          pendingWords={detector.pendingWords}
          scoring={detector.scoring}
          running={detector.running}
          speaking={detector.speaking}
          status={detector.status}
          wordsSent={detector.wordsSent}
          saving={detector.saving}
          sessionsOpen={railOpen}
          onReset={detector.reset}
          onToggleSessions={() => setRailOpen((open) => !open)}
        />
      </section>

      <AnimatePresence>
        {railOpen && (
          <motion.aside
            key="rail"
            // Below lg the rail has no column to sit in, so it comes over the
            // page from the right edge instead of squeezing the transcript.
            className="min-h-0 border-[var(--hairline)] lg:border-l max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-[280px] max-lg:border-l max-lg:pt-14"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          >
            <SessionRail
              activeId={detector.sessionId}
              refreshKey={refreshKey}
              onOpen={(session) => {
                detector.restore(session);
                setRefreshKey((k) => k + 1);
              }}
              onNew={detector.reset}
              onClose={() => setRailOpen(false)}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <Callout callout={detector.callout} speaking={detector.speaking} />

      <AnimatePresence>
        {detector.error && (
          <motion.p
            role="alert"
            className="material fixed inset-x-4 top-16 z-50 mx-auto max-w-md px-4 py-3 text-center text-[13px] text-[var(--color-mixed)]"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
          >
            {detector.error}
          </motion.p>
        )}
      </AnimatePresence>
    </main>
  );
}
