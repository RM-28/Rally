"use client";

import { projectFill, projectLabel } from "@/lib/board";

const STEPS = [1, 2, 3, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const niceStep = (dom: number) => STEPS.find((s) => dom / s <= 9) ?? 2000;
const pc = (x: number, dom: number) => `${((x / dom) * 100).toFixed(2)}%`;

export type GanttProps = {
  /** rows[person] = [project, step, start, end][] */
  rows: [number, number, number, number][][];
  people: string[];
  /** hours shown across the track; both plans share it so the difference is visible */
  domain: number;
  downtime?: Record<string, [number, number][]> | null;
  /** dashed line at this hour (where the other plan finishes) */
  marker?: number | null;
  /** project released late: its bars get an ink ring */
  late?: number | null;
  title?: string;
  sub?: string;
};

/** One row per person, one bar per task, colored by project. Hours are positions as % of the domain. */
export default function Gantt({ rows, people, domain, downtime, marker, late, title, sub }: GanttProps) {
  const dom = Math.max(1, domain);
  const small = dom <= 40;
  const rowH = small ? 28 : 22;
  const step = niceStep(dom);
  const ticks: number[] = [];
  for (let t = 0; t <= dom; t += step) ticks.push(t);

  return (
    <div className="flex flex-col gap-1.5">
      {title && (
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{title}</span>
          {sub && <span className="font-code text-[12px] text-ink-3">{sub}</span>}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {rows.map((ops, m) => (
          <div key={m} className="flex items-center gap-2.5">
            <span className="w-10 flex-none truncate text-[12px] text-ink-2">{people[m] ?? `P${m + 1}`}</span>
            <div className="relative flex-1 rounded-[5px] bg-sunken" style={{ height: rowH }}>
              {(downtime?.[String(m)] ?? []).map(([a, b], i) => (
                <span
                  key={`d${i}`}
                  title={`${people[m] ?? `P${m + 1}`} is out · hours ${a}–${b}`}
                  className="absolute inset-y-0 rounded-[3px]"
                  style={{ left: pc(a, dom), width: pc(b - a, dom), background: "repeating-linear-gradient(135deg,var(--line-strong) 0 2px,transparent 2px 6px)" }}
                />
              ))}
              {ops.map(([j, k, s, e]) => (
                <span
                  key={`${j}-${k}`}
                  title={`${projectLabel(j)}${k + 1} · ${people[m] ?? `P${m + 1}`} · hours ${s}–${e}`}
                  className="absolute top-0.5 bottom-0.5 grid place-items-center overflow-hidden rounded-[3px] font-semibold text-bar-ink"
                  style={{
                    left: pc(s, dom),
                    width: pc(e - s, dom),
                    background: projectFill(j),
                    boxShadow: late === j ? "inset 0 0 0 1.5px var(--ink)" : undefined,
                    fontSize: small ? 11 : 10,
                  }}
                >
                  {(e - s) / dom > (small ? 0.02 : 0.035) ? projectLabel(j) : ""}
                </span>
              ))}
              {marker != null && marker < dom && <span className="absolute -top-[3px] -bottom-[3px] border-l-[1.5px] border-dashed border-ink-2" style={{ left: pc(marker, dom) }} />}
            </div>
          </div>
        ))}
        <div className="flex gap-2.5">
          <span className="w-10 flex-none" />
          <div className="relative h-4 flex-1">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 font-code text-[10px] whitespace-nowrap text-ink-3" style={{ left: pc(t, dom) }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
