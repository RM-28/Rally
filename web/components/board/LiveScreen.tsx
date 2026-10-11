"use client";

import { useBoard } from "./BoardProvider";
import BotTiles from "./BotTiles";
import CalendarCard from "./CalendarCard";
import Leaderboard from "./Leaderboard";
import LiveFeed from "./LiveFeed";
import PhoneCard from "./PhoneCard";
import Playbook from "./Playbook";
import ScoreChart from "./ScoreChart";
import SteerCard from "./SteerCard";
import UsageCard from "./UsageCard";

export default function LiveScreen() {
  const { state } = useBoard();
  const bots = state?.bots ?? [];
  const active = bots.filter((b) => b.status === "active");

  return (
    <section className="mx-auto flex max-w-[1560px] flex-wrap items-start gap-5 p-5">
      <div className="flex min-w-0 flex-[1_1_640px] flex-col gap-5">
        {!state?.run ? (
          <div className="rounded-2xl border border-line bg-surface p-6 text-ink-2">{state ? "No run yet. Waiting for the team to start…" : "Connecting to the engine…"}</div>
        ) : (
          <>
            <div>
              <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
                <h2 className="m-0 text-[16px] font-semibold">The team</h2>
                <span className="text-[12px] text-ink-3">{active.length} active · the last-ranked bot leaves after every round · click a bot to see its code</span>
              </div>
              <BotTiles bots={bots} />
            </div>
            <ScoreChart state={state} />
            <Leaderboard state={state} />
            <CalendarCard state={state} />
          </>
        )}
      </div>
      <aside className="flex min-w-[300px] flex-[0_1_380px] flex-col gap-4">
        <SteerCard />
        {state?.run && <Playbook state={state} />}
        {state?.run && <UsageCard state={state} />}
        <LiveFeed />
        <PhoneCard />
      </aside>
    </section>
  );
}
