"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Season" },
  { href: "/people", label: "Agents" },
  { href: "/dates", label: "Dates" },
  { href: "/rankings", label: "Rankings" },
  { href: "/how", label: "How it works" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <path d="M16 28s-11-6.6-11-14.2C5 9.4 8.2 6.5 11.7 6.5c2 0 3.5 1 4.3 2.4.8-1.4 2.3-2.4 4.3-2.4 3.5 0 6.7 2.9 6.7 7.3C27 21.4 16 28 16 28z" fill="#e8436b" />
        <path d="M2 13c4-1 7 0 9 3M30 13c-4-1-7 0-9 3" stroke="#6b4eff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
      <span className="font-display text-2xl leading-none">Wingmate</span>
    </span>
  );
}

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>
        <nav className="no-scrollbar -mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cx("whitespace-nowrap rounded-full px-3 py-1.5 transition", active ? "bg-ink text-white" : "text-muted hover:bg-white hover:text-ink")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/join" className="shrink-0 rounded-full bg-rose px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110">
          + Add someone
        </Link>
      </div>
    </header>
  );
}
