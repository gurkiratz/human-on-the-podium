"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHUNK_TARGET_WORDS, STOP_FLUSH_WORDS, TranscriptChunker } from "./chunker";
import type { LiveThread } from "./live-thread";
import type { LivePrefs } from "./live-prefs";
import { pickLine, type Line } from "./roast";
import { ScribeSession, type ScribeStatus } from "./scribe";
import { Speaker } from "./speaker";
import type { Detection, Verdict } from "./types";

/** Praise and scolding get a cooldown; an AI catch always speaks. */
const PRAISE_COOLDOWN_MS = 15_000;
const TICK_MS = 500;
/** How long to wait for the session to settle before writing it to Postgres. */
const SAVE_DEBOUNCE_MS = 800;

export type Callout = {
  id: string;
  verdict: Verdict;
  caption: string;
  at: number;
};

export type DetectorState = {
  status: ScribeStatus;
  running: boolean;
  speaking: boolean;
  scoring: boolean;
  level: number;
  partial: string;
  pendingWords: number;
  pendingText: string;
  detections: Detection[];
  callout: Callout | null;
  latest: Detection | null;
  error: string | null;
  wordsSent: number;
  /** Postgres id of the session in progress, once one exists. */
  sessionId: string | null;
  /** Every listening run in this session; the last one is the active thread. */
  threads: LiveThread[];
  saving: boolean;
  /** True when the threads shown were loaded from a previous page load. */
  restored: boolean;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** A session is named after the first thing that was said. */
function titleFor(threads: LiveThread[]): string {
  for (const thread of threads) {
    const first = thread.segments.find((segment) => segment.trim());
    if (first) {
      const text = first.trim();
      return text.length > 70 ? `${text.slice(0, 70)}…` : text;
    }
  }
  return "Live session";
}

export function useDetector(voiceId: string, prefs: LivePrefs) {
  const [status, setStatus] = useState<ScribeStatus>("idle");
  const [running, setRunning] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [level, setLevel] = useState(0);
  const [partial, setPartial] = useState("");
  const [pendingWords, setPendingWords] = useState(0);
  const [pendingText, setPendingText] = useState("");
  const [threads, setThreads] = useState<LiveThread[]>([]);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);

  const sessionRef = useRef<ScribeSession | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const chunkerRef = useRef(new TranscriptChunker());
  /** Monotonic across the whole session, so detection ids stay unique after a resume. */
  const chunkIndexRef = useRef(0);
  const scoreQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastPraiseRef = useRef(0);
  const lastLineRef = useRef<string | undefined>(undefined);
  const voiceIdRef = useRef(voiceId);
  const voiceFeedbackRef = useRef(prefs.voice);
  const prefsRef = useRef(prefs);
  const sessionIdRef = useRef<string | null>(null);
  const threadsRef = useRef<LiveThread[]>([]);
  const currentThreadIdRef = useRef<string | null>(null);
  const partialRef = useRef("");

  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);

  useEffect(() => {
    voiceFeedbackRef.current = prefs.voice;
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  /** Writes the whole session (threads included) in one upsert. */
  const persist = useCallback(
    async (override?: {
      status?: "active" | "ended";
      threads?: LiveThread[];
      endedAt?: string | null;
    }) => {
      const id = sessionIdRef.current;
      if (!id) return;
      const payloadThreads = override?.threads ?? threadsRef.current;
      if (payloadThreads.length === 0) return;
      // Don't create a row for a session that was opened but never captured anything.
      const hasContent = payloadThreads.some(
        (thread) => thread.segments.length > 0 || thread.detections.length > 0,
      );
      if (!hasContent) return;

      setSaving(true);
      try {
        await fetch(`/api/live/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleFor(payloadThreads),
            voiceId: voiceIdRef.current,
            prefs: prefsRef.current,
            threads: payloadThreads,
            status: override?.status ?? "active",
            endedAt: override?.endedAt ?? null,
          }),
        });
      } catch {
        // A failed save is not worth interrupting the session over.
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const say = useCallback(async (verdict: Verdict, line: Line) => {
    if (!voiceFeedbackRef.current) return;
    lastLineRef.current = line.speech;
    setCallout({
      id: `${Date.now()}`,
      verdict,
      caption: line.caption,
      at: Date.now(),
    });
    // Mute first, then speak: the mic must already be closed when audio starts.
    sessionRef.current?.setMuted(true);
    try {
      await speakerRef.current?.speak(line, voiceIdRef.current);
    } finally {
      sessionRef.current?.setMuted(false);
    }
  }, []);

  const scoreNow = useCallback(
    async (text: string, threadId: string | null) => {
      const index = chunkIndexRef.current++;
      setScoring(true);
      try {
        const res = await fetch("/api/live-detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, index }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Detection failed (${res.status})`);
        }
        const detection = (await res.json()) as Detection;
        if (threadId) {
          setThreads((prev) =>
            prev.map((thread) =>
              thread.id === threadId
                ? { ...thread, detections: [...thread.detections, detection] }
                : thread,
            ),
          );
        }

        if (!voiceFeedbackRef.current) return;

        // A chunk under the 70-word floor can miss AI text but never invents
        // it, so a thin `human` verdict is not evidence of anything worth
        // saying out loud.
        if (detection.thin && detection.verdict === "human") return;

        const now = Date.now();
        if (detection.verdict !== "ai") {
          if (now - lastPraiseRef.current < PRAISE_COOLDOWN_MS) return;
          lastPraiseRef.current = now;
        }
        await say(detection.verdict, pickLine(detection.verdict, lastLineRef.current));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Detection failed");
      } finally {
        setScoring(false);
      }
    },
    [say],
  );

  // Chunks arrive from three places — the full buffer, the pause timer and stop
  // — and each request is independent. Serialise them so verdicts land in
  // transcript order and `scoring` never clears while another chunk is in flight.
  const score = useCallback(
    (text: string, threadId: string | null) => {
      const run = scoreQueueRef.current.then(() => scoreNow(text, threadId));
      scoreQueueRef.current = run.catch(() => {});
      return run;
    },
    [scoreNow],
  );

  /** Plays one roast line so the voice can be auditioned before a session. */
  const previewVoice = useCallback(async () => {
    const speaker = speakerRef.current ?? new Speaker(setSpeaking, setError);
    speakerRef.current = speaker;
    const line = pickLine("ai", lastLineRef.current);
    lastLineRef.current = line.speech;
    setCallout({ id: `${Date.now()}`, verdict: "ai", caption: line.caption, at: Date.now() });
    await speaker.speak(line, voiceIdRef.current);
    setCallout(null);
  }, []);

  /** Begins a new listening thread. The session and its earlier threads are kept. */
  const start = useCallback(
    async (deviceId?: string) => {
      setError(null);
      setPartial("");
      partialRef.current = "";
      setCallout(null);
      setPendingWords(0);
      setPendingText("");
      setRestored(false);
      chunkerRef.current.reset();
      scoreQueueRef.current = Promise.resolve();
      lastPraiseRef.current = 0;

      if (!sessionIdRef.current) {
        const id = newId();
        sessionIdRef.current = id;
        setSessionId(id);
        threadsRef.current = [];
        setThreads([]);
        chunkIndexRef.current = 0;
      }

      const threadId = newId();
      currentThreadIdRef.current = threadId;
      setThreads((prev) => {
        const next: LiveThread[] = [
          ...prev,
          {
            id: threadId,
            index: prev.length,
            startedAt: Date.now(),
            endedAt: null,
            segments: [],
            detections: [],
          },
        ];
        threadsRef.current = next;
        return next;
      });

      const speaker = new Speaker(setSpeaking, (msg) => setError(msg));
      speakerRef.current = speaker;
      // Pay the v3 synthesis cost now, so the first callout is instant.
      if (voiceFeedbackRef.current) void speaker.warm(voiceIdRef.current);

      const session = new ScribeSession({
        onStatus: setStatus,
        onLevel: setLevel,
        onError: (msg) => setError(msg),
        onPartial: (text) => {
          partialRef.current = text;
          setPartial(text);
        },
        onCommitted: (text) => {
          partialRef.current = "";
          setPartial("");
          const activeId = currentThreadIdRef.current;
          if (activeId) {
            setThreads((prev) =>
              prev.map((thread) =>
                thread.id === activeId
                  ? { ...thread, segments: [...thread.segments, text] }
                  : thread,
              ),
            );
          }
          const chunk = chunkerRef.current.push(text);
          setPendingWords(chunkerRef.current.pendingWords);
          setPendingText(chunkerRef.current.pendingText);
          if (chunk) void score(chunk.text, activeId);
        },
      });
      sessionRef.current = session;

      try {
        setRunning(true);
        await session.start(deviceId);
      } catch (err) {
        setRunning(false);
        setError(err instanceof Error ? err.message : "Could not start");
        await session.stop();
        sessionRef.current = null;
      }
    },
    [score],
  );

  /** Ends the current thread. The session stays open, ready to resume. */
  const stop = useCallback(async () => {
    setRunning(false);
    speakerRef.current?.stop();
    speakerRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    await session?.stop();
    const threadId = currentThreadIdRef.current;
    // Fold in any in-flight partial so a mid-sentence stop still scores.
    const leftover = partialRef.current.trim();
    // Pushing the leftover can itself complete a full chunk; score that too
    // rather than letting it fall on the floor.
    const extra = leftover ? chunkerRef.current.push(leftover) : null;
    partialRef.current = "";
    const tail = chunkerRef.current.flush(STOP_FLUSH_WORDS);
    setPendingWords(0);
    setPendingText("");
    setLevel(0);
    setPartial("");
    if (threadId) {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId ? { ...thread, endedAt: Date.now() } : thread,
        ),
      );
    }
    currentThreadIdRef.current = null;
    if (extra) void score(extra.text, threadId);
    if (tail) void score(tail.text, threadId);
  }, [score]);

  /** Closes the current session and clears the slate for a new one. */
  const newSession = useCallback(async () => {
    if (sessionRef.current) await stop();

    const id = sessionIdRef.current;
    const snapshot = threadsRef.current;
    if (id && snapshot.length > 0) {
      await persist({
        status: "ended",
        endedAt: new Date().toISOString(),
        threads: snapshot,
      });
    }

    sessionIdRef.current = null;
    currentThreadIdRef.current = null;
    threadsRef.current = [];
    setSessionId(null);
    setThreads([]);
    setCallout(null);
    setPendingWords(0);
    setPendingText("");
    setPartial("");
    setRestored(false);
    chunkerRef.current.reset();
  }, [stop, persist]);

  // Restore whatever session was left open when the page was last closed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const listRes = await fetch("/api/live", { cache: "no-store" });
        if (!listRes.ok) return;
        const { items } = (await listRes.json()) as {
          items: Array<{ id: string; status: string }>;
        };
        const active = items.find((item) => item.status === "active");
        if (!active || cancelled) return;

        const detailRes = await fetch(`/api/live/${active.id}`, { cache: "no-store" });
        if (!detailRes.ok || cancelled) return;
        const session = (await detailRes.json()) as { id: string; threads: LiveThread[] };
        if (cancelled) return;

        sessionIdRef.current = session.id;
        setSessionId(session.id);
        threadsRef.current = session.threads;
        setThreads(session.threads);
        // Continue the session's chunk numbering where it left off.
        const maxIndex = session.threads.reduce(
          (max, thread) => thread.detections.reduce((m, d) => Math.max(m, d.index), max),
          -1,
        );
        chunkIndexRef.current = maxIndex + 1;
        setRestored(true);
      } catch {
        // Nothing to restore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pause flush: if the speaker has gone quiet with enough words banked, score
  // them rather than leaving them unscored until they start talking again.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const chunk = chunkerRef.current.onTick();
      setPendingWords(chunkerRef.current.pendingWords);
      setPendingText(chunkerRef.current.pendingText);
      if (chunk) void score(chunk.text, currentThreadIdRef.current);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, score]);

  // Persist after activity settles, so the session survives a reload or crash.
  useEffect(() => {
    if (!sessionId || threads.length === 0) return;
    const id = setTimeout(() => void persist(), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [sessionId, threads, voiceId, prefs, persist]);

  useEffect(() => {
    return () => {
      speakerRef.current?.stop();
      void sessionRef.current?.stop();
    };
  }, []);

  const detections = useMemo(() => threads.flatMap((thread) => thread.detections), [threads]);
  const wordsSent = useMemo(
    () => detections.reduce((total, detection) => total + detection.words, 0),
    [detections],
  );

  const state: DetectorState = {
    status,
    running,
    speaking,
    scoring,
    level,
    partial,
    pendingWords,
    pendingText,
    detections,
    callout,
    latest: detections.length ? detections[detections.length - 1] : null,
    error,
    wordsSent,
    sessionId,
    threads,
    saving,
    restored,
  };

  return { ...state, start, stop, newSession, previewVoice, chunkTarget: CHUNK_TARGET_WORDS };
}
