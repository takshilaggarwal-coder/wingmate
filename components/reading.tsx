"use client";
import { useEffect, useRef, useState } from "react";
import type { RawSources, ReadingNote } from "@/lib/types";
import { SourceBadge, Typing, cx, fmt, imgSrc } from "./ui";

function refMatches(active: string | null, ref: string) {
  if (!active) return false;
  if (active === ref) return true;
  // li-exp-2 should light up when a note cites li-exp-2, etc.
  return false;
}

export function SourcesPanel({ raw, activeRef, compact }: { raw: RawSources; activeRef?: string | null; compact?: boolean }) {
  const li = raw.linkedin;
  const ig = raw.instagram;
  const box = (ref: string) =>
    cx("rounded-lg px-2.5 py-1.5 transition-colors duration-300", refMatches(activeRef ?? null, ref) ? "glow bg-violet-soft ring-1 ring-violet/40" : "");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeRef) return;
    const el = scrollRef.current?.querySelector(`[data-ref="${activeRef}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeRef]);

  return (
    <div ref={scrollRef} className={cx(compact ? "max-h-[560px] space-y-4 overflow-y-auto pr-1" : "grid items-start gap-4 lg:grid-cols-2")}>
      <div className="rounded-2xl border border-line bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <SourceBadge source="linkedin" />
          <a href={li.url} target="_blank" rel="noreferrer" className="text-sm font-semibold hover:underline">
            LinkedIn
          </a>
          <span className="text-xs text-muted">{li.followers ? `${fmt(li.followers)} followers` : ""}</span>
        </div>
        <div data-ref="li-headline" className={box("li-headline")}>
          <div className="font-semibold">{li.name}</div>
          <div className="text-sm text-muted">{li.headline}</div>
          {li.location && <div className="text-xs text-muted">{li.location}</div>}
        </div>
        {li.about && (
          <div data-ref="li-about" className={box("li-about")}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">About</div>
            <p className={cx("text-sm leading-relaxed", compact && "line-clamp-4")}>{li.about}</p>
          </div>
        )}
        {li.experience.length > 0 && (
          <div className="mt-1">
            <div className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Experience</div>
            {li.experience.map((e, i) => (
              <div key={i} data-ref={`li-exp-${i + 1}`} className={box(`li-exp-${i + 1}`)}>
                <div className="text-sm">
                  <span className="font-medium">{e.title}</span> · {e.company}
                </div>
                {e.duration && <div className="text-xs text-muted">{e.duration}</div>}
                {!compact && e.description && <div className="mt-0.5 line-clamp-3 text-xs text-muted">{e.description}</div>}
              </div>
            ))}
          </div>
        )}
        {li.education.length > 0 && (
          <div className="mt-1">
            <div className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Education</div>
            {li.education.map((e, i) => (
              <div key={i} data-ref={`li-edu-${i + 1}`} className={box(`li-edu-${i + 1}`)}>
                <div className="text-sm">{[e.school, e.degree, e.field].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        )}
        {li.skills.length > 0 && (
          <div data-ref="li-skills" className={box("li-skills")}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Skills</div>
            <div className="text-xs text-muted">{li.skills.slice(0, 14).join(" · ")}</div>
          </div>
        )}
        {li.posts.length > 0 && (
          <div className="mt-1">
            <div className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Recent posts</div>
            {li.posts.map((p) => (
              <div key={p.ref} data-ref={p.ref} className={box(p.ref)}>
                <p className={cx("text-xs leading-relaxed", compact ? "line-clamp-2" : "line-clamp-4")}>{p.text}</p>
                {(p.likes || p.date) && (
                  <div className="text-[10px] text-muted">
                    {p.date?.slice(0, 10)} {p.likes ? `· ${fmt(p.likes)} reactions` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <SourceBadge source="instagram" />
          <a href={ig.url} target="_blank" rel="noreferrer" className="text-sm font-semibold hover:underline">
            @{ig.username}
          </a>
          <span className="text-xs text-muted">{ig.followers ? `${fmt(ig.followers)} followers` : ""}</span>
        </div>
        <div data-ref="ig-bio" className={box("ig-bio")}>
          <p className="whitespace-pre-line text-sm">{ig.bio || "(no bio)"}</p>
          {ig.category && <div className="text-xs text-muted">{ig.category}</div>}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {ig.posts.map((p) => (
            <div
              key={p.ref}
              data-ref={p.ref}
              title={p.caption}
              className={cx("group relative aspect-square overflow-hidden rounded-lg bg-bg transition", refMatches(activeRef ?? null, p.ref) && "glow ring-2 ring-violet")}
            >
              {p.image || p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgSrc(p.image || p.imageUrl)} alt={p.alt || p.caption || ""} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="p-2 text-[10px] text-muted">{p.caption?.slice(0, 80)}</div>
              )}
              {!compact && p.caption && (
                <div className="absolute inset-x-0 bottom-0 line-clamp-3 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4 text-[10px] leading-tight text-white opacity-0 transition group-hover:opacity-100">
                  {p.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NoteRow({ note, active }: { note: ReadingNote; active?: boolean }) {
  const synthesis = note.ref === "synthesis";
  return (
    <li className={cx("rise flex gap-2.5 rounded-xl px-3 py-2 text-sm leading-snug transition", active ? "bg-violet-soft" : synthesis ? "bg-gold-soft" : "")}>
      <div className="pt-0.5">{synthesis ? <SourceBadge source="both" /> : <SourceBadge source={note.source} />}</div>
      <div>
        <span className="mr-1.5 rounded bg-bg px-1 py-0.5 font-mono text-[10px] text-muted">{note.ref}</span>
        {note.text}
      </div>
    </li>
  );
}

/** The agent's notebook: notes appear one by one while the cited source lights up. */
export function ReadingView({ raw, notes, live, replay, status }: { raw?: RawSources; notes: ReadingNote[]; live?: boolean; replay?: boolean; status?: string }) {
  const [count, setCount] = useState(replay ? 0 : notes.length);
  const [playing, setPlaying] = useState(!!replay);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!replay) setCount(notes.length);
  }, [notes.length, replay]);

  useEffect(() => {
    if (!replay || !playing) return;
    if (count >= notes.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setCount((c) => c + 1), 1100);
    return () => clearTimeout(t);
  }, [replay, playing, count, notes.length]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const shown = notes.slice(0, count);
  const active = shown.length ? shown[shown.length - 1].ref : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      {raw ? <SourcesPanel raw={raw} activeRef={active} compact /> : <div className="rounded-2xl border border-line bg-card p-6 text-sm text-muted">Loading sources…</div>}
      <div className="flex flex-col rounded-2xl border border-line bg-card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="font-semibold">📓 The agent&apos;s notebook</div>
            <div className="text-xs text-muted">{live ? status || "Reading…" : `${notes.length} observations from 2 sources`}</div>
          </div>
          {replay && (
            <button onClick={() => (count >= notes.length ? (setCount(0), setPlaying(true)) : setPlaying(!playing))} className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
              {count >= notes.length ? "↺ Replay reading" : playing ? "❚❚ Pause" : "▶ Play"}
            </button>
          )}
        </div>
        <ol ref={listRef} className="max-h-[560px] flex-1 space-y-1 overflow-y-auto p-2">
          {shown.map((n, i) => (
            <NoteRow key={i} note={n} active={i === shown.length - 1 && (live || (replay && playing))} />
          ))}
          {(live || (replay && playing)) && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted">
              <Typing /> reading…
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}
