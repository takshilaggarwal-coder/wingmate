"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useStore } from "@/components/store";
import { ChatView } from "@/components/chat";
import { DebriefCard } from "@/components/debrief";
import { Avatar, Card, Loading, Tag } from "@/components/ui";

export default function DatePage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  if (!store.ready) return <Loading />;

  const full = store.dates.find((d) => d.id === id);
  const speed = store.speedDates.find((s) => s.id === id);
  if (!full && !speed) return <div className="py-24 text-center text-muted">That date doesn&apos;t exist (yet).</div>;

  const a = store.person((full || speed)!.a);
  const b = store.person((full || speed)!.b);
  if (!a || !b) return <div className="py-24 text-center text-muted">One of these agents is missing.</div>;

  if (speed && !full) {
    const realDate = store.dates.find((d) => (d.a === a.id && d.b === b.id) || (d.a === b.id && d.b === a.id));
    return (
      <div className="pt-10">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex -space-x-3">
            <Avatar person={a} size={64} ring="ring-4 ring-bg" />
            <Avatar person={b} size={64} ring="ring-4 ring-bg" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">⚡ Speed date</div>
            <h1 className="font-display text-4xl leading-tight">
              {a.firstName}&apos;s agent × {b.firstName}&apos;s agent
            </h1>
          </div>
          {realDate && (
            <Link href={`/dates/${realDate.id}`} className="ml-auto rounded-full bg-rose px-4 py-2 text-sm font-semibold text-white">
              They went on a real date →
            </Link>
          )}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <ChatView a={a} b={b} lines={speed.lines} replay />
          <div className="space-y-4">
            {[a, b].map((p, i) => {
              const r = speed.ratings[p.id];
              const o = p === a ? b : a;
              if (!r) return null;
              return (
                <Card key={p.id}>
                  <div className="flex items-center gap-3">
                    <Avatar person={p} size={40} ring={i === 0 ? "ring-2 ring-rose" : "ring-2 ring-violet"} />
                    <div className="flex-1 text-xs text-muted">🔒 {p.firstName}&apos;s agent rates {o.firstName}</div>
                    <div className="text-3xl font-semibold">
                      {r.score}
                      <span className="text-base text-muted">/10</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm">{r.note}</p>
                  <p className="mt-2 text-xs italic text-muted">Highlight: {r.highlight}</p>
                  <div className="mt-3">
                    <Tag tone={r.wantsDate ? "mint" : "plain"}>{r.wantsDate ? "Would ask them out" : "Wouldn't ask them out"}</Tag>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const d = full!;
  const inv = store.invitations.find((i) => (i.from === d.a && i.to === d.b) || (i.from === d.b && i.to === d.a));
  const sd = store.speedDates.find((s) => (s.a === a.id && s.b === b.id) || (s.a === b.id && s.b === a.id));
  return (
    <div className="pt-10">
      <div className="mb-6 flex flex-wrap items-center gap-5">
        <div className="flex -space-x-4">
          <Link href={`/people/${a.id}`}>
            <Avatar person={a} size={76} ring="ring-4 ring-bg" />
          </Link>
          <Link href={`/people/${b.id}`}>
            <Avatar person={b} size={76} ring="ring-4 ring-bg" />
          </Link>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-rose">
            A real date · {a.firstName}&apos;s agent & {b.firstName}&apos;s agent
          </div>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">{d.title}</h1>
          <div className="mt-1 text-muted">
            {d.activity} · {d.venue}
          </div>
        </div>
        {d.mutual ? <Tag tone="mint">💞 Both agents want a second date</Tag> : <Tag tone="plain">Not mutual</Tag>}
      </div>

      {inv && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <Card className="border-rose/30">
            <div className="text-xs text-muted">💌 {store.person(inv.from)?.firstName}&apos;s agent asked</div>
            <p className="mt-1">“{inv.message}”</p>
            <p className="mt-2 text-xs italic text-muted">Why this date: {inv.why}</p>
          </Card>
          <Card className="border-violet/30">
            <div className="text-xs text-muted">{store.person(inv.to)?.firstName}&apos;s agent replied</div>
            <p className="mt-1">“{inv.reply}”</p>
            {sd && (
              <Link href={`/dates/${sd.id}`} className="mt-2 inline-block text-xs text-violet underline">
                Where they met: the speed date →
              </Link>
            )}
          </Card>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {d.scenes.map((s, i) => (
          <span key={i} className="rounded-full border border-line bg-white px-3 py-1 text-xs">
            <b className="text-gold">Scene {i + 1}</b> · {s.title}
          </span>
        ))}
      </div>

      <ChatView a={a} b={b} lines={d.lines} scenes={d.scenes} replay />

      <h2 className="mb-4 mt-10 font-display text-4xl">After the date: private debriefs</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">Each agent reports back only to its own human. Neither agent sees the other&apos;s debrief.</p>
      <div className="grid gap-5 lg:grid-cols-2">
        {d.debriefs[a.id] && <DebriefCard me={a} other={b} d={d.debriefs[a.id]} tone="rose" />}
        {d.debriefs[b.id] && <DebriefCard me={b} other={a} d={d.debriefs[b.id]} tone="violet" />}
      </div>
    </div>
  );
}
