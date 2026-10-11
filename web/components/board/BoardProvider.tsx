"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { describe, type LiveBot } from "@/lib/board";
import { API_URL, BOARD_URL } from "@/lib/config";
import type { LiveEvent, Message, State } from "@/lib/types";

const NAME_KEY = "botteam:name";
const THEME_KEY = "botteam:theme";
const PRICE_KEY = "botteam:price";
const ADMIN_KEY = "botteam:admin";
const REFETCH_ON = ["round_finished", "hired", "fired", "lesson", "human_message", "scored", "round_started", "paused", "resumed", "final_result"];

const read = (k: string, store: "local" | "session" = "local") => {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(k) ?? "";
  } catch {
    return "";
  }
};
const write = (k: string, v: string, store: "local" | "session" = "local") => {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(k, v);
  } catch {}
};

export type FeedItem = { id: string; text: string; ts: string };
export type Control = "start" | "pause" | "resume" | "stop";

type Board = {
  state: State | null;
  error: string | null;
  connected: boolean;
  live: Record<string, LiveBot>;
  feed: FeedItem[];
  messages: Message[];
  name: string;
  ready: boolean;
  setName: (n: string) => void;
  admin: string | null;
  control: (action: Control, body?: object) => Promise<void>;
  sendMessage: (text: string, bot: string | null) => Promise<boolean>;
  theme: "light" | "dark";
  toggleTheme: () => void;
  price: string;
  setPrice: (p: string) => void;
  view: "board" | "remote";
  setView: (v: "board" | "remote") => void;
  boardUrl: string;
  drawer: string | null;
  openStrategy: (id: string | null) => void;
};

const Ctx = createContext<Board | null>(null);

export function useBoard(): Board {
  const b = useContext(Ctx);
  if (!b) throw new Error("useBoard outside BoardProvider");
  return b;
}

export default function BoardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [live, setLive] = useState<Record<string, LiveBot>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [pending, setPending] = useState<Message[]>([]);
  const [name, setNameState] = useState("");
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [price, setPriceState] = useState("");
  const [view, setView] = useState<"board" | "remote">("board");
  const [boardUrl, setBoardUrl] = useState("");
  const [drawer, setDrawer] = useState<string | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/state`, { cache: "no-store" });
      setState(await r.json());
      setPending([]);
      setError(null);
    } catch {
      setError("Can’t reach the engine");
    }
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(fetchState, 400);
  }, [fetchState]);

  useEffect(() => {
    setNameState(read(NAME_KEY));
    const t = read(THEME_KEY);
    setTheme(t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light");
    setPriceState(read(PRICE_KEY) || process.env.NEXT_PUBLIC_LUMINAL_PRICE_PER_M || "");
    setBoardUrl(BOARD_URL || window.location.origin);
    const q = new URLSearchParams(window.location.search);
    // the admin token survives moving between screens and reloads in this tab
    const token = q.get("admin") || read(ADMIN_KEY, "session") || null;
    if (token) write(ADMIN_KEY, token, "session");
    setAdmin(token);
    const phone = window.matchMedia("(max-width: 767px)").matches;
    const asked = q.get("view");
    setView(asked === "board" || asked === "remote" ? asked : phone && !token ? "remote" : "board");
    setReady(true);
    fetchState();
  }, [fetchState]);

  // one EventSource for every screen
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      es = new EventSource(`${API_URL}/api/stream`);
      es.onopen = () => {
        setConnected(true);
        fetchState(); // on (re)connect, refetch the whole state
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = setTimeout(connect, 2000);
      };
      es.onmessage = (m) => {
        const e: LiveEvent = JSON.parse(m.data);
        const d = e.data as Record<string, unknown>;
        if (e.bot) {
          setLive((prev) => {
            const cur = prev[e.bot!] ?? { status: "waiting" };
            switch (e.type) {
              case "assignment":
                return { ...prev, [e.bot!]: { status: "thinking", change: String(d.change ?? "") } };
              case "proposal":
                return { ...prev, [e.bot!]: { ...cur, status: "testing" } };
              case "rejected":
                return { ...prev, [e.bot!]: { ...cur, status: d.final ? "sat out" : "retrying", error: String(d.error ?? "") } };
              case "scored":
                return { ...prev, [e.bot!]: { ...cur, status: "scored", gap: d.practice_gap as number, delta: (d.delta as number) ?? null } };
              case "fired":
                return { ...prev, [e.bot!]: { ...cur, status: "fired" } };
              default:
                return prev;
            }
          });
        }
        if (e.type === "round_started") setLive({});
        const text = describe(e);
        if (text) setFeed((a) => [{ id: e._id, text, ts: e.ts }, ...a].slice(0, 40));
        if (REFETCH_ON.includes(e.type)) scheduleRefetch();
      };
    };
    connect();
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [fetchState, scheduleRefetch]);

  // presence heartbeat
  useEffect(() => {
    if (!name) return;
    const beat = () =>
      fetch(`${API_URL}/api/presence`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => {});
    beat();
    const t = setInterval(beat, 10_000);
    return () => clearInterval(t);
  }, [name]);

  const sendMessage = useCallback(
    async (text: string, bot: string | null) => {
      // optimistic: show it now, the refetch replaces it with the stored copy
      const tmp: Message = { _id: `pending-${Date.now()}`, ts: new Date().toISOString(), name, text, bot };
      setPending((p) => [...p, tmp]);
      try {
        const r = await fetch(`${API_URL}/api/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, text, bot }) });
        if (!r.ok) throw new Error(String(r.status));
        scheduleRefetch();
        return true;
      } catch {
        setPending((p) => p.filter((m) => m._id !== tmp._id));
        setError("Message not sent, try again");
        return false;
      }
    },
    [name, scheduleRefetch],
  );

  const control = useCallback(
    async (action: Control, body?: object) => {
      const r = await fetch(`${API_URL}/api/run/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": admin ?? "" },
        body: JSON.stringify(body ?? {}),
      }).catch(() => null);
      if (!r) setError(`${action}: can’t reach the engine`);
      else if (!r.ok) setError(`${action}: ${(await r.json().catch(() => ({}))).detail ?? r.status}`);
      else {
        setError(null);
        scheduleRefetch();
      }
    },
    [admin, scheduleRefetch],
  );

  const value = useMemo<Board>(
    () => ({
      state,
      error,
      connected,
      live,
      feed,
      messages: [...(state?.messages ?? []), ...pending],
      name,
      ready,
      setName: (n) => {
        write(NAME_KEY, n);
        setNameState(n);
      },
      admin,
      control,
      sendMessage,
      theme,
      toggleTheme: () =>
        setTheme((t) => {
          const next = t === "dark" ? "light" : "dark";
          write(THEME_KEY, next);
          return next;
        }),
      price,
      setPrice: (p) => {
        write(PRICE_KEY, p);
        setPriceState(p);
      },
      view,
      setView,
      boardUrl,
      drawer,
      openStrategy: setDrawer,
    }),
    [state, error, connected, live, feed, pending, name, ready, admin, control, sendMessage, theme, price, view, boardUrl, drawer],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
