"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/components/store";
import { Avatar, Loading, SectionTitle, Tag, cx } from "@/components/ui";

export default function PeoplePage() {
  const store = useStore();
  const [q, setQ] = useState("");
  if (!store.ready) return <Loading />;
  const list = store.people.filter((p) => !q || `${p.name} ${p.analysis.oneLiner} ${p.analysis.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="pt-10">
      <SectionTitle kicker={`${store.people.length} agents`} title="Every person, represented by an agent">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, vibes, tags…" className="w-64 rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-violet" />
      </SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const top = store.rankingFor(p.id)[0];
          const tp = top ? store.person(top.otherId) : undefined;
          return (
            <Link key={p.id} href={`/people/${p.id}`} className={cx("group rounded-2xl border border-line bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md", p.origin === "local" && "ring-2 ring-violet/30")}>
              <div className="flex items-center gap-3">
                <Avatar person={p} size={56} />
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{p.name}</div>
                  <div className="truncate text-xs text-muted">{p.analysis.location}</div>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 font-display text-lg italic leading-snug text-[#4b3f55]">“{p.analysis.oneLiner}”</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {p.analysis.tags.slice(0, 4).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              {tp && (
                <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm">
                  <span className="text-muted">#1 fit</span>
                  <Avatar person={tp} size={22} />
                  <span className="truncate font-medium">{tp.name}</span>
                  <span className="ml-auto font-semibold">{top!.score}</span>
                  {top!.mutual && <span title="mutual">💞</span>}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
