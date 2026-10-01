"use client";
import type { Debrief, Person } from "@/lib/types";
import { Avatar, Bar, Card, ScoreRing, Tag, verdictTone } from "./ui";

const DIMS: [keyof Debrief["dimensions"], string][] = [
  ["values", "Values"],
  ["lifestyle", "Lifestyle"],
  ["ambition", "Ambition"],
  ["communication", "Communication"],
  ["interests", "Shared interests"],
  ["chemistry", "Chemistry"],
];

export function DebriefCard({ me, other, d, tone }: { me: Person; other: Person; d: Debrief; tone: "rose" | "violet" }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <Avatar person={me} size={44} ring={tone === "rose" ? "ring-2 ring-rose" : "ring-2 ring-violet"} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">
            🔒 {me.firstName}&apos;s agent → private debrief for {me.firstName}
          </div>
          <div className="mt-0.5 font-display text-xl leading-snug">“{d.headline}”</div>
          <div className="mt-1.5">
            <Tag tone={verdictTone(d.verdict)}>{d.verdict === "second date" ? "💞 Second date" : d.verdict === "maybe" ? "🤔 Maybe" : "🙅 Pass"}</Tag>
          </div>
        </div>
        <ScoreRing value={d.overall} label="fit" tone={tone} />
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {DIMS.map(([k, label]) => (
          <div key={k} title={d.dimensions[k].note}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-muted">{label}</span>
              <span className="font-semibold">{d.dimensions[k].score}/10</span>
            </div>
            <Bar value={d.dimensions[k].score * 10} tone={tone} />
            <div className="mt-1 text-[11px] leading-snug text-muted">{d.dimensions[k].note}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold text-mint">Green flags</div>
          <ul className="space-y-1 text-sm">
            {d.greenFlags.map((g, i) => (
              <li key={i}>✓ {g}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-rose">Concerns</div>
          <ul className="space-y-1 text-sm">
            {d.concerns.length ? d.concerns.map((g, i) => <li key={i}>• {g}</li>) : <li className="text-muted">None worth flagging.</li>}
          </ul>
        </div>
      </div>
      <div className="rounded-xl bg-bg px-3.5 py-2.5 text-sm">
        <span className="font-semibold">Best moment:</span> {d.bestMoment}
      </div>
      <div className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm leading-relaxed">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Note to {me.firstName} about {other.firstName}</div>
        {d.toMyHuman}
      </div>
    </Card>
  );
}
