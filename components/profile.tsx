"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Person, RawSources, Trait } from "@/lib/types";
import { useStore } from "./store";
import { ReadingView, SourcesPanel } from "./reading";
import { RankingList } from "./ranking";
import { Avatar, Bar, Card, SourceBadge, Tag, cx, fmt, verdictTone } from "./ui";

export function useRaw(p?: Person): RawSources | undefined {
  const [raw, setRaw] = useState<RawSources | undefined>(p?.raw);
  useEffect(() => {
    if (!p) return;
    if (p.raw) return setRaw(p.raw);
    fetch(`/season/raw/${p.id}.json`)
      .then((r) => (r.ok ? r.json() : undefined))
      .then((r) => r && setRaw(r))
      .catch(() => {});
  }, [p]);
  return raw;
}

function TraitGrid({ items, tone }: { items: Trait[]; tone: "rose" | "violet" | "mint" | "gold" }) {
  const border = { rose: "border-l-rose", violet: "border-l-violet", mint: "border-l-mint", gold: "border-l-gold" }[tone];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((t, i) => (
        <div key={i} className={cx("rounded-xl border border-l-4 border-line bg-card p-4", border)}>
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold leading-snug">{t.label}</div>
            <SourceBadge source={t.source} />
          </div>
          <p className="mt-1 text-sm leading-relaxed">{t.detail}</p>
          <p className="mt-2 text-xs italic text-muted">Evidence: {t.evidence}</p>
        </div>
      ))}
    </div>
  );
}

function Block({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 pt-10">
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-rose">{kicker}</div>
      <h3 className="mb-4 font-display text-3xl">{title}</h3>
      {children}
    </section>
  );
}

const SECTIONS = [
  ["read", "Read"],
  ["needs", "Needs"],
  ["hobbies", "Hobbies & interests"],
  ["personality", "Personality"],
  ["partner", "Ideal partner"],
  ["agent", "Agent brief"],
  ["notebook", "Notebook"],
  ["dates", "Dates"],
  ["ranking", "Ranking"],
  ["sources", "Sources"],
] as const;

export function ProfileView({ person }: { person: Person }) {
  const store = useStore();
  const raw = useRaw(person);
  const a = person.analysis;
  const [replay, setReplay] = useState(false);
  const myDates = store.dates.filter((d) => d.a === person.id || d.b === person.id);
  const myInvites = store.invitations.filter((i) => i.from === person.id || i.to === person.id);
  const mySpeed = store.speedDates.filter((s) => s.a === person.id || s.b === person.id);
  const top = store.rankingFor(person.id)[0];
  const topPerson = top ? store.person(top.otherId) : undefined;
  const b5 = a.personality.bigFive;

  return (
    <div>
      {/* Header */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar person={person} size={112} ring="ring-4 ring-white shadow-lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{a.location}</span>·<span>{a.pronouns}</span>
              {person.origin === "local" && <Tag tone="violet">added by you</Tag>}
            </div>
            <h1 className="mt-1 font-display text-5xl leading-[1.05] sm:text-6xl">{person.name}</h1>
            <p className="mt-2 max-w-2xl font-display text-2xl italic leading-snug text-[#4b3f55]">“{a.oneLiner}”</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={person.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-li">
                <SourceBadge source="linkedin" /> LinkedIn {person.stats?.linkedinFollowers ? <span className="text-muted">· {fmt(person.stats.linkedinFollowers)}</span> : null}
              </a>
              <a href={person.instagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-rose">
                <SourceBadge source="instagram" /> Instagram {person.stats?.instagramFollowers ? <span className="text-muted">· {fmt(person.stats.instagramFollowers)}</span> : null}
              </a>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
          </div>
        </div>
        <Card className="space-y-3 self-start">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Agent status</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-2xl font-semibold">{mySpeed.length}</div>
              <div className="text-[11px] text-muted">speed dates</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{myDates.length}</div>
              <div className="text-[11px] text-muted">real dates</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{myDates.filter((d) => d.mutual).length}</div>
              <div className="text-[11px] text-muted">mutual</div>
            </div>
          </div>
          {topPerson && (
            <Link href="#ranking" className="flex items-center gap-3 rounded-xl bg-rose-soft p-3 hover:brightness-[0.98]">
              <Avatar person={topPerson} size={40} />
              <div className="min-w-0 text-sm">
                <div className="text-xs text-muted">#1 fit</div>
                <div className="truncate font-semibold">{topPerson.name}</div>
              </div>
              <div className="ml-auto text-2xl font-semibold">{top!.score}</div>
            </Link>
          )}
          <div className="text-xs text-muted">
            Read confidence <b className="text-ink">{a.confidence.overall}%</b> — built from {person.stats?.experiences ?? "?"} roles, {person.stats?.linkedinPosts ?? "?"} LinkedIn posts,{" "}
            {person.stats?.instagramPosts ?? "?"} Instagram posts.
          </div>
        </Card>
      </div>

      {/* Section nav */}
      <div className="no-scrollbar sticky top-16 z-20 -mx-4 mt-8 flex gap-1 overflow-x-auto border-y border-line bg-bg/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-full sm:border sm:px-2">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-full px-3 py-1 text-sm text-muted hover:bg-white hover:text-ink">
            {label}
          </a>
        ))}
      </div>

      <Block id="read" kicker="The agent's read" title={`Who ${person.firstName} is`}>
        <Card>
          <p className="font-display text-2xl leading-snug">{a.summary}</p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Career drive</div>
              {a.careerDrive}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Love language (best guess)</div>
              <b>{a.loveLanguage.primary}</b> — {a.loveLanguage.why}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">What the sources don&apos;t say</div>
              {a.confidence.gaps.join(" · ")}
            </div>
          </div>
        </Card>
      </Block>

      <Block id="needs" kicker="Needs" title={`What ${person.firstName} needs from a partner`}>
        <TraitGrid items={a.needs} tone="rose" />
      </Block>

      <Block id="hobbies" kicker="Hobbies & interests" title="How they spend their time — and their attention">
        <div className="mb-2 text-sm font-semibold">Hobbies</div>
        <TraitGrid items={a.hobbies} tone="violet" />
        <div className="mb-2 mt-6 text-sm font-semibold">Interests</div>
        <TraitGrid items={a.interests} tone="gold" />
        <div className="mb-2 mt-6 text-sm font-semibold">Values</div>
        <TraitGrid items={a.values} tone="mint" />
      </Block>

      <Block id="personality" kicker="Personality & lifestyle" title="What they'd be like to date">
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <TraitGrid items={a.personality.traits} tone="violet" />
          <Card className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Big Five (estimated)</div>
            {(
              [
                ["Openness", b5.openness],
                ["Conscientiousness", b5.conscientiousness],
                ["Extraversion", b5.extraversion],
                ["Agreeableness", b5.agreeableness],
                ["Neuroticism", b5.neuroticism],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{k}</span>
                  <span className="text-muted">{v}</span>
                </div>
                <Bar value={v} tone={k === "Neuroticism" ? "gold" : "violet"} />
              </div>
            ))}
            <div className="border-t border-line pt-3 text-sm">
              <div>
                <span className="text-muted">Social energy:</span> <b className="capitalize">{a.personality.socialEnergy}</b>
              </div>
              <div className="mt-1">
                <span className="text-muted">Talks like:</span> {a.personality.communicationStyle}
              </div>
              <div className="mt-1">
                <span className="text-muted">Humour:</span> {a.personality.humor}
              </div>
            </div>
          </Card>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ["⚡ Pace", a.lifestyle.pace],
              ["🗓 Schedule", a.lifestyle.schedule],
              ["✈️ Travel", a.lifestyle.travel],
              ["🏃 Fitness", a.lifestyle.fitness],
              ["🥂 Social", a.lifestyle.social],
            ] as const
          ).map(([k, v]) => (
            <Card key={k} className="p-4">
              <div className="text-xs font-semibold text-muted">{k}</div>
              <div className="mt-1 text-sm">{v}</div>
            </Card>
          ))}
        </div>
      </Block>

      <Block id="partner" kicker="Fit" title="Who would be good for them">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Ideal partner</div>
            <p className="mt-2 font-display text-xl leading-snug">{a.idealPartner}</p>
          </Card>
          <Card>
            <div className="text-xs font-semibold uppercase tracking-wide text-mint">Green flags</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {a.greenFlags.map((g, i) => (
                <li key={i}>✓ {g}</li>
              ))}
            </ul>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-rose">Likely dealbreakers</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {a.dealbreakers.map((g, i) => (
                <li key={i}>✕ {g}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">First dates they&apos;d love</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {a.dateIdeas.map((g, i) => (
                <li key={i}>☕ {g}</li>
              ))}
            </ul>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Get them talking</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {a.conversationStarters.map((g, i) => (
                <li key={i}>💬 {g}</li>
              ))}
            </ul>
          </Card>
        </div>
      </Block>

      <Block id="agent" kicker="Agent brief" title={`How the agent will date for ${person.firstName}`}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Voice on dates</div>
            <p className="mt-2 text-sm">{a.agentBrief.voice}</p>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">True things it will share</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {a.agentBrief.sellingPoints.map((g, i) => (
                <li key={i}>• {g}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Its private agenda</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {a.agentBrief.agenda.map((g, i) => (
                <li key={i}>🎯 {g}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Questions it will ask</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {a.agentBrief.mustAsk.map((g, i) => (
                <li key={i}>❓ {g}</li>
              ))}
            </ul>
          </Card>
        </div>
      </Block>

      <Block id="notebook" kicker="How the agent read them" title="The reading, note by note">
        <div className="mb-3 flex items-center gap-3 text-sm text-muted">
          Every observation cites the LinkedIn or Instagram item it came from.
          <button onClick={() => setReplay((r) => !r)} className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
            {replay ? "Show all notes" : "▶ Watch the agent read"}
          </button>
        </div>
        <ReadingView key={replay ? "replay" : "static"} raw={raw} notes={person.notes} replay={replay} />
      </Block>

      <Block id="dates" kicker="Dating history" title={`${person.firstName}'s agent went out`}>
        {myInvites.length > 0 && (
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {myInvites.map((inv) => {
              const other = store.person(inv.from === person.id ? inv.to : inv.from);
              const d = myDates.find((x) => (x.a === inv.from && x.b === inv.to) || (x.a === inv.to && x.b === inv.from));
              if (!other) return null;
              const mine = d?.debriefs[person.id];
              return (
                <Link key={inv.id} href={d ? `/dates/${d.id}` : `/people/${other.id}`} className="block">
                  <Card className="h-full transition hover:border-rose/40">
                    <div className="flex items-center gap-3">
                      <Avatar person={other} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted">{inv.from === person.id ? `${person.firstName}'s agent asked` : `${other.firstName}'s agent asked`}</div>
                        <div className="truncate font-semibold">{other.name}</div>
                      </div>
                      {d ? (
                        <Tag tone={d.mutual ? "mint" : mine ? verdictTone(mine.verdict) : "plain"}>{d.mutual ? "💞 mutual" : mine?.verdict}</Tag>
                      ) : (
                        <Tag tone={inv.accepted ? "gold" : "rose"}>{inv.accepted ? "accepted" : "declined"}</Tag>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-muted">
                      {d ? (
                        <>
                          <b className="text-ink">{d.title}</b> · {d.activity} at {d.venue}
                        </>
                      ) : (
                        <>“{inv.reply}”</>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
        <details className="rounded-2xl border border-line bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">All {mySpeed.length} speed dates</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {mySpeed.map((s) => {
              const other = store.person(s.a === person.id ? s.b : s.a);
              if (!other) return null;
              const r = s.ratings[person.id];
              return (
                <Link key={s.id} href={`/dates/${s.id}`} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-bg">
                  <Avatar person={other} size={28} />
                  <span className="flex-1 truncate text-sm">{other.name}</span>
                  <span className="text-xs text-muted">{r ? `${r.score}/10` : ""}</span>
                </Link>
              );
            })}
          </div>
        </details>
      </Block>

      <Block id="ranking" kicker="Ranking" title={`Who fits ${person.firstName} best`}>
        <RankingList personId={person.id} />
      </Block>

      <Block id="sources" kicker="The only two sources" title="What the agent was allowed to read">
        {raw ? <SourcesPanel raw={raw} /> : <div className="text-sm text-muted">Loading…</div>}
      </Block>
    </div>
  );
}
