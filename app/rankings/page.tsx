"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { useStore } from "@/components/store";
import { RankingList } from "@/components/ranking";
import { Avatar, Card, Loading, SectionTitle, Tag, cx } from "@/components/ui";

function heat(v: number) {
  // cream → violet → rose
  const t = Math.max(0, Math.min(1, (v - 35) / 55));
  const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
  const [r, g, b] = t < 0.5 ? [lerp(251, 190, t * 2), lerp(246, 178, t * 2), lerp(241, 255, t * 2)] : [lerp(190, 232, (t - 0.5) * 2), lerp(178, 67, (t - 0.5) * 2), lerp(255, 107, (t - 0.5) * 2)];
  return `rgb(${r},${g},${b})`;
}

function Rankings() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("p") || store.people[0]?.id;
  const me = selected ? store.person(selected) : undefined;

  const mutuals = useMemo(() => store.dates.filter((d) => d.mutual), [store.dates]);
  if (!store.ready) return <Loading />;
  if (!me) return <div className="py-24 text-center text-muted">No agents yet.</div>;

  return (
    <div className="pt-10">
      <SectionTitle kicker="Rankings" title={<>Who fits <span className="italic text-rose">{me.firstName}</span> best</>} />
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-2">
        {store.people.map((p) => (
          <button key={p.id} onClick={() => router.replace(`/rankings?p=${p.id}`, { scroll: false })} className={cx("flex shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] transition", p.id === me.id ? "bg-white shadow-sm ring-2 ring-rose" : "opacity-70 hover:opacity-100")}>
            <Avatar person={p} size={44} />
            <span className="max-w-16 truncate">{p.firstName}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <RankingList personId={me.id} />
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Fit = 55% what {me.firstName}&apos;s agent concluded about them + 30% what their agent concluded about {me.firstName} + 15% the matchmaker&apos;s pre-date
            forecast. A real date outweighs a speed date; people {me.firstName}&apos;s agent never met are ranked on forecast only.
          </p>
        </div>
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3">
              <Avatar person={me} size={52} />
              <div>
                <div className="font-semibold">{me.name}</div>
                <div className="text-sm italic text-muted">“{me.analysis.oneLiner}”</div>
              </div>
            </div>
            <div className="mt-3 text-sm">
              <span className="text-muted">Needs:</span> {me.analysis.needs.map((n) => n.label).join(" · ")}
            </div>
            <Link href={`/people/${me.id}`} className="mt-3 inline-block text-sm text-rose underline">
              Open profile →
            </Link>
          </Card>
          <Card>
            <div className="mb-2 font-semibold">💞 Mutual matches this season ({mutuals.length})</div>
            <div className="space-y-2">
              {mutuals.map((d) => {
                const a = store.person(d.a);
                const b = store.person(d.b);
                if (!a || !b) return null;
                return (
                  <Link key={d.id} href={`/dates/${d.id}`} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-bg">
                    <Avatar person={a} size={26} />
                    <Avatar person={b} size={26} />
                    <span className="truncate">
                      {a.firstName} & {b.firstName}
                    </span>
                    <span className="ml-auto truncate text-xs text-muted">{d.title}</span>
                  </Link>
                );
              })}
              {!mutuals.length && <div className="text-sm text-muted">None yet.</div>}
            </div>
          </Card>
        </div>
      </div>

      <h3 className="mb-2 mt-12 font-display text-3xl">The whole season at a glance</h3>
      <p className="mb-4 text-sm text-muted">
        Row = whose ranking it is; column = candidate. Darker = better fit. <Tag tone="mint">●</Tag> = real date, ◦ = speed date only.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card p-3">
        <table className="border-separate border-spacing-[2px] text-[10px]">
          <thead>
            <tr>
              <th />
              {store.people.map((p) => (
                <th key={p.id} className="p-0">
                  <Link href={`/rankings?p=${p.id}`} title={p.name}>
                    <Avatar person={p} size={22} />
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {store.people.map((row) => {
              const rank = new Map(store.rankingFor(row.id).map((r) => [r.otherId, r]));
              return (
                <tr key={row.id} className={cx(row.id === me.id && "outline outline-2 outline-rose")}>
                  <td className="whitespace-nowrap pr-2 text-right font-medium">
                    <Link href={`/rankings?p=${row.id}`}>{row.firstName}</Link>
                  </td>
                  {store.people.map((col) => {
                    const r = rank.get(col.id);
                    if (!r) return <td key={col.id} className="h-[22px] w-[22px] rounded bg-[#f3ece6]" />;
                    return (
                      <td key={col.id} title={`${row.firstName} → ${col.firstName}: ${r.score} (${r.basis})`} className="h-[22px] w-[22px] rounded text-center align-middle font-semibold text-white" style={{ background: heat(r.score) }}>
                        {r.basis === "date" ? "●" : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RankingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Rankings />
    </Suspense>
  );
}
