"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Zoom } from "@visx/zoom";
import { scaleLinear } from "@visx/scale";
import { ParentSize } from "@visx/responsive";
import { AI_BANDS, AiMeter, aiPct, bandOf } from "@/components/ai-scale";

export type MapPoint = {
  id: string;
  title: string;
  x: number;
  y: number;
  /**
   * The same record in the 3D layout — its own UMAP run, not this x/y with a
   * depth added. Null for records projected before 3D coordinates existed.
   */
  p3: { x: number; y: number; z: number } | null;
  ai: number;
  verdict: string;
  sourceType: string;
  words: number;
  url: string;
  excerpt: string;
  contested: boolean;
};

type Neighbour = {
  recordId: string;
  title: string;
  aiShare: number;
  verdict: string;
  sourceType: string;
  score: number;
};

/** Which projection is on screen. 2D is the default: it is the readable one. */
type Dim = "2d" | "3d";

/** The reference lattice drawn behind (2D) or beneath (3D) the records. */
type Lattice = "none" | "dots" | "grid";

/** Where the eye sits in the 3D view. Lifted so it survives toggling to 2D. */
type Cam = { yaw: number; pitch: number; zoom: number };

const PAD = 34;
const START_CAM: Cam = { yaw: 0.62, pitch: 0.5, zoom: 1 };

export function RecordMap({ points }: { points: MapPoint[] }) {
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [hovered, setHovered] = useState<MapPoint | null>(null);
  const [onlyContested, setOnlyContested] = useState(false);
  const [dim, setDim] = useState<Dim>("2d");
  const [cam, setCam] = useState<Cam>(START_CAM);
  const [kinds, setKinds] = useState<Set<string>>(
    () => new Set(points.map((p) => p.sourceType))
  );

  const kindList = useMemo(
    () => [...new Set(points.map((p) => p.sourceType))].sort(),
    [points]
  );

  const has3d = useMemo(() => points.some((p) => p.p3), [points]);

  useEffect(() => {
    if (dim !== "3d") return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [dim]);

  const visible = useMemo(
    () =>
      points.filter(
        (p) =>
          kinds.has(p.sourceType) &&
          (!onlyContested || p.contested) &&
          (dim === "2d" || p.p3 !== null)
      ),
    [points, kinds, onlyContested, dim]
  );

  const contestedCount = points.filter((p) => p.contested).length;

  return (
    <main className="pt-14">
      <div className="mx-auto max-w-[1400px] px-5 pb-16 sm:px-8">
        <header className="py-9 sm:py-11">
          <p className="paper-label">The corpus</p>
          <h1 className="paper-display mt-3.5 text-[clamp(2rem,4vw,3rem)]">
            Explore similar records
          </h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-7 text-[var(--muted-ink)]">
            This map groups records by meaning. Records with similar text are
            close together. Each color shows how much of the text can be
            AI-generated. A ring marks a record when nearby results disagree.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {kindList.map((k) => {
              const on = kinds.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    setKinds((prev) => {
                      const next = new Set(prev);
                      if (next.has(k) && next.size > 1) next.delete(k);
                      else next.add(k);
                      return next;
                    })
                  }
                  aria-pressed={on}
                  className={`press focus-ring rounded-full border px-3 py-1 text-[12px] font-medium ${
                    on
                      ? "border-[var(--line-strong)] bg-[var(--ink)] text-white"
                      : "border-[var(--line)] text-[var(--muted-ink)]"
                  }`}
                >
                  {k === "doc" ? "Documents" : "Speeches"}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setOnlyContested((v) => !v)}
              aria-pressed={onlyContested}
              disabled={contestedCount === 0}
              className={`press focus-ring rounded-full border px-3 py-1 text-[12px] font-medium disabled:opacity-40 ${
                onlyContested
                  ? "border-[var(--line-strong)] bg-[var(--ink)] text-white"
                  : "border-[var(--line)] text-[var(--muted-ink)]"
              }`}
            >
              Contested only ({contestedCount})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel="Projection"
              value={dim}
              onChange={setDim}
              options={[
                { value: "2d", label: "2D" },
                {
                  value: "3d",
                  label: "3D",
                  disabled: !has3d,
                  title: has3d
                    ? undefined
                    : "No 3D coordinates yet — run scripts/build-embeddings.mts",
                },
              ]}
            />
          </div>
        </div>

        <div className="mb-3 flex justify-end">
          <Legend />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="paper-card relative h-[min(72vh,720px)] overflow-hidden">
            <ParentSize>
              {({ width, height }) =>
                width > 0 && height > 0 ? (
                  dim === "2d" ? (
                    <FlatCanvas
                      width={width}
                      height={height}
                      points={visible}
                      lattice="grid"
                      selected={selected}
                      hovered={hovered}
                      onHover={setHovered}
                      onSelect={setSelected}
                    />
                  ) : (
                    <DeepCanvas
                      width={width}
                      height={height}
                      points={visible}
                      lattice="grid"
                      cam={cam}
                      onCam={setCam}
                      selected={selected}
                      hovered={hovered}
                      onHover={setHovered}
                      onSelect={setSelected}
                    />
                  )
                ) : null
              }
            </ParentSize>
            <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-[var(--faint-ink)]">
              {visible.length} of {points.length} records ·{" "}
              {dim === "2d"
                ? "scroll to zoom, drag to pan"
                : "drag to turn, scroll to zoom, double-click to reset"}
            </p>
          </div>

          <DetailPanel point={selected} onClose={() => setSelected(null)} />
        </div>
      </div>
    </main>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{
    value: T;
    label: string;
    disabled?: boolean;
    title?: string;
  }>;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-full border border-[var(--line)] p-0.5"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            title={o.title}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`press focus-ring rounded-full px-2.5 py-[3px] text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-35 ${
              on
                ? "bg-[var(--ink)] text-white"
                : "text-[var(--muted-ink)] hover:text-[var(--ink)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- 2D ---------------------------------- */

function FlatCanvas({
  width,
  height,
  points,
  lattice,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  width: number;
  height: number;
  points: MapPoint[];
  lattice: Lattice;
  selected: MapPoint | null;
  hovered: MapPoint | null;
  onHover: (p: MapPoint | null) => void;
  onSelect: (p: MapPoint) => void;
}) {
  const xScale = useMemo(
    () => scaleLinear({ domain: [-1, 1], range: [PAD, width - PAD] }),
    [width]
  );
  const yScale = useMemo(
    () => scaleLinear({ domain: [-1, 1], range: [height - PAD, PAD] }),
    [height]
  );

  return (
    <Zoom<SVGSVGElement>
      width={width}
      height={height}
      scaleXMin={0.6}
      scaleXMax={14}
      scaleYMin={0.6}
      scaleYMax={14}
    >
      {(zoom) => (
        <svg
          width={width}
          height={height}
          ref={zoom.containerRef}
          className={zoom.isDragging ? "cursor-grabbing" : "cursor-grab"}
          style={{ touchAction: "none" }}
        >
          <FlatLattice
            kind={lattice}
            width={width}
            height={height}
            k={zoom.transformMatrix.scaleX}
            originX={
              zoom.transformMatrix.translateX +
              xScale(0) * zoom.transformMatrix.scaleX
            }
            originY={
              zoom.transformMatrix.translateY +
              yScale(0) * zoom.transformMatrix.scaleY
            }
          />
          <rect
            width={width}
            height={height}
            fill="transparent"
            onWheel={(e) => {
              e.preventDefault();
              zoom.handleWheel(e);
            }}
            onMouseDown={zoom.dragStart}
            onMouseMove={zoom.dragMove}
            onMouseUp={zoom.dragEnd}
            onMouseLeave={() => {
              if (zoom.isDragging) zoom.dragEnd();
              onHover(null);
            }}
            onDoubleClick={() => zoom.reset()}
          />
          <g transform={zoom.toString()}>
            {points.map((p) => {
              const isSel = selected?.id === p.id;
              const isHov = hovered?.id === p.id;
              // Radius and stroke divide by the zoom scale so dots keep a
              // constant on-screen size as you zoom into a dense knot.
              const k = zoom.transformMatrix.scaleX;
              return (
                <Dot
                  key={p.id}
                  point={p}
                  cx={xScale(p.x)}
                  cy={yScale(p.y)}
                  r={(isSel ? 7 : isHov ? 6 : 4.5) / k}
                  strokeW={(isSel ? 2 : 1) / k}
                  selected={isSel}
                  hovered={isHov}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              );
            })}
          </g>

          {hovered && (
            <HoverCard
              point={hovered}
              width={width}
              x={
                zoom.transformMatrix.translateX +
                xScale(hovered.x) * zoom.transformMatrix.scaleX
              }
              y={
                zoom.transformMatrix.translateY +
                yScale(hovered.y) * zoom.transformMatrix.scaleY
              }
            />
          )}
        </svg>
      )}
    </Zoom>
  );
}

/**
 * The flat lattice is one tiled pattern in screen space rather than drawn
 * geometry, so it stays cheap however far out you zoom. `patternTransform`
 * carries the zoom, which keeps a lattice vertex pinned to the origin of the
 * layout; the step jumps by whole octaves so cells never grow past legible.
 */
function FlatLattice({
  kind,
  width,
  height,
  k,
  originX,
  originY,
}: {
  kind: Lattice;
  width: number;
  height: number;
  k: number;
  originX: number;
  originY: number;
}) {
  if (kind === "none") return null;

  const base = Math.max(26, Math.min(width, height) / 14);
  const octave = Math.pow(2, Math.round(Math.log2(1 / k)));
  const step = base * octave;
  const id = `lattice-${kind}`;

  return (
    <>
      <defs>
        <pattern
          id={id}
          width={step}
          height={step}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${originX} ${originY}) scale(${k})`}
        >
          {kind === "dots" ? (
            <circle
              cx={0}
              cy={0}
              r={1.4 / k}
              fill="var(--line-strong)"
              opacity={0.75}
            />
          ) : (
            <path
              d={`M ${step} 0 L 0 0 L 0 ${step}`}
              fill="none"
              stroke="var(--line)"
              strokeWidth={1 / k}
            />
          )}
        </pattern>
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </>
  );
}

/* --------------------------------- 3D ---------------------------------- */

/**
 * Eye distance, in radii of the cloud. Near enough that the far side of a
 * knot reads as far — about a 2x size difference front to back — and far
 * enough that the edges do not smear.
 */
const CAM_DIST_R = 2.9;
const DEEP_PAD = 30;
/** How many cells across the floor lattice runs. */
const FLOOR_STEPS = 14;
/** Pitch stops short of the poles, where the floor collapses to a line. */
const PITCH_LIMIT = 1.25;

/**
 * The cloud the camera is aimed at, measured from the records rather than
 * assumed: the layout is normalised per axis, so its middle is not the origin
 * and its extent in each direction is its own.
 */
type Frame = {
  cx: number;
  cy: number;
  cz: number;
  /** Radius of the sphere holding the records and their floor. */
  r: number;
  floorY: number;
  floorHalf: number;
};

function frameOf(points: MapPoint[]): Frame {
  const ps = points.map((p) => p.p3).filter((p) => p !== null);
  if (ps.length === 0)
    return { cx: 0, cy: 0, cz: 0, r: 1, floorY: -1, floorHalf: 1 };

  const mean = (f: (p: { x: number; y: number; z: number }) => number) =>
    ps.reduce((a, p) => a + f(p), 0) / ps.length;
  const cx = mean((p) => p.x);
  const cy = mean((p) => p.y);
  const cz = mean((p) => p.z);

  const spread = Math.max(
    ...ps.map((p) => Math.max(Math.abs(p.x - cx), Math.abs(p.z - cz))),
    0.2
  );
  const floorHalf = spread * 1.06;
  const floorY = Math.min(...ps.map((p) => p.y - cy)) - spread * 0.14;

  // The eye has to clear the floor's far corner as well as the records, or a
  // steep pitch puts geometry behind the camera.
  const r = Math.max(
    ...ps.map((p) => Math.hypot(p.x - cx, p.y - cy, p.z - cz)),
    Math.hypot(floorHalf, floorY, floorHalf),
    0.2
  );

  return { cx, cy, cz, r, floorY, floorHalf };
}

/** A point turned into camera space but not yet divided by its distance. */
type Turned = { x: number; y: number; depth: number };
type Projected = { sx: number; sy: number; depth: number };

/**
 * Everything on screen for one camera position. The focal length is fitted to
 * the records at the angle they are actually being seen from, so the cloud
 * fills the card however it is turned.
 */
function viewOf(
  points: MapPoint[],
  frame: Frame,
  cam: Cam,
  width: number,
  height: number
) {
  const cosY = Math.cos(cam.yaw);
  const sinY = Math.sin(cam.yaw);
  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);
  const eye = frame.r * CAM_DIST_R;

  // Yaw about the vertical axis, then pitch about the horizontal one.
  const turn = (dx: number, dy: number, dz: number): Turned => {
    const x1 = dx * cosY + dz * sinY;
    const z1 = -dx * sinY + dz * cosY;
    const y2 = dy * cosP - z1 * sinP;
    const z2 = dy * sinP + z1 * cosP;
    return { x: x1, y: y2, depth: Math.max(frame.r * 0.3, eye - z2) };
  };

  const turned = points
    .filter((p) => p.p3)
    .map((p) => ({
      p,
      t: turn(p.p3!.x - frame.cx, p.p3!.y - frame.cy, p.p3!.z - frame.cz),
    }));

  const tick = (i: number) =>
    -frame.floorHalf + (i / FLOOR_STEPS) * frame.floorHalf * 2;
  const floorTurned = Array.from({ length: FLOOR_STEPS + 1 }, (_, i) =>
    Array.from({ length: FLOOR_STEPS + 1 }, (_, j) =>
      turn(tick(i), frame.floorY, tick(j))
    )
  );

  // Fitted to the records alone. The floor is a backdrop — at a shallow
  // pitch its near edge projects enormously wide, and framing that would
  // squeeze the records into a thread. Letting it run off the card instead
  // reads as a surface continuing past the frame, which is what it is.
  let ux = 1e-6;
  let uy = 1e-6;
  for (const { t } of turned) {
    ux = Math.max(ux, Math.abs(t.x) / t.depth);
    uy = Math.max(uy, Math.abs(t.y) / t.depth);
  }
  const focal =
    Math.min((width / 2 - DEEP_PAD) / ux, (height / 2 - DEEP_PAD) / uy) *
    cam.zoom;

  const screen = (t: Turned): Projected => ({
    sx: width / 2 + (t.x * focal) / t.depth,
    sy: height / 2 - (t.y * focal) / t.depth,
    depth: t.depth,
  });

  return {
    eye,
    // Painter's algorithm: furthest first, so a near record covers a far one.
    placed: turned
      .map(({ p, t }) => ({ p, at: screen(t) }))
      .sort((a, b) => b.at.depth - a.at.depth),
    floor: floorTurned.map((row) => row.map(screen)),
  };
}

/** 0 at the near face of the cloud, 1 at the far face. */
function depthT(depth: number, frame: Frame) {
  const near = frame.r * (CAM_DIST_R - 1);
  return Math.min(1, Math.max(0, (depth - near) / (2 * frame.r)));
}

function DeepCanvas({
  width,
  height,
  points,
  lattice,
  cam,
  onCam,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  width: number;
  height: number;
  points: MapPoint[];
  lattice: Lattice;
  cam: Cam;
  onCam: (c: Cam) => void;
  selected: MapPoint | null;
  hovered: MapPoint | null;
  onHover: (p: MapPoint | null) => void;
  onSelect: (p: MapPoint) => void;
}) {
  const drag = useRef<{ x: number; y: number; cam: Cam } | null>(null);
  const [dragging, setDragging] = useState(false);

  const frame = useMemo(() => frameOf(points), [points]);
  const view = useMemo(
    () => viewOf(points, frame, cam, width, height),
    [points, frame, cam, width, height]
  );

  const hoveredAt = hovered
    ? view.placed.find((d) => d.p.id === hovered.id)?.at
    : undefined;

  return (
    <svg
      width={width}
      height={height}
      className={dragging ? "cursor-grabbing" : "cursor-grab"}
      style={{ touchAction: "none" }}
      onWheel={(e) => {
        e.preventDefault();
        const next = cam.zoom * Math.exp(-e.deltaY * 0.0015);
        onCam({ ...cam, zoom: Math.min(6, Math.max(0.4, next)) });
      }}
      onMouseDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, cam };
        setDragging(true);
      }}
      onMouseMove={(e) => {
        const d = drag.current;
        if (!d) return;
        onCam({
          ...d.cam,
          yaw: d.cam.yaw + (e.clientX - d.x) * 0.006,
          pitch: Math.min(
            PITCH_LIMIT,
            Math.max(-PITCH_LIMIT, d.cam.pitch - (e.clientY - d.y) * 0.006)
          ),
        });
      }}
      onMouseUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onMouseLeave={() => {
        drag.current = null;
        setDragging(false);
        onHover(null);
      }}
      onDoubleClick={() => onCam(START_CAM)}
    >
      <DeepLattice kind={lattice} floor={view.floor} frame={frame} />

      {/* Hit testing is off mid-drag: turning the view should not also be
          hovering everything the cursor sweeps past. */}
      <g pointerEvents={dragging ? "none" : undefined}>
        {view.placed.map(({ p, at }) => {
          const isSel = selected?.id === p.id;
          const isHov = hovered?.id === p.id;
          const near = view.eye / at.depth;
          return (
            <Dot
              key={p.id}
              point={p}
              cx={at.sx}
              cy={at.sy}
              r={(isSel ? 7 : isHov ? 6 : 4.5) * near}
              strokeW={(isSel ? 2 : 1) * near}
              // Distance reads as haze as well as size, which is what keeps a
              // rotating cloud from looking like flat confetti.
              opacity={1 - 0.6 * depthT(at.depth, frame)}
              selected={isSel}
              hovered={isHov}
              onHover={onHover}
              onSelect={onSelect}
            />
          );
        })}
      </g>

      {hovered && hoveredAt && (
        <HoverCard
          point={hovered}
          width={width}
          x={hoveredAt.sx}
          y={hoveredAt.sy}
        />
      )}
    </svg>
  );
}

/**
 * A floor under the cloud. In 3D the lattice is doing more than decoration:
 * without a plane in perspective there is nothing to read the rotation
 * against, and the records just swirl.
 */
function DeepLattice({
  kind,
  floor,
  frame,
}: {
  kind: Lattice;
  floor: Projected[][];
  frame: Frame;
}) {
  if (kind === "none") return null;

  const fade = (depth: number, top: number) =>
    top - (top - top * 0.35) * depthT(depth, frame);

  return (
    <g aria-hidden pointerEvents="none">
      {kind === "dots"
        ? floor.flatMap((row, i) =>
            row.map((v, j) => (
              <circle
                key={`${i}-${j}`}
                cx={v.sx}
                cy={v.sy}
                r={1.9 * ((frame.r * CAM_DIST_R) / v.depth)}
                fill="var(--line-strong)"
                opacity={fade(v.depth, 0.85)}
              />
            ))
          )
        : // A straight line in the world stays straight under this
          // projection, so each grid line is two projected ends and nothing
          // in between.
          floor.flatMap((row, i) => {
            const last = FLOOR_STEPS;
            const spans: Array<[Projected, Projected, string]> = [
              [row[0], row[last], `r${i}`],
              [floor[0][i], floor[last][i], `c${i}`],
            ];
            return spans.map(([a, b, key]) => (
              <line
                key={key}
                x1={a.sx}
                y1={a.sy}
                x2={b.sx}
                y2={b.sy}
                stroke="var(--line-strong)"
                strokeWidth={1}
                opacity={fade((a.depth + b.depth) / 2, 0.75)}
              />
            ));
          })}
    </g>
  );
}

/* ------------------------------- shared -------------------------------- */

function Dot({
  point,
  cx,
  cy,
  r,
  strokeW,
  opacity = 1,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  point: MapPoint;
  cx: number;
  cy: number;
  r: number;
  strokeW: number;
  opacity?: number;
  selected: boolean;
  hovered: boolean;
  onHover: (p: MapPoint | null) => void;
  onSelect: (p: MapPoint) => void;
}) {
  const color = `var(${bandOf(point.ai).v})`;
  return (
    <g opacity={opacity}>
      {point.contested && (
        <circle
          cx={cx}
          cy={cy}
          r={r * 2}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          opacity={0.45}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        fillOpacity={selected || hovered ? 1 : 0.82}
        stroke={selected ? "var(--ink)" : "white"}
        strokeWidth={strokeW}
        onMouseEnter={() => onHover(point)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(point);
        }}
        style={{ cursor: "pointer" }}
      />
    </g>
  );
}

function HoverCard({
  point,
  width,
  x,
  y,
}: {
  point: MapPoint;
  width: number;
  x: number;
  y: number;
}) {
  const w = 236;
  const flip = x + w + 16 > width;
  const left = flip ? x - w - 14 : x + 14;
  return (
    <foreignObject
      x={Math.max(4, left)}
      y={Math.max(4, y - 30)}
      width={w}
      height={78}
      pointerEvents="none"
    >
      <div className="rounded-[10px] border border-[var(--line)] bg-white/95 px-3 py-2 shadow-[0_8px_24px_-12px_rgba(17,18,15,0.4)] backdrop-blur-sm">
        <p className="line-clamp-2 text-[12px] font-medium leading-snug text-[var(--ink)]">
          {point.title}
        </p>
        <p
          className="mt-1 text-[11px]"
          style={{ color: `var(${bandOf(point.ai).v})` }}
        >
          <span className="font-semibold">{aiPct(point.ai)}% AI</span>
          <span className="text-[var(--muted-ink)]">
            {" "}
            · {bandOf(point.ai).label}
          </span>
        </p>
      </div>
    </foreignObject>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--muted-ink)]">
      {AI_BANDS.map((b) => (
        <span key={b.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ background: `var(${b.v})` }}
          />
          {b.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-3 rounded-full border border-[var(--muted-ink)]"
        />
        contested
      </span>
    </div>
  );
}

function DetailPanel({
  point,
  onClose,
}: {
  point: MapPoint | null;
  onClose: () => void;
}) {
  if (!point) {
    return (
      <aside className="paper-card p-5">
        <p className="paper-label">No record selected</p>
        <p className="mt-3 text-[14px] leading-6 text-[var(--muted-ink)]">
          Click a dot to read the record, see how machine-written it scored, and
          find the records nearest to it in meaning.
        </p>
        <p className="mt-4 text-[13px] leading-6 text-[var(--faint-ink)]">
          Ringed dots sit in a neighbourhood where the readings disagree sharply
          — near-identical text called both human and machine.
        </p>
      </aside>
    );
  }

  return (
    <aside className="paper-card max-h-[min(72vh,720px)] overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="paper-label">
          {point.sourceType === "doc" ? "Document" : "Speech"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring rounded-[4px] text-[12px] text-[var(--muted-ink)] hover:text-[var(--ink)]"
        >
          Close
        </button>
      </div>

      <h2 className="paper-heading mt-2 text-[17px]">{point.title}</h2>

      <AiMeter ai={point.ai} className="mt-4" />

      <p className="mt-2 text-[12px] text-[var(--faint-ink)]">
        {point.words} words{point.contested && " · contested neighbourhood"}
      </p>

      <p className="mt-4 max-h-40 overflow-y-auto text-[13px] leading-6 text-[var(--muted-ink)]">
        {point.excerpt}…
      </p>

      <a
        href={point.url}
        target="_blank"
        rel="noreferrer"
        className="focus-ring mt-3 inline-block rounded-[4px] text-[13px] font-medium text-[var(--accent)] underline-offset-2 underline"
      >
        Source
      </a>

      <NeighbourList key={point.id} id={point.id} />
    </aside>
  );
}

function NeighbourList({ id }: { id: string }) {
  const [near, setNear] = useState<Neighbour[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/neighbours?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.error) setError(j.error);
        else setNear(j.neighbours ?? []);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <div className="paper-divider mt-5 pt-4">
      <p className="paper-label">Nearest in meaning</p>
      {error && (
        <p className="mt-3 text-[12px] text-[var(--stamp-ai)]">{error}</p>
      )}
      {!near && !error && (
        <p className="mt-3 text-[12px] text-[var(--faint-ink)]">Searching…</p>
      )}
      {near && near.length === 0 && (
        <p className="mt-3 text-[12px] text-[var(--faint-ink)]">
          Nothing else close by.
        </p>
      )}
      <ul className="mt-3 space-y-2.5">
        {near?.map((n) => (
          <li key={n.recordId} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{ background: `var(${bandOf(n.aiShare).v})` }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] leading-snug">
                {n.title}
              </span>
              <span className="text-[11px] text-[var(--faint-ink)]">
                {aiPct(n.aiShare)}% AI · {(n.score * 100).toFixed(0)}% match
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
