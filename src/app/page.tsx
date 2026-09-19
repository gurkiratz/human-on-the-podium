"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CapturePanel } from "@/components/CapturePanel";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { Callout } from "@/components/Callout";
import { useDetector } from "@/lib/useDetector";
import { useDevices } from "@/lib/useDevices";
import { DEFAULT_VOICE_ID } from "@/lib/voices";

export default function Home() {
  const [videoOn, setVideoOn] = useState(true);
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  const devices = useDevices();
  const detector = useDetector(voiceId);

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
  // clipped the record button. Desktop keeps the two fixed columns.
  return (
    <main className="mx-auto grid min-h-dvh max-w-[1600px] grid-rows-[auto_minmax(340px,1fr)] border-x border-[var(--hairline)] pt-14 lg:h-dvh lg:grid-cols-[minmax(420px,44%)_1fr] lg:grid-rows-1">
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
          wordsSent={detector.wordsSent}
        />
      </section>

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
