"use client";

import type { CSSProperties, ReactNode } from "react";
import { tint } from "@/lib/rally/format";
import { useRally, whoOf } from "@/lib/rally/store";

export const btn = {
  outline: "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] border border-line-strong bg-surface font-medium whitespace-nowrap hover:bg-hover",
  primary: "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-ink text-on-ink font-semibold whitespace-nowrap hover:opacity-[.88]",
  ghost: "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-ink-2 font-medium whitespace-nowrap hover:bg-hover",
  icon: "grid place-items-center rounded-[10px] text-ink-3 hover:bg-hover hover:text-ink",
  link: "font-medium text-ink underline underline-offset-2 hover:opacity-75",
};

export function Icon({ name, size = 20, fill = false, className = "", style }: { name: string; size?: number; fill?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden className={`ms ${className}`} style={{ fontSize: size, fontVariationSettings: `'FILL' ${fill ? 1 : 0}`, ...style }}>
      {name}
    </span>
  );
}

/** Initials on a tint. People are circles, agents are rounded squares in their color. */
export function Avatar({ id, size, radius, text, weight = 600, ring, className = "" }: { id: string; size: number; radius?: number; text?: number; weight?: number; ring?: string; className?: string }) {
  const { state } = useRally();
  const w = whoOf(state, id);
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: w.isAgent ? (radius ?? 8) : 999,
    fontSize: text ?? Math.max(10, Math.round(size * 0.38)),
    fontWeight: weight,
    ...(w.isAgent && w.color ? tint(w.color) : { background: "var(--hover)", color: "var(--ink)" }),
    ...(ring ? { border: `2px solid ${ring}` } : {}),
  };
  return (
    <span title={w.name} className={`grid flex-none place-items-center leading-none ${className}`} style={style}>
      {w.init}
    </span>
  );
}

export function LiveDot({ color = "var(--live)" }: { color?: string }) {
  return <span className="r-pulse inline-block h-2 w-2 flex-none rounded-full" style={{ background: color }} />;
}

/** Track-style segmented control (`--hover` track, selected segment raised on `--surface`). */
export function Segmented<T extends string>({ options, value, onChange, full = false, small = false }: { options: [T, string][]; value: T; onChange: (v: T) => void; full?: boolean; small?: boolean }) {
  return (
    <div role="radiogroup" className={`flex rounded-[10px] bg-hover p-[3px] ${full ? "w-full" : ""}`}>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <button
            key={v}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={`rounded-[7px] font-medium whitespace-nowrap ${full ? "flex-1 h-8 px-2 text-[13px]" : "h-[30px] px-3"} ${small ? "text-[13px]" : ""} ${on ? "bg-surface text-ink" : "text-ink-2"}`}
            style={on ? { boxShadow: "0 1px 2px rgb(0 0 0 / .1), 0 0 0 1px var(--line)" } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Pill-style filter (sidebar, panel tabs). */
export function Pills<T extends string>({ options, value, onChange, className = "h-[26px] px-2.5 text-[12px] rounded-full" }: { options: [T, string][]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <button key={v} aria-pressed={on} onClick={() => onChange(v)} className={`font-medium whitespace-nowrap ${className} ${on ? "bg-surface text-ink" : "text-ink-2 hover:text-ink"}`} style={on ? { boxShadow: "0 0 0 1px var(--line)" } : undefined}>
            {label}
          </button>
        );
      })}
    </>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label?: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange} className={`flex h-6 w-10 flex-none rounded-full p-0.5 ${on ? "justify-end bg-ink" : "justify-start bg-line-strong"}`}>
      <span className="h-5 w-5 rounded-full bg-surface" style={{ boxShadow: "0 1px 2px rgb(0 0 0 / .2)" }} />
    </button>
  );
}

export function Tag({ children, bg = "transparent", fg = "var(--ink-2)", line = "var(--line)", className = "" }: { children: ReactNode; bg?: string; fg?: string; line?: string; className?: string }) {
  return (
    <span className={`rounded-[5px] border px-[7px] py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`} style={{ background: bg, color: fg, borderColor: line }}>
      {children}
    </span>
  );
}

export function Progress({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-hover">
      <div className="h-full rounded-full transition-[width] duration-600 ease-out" style={{ width: `${Math.round(pct)}%`, background: color }} />
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-[220px] flex-1">
        <h1 className="m-0 text-[24px] font-semibold">{title}</h1>
        <div className="text-ink-2">{sub}</div>
      </div>
      {children}
    </div>
  );
}
