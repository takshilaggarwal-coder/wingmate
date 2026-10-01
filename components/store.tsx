"use client";
// Client data store: the pre-run season (static JSON) + anything the visitor adds in their browser.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { FullDate, Invitation, Person, Season, SpeedDate } from "@/lib/types";
import { indexes, rankFor, type Indexes } from "@/lib/ranking";

interface LocalData {
  people: Person[];
  speedDates: SpeedDate[];
  invitations: Invitation[];
  dates: FullDate[];
}

const EMPTY: LocalData = { people: [], speedDates: [], invitations: [], dates: [] };
const KEY = "wingmate:v1";

interface StoreValue {
  ready: boolean;
  error: string | null;
  season: Season | null;
  local: LocalData;
  people: Person[];
  speedDates: SpeedDate[];
  invitations: Invitation[];
  dates: FullDate[];
  idx: Indexes;
  person: (id: string) => Person | undefined;
  rankingFor: (id: string) => ReturnType<typeof rankFor>;
  addPerson: (p: Person) => void;
  addSpeedDate: (s: SpeedDate) => void;
  addInvitation: (i: Invitation) => void;
  addDate: (d: FullDate) => void;
  removeLocalPerson: (id: string) => void;
}

const Ctx = createContext<StoreValue | null>(null);

function loadLocal(): LocalData {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return EMPTY;
    const v = JSON.parse(s) as Partial<LocalData>;
    return { people: v.people || [], speedDates: v.speedDates || [], invitations: v.invitations || [], dates: v.dates || [] };
  } catch {
    return EMPTY;
  }
}

function saveLocal(d: LocalData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // Storage full or blocked: the session still works in memory.
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [season, setSeason] = useState<Season | null>(null);
  const [local, setLocal] = useState<LocalData>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(loadLocal());
    fetch("/season/season.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`season ${r.status}`))))
      .then((s: Season) => setSeason(s))
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((fn: (d: LocalData) => LocalData) => {
    setLocal((prev) => {
      const next = fn(prev);
      saveLocal(next);
      return next;
    });
  }, []);

  const value = useMemo<StoreValue>(() => {
    const people = [...(season?.people || []), ...local.people];
    const speedDates = [...(season?.speedDates || []), ...local.speedDates];
    const invitations = [...(season?.invitations || []), ...local.invitations];
    const dates = [...(season?.dates || []), ...local.dates];
    const idx = indexes(speedDates, dates);
    const byId = new Map(people.map((p) => [p.id, p]));
    const cache = new Map<string, ReturnType<typeof rankFor>>();
    return {
      ready,
      error,
      season,
      local,
      people,
      speedDates,
      invitations,
      dates,
      idx,
      person: (id) => byId.get(id),
      rankingFor: (id) => {
        if (!cache.has(id)) {
          const p = byId.get(id);
          cache.set(id, p ? rankFor(p, people, idx) : []);
        }
        return cache.get(id)!;
      },
      addPerson: (p) => update((d) => ({ ...d, people: [...d.people.filter((x) => x.id !== p.id), p] })),
      addSpeedDate: (s) => update((d) => ({ ...d, speedDates: [...d.speedDates.filter((x) => x.id !== s.id), s] })),
      addInvitation: (i) => update((d) => ({ ...d, invitations: [...d.invitations.filter((x) => x.id !== i.id), i] })),
      addDate: (x) => update((d) => ({ ...d, dates: [...d.dates.filter((y) => y.id !== x.id), x] })),
      removeLocalPerson: (id) =>
        update((d) => ({
          people: d.people.filter((p) => p.id !== id),
          speedDates: d.speedDates.filter((s) => s.a !== id && s.b !== id),
          invitations: d.invitations.filter((i) => i.from !== id && i.to !== id),
          dates: d.dates.filter((x) => x.a !== id && x.b !== id),
        })),
    };
  }, [season, local, ready, error, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}
