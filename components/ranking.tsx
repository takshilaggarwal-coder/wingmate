"use client";
import Link from "next/link";
import type { RankingEntry } from "@/lib/types";
import { matchesPreference } from "@/lib/ranking";
import { useStore } from "./store";
import { Avatar, Tag, cx } from "./ui";

export function basisLabel(b: RankingEntry["basis"]) {
  return b === "date" ? "after a real date" : b === "speed" ? "after speed dating" : "forecast only";
}

export function RankingList({ personId, limit = 24, respectPreference = true }: { personId: string; limit?: number; respectPreference?: boolean }) {
  const store = useStore();
  const me = store.person(personId);
  if (!me) return null;
  const list = store.rankingFor(personId).filter((r) => {
    const o = store.person(r.otherId);
    return o && (!respectPreference || matchesPreference(me.interestedIn || "anyone", o));
  });
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {list.slice(0, limit).map((r, i) => {
        const o = store.person(r.otherId)!;
        const href = r.dateId ? `/dates/${r.dateId}` : r.speedId ? `/dates/${r.speedId}` : `/people/${o.id}`;
        return (
          <li key={r.otherId} className={cx("flex items-center gap-3 px-4 py-3", i === 0 && "bg-rose-soft/50")}>
            <div className={cx("w-7 shrink-0 text-center font-display text-2xl", i < 3 ? "text-rose" : "text-muted")}>{i + 1}</div>
            <Link href={`/people/${o.id}`}>
              <Avatar person={o} size={42} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/people/${o.id}`} className="font-semibold hover:underline">
                  {o.name}
                </Link>
                {r.mutual && <Tag tone="mint">💞 mutual</Tag>}
                <span className="text-[11px] text-muted">{basisLabel(r.basis)}</span>
              </div>
              <Link href={href} className="line-clamp-2 text-sm text-muted hover:text-ink">
                {r.reason}
              </Link>
            </div>
            <div className="hidden w-40 shrink-0 text-right text-[11px] leading-tight text-muted sm:block">
              {r.myView !== null && <div>{me.firstName}&apos;s agent: <b className="text-ink">{r.myView}</b></div>}
              {r.theirView !== null && <div>{o.firstName}&apos;s agent: <b className="text-ink">{r.theirView}</b></div>}
              <div>forecast: {r.prior}</div>
            </div>
            <div className="w-14 shrink-0 text-right">
              <div className="text-2xl font-semibold leading-none">{r.score}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted">fit</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
