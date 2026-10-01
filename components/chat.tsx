"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatLine, DateScene, Person } from "@/lib/types";
import { Avatar, Typing, cx } from "./ui";

export function chemistry(lines: ChatLine[], id: string): number {
  const s = lines.filter((l) => l.speaker === id).reduce((acc, l) => acc + (l.signal || 0), 0);
  return Math.max(4, Math.min(100, 50 + s * 7));
}

function Meter({ person, value, tone }: { person: Person; value: number; tone: "rose" | "violet" }) {
  return (
    <div className={cx("flex min-w-0 flex-1 items-center gap-2.5", tone === "violet" && "flex-row-reverse text-right")}>
      <Avatar person={person} size={40} ring={tone === "rose" ? "ring-2 ring-rose" : "ring-2 ring-violet"} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-muted">
          {person.firstName}&apos;s agent · <span className="font-medium text-ink">feeling it: {Math.round(value)}%</span>
        </div>
        <div className={cx("mt-1 h-2 overflow-hidden rounded-full bg-[#f1e9e2]", tone === "violet" && "rotate-180")}>
          <div className={cx("h-full rounded-full", tone === "rose" ? "bg-rose" : "bg-violet")} style={{ width: `${value}%`, transition: "width .7s ease" }} />
        </div>
      </div>
    </div>
  );
}

export function ChatView({
  a,
  b,
  lines,
  scenes,
  live,
  replay,
  compact,
  onReplayDone,
}: {
  a: Person;
  b: Person;
  lines: ChatLine[];
  scenes?: DateScene[];
  live?: boolean;
  replay?: boolean;
  compact?: boolean;
  onReplayDone?: () => void;
}) {
  const [showThoughts, setShowThoughts] = useState(true);
  const [count, setCount] = useState(replay ? 0 : lines.length);
  const [playing, setPlaying] = useState(!!replay);
  const [speed, setSpeed] = useState(1);
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!replay) setCount(lines.length);
  }, [lines.length, replay]);

  useEffect(() => {
    if (!replay || !playing) return;
    if (count >= lines.length) {
      setPlaying(false);
      onReplayDone?.();
      return;
    }
    const next = lines[count];
    const base = next.speaker === "director" ? 1400 : Math.min(4200, 900 + next.text.length * 22);
    setTyping(next.speaker !== "director");
    const t = setTimeout(() => {
      setTyping(false);
      setCount((c) => c + 1);
    }, base / speed);
    return () => clearTimeout(t);
  }, [replay, playing, count, lines, speed, onReplayDone]);

  useEffect(() => {
    if ((replay && playing) || live) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [count, live, replay, playing, lines.length]);

  const shown = lines.slice(0, count);
  const ca = chemistry(shown, a.id);
  const cb = chemistry(shown, b.id);
  const nextSpeaker = replay ? lines[count]?.speaker : undefined;
  const liveNext = live ? (shown.filter((l) => l.speaker !== "director").slice(-1)[0]?.speaker === a.id ? b.id : a.id) : undefined;

  const sceneOf = useMemo(() => {
    const seen = new Set<number>();
    return shown.map((l) => {
      if (l.scene === undefined || seen.has(l.scene) || l.speaker !== "director") return null;
      seen.add(l.scene);
      return l.scene;
    });
  }, [shown]);

  return (
    <div className="rounded-2xl border border-line bg-card">
      <div className="sticky top-16 z-10 flex items-center gap-4 rounded-t-2xl border-b border-line bg-card/95 px-4 py-3 backdrop-blur">
        <Meter person={a} value={ca} tone="rose" />
        <div className="shrink-0 text-xl">💞</div>
        <Meter person={b} value={cb} tone="violet" />
      </div>

      <div className={cx("space-y-3 px-3 py-4 sm:px-5", compact ? "max-h-[420px] overflow-y-auto" : "")}>
        {shown.map((l, i) => {
          if (l.speaker === "director") {
            const sc = sceneOf[i];
            return (
              <div key={i} className="rise py-1 text-center">
                {sc !== null && sc !== undefined && scenes?.[sc] && (
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                    Scene {sc + 1} · {scenes[sc].title}
                  </div>
                )}
                <div className="mx-auto inline-block max-w-xl rounded-xl bg-gold-soft px-3.5 py-2 text-sm italic text-[#7a5310]">🎬 {l.text}</div>
              </div>
            );
          }
          const isA = l.speaker === a.id;
          const p = isA ? a : b;
          return (
            <div key={i} className={cx("rise flex gap-2.5", !isA && "flex-row-reverse")}>
              <Avatar person={p} size={34} />
              <div className={cx("flex max-w-[82%] flex-col", !isA && "items-end")}>
                <div className="mb-0.5 text-[11px] text-muted">{p.firstName}&apos;s agent</div>
                <div className={cx("rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug", isA ? "rounded-tl-sm bg-rose-soft" : "rounded-tr-sm bg-violet-soft")}>{l.text}</div>
                {showThoughts && l.thought && (
                  <div className={cx("mt-1 max-w-full rounded-lg border border-dashed px-2.5 py-1.5 text-xs text-muted", isA ? "border-rose/30" : "border-violet/30")}>
                    <span className="mr-1">🔒</span>
                    <span className="font-medium">private note to {p.firstName}:</span> {l.thought}
                    {typeof l.signal === "number" && l.signal !== 0 && (
                      <span className={cx("ml-1.5 font-semibold", l.signal > 0 ? "text-mint" : "text-rose")}>
                        {l.signal > 0 ? "▲".repeat(l.signal) : "▼".repeat(-l.signal)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {((replay && typing && nextSpeaker) || (live && liveNext)) && (
          <div className={cx("flex items-center gap-2 text-muted", (nextSpeaker || liveNext) !== a.id && "flex-row-reverse")}>
            <Avatar person={(nextSpeaker || liveNext) === a.id ? a : b} size={26} />
            <div className="rounded-full bg-[#f4ede7] px-3 py-2">
              <Typing />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-xs">
        {replay && (
          <>
            <button onClick={() => (count >= lines.length ? (setCount(0), setPlaying(true)) : setPlaying(!playing))} className="rounded-full bg-ink px-3 py-1.5 font-semibold text-white">
              {count >= lines.length ? "↺ Replay" : playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={cx("rounded-full px-2.5 py-1.5", speed === s ? "bg-violet-soft font-semibold text-violet" : "text-muted hover:bg-bg")}>
                {s}×
              </button>
            ))}
            <button onClick={() => (setCount(lines.length), setPlaying(false))} className="rounded-full px-2.5 py-1.5 text-muted hover:bg-bg">
              Skip to end
            </button>
          </>
        )}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-muted">
          <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} className="accent-violet" />
          Show agents&apos; private notes
        </label>
      </div>
    </div>
  );
}
