"use client";

import {
  type ColumnFiltersState,
  createColumnHelper,
  type ExpandedState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Fragment, useMemo, useState } from "react";
import type { ProjectRecord } from "@/lib/projects";
import { formatDay, formatDuration } from "@/lib/time-format";
import { AiMeter, bandOf, BandLegend } from "@/components/ai-scale";
import { formatWhen, pct, sourceAt } from "./format";

/** Fixed widths keep columns from re-flowing when a row expands. */
const COLUMN_WIDTH: Record<string, string> = {
  expand: "30px",
  createdAt: "118px",
  title: "auto",
  aiShare: "168px",
  words: "64px",
  source: "88px",
};

const archiveFilter: FilterFn<ProjectRecord> = (row, _id, value) => {
  const q = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const r = row.original;
  const hay = [
    r.name,
    r.transcript,
    r.video.channel,
    r.video.videoId,
    r.aiProbability !== null ? bandOf(r.aiProbability).label : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
};

const columnHelper = createColumnHelper<ProjectRecord>();

export function ScoreTable({
  data,
  query,
}: {
  data: ProjectRecord[];
  query: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const columnFilters = useMemo<ColumnFiltersState>(() => [], []);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "expand",
        header: "",
        cell: ({ row }) => (
          <span
            aria-hidden
            className="inline-block text-muted-foreground/70 transition-transform"
            style={{ transform: row.getIsExpanded() ? "rotate(90deg)" : undefined }}
          >
            ▸
          </span>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: "Created",
        cell: (info) => (
          <span className="tabular-nums text-[13px] text-muted-foreground">
            {formatWhen(Date.parse(info.getValue()))}
          </span>
        ),
      }),
      columnHelper.accessor((r) => r.name, {
        id: "title",
        header: "Speech",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-[15px] font-medium leading-snug">
              {row.original.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground/70">
              {row.original.video.channel || row.original.video.videoId}
              {` · ${formatDuration(row.original.stats.duration)}`}
            </p>
          </div>
        ),
      }),
      columnHelper.accessor((r) => r.aiProbability ?? -1, {
        id: "aiShare",
        header: "AI-ness",
        cell: ({ row }) =>
          row.original.aiProbability === null ? (
            <span className="text-[13px] text-muted-foreground/70">Not scored</span>
          ) : (
            <AiMeter ai={row.original.aiProbability} className="w-full" />
          ),
      }),
      columnHelper.accessor((r) => r.stats.words, {
        id: "words",
        header: "Words",
        cell: (info) => <span className="tabular-nums text-[13px]">{info.getValue()}</span>,
      }),
      columnHelper.display({
        id: "source",
        header: "Source",
        cell: ({ row }) => <SourceLink url={row.original.video.url} startSec={0} />,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, expanded, globalFilter: query, columnFilters },
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
      <p className="rounded-2xl border border-dashed border-border/70 bg-card/40 px-5 py-10 text-center text-[15px] text-muted-foreground">
        The archive is empty. Analyze a speech first, then come back.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/70 bg-card/40 px-5 py-10 text-center text-[15px] text-muted-foreground">
        Nothing in the files matches that search.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-[13px] text-muted-foreground">
          {rows.length} record{rows.length === 1 ? "" : "s"}
          {query.trim() ? " after the filter" : " on file"}
        </p>
        <BandLegend />
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const r = row.original;
          const open = row.getIsExpanded();
          return (
            <li key={r.id} className="overflow-hidden rounded-2xl border border-border/70 bg-card/40">
              <button
                type="button"
                onClick={row.getToggleExpandedHandler()}
                className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left active:bg-accent/40"
              >
                <p className="min-w-0 text-[16px] font-medium leading-snug">{r.name}</p>
                {r.aiProbability !== null ? (
                  <AiMeter ai={r.aiProbability} className="w-full max-w-[220px]" />
                ) : (
                  <span className="text-[13px] text-muted-foreground/70">Not scored</span>
                )}
                <p className="text-[13px] text-muted-foreground">
                  {formatWhen(Date.parse(r.createdAt))} · {r.stats.words} words
                </p>
              </button>
              <div className="px-4 pb-3">
                <SourceLink url={r.video.url} startSec={0} />
              </div>
              {open && <RecordDetail record={r} />}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-border/70 bg-card/40 md:block">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
          <colgroup>
            {table.getVisibleLeafColumns().map((col) => (
              <col key={col.id} style={{ width: COLUMN_WIDTH[col.id] }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border/70 bg-background/40">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="text-muted-foreground/70">
                          {(
                            {
                              asc: "↑",
                              desc: "↓",
                            } as Record<string, string>
                          )[header.column.getIsSorted() as string] ?? ""}
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
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
                  className="cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/40"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                {row.getIsExpanded() && (
                  <tr className="border-b border-border/70">
                    <td colSpan={row.getVisibleCells().length} className="p-0">
                      <RecordDetail record={row.original} />
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
      href={sourceAt(url, startSec)}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-primary underline-offset-2 hover:underline"
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

function RecordDetail({ record }: { record: ProjectRecord }) {
  return (
    <div className="grid gap-5 bg-background/40 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        {record.aiProbability !== null ? (
          <p className="text-[13px] text-muted-foreground">
            {pct(record.aiProbability)}% AI · {record.flaggedCount} of {record.sentenceCount}{" "}
            sentences flagged · {record.stats.words.toLocaleString()} words
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Not scored yet — open the project to run the AI-o-meter.
          </p>
        )}
        {record.video.channel ? (
          <span className="text-[13px] text-muted-foreground/70">{record.video.channel}</span>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">Transcript</p>
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed">
          {record.transcript || "No transcript on file."}
        </p>
      </div>
    </div>
  );
}
