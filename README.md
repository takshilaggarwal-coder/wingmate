# Wingmate: your agent dates for you

Every person is represented by an AI agent built from exactly two sources: their public LinkedIn and their public Instagram. The agents date each other on their people's behalf, and each person gets a ranking of who fits them best.

- **Live site:** _add the Vercel URL here_
- **Demo (the finished 25-person season):** the live site's home page, [`/people`](#), [`/dates`](#) and [`/rankings`](#)
- **Video:** _add the YouTube URL here_

```
LinkedIn (public) + Instagram (public)
        ↓  Apify scrapers
The agent reads both → cited field notes → structured dossier
        ↓
Profile page: needs · hobbies · interests · values · personality · ideal partner
        ↓
The agents date: speed-dating night → invitations → 4-scene real dates → private debriefs
        ↓
Ranking: who fits each person best
```

## What it does

1. **Find the people.** `data/people.json` lists the real people in the season. Each person is exactly two official links: LinkedIn and a public Instagram.
2. **Each agent reads its person.** Apify scrapes both profiles. The agent (a free open-weight LLM) reads every role, post, caption and up to six photos. It streams field notes, each citing the item it came from (`[ig-post-4]`, `[li-exp-2]`, …), then writes a schema-validated dossier with evidence for every trait: relationship needs, hobbies, interests, values, personality (traits + Big Five estimate), lifestyle, love-language guess, ideal partner, green flags, dealbreakers, and a private brief for how to date on the person's behalf. The profile page shows all of it, plus a replay of the reading.
3. **The agents date.** Each agent is its own model call with its own system prompt: its person's private dossier, a voice, and an agenda. It never sees the other person's dossier, only a dating-app style public card. What it learns about the other side, it learns on the date.
   - **Speed-dating night:** a matchmaker seats every agent with its 8 most promising matches (by the forecast below). Each table is four messages; with its last message each agent privately rates the other (1–10, would ask out?).
   - **Invitations:** every agent asks out its top two. The receiving agent decides on its own person's behalf and can decline.
   - **Real dates:** a neutral *Date Director* plans four scenes at the chosen venue, each with a curveball. The agents talk for 16 turns, remember their speed date, probe needs and dealbreakers, and name friction rather than glossing over it. Every message also carries a private note to the agent's human and a −2…+2 signal that drives the live "feeling it" meters.
   - **Debriefs:** each agent writes a private report to its own human: six dimension scores, green flags, concerns, the best moment, a verdict (second date / maybe / pass) and an overall fit from 0 to 100.
4. **Each person gets a ranking.** For every person, each other person gets a fit score: **55%** from what the person's own agent concluded, **30%** from what the other agent concluded about them (fit has to work both ways), and **15%** from a transparent matchmaker forecast (shared tags, Big Five similarity, social energy, values overlap). Real-date debriefs outweigh speed-date ratings. Pairs who never met are ranked on the forecast alone. 💞 marks mutual second dates.

## Try it

Open **Add someone** (`/join`) and paste a LinkedIn URL and a public Instagram URL. You can watch every step: the three scraper runs, the agent reading with each cited source lighting up, the profile, then the new agent speed-dating every agent in the season, sending and receiving invitations, going on real dates live, and finally its ranking. Whatever you add is saved in your browser's localStorage and merged into every page, including the other agents' rankings.

## Tech stack

| Layer | What |
| --- | --- |
| Scraping | [Apify](https://apify.com) REST API, 3 actors run in parallel with no cookies or logins: `harvestapi/linkedin-profile-scraper` (headline, about, experience, education, skills), `harvestapi/linkedin-profile-posts` (about 10 recent posts), `apify/instagram-profile-scraper` (bio, category, followers, latest 12 posts with captions, hashtags, locations, images). Private Instagram accounts are rejected. `lib/apify.ts` normalises both into one schema. |
| Agents | **Free LLM APIs only.** Default: the Gemini API free tier (one Google AI Studio key) with a pool of models that each have their own free quota (`gemini-flash-lite-latest`, `gemini-flash-latest`, `gemini-2.5-flash-lite`, `gemma-3-27b-it`); the scheduler paces each model under its free RPM and rotates to the next model, then the next provider, on rate limits or daily-quota exhaustion. Any OpenAI-compatible provider can be added as a fallback: Groq, NVIDIA NIM, Cerebras, OpenRouter, Mistral, xAI (`lib/llm.ts`). Every agent turn, rating, invitation, date plan and debrief is JSON validated against a zod schema, with a repair retry. Instagram photos are fetched server-side and passed to the vision model. |
| App | Next.js 15 (App Router) + TypeScript + Tailwind v4. API routes stream NDJSON so the reading and the dates render live. |
| Data | The 25-person season was produced offline with the same code (`npm run season`) and ships as static JSON in `public/season/`. People added live are stored client-side. |

```
lib/apify.ts      scraping + normalisation
lib/analyze.ts    reading notes (streamed) + dossier (structured)
lib/dating.ts     the dating harness: agents, speed dates, invitations, Date Director, real dates, debriefs
lib/ranking.ts    matchmaker forecast + ranking formula
scripts/run-season.ts   runs the whole season end to end, cached and resumable
app/              pages (season, agents, profile, dates, rankings, join, how) + API routes
```

## Run it locally

```bash
npm install
cp .env.example .env.local   # add APIFY_TOKEN and GEMINI_API_KEY (both free)
npm run dev                  # http://localhost:3000
```

Re-run the season (scrapes, reads, and dates everyone in `data/people.json`; every step is cached in `data/cache/`):

```bash
npm run season                    # full season (25 people, 8 speed dates each, 2 invitations each)
npm run season -- --speed-k 0     # everyone speed-dates everyone (needs more free quota)
npm run season -- --limit 6       # quick test
```

Deploy on Vercel: import the repo, set `APIFY_TOKEN` and `GEMINI_API_KEY` (plus any optional fallback keys), deploy. Optional env: `LLM_PROVIDER`, `LLM_MODELS`, `LLM_CONCURRENCY`.

## The people

See [`data/people.json`](data/people.json). They are public figures (founders, authors, creators) with official LinkedIn profiles and public Instagram accounts.

## Ground rules

- Only public profiles, and only these two sources. The agents are told to ignore anything they know about a person from anywhere else.
- Agents speak as agents ("Logan's agent") and never impersonate the person.
- Agents never discuss anyone's real partners, looks, health or sexuality. Orientation is never inferred; you can set a preference when you add someone.
- This is a simulation. It says nothing about anyone's real relationships and is not affiliated with or endorsed by the people shown.
# wingmate
