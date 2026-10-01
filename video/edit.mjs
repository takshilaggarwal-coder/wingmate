// Assembles the demo video from the recorded segments: narration (macOS `say`), burned-in subtitles
// (rendered as PNGs with Chrome, since this ffmpeg has no text filters), speed-ups, and concatenation.
//   node video/edit.mjs   →  video/build/wingmate-demo.mp4
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const OUT = path.resolve("video/build");
const TMP = path.join(OUT, "tmp");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const marks = JSON.parse(fs.readFileSync(path.join(OUT, "marks.json"), "utf8"));
const VOICE = process.env.VOICE || "Samantha";
const RATE = process.env.RATE || "182";
const FPS = 30;

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const ff = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const dur = (f) => parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));

const SECTIONS = [
  {
    name: "intro",
    clips: [["home", "intro"]],
    say: [
      "This is Wingmate, an agentic dating site.",
      "Every person is represented by an AI agent, built from exactly two sources: their public LinkedIn, and their public Instagram.",
      "Twenty-five real people are already in this season, and their agents have been dating each other.",
    ],
  },
  {
    name: "paste",
    clips: [
      ["join", "paste"],
      ["join", "scrape"],
    ],
    say: [
      "Let's add someone live. We paste an official LinkedIn and a public Instagram.",
      "Apify runs three scrapers in parallel: the LinkedIn profile, the LinkedIn posts, and the Instagram profile with its latest posts.",
    ],
  },
  {
    name: "read",
    clips: [["join", "read"]],
    say: [
      "Now the agent reads.",
      "Every note cites the exact role, post, or photo it came from, and that source lights up while it reads.",
      "Then it writes a structured dossier.",
    ],
  },
  {
    name: "profile",
    clips: [["profile", "profile"]],
    say: [
      "This is the profile page.",
      "What this person needs from a partner, with the evidence for each need.",
      "Their hobbies, interests and values.",
      "A personality read, lifestyle, ideal partner, and likely dealbreakers.",
      "And the private brief the agent follows when it dates on their behalf.",
      "You can even replay the reading, note by note.",
    ],
  },
  {
    name: "speed",
    clips: [["join", "speed"]],
    say: [
      "Then the agent goes out. First, speed dating: a matchmaker seats it with its most promising matches.",
      "Each agent only knows its own person. Everything about the other side, it learns at the table.",
      "The dashed notes are private thoughts for its human, and the meters show how it's going.",
    ],
  },
  {
    name: "livedate",
    clips: [
      ["join", "invites"],
      ["join", "livedate"],
    ],
    say: [
      "Next, it asks its favourites out, and the other agents can say no.",
      "A Date Director plans four scenes, each with a curveball, and the two agents go on a real date.",
    ],
  },
  {
    name: "seasondate",
    clips: [["date", "seasondate"]],
    say: [
      "Here is a full date from the season.",
      "The agents probe each other's needs, react to the curveballs, and name friction honestly, instead of glossing over it.",
    ],
  },
  {
    name: "debrief",
    clips: [["date", "debrief"]],
    say: ["Afterwards, each agent writes a private debrief for its own human: six scores, green flags, concerns, and a verdict."],
  },
  {
    name: "rankings",
    clips: [
      ["join", "joinrank"],
      ["rankings", "rankings"],
    ],
    say: [
      "Finally, the rankings.",
      "For every person, fit combines what their own agent concluded, what the other agent concluded, and a matchmaker forecast.",
      "Mutual second dates are marked. And here is the whole season at a glance.",
    ],
  },
  {
    name: "outro",
    clips: [["outro", "outro"]],
    say: ["Wingmate. Your agent dates for you.", "The site is live: paste your own links, and try it."],
  },
];

// ---------- subtitle + badge PNGs ----------
const browser = await chromium.launch({ channel: "chrome", headless: true });
const pg = await browser.newPage({ viewport: { width: 1920, height: 160 }, deviceScaleFactor: 1 });
async function png(file, html, height = 160) {
  await pg.setViewportSize({ width: 1920, height });
  await pg.setContent(
    `<html><body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:${height}px;font-family:-apple-system,Inter,Helvetica,sans-serif">${html}</body></html>`,
  );
  await pg.screenshot({ path: file, omitBackground: true });
}
const caption = (text) =>
  `<div style="max-width:1500px;background:rgba(20,16,26,.86);color:#fff;font-size:38px;line-height:1.3;font-weight:500;padding:16px 30px;border-radius:18px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.25)">${text}</div>`;

// ---------- build each section ----------
const sectionFiles = [];
let total = 0;
for (const sec of SECTIONS) {
  const dir = path.join(TMP, sec.name);
  fs.mkdirSync(dir);

  // narration
  const lines = [];
  let t = 0.35;
  const parts = [];
  ff(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.35", path.join(dir, "lead.wav")]);
  parts.push("lead.wav");
  for (let i = 0; i < sec.say.length; i++) {
    const aiff = path.join(dir, `s${i}.aiff`);
    run("say", ["-v", VOICE, "-r", RATE, "-o", aiff, sec.say[i]]);
    const wav = path.join(dir, `s${i}.wav`);
    ff(["-i", aiff, "-ar", "44100", "-ac", "1", wav]);
    const d = dur(wav);
    lines.push({ text: sec.say[i], start: t, end: t + d + 0.15 });
    t += d;
    parts.push(`s${i}.wav`);
    if (i < sec.say.length - 1) {
      ff(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.3", path.join(dir, `g${i}.wav`)]);
      parts.push(`g${i}.wav`);
      t += 0.3;
    }
  }
  ff(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.7", path.join(dir, "tail.wav")]);
  parts.push("tail.wav");
  t += 0.7;
  fs.writeFileSync(path.join(dir, "audio.txt"), parts.map((p) => `file '${p}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", path.join(dir, "audio.txt"), "-c:a", "pcm_s16le", path.join(dir, "audio.wav")]);
  const T = dur(path.join(dir, "audio.wav"));

  // video parts
  const vparts = [];
  for (const [pageName, segName] of sec.clips) {
    const s = marks.segments.find((x) => x.name === segName);
    const file = marks.pages[pageName]?.file;
    if (!s || !file || s.start === undefined || s.end === undefined) {
      console.warn(`  ! missing clip ${pageName}/${segName}`);
      continue;
    }
    const out = path.join(dir, `v${vparts.length}.mp4`);
    ff([
      "-ss", String(Math.max(0, s.start)), "-to", String(s.end), "-i", file,
      "-vf", `fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p`,
      "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", out,
    ]);
    vparts.push(path.basename(out));
  }
  fs.writeFileSync(path.join(dir, "video.txt"), vparts.map((p) => `file '${p}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", path.join(dir, "video.txt"), "-c", "copy", path.join(dir, "raw.mp4")]);
  const D = dur(path.join(dir, "raw.mp4"));

  // fit video to narration: speed up long clips, freeze the last frame on short ones
  const k = Math.min(1, T / D);
  const pad = Math.max(0, T - D * k);
  const speedLabel = D / T > 1.4 ? `${Math.round(D / T)}× speed` : "";

  const inputs = ["-i", path.join(dir, "raw.mp4")];
  for (let i = 0; i < lines.length; i++) {
    const f = path.join(dir, `c${i}.png`);
    await png(f, caption(lines[i].text));
    inputs.push("-i", f);
  }
  let badgeIdx = -1;
  if (speedLabel) {
    const f = path.join(dir, "badge.png");
    await png(f, `<div style="background:rgba(232,67,107,.95);color:#fff;font-size:30px;font-weight:700;padding:8px 18px;border-radius:999px">⏩ ${speedLabel}</div>`, 80);
    inputs.push("-i", f);
    badgeIdx = lines.length + 1;
  }
  inputs.push("-i", path.join(dir, "audio.wav"));
  const audioIdx = inputs.filter((x) => x === "-i").length - 1;

  let fc = `[0:v]setpts=PTS*${k.toFixed(5)},fps=${FPS}${pad > 0 ? `,tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}` : ""}[v0]`;
  let last = "v0";
  lines.forEach((l, i) => {
    fc += `;[${last}][${i + 1}:v]overlay=(W-w)/2:H-h-36:enable='between(t,${l.start.toFixed(2)},${l.end.toFixed(2)})'[v${i + 1}]`;
    last = `v${i + 1}`;
  });
  if (badgeIdx > 0) {
    fc += `;[${last}][${badgeIdx}:v]overlay=W-w-24:20[vb]`;
    last = "vb";
  }
  const secFile = path.join(TMP, `${String(sectionFiles.length).padStart(2, "0")}-${sec.name}.mp4`);
  ff([
    ...inputs,
    "-filter_complex", fc,
    "-map", `[${last}]`, "-map", `${audioIdx}:a`,
    "-t", T.toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
    secFile,
  ]);
  sectionFiles.push(secFile);
  total += T;
  console.log(`${sec.name}: clip ${D.toFixed(1)}s → ${T.toFixed(1)}s${speedLabel ? ` (${speedLabel})` : ""}`);
}
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);

fs.writeFileSync(path.join(TMP, "sections.txt"), sectionFiles.map((f) => `file '${f}'`).join("\n"));
const final = path.join(OUT, "wingmate-demo.mp4");
ff(["-f", "concat", "-safe", "0", "-i", path.join(TMP, "sections.txt"), "-c", "copy", "-movflags", "+faststart", final]);
console.log(`\nwrote ${final} — ${dur(final).toFixed(1)}s total (target ≤ 180s)`);
process.exit(0);
