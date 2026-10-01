"use client";
import { useStore } from "@/components/store";
import { Card, SectionTitle } from "@/components/ui";

function Flow() {
  const box = "rounded-xl border border-line bg-white px-4 py-3 text-center text-sm";
  const arrow = <div className="text-center text-xl text-muted">↓</div>;
  return (
    <div className="mx-auto max-w-xl space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div className={box}>
          <b className="text-li">LinkedIn</b>
          <div className="text-xs text-muted">profile + recent posts</div>
        </div>
        <div className={box}>
          <b className="text-rose">Instagram</b>
          <div className="text-xs text-muted">bio + latest posts + photos</div>
        </div>
      </div>
      {arrow}
      <div className={box}>
        <b>Agent reads both</b>
        <div className="text-xs text-muted">cited field notes → structured dossier</div>
      </div>
      {arrow}
      <div className={box}>
        <b>Profile page</b>
        <div className="text-xs text-muted">needs · hobbies · interests · values · personality · ideal partner</div>
      </div>
      {arrow}
      <div className={box}>
        <b>Agents date</b>
        <div className="text-xs text-muted">speed-dating night → invitations → 4-scene real dates → private debriefs</div>
      </div>
      {arrow}
      <div className={box}>
        <b>Ranking</b>
        <div className="text-xs text-muted">who fits each person best</div>
      </div>
    </div>
  );
}

export default function HowPage() {
  const store = useStore();
  const s = store.season;
  return (
    <div className="pt-10">
      <SectionTitle kicker="How it works" title="One person, one agent, two sources" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Flow />
        <div className="space-y-4 text-[15px] leading-relaxed">
          <Card>
            <h3 className="font-display text-2xl">1 · Scraping (Apify)</h3>
            <p className="mt-1 text-muted">
              Three Apify actors run in parallel, no cookies or logins: <code>harvestapi/linkedin-profile-scraper</code> (headline, about, experience, education,
              skills), <code>harvestapi/linkedin-profile-posts</code> (the last ~10 posts) and <code>apify/instagram-profile-scraper</code> (bio, category, followers and
              the latest 12 posts with captions, hashtags, locations and images). Private Instagram accounts are rejected. Output is normalised into one schema.
            </p>
          </Card>
          <Card>
            <h3 className="font-display text-2xl">2 · Reading (the analysis)</h3>
            <p className="mt-1 text-muted">
              The agent (Grok, via xAI&apos;s API) gets the two sources and up to six Instagram photos. First it streams field notes — one observation per item, each
              citing the exact LinkedIn or Instagram item it came from (<code>[ig-post-4]</code>, <code>[li-exp-2]</code>…). Then it writes a schema-validated dossier:
              5 relationship needs, hobbies, interests, values, personality traits + Big Five estimate, lifestyle, love language guess, ideal partner, green flags,
              dealbreakers, and a private brief for how to date on the person&apos;s behalf. Every trait carries its evidence. It is told to ignore anything it knows
              about the person from outside the two sources, and to list what the sources don&apos;t reveal instead of inventing it.
            </p>
          </Card>
          <Card>
            <h3 className="font-display text-2xl">3 · Dating (the harness)</h3>
            <p className="mt-1 text-muted">
              Every agent is a separate model call with its own system prompt: its person&apos;s private dossier, its voice, its agenda. It never sees the other
              person&apos;s dossier — only a dating-app style public card (name, one-liner, a few tags). What it learns about the other side, it learns on the date.
              Each message returns what the agent says out loud, a private note to its human, and a signal (−2…+2) that drives the live &quot;feeling it&quot; meters.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
              <li>
                <b className="text-ink">Speed-dating night:</b> every pair meets for four messages, then both agents rate privately (1–10, would-ask-out).
              </li>
              <li>
                <b className="text-ink">Invitations:</b> each agent asks out its top 3. The receiving agent decides on its person&apos;s behalf, and can say no.
              </li>
              <li>
                <b className="text-ink">Real dates:</b> a neutral Date Director designs four scenes at the chosen venue, each with a curveball. The agents talk for 16
                turns, remembering their speed date, probing needs and dealbreakers, and naming friction instead of glossing over it.
              </li>
              <li>
                <b className="text-ink">Debriefs:</b> each agent writes a private report to its own human — six dimension scores, green flags, concerns, best moment,
                verdict (second date / maybe / pass) and an overall fit.
              </li>
            </ul>
          </Card>
          <Card>
            <h3 className="font-display text-2xl">4 · Ranking</h3>
            <p className="mt-1 text-muted">
              For each person, every other person gets a fit score: <b className="text-ink">55%</b> what their own agent concluded, <b className="text-ink">30%</b> what
              the other agent concluded about them (fit is two-way), <b className="text-ink">15%</b> a transparent matchmaker forecast (shared tags, Big Five similarity,
              social energy, values overlap). Real-date debriefs outweigh speed-date ratings; pairs that never met are ranked on forecast only. 💞 marks mutual second
              dates.
            </p>
          </Card>
          <Card>
            <h3 className="font-display text-2xl">Stack</h3>
            <p className="mt-1 text-muted">
              Next.js 15 (App Router) + TypeScript + Tailwind on Vercel. API routes stream NDJSON so you watch the reading and the dates live. Apify REST API for
              scraping. xAI Grok ({s?.model || "grok-4.7"}) through the OpenAI-compatible SDK with JSON-schema structured outputs (zod). The 25-person season was run
              offline with the exact same code (<code>npm run season</code>) and ships as static JSON; people you add live are stored in your browser.
            </p>
          </Card>
          <Card className="bg-gold-soft">
            <h3 className="font-display text-2xl">Ground rules</h3>
            <p className="mt-1 text-[#6b4a10]">
              Only public profiles, only two sources. Agents speak as agents (&quot;Logan&apos;s agent&quot;), never impersonate the person, and are instructed never to
              discuss anyone&apos;s real partners, looks, health or sexuality. Orientation is never inferred; you can set a preference when you add someone. This is a
              simulation and says nothing about anyone&apos;s real relationships.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
