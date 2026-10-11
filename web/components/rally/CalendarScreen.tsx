"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/rally-types";
import { eventWhen, tint } from "@/lib/rally/format";
import { useRally, whoOf } from "@/lib/rally/store";
import { Avatar, btn, Icon, PageHeader } from "./primitives";

const HOUR = 48; // px per hour
const DAY_MS = 86_400_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseYmd = (s: string | null) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

/** Side-by-side lanes for overlapping events in one day. */
function layout(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const out: { ev: CalendarEvent; lane: number; lanes: number }[] = [];
  let group: typeof out = [];
  let groupEnd = "";
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => out.push({ ...g, lanes }));
    group = [];
  };
  for (const ev of sorted) {
    if (group.length && ev.start >= groupEnd) {
      flush();
      groupEnd = "";
    }
    const used = new Set(group.filter((g) => g.ev.end > ev.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ ev, lane, lanes: 1 });
    if (ev.end > groupEnd) groupEnd = ev.end;
  }
  if (group.length) flush();
  return out;
}

export default function CalendarScreen() {
  const { state } = useRally();
  const router = useRouter();
  const params = useSearchParams();
  const focus = parseYmd(params.get("date")) ?? new Date();
  // a rolling 7 days from the chosen day (today by default), so what's coming up is always in view
  const weekStart = startOfDay(focus);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const selected = params.get("event");
  const [draft, setDraft] = useState<{ date: string; time: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = HOUR * 7.5;
  }, []);

  const go = (q: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    Object.entries(q).forEach(([k, v]) => (v === null ? p.delete(k) : p.set(k, v)));
    router.replace(`/calendar?${p.toString()}`, { scroll: false });
  };

  const byDay = days.map((d) => {
    const a = d.getTime();
    const b = a + DAY_MS;
    return layout(state.calendar.filter((e) => e.status !== "cancelled" && Date.parse(e.start) < b && Date.parse(e.end) > a));
  });
  const sel = selected ? state.calendar.find((e) => e.id === selected) : undefined;
  const label = `${days[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString([], {
    month: days[0].getMonth() === days[6].getMonth() ? undefined : "short",
    day: "numeric",
  })}, ${days[6].getFullYear()}`;

  return (
    <section aria-label="Calendar" className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex-none px-7 pt-6 pb-4">
          <PageHeader title="Calendar" sub="Your Rally calendar. Agents book time here, and ask first when guests or quiet hours are involved.">
            <div className="flex items-center gap-1">
              <button onClick={() => go({ date: null })} className={`${btn.outline} h-9`}>
                Today
              </button>
              <button onClick={() => go({ date: ymd(addDays(weekStart, -7)) })} aria-label="Previous week" className={`${btn.icon} h-9 w-9`}>
                <Icon name="chevron_left" />
              </button>
              <button onClick={() => go({ date: ymd(addDays(weekStart, 7)) })} aria-label="Next week" className={`${btn.icon} h-9 w-9`}>
                <Icon name="chevron_right" />
              </button>
              <span className="ml-1 min-w-[150px] font-medium whitespace-nowrap">{label}</span>
            </div>
            <button onClick={() => setDraft({ date: ymd(new Date()), time: nextHalfHour() })} className={btn.primary}>
              <Icon name="add" size={18} />
              New event
            </button>
          </PageHeader>
        </div>

        <div className="mx-7 mb-7 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className="grid flex-none border-b border-line bg-sunken" style={{ gridTemplateColumns: "56px repeat(7, minmax(96px, 1fr))" }}>
            <span />
            {days.map((d) => {
              const today = ymd(d) === ymd(now);
              return (
                <div key={ymd(d)} className="flex items-center gap-1.5 border-l border-line px-2.5 py-2 text-[12px] text-ink-3">
                  <span className="font-medium">{d.toLocaleDateString([], { weekday: "short" })}</span>
                  <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[13px] font-semibold ${today ? "bg-ink text-on-ink" : "text-ink"}`}>{d.getDate()}</span>
                </div>
              );
            })}
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
            <div className="relative grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(96px, 1fr))", height: HOUR * 24 }}>
              <div className="relative">
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-ink-3" style={{ top: h * HOUR }}>
                    {h === 0 ? "" : new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" })}
                  </span>
                ))}
              </div>
              {days.map((d, i) => {
                const dayStart = d.getTime();
                const isToday = ymd(d) === ymd(now);
                return (
                  <div
                    key={ymd(d)}
                    className="relative border-l border-line"
                    style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${HOUR}px)` }}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return;
                      const y = e.nativeEvent.offsetY;
                      const mins = Math.floor((y / HOUR) * 2) * 30;
                      setDraft({ date: ymd(d), time: `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}` });
                    }}
                    title="Click to add an event"
                  >
                    {/* quiet hours */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 bg-sunken/60" style={{ height: HOUR * 8 }} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-sunken/60" style={{ height: HOUR * 5 }} />
                    {isToday && (
                      <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger" style={{ top: ((now.getTime() - dayStart) / 3_600_000) * HOUR }}>
                        <span className="absolute -top-[3px] -left-1 h-2 w-2 rounded-full bg-danger" />
                      </div>
                    )}
                    {byDay[i].map(({ ev, lane, lanes }) => {
                      const s = Math.max(Date.parse(ev.start), dayStart);
                      const e = Math.min(Date.parse(ev.end), dayStart + DAY_MS);
                      const top = ((s - dayStart) / 3_600_000) * HOUR;
                      const height = Math.max(22, ((e - s) / 3_600_000) * HOUR - 2);
                      const owner = whoOf(state, ev.createdBy);
                      const tent = ev.status === "tentative";
                      const colors = tent
                        ? { background: "var(--warn-bg)", color: "var(--warn-fg)", border: "1px dashed var(--warn)" }
                        : owner.isAgent && owner.color
                          ? { ...tint(owner.color), border: "1px solid transparent" }
                          : { background: "var(--hover)", color: "var(--ink)", border: "1px solid var(--line-strong)" };
                      return (
                        <button
                          key={ev.id}
                          onClick={() => go({ event: ev.id })}
                          aria-current={selected === ev.id ? "true" : undefined}
                          className={`absolute z-[5] flex flex-col overflow-hidden rounded-lg px-2 text-left text-[12px] leading-tight hover:shadow-rally ${height > 34 ? "py-1" : "justify-center"}`}
                          style={{
                            top: top + 1,
                            height,
                            left: `calc(${(lane / lanes) * 100}% + 3px)`,
                            width: `calc(${100 / lanes}% - 6px)`,
                            ...colors,
                            outline: selected === ev.id ? "2px solid var(--a1)" : undefined,
                          }}
                        >
                          <span className="truncate font-semibold">{ev.title}</span>
                          {height > 34 && (
                            <span className="truncate opacity-80">
                              {new Date(ev.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              {tent ? " · Tentative" : ""}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {sel && <EventPanel ev={sel} onClose={() => go({ event: null })} />}
      {draft && <NewEventDialog initial={draft} onClose={() => setDraft(null)} onCreated={(ev) => go({ event: ev.id, date: ymd(new Date(ev.start)) })} />}
    </section>
  );
}

function nextHalfHour() {
  const d = new Date(Date.now() + 30 * 60_000);
  return `${String(d.getHours()).padStart(2, "0")}:${d.getMinutes() < 30 ? "00" : "30"}`;
}

function EventPanel({ ev, onClose }: { ev: CalendarEvent; onClose: () => void }) {
  const { state, actions } = useRally();
  const room = state.rooms.find((r) => r.id === ev.roomId);
  const creator = whoOf(state, ev.createdBy);
  const tent = ev.status === "tentative";
  return (
    <aside aria-label="Event details" className="flex w-[340px] flex-none flex-col gap-4 overflow-auto border-l border-line bg-sunken p-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[18px] font-semibold">{ev.title}</div>
          <div className="text-ink-2">{eventWhen(ev.start, ev.end)}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className={`${btn.icon} h-8 w-8`}>
          <Icon name="close" />
        </button>
      </div>
      <div>
        <span
          className="rounded-[5px] px-[7px] py-0.5 text-[11px] font-semibold"
          style={tent ? { background: "var(--warn-bg)", color: "var(--warn-fg)" } : { background: "var(--ok-bg)", color: "var(--ok)" }}
        >
          {tent ? "Tentative · waiting for approval" : "Confirmed"}
        </span>
      </div>
      {tent && ev.approvalId && (
        <Link href={`/approvals?id=${ev.approvalId}`} className={`${btn.primary} self-start`}>
          Review the approval
        </Link>
      )}
      <dl className="m-0 flex flex-col gap-3 text-[13px]">
        {room && (
          <Row k="Room">
            <Link href={`/rooms/${room.id}`} className="font-code text-[12px] underline underline-offset-2">
              #{room.name}
            </Link>
          </Row>
        )}
        <Row k="Who">
          <div className="flex flex-wrap gap-1.5">
            {ev.attendees.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-2 pl-0.5">
                <Avatar id={id} size={20} radius={6} text={10} />
                {whoOf(state, id).name}
              </span>
            ))}
          </div>
        </Row>
        {ev.guests.length > 0 && (
          <Row k="Guests">
            <div>
              {ev.guests.join(", ")}
              <div className="text-[12px] text-ink-3">Rally doesn’t send email, so share the time with guests yourself.</div>
            </div>
          </Row>
        )}
        {ev.notes && <Row k="Notes">{ev.notes}</Row>}
        <Row k="Booked by">{creator.name}</Row>
      </dl>
      <button onClick={() => (actions.deleteEvent(ev.id), onClose())} className="mt-auto h-9 self-start rounded-[10px] px-3.5 font-medium text-danger hover:bg-hover">
        Delete event
      </button>
    </aside>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[72px] flex-none text-ink-3">{k}</dt>
      <dd className="m-0 min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function NewEventDialog({ initial, onClose, onCreated }: { initial: { date: string; time: string }; onClose: () => void; onCreated: (ev: CalendarEvent) => void }) {
  const { state, actions } = useRally();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [minutes, setMinutes] = useState(30);
  const [roomId, setRoomId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const field = "h-10 rounded-[10px] border border-line-strong bg-bg px-3 outline-0";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(`${date}T${time}`);
    if (!title.trim() || isNaN(start.getTime())) return;
    setBusy(true);
    const ev = await actions.createEvent({ title: title.trim(), start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString(), roomId: roomId || null, notes });
    setBusy(false);
    if (ev) {
      onClose();
      onCreated(ev);
    }
  };
  return (
    <>
      <div onClick={onClose} className="absolute inset-0 z-40" style={{ background: "rgb(41 37 30 / .28)" }} />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-event-title"
        className="absolute top-[10vh] left-1/2 z-50 flex w-[min(460px,calc(100%-32px))] -translate-x-1/2 flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-rally"
      >
        <div id="new-event-title" className="text-[18px] font-semibold">
          New event
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Plan the week" className={field} required />
        </label>
        <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Start</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={300} className={field} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Length</span>
            <select value={minutes} onChange={(e) => setMinutes(+e.target.value)} className={field}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Room (optional)</span>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={field}>
            <option value="">None</option>
            {state.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none rounded-[10px] border border-line-strong bg-bg px-3 py-2 outline-0" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btn.outline} h-[38px]`}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !title.trim()} className={`${btn.primary} h-[38px] disabled:opacity-60`}>
            {busy ? "Adding…" : "Add event"}
          </button>
        </div>
      </form>
    </>
  );
}
