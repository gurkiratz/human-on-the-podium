"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { aiPct, bandOf } from "./ai-scale";
import type { Session, SessionSummary } from "@/lib/sessions-db";

type Props = {
  /** The session being recorded into right now, highlighted in the list. */
  activeId: string | null;
  /** Bumped by the page whenever a save lands, so the list re-reads. */
  refreshKey: number;
  onOpen: (session: Session) => void;
  onNew: () => void;
  onClose: () => void;
};

/** Recent takes want "12 min ago"; older ones want a date. */
function when(ms: number): string {
  const then = DateTime.fromMillis(ms);
  const age = DateTime.now().diff(then, "hours").hours;
  if (age < 18) return then.toRelative({ style: "short" }) ?? "";
  return then.toFormat("LLL d, HH:mm");
}

export function SessionRail(props: Props) {
  const { refreshKey } = props;
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ sessions: SessionSummary[] }>) : null))
      .then((body) => {
        if (cancelled) return;
        if (body) setSessions(body.sessions);
        setLoading(false);
      })
      .catch(() => {
        // An unreachable list is not worth an alert over the recording.
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const open = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/sessions/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      props.onOpen((await res.json()) as Session);
    } catch {
      // Leave the current session alone if the saved one cannot be read.
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#060706]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--hairline)] px-4 py-3">
        <p className="caps text-[10px] font-semibold text-[var(--faint)]">Sessions</p>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Hide sessions"
          className="px-1.5 text-[14px] leading-none text-[var(--faint)] transition-colors hover:text-[var(--color-chalk)]"
        >
          ×
        </button>
      </div>

      <div className="shrink-0 border-b border-[var(--hairline)] p-3">
        <button
          type="button"
          onClick={props.onNew}
          className="w-full border border-[var(--hairline)] px-3 py-2 text-[12px] text-[var(--muted)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--color-chalk)]"
        >
          New session
        </button>
      </div>

      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-4 py-6 text-[12px] text-[var(--faint)]">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="px-4 py-6 text-[12px] leading-relaxed text-[var(--faint)]">
            Nothing saved yet. A session is filed as soon as its first chunk is
            analyzed.
          </p>
        ) : (
          <ul>
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                active={s.id === props.activeId}
                busy={busyId === s.id}
                onOpen={() => void open(s.id)}
                onDelete={() => void remove(s.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  active,
  busy,
  onOpen,
  onDelete,
}: {
  session: SessionSummary;
  active: boolean;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const share = session.aiShare;
  const band = share === null ? null : bandOf(share);

  return (
    <li className="group relative border-b border-[var(--hairline)]">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className={`w-full px-4 py-3 text-left transition-colors hover:bg-[var(--raise-1)] ${
          active ? "bg-[var(--raise-2)]" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-[12.5px] leading-snug text-[var(--color-chalk)]">
            {session.title}
          </p>
          {band && share !== null && (
            <span
              className="shrink-0 tabular-nums text-[11px] font-semibold"
              style={{ color: `var(${band.v})` }}
              title={`${band.label} — ${aiPct(share)}% of these words read as machine`}
            >
              {aiPct(share)}%
            </span>
          )}
        </div>
        <p className="mt-1 text-[10.5px] tabular-nums text-[var(--faint)]">
          {when(session.updatedAt)} · {session.chunks}{" "}
          {session.chunks === 1 ? "chunk" : "chunks"} · {session.words} words
          {active ? " · open" : ""}
        </p>
      </button>

      {/* Sits over the meta line, not the share badge, so hovering never hides
          the one number the row exists to show. */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete session: ${session.title}`}
        className="absolute bottom-1.5 right-2 hidden bg-[#060706] px-1.5 py-0.5 text-[10.5px] text-[var(--faint)] transition-colors hover:text-[var(--color-ai)] group-hover:block"
      >
        Delete
      </button>
    </li>
  );
}
