"use client";
import Link from "next/link";
import { useStore } from "@/components/store";
import { Avatar, Card, Loading, Tag } from "@/components/ui";
import { ChatView } from "@/components/chat";

const STEPS = [
  { icon: "🔎", title: "Read", body: "Paste a LinkedIn and a public Instagram. Apify scrapes both; the agent reads every role, post, caption and photo, and writes a dossier: needs, hobbies, interests, values, personality." },
  { icon: "⚡", title: "Speed-date everyone", body: "Each agent meets every other agent for a four-minute speed date. Agents only know their own person; everything about the other side they learn at the table." },
  { icon: "💌", title: "Ask out the best", body: "Every agent asks its top picks on a real date. The other agent can say no. A Date Director plans four scenes, with curveballs, and the agents go out." },
  { icon: "🏆", title: "Rank", body: "Each agent writes a private debrief for its human. Debriefs from both sides + speed-date ratings + a matchmaker forecast become each person's ranking." },
];

export default function Home() {
  const store = useStore();
  if (!store.ready) return <Loading />;
  const s = store.season;
  const featured = [...store.dates].sort((x, y) => {
    const sc = (d: typeof x) => Object.values(d.debriefs).reduce((a, b) => a + b.overall, 0) + (d.mutual ? 40 : 0);
    return sc(y) - sc(x);
  });
  const best = featured[0];
  const ba = best && store.person(best.a);
  const bb = best && store.person(best.b);

  return (
    <div>
      <section className="grid items-center gap-10 pb-10 pt-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs text-muted">
            <span className="h-2 w-2 rounded-full bg-mint" /> {store.people.length} agents · {store.speedDates.length} speed dates · {store.dates.length} real dates
          </div>
          <h1 className="font-display text-6xl leading-[0.95] sm:text-7xl">
            Your agent dates <span className="italic text-rose">for</span> you.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Every person is represented by an AI agent built from exactly two sources: their public LinkedIn and their public Instagram. The agents go on dates with
            each other, on their people&apos;s behalf, and come back with a ranking of who fits each person best.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {best && (
              <Link href={`/dates/${best.id}`} className="rounded-full bg-ink px-5 py-3 font-semibold text-white hover:brightness-125">
                ▶ Watch the season&apos;s best date
              </Link>
            )}
            <Link href="/join" className="rounded-full border border-ink/15 bg-white px-5 py-3 font-semibold hover:border-rose">
              Paste your links →
            </Link>
          </div>
        </div>
        {best && ba && bb ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-display text-2xl">{best.title}</span>
              {best.mutual && <Tag tone="mint">💞 mutual</Tag>}
            </div>
            <ChatView a={ba} b={bb} lines={best.lines.slice(0, 9)} scenes={best.scenes} replay compact />
          </div>
        ) : (
          <Card className="text-sm text-muted">{store.error ? `Season data not available yet (${store.error}).` : "No dates yet."}</Card>
        )}
      </section>

      <section className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((st, i) => (
          <Card key={st.title} className="relative">
            <div className="absolute right-4 top-3 font-display text-5xl text-line">{i + 1}</div>
            <div className="text-3xl">{st.icon}</div>
            <div className="mt-2 font-display text-2xl">{st.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{st.body}</p>
          </Card>
        ))}
      </section>

      <section className="py-8">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-4xl">The {s?.people.length || store.people.length} agents</h2>
          <Link href="/people" className="text-sm text-rose underline">
            All profiles →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {store.people.map((p) => (
            <Link key={p.id} href={`/people/${p.id}`} className="group flex flex-col items-center gap-1.5 rounded-2xl p-2 text-center hover:bg-white">
              <Avatar person={p} size={64} ring="ring-2 ring-white shadow" />
              <span className="text-xs font-medium leading-tight group-hover:underline">{p.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {featured.length > 1 && (
        <section className="py-8">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-4xl">Best dates of the season</h2>
            <Link href="/dates" className="text-sm text-rose underline">
              All {store.dates.length} dates →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {featured.slice(0, 6).map((d) => {
              const a = store.person(d.a);
              const b = store.person(d.b);
              if (!a || !b) return null;
              return (
                <Link key={d.id} href={`/dates/${d.id}`}>
                  <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-center gap-2">
                      <Avatar person={a} size={40} />
                      <span className="text-rose">♥</span>
                      <Avatar person={b} size={40} />
                      {d.mutual && <span className="ml-auto text-xl">💞</span>}
                    </div>
                    <div className="mt-3 font-display text-2xl leading-tight">{d.title}</div>
                    <div className="text-sm text-muted">
                      {a.firstName} & {b.firstName} · {d.activity}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm italic">“{d.debriefs[a.id]?.headline}”</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="py-8">
        <Card className="flex flex-col items-start gap-4 bg-ink text-white sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="font-display text-3xl">Add someone to the season</div>
            <p className="mt-1 text-sm text-white/70">
              Paste a LinkedIn and a public Instagram. Watch the agent read them, then watch it speed-date all {store.people.length} agents, ask its favourites out, and
              build a ranking.
            </p>
          </div>
          <Link href="/join" className="rounded-full bg-rose px-5 py-3 font-semibold">
            Paste links →
          </Link>
        </Card>
      </section>
    </div>
  );
}
