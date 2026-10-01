"use client";
import Link from "next/link";
import type { Person, TraitSource } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const GRADS = [
  "from-rose-400 to-orange-300",
  "from-violet-500 to-fuchsia-400",
  "from-sky-500 to-cyan-300",
  "from-emerald-500 to-lime-300",
  "from-amber-500 to-rose-400",
];

export function imgSrc(u?: string): string | undefined {
  if (!u) return undefined;
  if (u.startsWith("/") || u.startsWith("data:")) return u;
  return `/api/img?u=${encodeURIComponent(u)}`;
}

export function Avatar({ person, size = 48, ring }: { person?: Pick<Person, "name" | "avatar" | "id">; size?: number; ring?: string }) {
  const name = person?.name || "?";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const g = GRADS[(person?.id || name).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % GRADS.length];
  const style = { width: size, height: size };
  if (person?.avatar)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imgSrc(person.avatar)} alt={name} style={style} className={cx("shrink-0 rounded-full object-cover", ring)} />
    );
  return (
    <div style={{ ...style, fontSize: size * 0.38 }} className={cx("flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white", g, ring)}>
      {initials}
    </div>
  );
}

export function SourceBadge({ source, className }: { source: TraitSource | "synthesis"; className?: string }) {
  if (source === "linkedin")
    return <span className={cx("inline-flex h-5 items-center rounded bg-li px-1.5 text-[10px] font-bold text-white", className)}>in</span>;
  if (source === "instagram")
    return <span className={cx("ig-gradient inline-flex h-5 items-center rounded px-1.5 text-[10px] font-bold text-white", className)}>IG</span>;
  return (
    <span className={cx("inline-flex h-5 items-center gap-0.5 rounded bg-ink px-1.5 text-[10px] font-bold text-white", className)}>
      in+IG
    </span>
  );
}

export function Tag({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "rose" | "violet" | "mint" | "gold" }) {
  const tones = {
    plain: "bg-white border-line text-ink",
    rose: "bg-rose-soft border-rose/20 text-rose",
    violet: "bg-violet-soft border-violet/20 text-violet",
    mint: "bg-mint-soft border-mint/20 text-mint",
    gold: "bg-gold-soft border-gold/20 text-gold",
  };
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-line bg-card p-5 shadow-[0_1px_0_rgba(0,0,0,0.03)]", className)}>{children}</div>;
}

export function SectionTitle({ kicker, title, children }: { kicker?: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-rose">{kicker}</div>}
        <h2 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function ScoreRing({ value, size = 56, label, tone = "rose" }: { value: number; size?: number; label?: string; tone?: "rose" | "violet" | "mint" }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const col = { rose: "#e8436b", violet: "#6b4eff", mint: "#138a5e" }[tone];
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#efe6de" strokeWidth={6} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="font-semibold" style={{ fontSize: size * 0.28 }}>
          {Math.round(v)}
        </div>
        {label && <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">{label}</div>}
      </div>
    </div>
  );
}

export function Bar({ value, tone = "violet" }: { value: number; tone?: "violet" | "rose" | "mint" | "gold" }) {
  const col = { violet: "bg-violet", rose: "bg-rose", mint: "bg-mint", gold: "bg-gold" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#f1e9e2]">
      <div className={cx("h-full rounded-full", col)} style={{ width: `${Math.max(2, Math.min(100, value))}%`, transition: "width .6s ease" }} />
    </div>
  );
}

export function PersonChip({ person, href = true, size = 28 }: { person?: Person; href?: boolean; size?: number }) {
  if (!person) return null;
  const inner = (
    <span className="inline-flex items-center gap-2">
      <Avatar person={person} size={size} />
      <span className="font-medium">{person.name}</span>
    </span>
  );
  return href ? (
    <Link href={`/people/${person.id}`} className="hover:underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Typing() {
  return (
    <span className="inline-flex gap-1">
      <span className="dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="dot h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}

export function Loading({ label = "Loading the season…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-24 text-muted">
      <Typing /> {label}
    </div>
  );
}

export function fmt(n?: number) {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export function verdictTone(v: string): "mint" | "gold" | "rose" {
  return v === "second date" ? "mint" : v === "maybe" ? "gold" : "rose";
}
