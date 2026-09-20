"use client";

import { Fragment, useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type ExpandedState,
  type FilterFn,
  type SortingState,
} from "@tanstack/react-table";
import type { YoutubeScore } from "@/lib/types";
import { SENTENCE_HUMAN_MAX } from "@/lib/constants";
import { formatClock, formatWhen, pct, youtubeAt } from "./format";
import { formatDay, formatDuration } from "@/lib/time-format";
import {
  AiMeter,
  BandLegend,
  CERTAINTY,
  CERTAINTY_RANK,
  CertaintyBars,
  bandOf,
} from "@/components/ai-scale";

const STAMP: Record<YoutubeScore["verdict"], { bg: string; fg: string }> = {
  ai: { bg: "var(--stamp-ai)", fg: "#fff" },
  human: { bg: "var(--stamp-human)", fg: "#fff" },
  mixed: { bg: "var(--stamp-mixed)", fg: "#14110d" },
};

/** Fixed widths keep columns from re-flowing when a row expands. */
const COLUMN_WIDTH: Record<string, string> = {
  expand: "30px",
  createdAt: "118px",
  title: "auto",
  aiShare: "168px",
  confidence: "80px",
  words: "64px",
  source: "88px",
};

const archiveFilter: FilterFn<YoutubeScore> = (row, _id, value) => {
  const q = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const r = row.original;
  const hay = [
    r.title,
    r.transcript,
    r.videoId,
    r.youtubeUrl,
    r.verdict,
    r.confidence,
    bandOf(r.probs.ai).label,
    r.publishedAt !== null ? formatDay(r.publishedAt) : null,
    ...r.sentences.map((s) => s.sentence),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
};

const columnHelper = createColumnHelper<YoutubeScore>();

function VerdictStamp({ verdict }: { verdict: YoutubeScore["verdict"] }) {
  const s = STAMP[verdict];
  return (
    <span
      className="inline-block rounded-sm px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em]"
      style={{ background: s.bg, color: s.fg }}
    >
      {verdict}
    </span>
  );
}

export function ScoreTable({
  data,
  query,
  verdict,
}: {
  data: YoutubeScore[];
  query: string;
  verdict: "all" | YoutubeScore["verdict"];
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const columnFilters = useMemo<ColumnFiltersState>(
    () => (verdict === "all" ? [] : [{ id: "verdict", value: verdict }]),
    [verdict]
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "expand",
        header: "",
        cell: ({ row }) => (
          <span
            aria-hidden
            className="inline-block text-[var(--faint-ink)] transition-transform"
            style={{
              transform: row.getIsExpanded() ? "rotate(90deg)" : undefined,
            }}
          >
            ▸
          </span>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: "Analyzed",
        cell: (info) => (
          <span className="tabular-nums text-[13px] text-[var(--muted-ink)]">
            {formatWhen(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor((r) => r.title ?? r.videoId, {
        id: "title",
        header: "Recording",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-[15px] font-medium leading-snug">
              {row.original.title ?? row.original.videoId}
            </p>
            {row.original.publishedAt !== null ? (
              <p className="truncate text-[11px] text-[var(--faint-ink)]">
                Recorded {formatDay(row.original.publishedAt)}
                {row.original.sourceDurationSec !== null &&
                  ` · ${formatDuration(row.original.sourceDurationSec)}`}
              </p>
            ) : (
              <p className="truncate font-mono text-[11px] text-[var(--faint-ink)]">
                {row.original.videoId}
              </p>
            )}
          </div>
        ),
      }),
      // Kept only so the hero's verdict dropdown still has something to filter.
      columnHelper.accessor("verdict", {
        id: "verdict",
        filterFn: (row, _id, value) => row.original.verdict === value,
      }),
      columnHelper.accessor((r) => r.probs.ai, {
        id: "aiShare",
        header: "AI-ness",
        cell: ({ row }) => (
          <AiMeter ai={row.original.probs.ai} className="w-full" />
        ),
      }),
      columnHelper.accessor("confidence", {
        header: "Certainty",
        cell: (info) => <CertaintyBars level={info.getValue()} />,
        sortingFn: (a, b) =>
          CERTAINTY_RANK[a.original.confidence] -
          CERTAINTY_RANK[b.original.confidence],
      }),
      columnHelper.accessor("words", {
        header: "Words",
        cell: (info) => (
          <span className="tabular-nums text-[13px]">{info.getValue()}</span>
        ),
      }),
      columnHelper.display({
        id: "source",
        header: "Source",
        cell: ({ row }) => (
          <SourceLink
            url={row.original.youtubeUrl}
            startSec={row.original.startSec}
          />
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      expanded,
      globalFilter: query,
      columnFilters,
      columnVisibility: { verdict: false },
    },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    getRowId: (row) => row.id,
    globalFilterFn: archiveFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const rows = table.getRowModel().rows;

  if (data.length === 0) {
    return (
      <p className="border border-dashed border-[var(--line)] bg-white/60 px-5 py-10 text-center text-[15px] text-[var(--muted-ink)]">
        The archive is empty. Analyze a speech first, then come back.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="border border-dashed border-[var(--line)] bg-white/60 px-5 py-10 text-center text-[15px] text-[var(--muted-ink)]">
        Nothing in the files matches that search.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-[13px] text-[var(--muted-ink)]">
          {rows.length} record{rows.length === 1 ? "" : "s"}
          {query.trim() || verdict !== "all" ? " after the filter" : " on file"}
        </p>
        <BandLegend />
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const r = row.original;
          const open = row.getIsExpanded();
          return (
            <li
              key={r.id}
              className="overflow-hidden border border-[var(--line)] bg-white"
            >
              <button
                type="button"
                onClick={row.getToggleExpandedHandler()}
                className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left active:bg-[var(--paper)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-[16px] font-medium leading-snug">
                    {r.title ?? r.videoId}
                  </p>
                  <CertaintyBars level={r.confidence} />
                </div>
                <AiMeter ai={r.probs.ai} className="w-full max-w-[220px]" />
                <p className="text-[13px] text-[var(--muted-ink)]">
                  {formatWhen(r.createdAt)} · @{formatClock(r.startSec)} ·{" "}
                  {r.words} words
                </p>
              </button>
              <div className="px-4 pb-3">
                <SourceLink url={r.youtubeUrl} startSec={r.startSec} />
              </div>
              {open && <RecordDetail row={r} />}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto border border-[var(--line)] bg-white md:block">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
          <colgroup>
            {table.getVisibleLeafColumns().map((col) => (
              <col key={col.id} style={{ width: COLUMN_WIDTH[col.id] }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-[var(--line)] bg-[var(--paper-deep)]/50"
              >
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-ink)]"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <span className="text-[var(--faint-ink)]">
                          {{
                            asc: "↑",
                            desc: "↓",
                          }[header.column.getIsSorted() as string] ?? ""}
                        </span>
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr
                  onClick={row.getToggleExpandedHandler()}
                  className="cursor-pointer border-b border-[var(--line)] transition-colors hover:bg-[var(--paper)]"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-3 align-middle">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
                {row.getIsExpanded() && (
                  <tr className="border-b border-[var(--line)]">
                    <td colSpan={row.getVisibleCells().length} className="p-0">
                      <RecordDetail row={row.original} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceLink({ url, startSec }: { url: string; startSec: number }) {
  return (
    <a
      href={youtubeAt(url, startSec)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--blood)] underline-offset-2 hover:underline"
    >
      Source
      <ExternalIcon />
    </a>
  );
}

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5 fill-none stroke-current"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3.5H3.5A1.5 1.5 0 0 0 2 5v7.5A1.5 1.5 0 0 0 3.5 14H11a1.5 1.5 0 0 0 1.5-1.5V9" />
      <path d="M9 2h5v5" />
      <path d="M8 8 14 2" />
    </svg>
  );
}

function RecordDetail({ row }: { row: YoutubeScore }) {
  return (
    <div className="grid gap-5 bg-[var(--paper)]/70 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictStamp verdict={row.verdict} />
        <p className="text-[13px] text-[var(--muted-ink)]">
          AI {pct(row.probs.ai)}% · mixed {pct(row.probs.mixed)}% · human{" "}
          {pct(row.probs.human)}%
        </p>
        <span className="flex items-center gap-1.5 text-[13px] text-[var(--muted-ink)]">
          <CertaintyBars level={row.confidence} decorative />
          {CERTAINTY[row.confidence].note}
        </span>
      </div>

      <div>
        <p className="database-stamp mb-2 text-[10px] text-[var(--faint-ink)]">
          Transcript · hover highlights for confidence
        </p>
        <p className="max-h-64 overflow-y-auto text-[16px] leading-relaxed">
          {row.sentences.length > 0
            ? row.sentences.map((sentence, index) => (
                <span
                  key={`${index}-${sentence.sentence.slice(0, 24)}`}
                  title={`${pct(sentence.ai)}% AI`}
                  className="mr-[0.25em] box-decoration-clone px-0.5"
                  style={{
                    background:
                      sentence.ai >= SENTENCE_HUMAN_MAX
                        ? "rgba(216, 59, 29, 0.22)"
                        : "rgba(38, 115, 70, 0.2)",
                  }}
                >
                  {sentence.sentence}
                </span>
              ))
            : row.transcript}
        </p>
      </div>
    </div>
  );
}
