"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/components/store";
import { Avatar, Card, Loading, SectionTitle, Tag, cx, verdictTone } from "@/components/ui";

export default function DatesPage() {
  const store = useStore();
  const [mutualOnly, setMutualOnly] = useState(false);
  const [q, setQ] = useState("");
  if (!store.ready) return <Loading />;
  const dates = [...store.dates]
    .filter((d) => !mutualOnly || d.mutual)
    .sort((x, y) => {
      const s = (d: typeof x) => Object.values(d.debriefs).reduce((a, b) => a + b.overall, 0);
      return s(y) - s(x);
    });
  const declined = store.invitations.filter((i) => !i.accepted);
  const speed = store.speedDates.filter((s) => {
    if (!q) return true;
    const t = `${store.person(s.a)?.name} ${store.person(s.b)?.name}`.toLowerCase();
    return t.includes(q.toLowerCase());
  });

  return (
    <div className="pt-10">
      <SectionTitle kicker={`${store.dates.length} real dates · ${store.dates.filter((d) => d.mutual).length} mutual`} title="The agents went out">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mutualOnly} onChange={(e) => setMutualOnly(e.target.checked)} className="accent-rose" /> Mutual matches only
        </label>
      </SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        {dates.map((d) => {
          const a = store.person(d.a);
          const b = store.person(d.b);
          if (!a || !b) return null;
          return (
            <Link key={d.id} href={`/dates/${d.id}`}>
              <Card className={cx("h-full transition hover:-translate-y-0.5 hover:shadow-md", d.mutual && "border-mint/40")}>
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-3">
                    <Avatar person={a} size={48} ring="ring-2 ring-white" />
                    <Avatar person={b} size={48} ring="ring-2 ring-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-muted">
                      {a.name} × {b.name}
                    </div>
                    <div className="truncate font-display text-2xl leading-tight">{d.title}</div>
                  </div>
                  {d.mutual && <span className="text-2xl">💞</span>}
                </div>
                <div className="mt-2 text-sm text-muted">
                  {d.activity} · {d.venue}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[a, b].map((p) => {
                    const db = d.debriefs[p.id];
                    return db ? (
                      <Tag key={p.id} tone={verdictTone(db.verdict)}>
                        {p.firstName}&apos;s agent: {db.verdict} · {db.overall}
                      </Tag>
                    ) : null;
                  })}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {declined.length > 0 && (
        <>
          <h3 className="mb-3 mt-12 font-display text-3xl">Some agents said no</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {declined.map((i) => {
              const f = store.person(i.from);
              const t = store.person(i.to);
              if (!f || !t) return null;
              return (
                <Card key={i.id} className="p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Avatar person={f} size={26} /> <span className="text-muted">asked</span> <Avatar person={t} size={26} />
                    <span className="truncate font-medium">{t.firstName}</span>
                  </div>
                  <p className="mt-2 text-muted">“{i.reply}”</p>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <div className="mb-3 mt-12 flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-display text-3xl">Speed-dating night · {store.speedDates.length} tables</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name…" className="w-56 rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-violet" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {speed.slice(0, 400).map((s) => {
          const a = store.person(s.a);
          const b = store.person(s.b);
          if (!a || !b) return null;
          const ra = s.ratings[a.id];
          const rb = s.ratings[b.id];
          return (
            <Link key={s.id} href={`/dates/${s.id}`} className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm hover:border-violet/40">
              <Avatar person={a} size={26} />
              <span className="w-6 text-center text-xs font-semibold">{ra?.score}</span>
              <span className="text-muted">⚡</span>
              <span className="w-6 text-center text-xs font-semibold">{rb?.score}</span>
              <Avatar person={b} size={26} />
              <span className="ml-1 truncate text-muted">
                {a.firstName} & {b.firstName}
              </span>
              {ra?.wantsDate && rb?.wantsDate && <span className="ml-auto">✨</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
