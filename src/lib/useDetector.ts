"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHUNK_TARGET_WORDS, STOP_FLUSH_WORDS, TranscriptChunker } from "./chunker";
import { VOICE_FEEDBACK } from "./constants";
import { pickLine, type Line } from "./roast";
import { ScribeSession, type ScribeStatus } from "./scribe";
import { Speaker } from "./speaker";
import type { Session } from "./sessions-db";
import type { Detection, Verdict } from "./types";

/** Praise and scolding get a cooldown; an AI catch always speaks. */
const PRAISE_COOLDOWN_MS = 15_000;
const TICK_MS = 500;
/** Autosave settles this long after the last change, so a burst writes once. */
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
  committed: string[];
  pendingWords: number;
  pendingText: string;
  detections: Detection[];
  callout: Callout | null;
  latest: Detection | null;
  error: string | null;
  wordsSent: number;
  /** Row this session is being written to; null until the first chunk lands. */
  sessionId: string | null;
  saving: boolean;
};

export function useDetector(voiceId: string) {
  const [status, setStatus] = useState<ScribeStatus>("idle");
  const [running, setRunning] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [level, setLevel] = useState(0);
  const [partial, setPartial] = useState("");
  const [committed, setCommitted] = useState<string[]>([]);
  const [pendingWords, setPendingWords] = useState(0);
  const [pendingText, setPendingText] = useState("");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wordsSent, setWordsSent] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sessionRef = useRef<ScribeSession | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const chunkerRef = useRef(new TranscriptChunker());
  const chunkIndexRef = useRef(0);
  const lastPraiseRef = useRef(0);
  const lastLineRef = useRef<string | undefined>(undefined);
  const voiceIdRef = useRef(voiceId);
  const partialRef = useRef("");
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);

  const say = useCallback(async (verdict: Verdict, line: Line) => {
    if (!VOICE_FEEDBACK) return;
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

  const score = useCallback(
    async (text: string) => {
      const index = chunkIndexRef.current++;
      // The first chunk of a take opens the session row. Allocating the id
      // here rather than in the save effect means a mic opened and closed
      // with nothing said never files anything.
      if (!sessionIdRef.current) {
        const id = crypto.randomUUID();
        sessionIdRef.current = id;
        setSessionId(id);
      }
      setScoring(true);
      setWordsSent((w) => w + text.trim().split(/\s+/).filter(Boolean).length);
      try {
        const res = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, index }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Detection failed (${res.status})`);
        }
        const detection = (await res.json()) as Detection;
        setDetections((prev) => [...prev, detection]);

        if (!VOICE_FEEDBACK) return;

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

  const start = useCallback(
    async (deviceId?: string) => {
      // Starting again resumes the same session rather than opening a new one:
      // analyzed chunks, the billing count and the unanalyzed word buffer all
      // survive a stop, so a pause mid-thought does not throw away the words
      // banked before it. `reset` is the only thing that clears them.
      setError(null);
      setPartial("");
      partialRef.current = "";
      setCallout(null);
      setPendingWords(chunkerRef.current.pendingWords);
      setPendingText(chunkerRef.current.pendingText);

      const speaker = new Speaker(setSpeaking, (msg) => setError(msg));
      speakerRef.current = speaker;
      // Pay the v3 synthesis cost now, so the first callout is instant.
      if (VOICE_FEEDBACK) void speaker.warm(voiceIdRef.current);

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
          setCommitted((prev) => [...prev, text]);
          const chunk = chunkerRef.current.push(text);
          setPendingWords(chunkerRef.current.pendingWords);
          setPendingText(chunkerRef.current.pendingText);
          if (chunk) void score(chunk.text);
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

  const stop = useCallback(async () => {
    setRunning(false);
    speakerRef.current?.stop();
    speakerRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    await session?.stop();
    // Fold in any in-flight partial so a mid-sentence stop still gets analyzed.
    // That last push can itself fill a chunk, and dropping what it hands back
    // would throw the words away, so it takes priority over the flush.
    const leftover = partialRef.current.trim();
    const filled = leftover ? chunkerRef.current.push(leftover) : null;
    partialRef.current = "";
    // Enough words banked -> analyze them now, so stopping is what closes the
    // chunk. Too few -> they stay in the buffer and the next start carries on
    // from exactly here instead of dropping them.
    const tail = filled ?? chunkerRef.current.flush(STOP_FLUSH_WORDS);
    setPendingWords(chunkerRef.current.pendingWords);
    setPendingText(chunkerRef.current.pendingText);
    setLevel(0);
    setPartial("");
    if (tail) void score(tail.text);
  }, [score]);

  // Autosave. The session row is created by the first chunk that lands, so a
  // mic opened and closed with nothing said leaves no row behind. Everything
  // after that is an upsert of the same id, debounced so a burst of chunks
  // costs one write.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef("");
  useEffect(() => {
    if (detections.length === 0 || !sessionId) return;

    const payload = JSON.stringify({
      id: sessionId,
      detections,
      pendingText,
      wordsSent,
    });
    if (payload === savedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      savedRef.current = payload;
      setSaving(true);
      void fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
        .then((res) => {
          if (!res.ok) throw new Error("Could not save this session");
        })
        .catch((err: unknown) => {
          // A failed save must not interrupt a recording in progress; the next
          // chunk retries with the whole session, so nothing is lost.
          savedRef.current = "";
          setError(err instanceof Error ? err.message : "Could not save this session");
        })
        .finally(() => setSaving(false));
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [detections, pendingText, wordsSent, sessionId]);

  /**
   * Reopen a saved session so the next take appends to it: analyzed chunks
   * come back on screen and the words it stopped short on go back into the
   * buffer, exactly where the last stop left them.
   */
  const restore = useCallback((session: Session) => {
    setDetections(session.detections);
    setCommitted([]);
    setCallout(null);
    setError(null);
    setPartial("");
    partialRef.current = "";
    setWordsSent(session.wordsSent);
    chunkerRef.current.seed(session.pendingText);
    setPendingWords(chunkerRef.current.pendingWords);
    setPendingText(chunkerRef.current.pendingText);
    chunkIndexRef.current = session.detections.length;
    lastPraiseRef.current = 0;
    savedRef.current = "";
    sessionIdRef.current = session.id;
    setSessionId(session.id);
  }, []);

  /**
   * Clear the session: analyzed chunks, banked words, billing count. Safe to
   * hit mid-recording — the mic stays open and the next words start a fresh
   * first chunk.
   */
  const reset = useCallback(() => {
    setDetections([]);
    setCommitted([]);
    setCallout(null);
    setError(null);
    setPartial("");
    partialRef.current = "";
    setWordsSent(0);
    setPendingWords(0);
    setPendingText("");
    chunkerRef.current.reset();
    chunkIndexRef.current = 0;
    lastPraiseRef.current = 0;
    // Detach from the stored row rather than deleting it: reset clears the
    // screen, it does not throw away a session already in the rail.
    savedRef.current = "";
    sessionIdRef.current = null;
    setSessionId(null);
  }, []);

  // Pause flush: if the speaker has gone quiet with enough words banked, score
  // them rather than leaving them unscored until they start talking again.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const chunk = chunkerRef.current.onTick();
      setPendingWords(chunkerRef.current.pendingWords);
      setPendingText(chunkerRef.current.pendingText);
      if (chunk) void score(chunk.text);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, score]);

  useEffect(() => {
    return () => {
      speakerRef.current?.stop();
      void sessionRef.current?.stop();
    };
  }, []);

  const state: DetectorState = {
    status,
    running,
    speaking,
    scoring,
    level,
    partial,
    committed,
    pendingWords,
    pendingText,
    detections,
    callout,
    latest: detections.length ? detections[detections.length - 1] : null,
    error,
    wordsSent,
    sessionId,
    saving,
  };

  return {
    ...state,
    start,
    stop,
    reset,
    restore,
    previewVoice,
    chunkTarget: CHUNK_TARGET_WORDS,
  };
}
