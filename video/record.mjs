// Records the demo video segments by driving the real site in Chrome.
//   node video/record.mjs            (site must be running at BASE_URL, default http://localhost:3000)
// Output: video/build/raw/*.webm + video/build/marks.json (segment start/end seconds per page video).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve("video/build");
const W = 1600;
const H = 900;
const JOIN_LI = process.env.JOIN_LI || "https://www.linkedin.com/in/kunalshah1/";
const JOIN_IG = process.env.JOIN_IG || "https://www.instagram.com/kunalb11/";
fs.rmSync(path.join(OUT, "raw"), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "raw"), { recursive: true });

const season = JSON.parse(fs.readFileSync("public/season/season.json", "utf8"));
const score = (d) => Object.values(d.debriefs).reduce((a, b) => a + b.overall, 0) + (d.mutual ? 40 : 0);
const best = [...season.dates].sort((a, b) => score(b) - score(a))[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: path.join(OUT, "raw"), size: { width: W, height: H } },
});
// Hide the Next.js dev indicator if present and make scrolling smooth.
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none!important} html{scroll-behavior:smooth}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});

const marks = { pages: {}, segments: [] };

async function newPage(name) {
  const page = await ctx.newPage();
  const t0 = Date.now();
  marks.pages[name] = { t0 };
  const mark = (seg, kind) => {
    const t = (Date.now() - t0) / 1000;
    let s = marks.segments.find((x) => x.name === seg);
    if (!s) marks.segments.push((s = { name: seg, page: name }));
    s[kind] = t;
  };
  return { page, mark };
}

async function smoothScroll(page, to, ms = 2500) {
  await page.evaluate(
    ([to, ms]) =>
      new Promise((res) => {
        const from = window.scrollY;
        const target = typeof to === "number" ? to : document.querySelector(to)?.getBoundingClientRect().top + window.scrollY - 90;
        const start = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - start) / ms);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          window.scrollTo(0, from + (target - from) * e);
          if (k < 1) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      }),
    [to, ms],
  );
}

async function closePage(name, page) {
  const v = page.video();
  await page.close();
  marks.pages[name].file = await v.path();
}

// ---------- 1. Intro: season home ----------
{
  const { page, mark } = await newPage("home");
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await sleep(1200);
  mark("intro", "start");
  await sleep(5000);
  await smoothScroll(page, 760, 4000);
  await sleep(2500);
  await smoothScroll(page, 1500, 4000);
  await sleep(3000);
  mark("intro", "end");
  await closePage("home", page);
}

// ---------- 2. Live: paste links → scrape → read → speed dates → invitations → date → ranking ----------
const { page: join, mark: jmark } = await newPage("join");
await join.goto(BASE + "/join", { waitUntil: "networkidle" });
await sleep(1000);
jmark("paste", "start");
await join.locator('input[placeholder*="linkedin"]').click();
await join.keyboard.type(JOIN_LI, { delay: 35 });
await sleep(300);
await join.locator('input[placeholder*="instagram"]').click();
await join.keyboard.type(JOIN_IG, { delay: 35 });
await sleep(500);
await join.locator("select").nth(1).selectOption("5");
await sleep(800);
await join.getByRole("button", { name: /Create their agent/ }).click();
await join.getByText("Scraping public profiles").waitFor({ timeout: 60_000 });
jmark("paste", "end");
jmark("scrape", "start");
await join.getByText(/The agent is reading/).waitFor({ timeout: 300_000 });
jmark("scrape", "end");
jmark("read", "start");
await join.getByText("Agent created").waitFor({ timeout: 600_000 });
jmark("read", "end");
const local = await join.evaluate(() => JSON.parse(localStorage.getItem("wingmate:v1") || "{}"));
const newId = local.people?.[local.people.length - 1]?.id;
console.log("new person:", newId);

// ---------- 3. Profile page of the person just added (recorded while the dates run) ----------
{
  const { page, mark } = await newPage("profile");
  await page.goto(`${BASE}/people/${newId}`, { waitUntil: "networkidle" });
  await sleep(1500);
  mark("profile", "start");
  await sleep(3500);
  for (const sel of ["#read", "#needs", "#hobbies", "#personality", "#partner", "#agent"]) {
    await smoothScroll(page, sel, 1800);
    await sleep(sel === "#needs" || sel === "#hobbies" ? 4200 : 3200);
  }
  await smoothScroll(page, "#notebook", 1800);
  await page.getByRole("button", { name: /Watch the agent read/ }).click();
  await sleep(9000);
  mark("profile", "end");
  await closePage("profile", page);
}

await join.bringToFront();
const scrollJoinToBottom = () => join.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
await join.getByText(/Speed-dating night/).waitFor({ timeout: 600_000 });
await scrollJoinToBottom();
jmark("speed", "start");
const scroller = setInterval(() => scrollJoinToBottom().catch(() => {}), 4000);
await join.getByText("💌 Invitations").waitFor({ timeout: 1_200_000 });
jmark("speed", "end");
jmark("invites", "start");
await join.getByText("On a date right now").waitFor({ timeout: 600_000 }).catch(() => {});
jmark("invites", "end");
jmark("livedate", "start");
await join.getByText(/^Who fits .* best$/).waitFor({ timeout: 1_800_000 });
jmark("livedate", "end");
clearInterval(scroller);
await sleep(800);
await join.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((x) => /Who fits/.test(x.textContent || ""));
  h?.scrollIntoView({ behavior: "smooth", block: "start" });
});
await sleep(1500);
jmark("joinrank", "start");
await sleep(7000);
jmark("joinrank", "end");
await closePage("join", join);

// ---------- 4. A full date from the season, replayed ----------
{
  const { page, mark } = await newPage("date");
  await page.goto(`${BASE}/dates/${best.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "2×" }).click();
  await sleep(500);
  mark("seasondate", "start");
  await sleep(4000);
  await smoothScroll(page, 420, 1500);
  await sleep(30000);
  mark("seasondate", "end");
  await page.getByRole("button", { name: "Skip to end" }).click();
  await sleep(500);
  mark("debrief", "start");
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => /private debriefs/.test(x.textContent || ""));
    h?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  await sleep(9000);
  mark("debrief", "end");
  await closePage("date", page);
}

// ---------- 5. Rankings ----------
{
  const { page, mark } = await newPage("rankings");
  await page.goto(`${BASE}/rankings?p=${newId}`, { waitUntil: "networkidle" });
  await sleep(1200);
  mark("rankings", "start");
  await sleep(6000);
  const other = best.a;
  await page.goto(`${BASE}/rankings?p=${other}`, { waitUntil: "networkidle" });
  await sleep(5000);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h3")].find((x) => /at a glance/.test(x.textContent || ""));
    h?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  await sleep(6000);
  mark("rankings", "end");
  await closePage("rankings", page);
}

// ---------- 6. Outro ----------
{
  const { page, mark } = await newPage("outro");
  await page.goto(BASE + "/people", { waitUntil: "networkidle" });
  await sleep(1000);
  mark("outro", "start");
  await sleep(3000);
  await smoothScroll(page, 900, 3500);
  await sleep(2000);
  mark("outro", "end");
  await closePage("outro", page);
}

marks.newId = newId;
marks.bestDate = best.id;
fs.writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 2));
await Promise.race([ctx.close().then(() => browser.close()), sleep(15000)]);
console.log("recorded", Object.keys(marks.pages).length, "pages");
process.exit(0);
