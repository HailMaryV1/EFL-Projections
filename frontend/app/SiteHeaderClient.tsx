"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type NavIcon = (props: { className?: string }) => React.JSX.Element;

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const HomeIcon: NavIcon = ({ className }) => (
  <svg {...iconProps} className={className}>
    <path d="M4 11.5L12 4l8 7.5" />
    <path d="M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9" />
    <path d="M10 20v-6h4v6" />
  </svg>
);
const ProjectedPointsIcon: NavIcon = ({ className }) => (
  <svg {...iconProps} className={className}>
    <path d="M4 20V10M12 20V4M20 20v-7" />
  </svg>
);
const FixturesIcon: NavIcon = ({ className }) => (
  <svg {...iconProps} className={className}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
    <path d="M3.5 9.5h17M8 3v3M16 3v3" />
  </svg>
);
const SquadIcon: NavIcon = ({ className }) => (
  <svg {...iconProps} className={className}>
    <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
    <circle cx="12" cy="11" r="2.4" />
  </svg>
);
const TopPicksIcon: NavIcon = ({ className }) => (
  <svg {...iconProps} className={className}>
    <path d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" />
  </svg>
);
const CompareIcon: NavIcon = ({ className }) => (
  <svg {...iconProps} className={className}>
    <path d="M7 4v13M4 14l3 3 3-3M17 20V7M14 10l3-3 3 3" />
  </svg>
);
const MySquadIcon: NavIcon = ({ className }) => (
  <svg {...iconProps} className={className}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
  </svg>
);
const AdminIcon: NavIcon = ({ className }) => (
  <svg {...iconProps} className={className}>
    <path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z" />
    <path d="M9.5 12l1.8 1.8L15 10" />
  </svg>
);
const SwitchGameIcon: NavIcon = ({ className }) => (
  <svg {...iconProps} className={className}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
);

// Real, separately-deployed sibling sites (own repo/domain/database each -
// every game keeps its own independent identity, never a shared squad/
// calibration). This is pure cross-site navigation, not shared state, so
// plain <a> tags (full page loads) are correct here, not Next's <Link>.
type Game = { key: "efl" | "nfl" | "dreamteam"; label: string; href: string };
const GAMES: Game[] = [
  { key: "efl", label: "EFL Projections", href: "https://efl.hailmaryfantasysports.co.uk" },
  { key: "nfl", label: "NFL Projections", href: "https://nfl.hailmaryfantasysports.co.uk" },
  { key: "dreamteam", label: "Dream Team Projections", href: "https://dreamteam.hailmaryfantasysports.co.uk" },
];
const CURRENT_GAME: Game["key"] = "efl";

// Split into ANALYSE (read the model's own numbers) and BUILD (use them to
// make a real squad/pick decision) - same grouping ported from
// dreamteam-projections' sidebar, adapted to EFL's 5 tools (3+2 instead of
// PL's 3+3, since EFL has no separate "value finder" tool).
const ANALYSE_LINKS: { href: string; label: string; icon: NavIcon }[] = [
  { href: "/projected-points", label: "Projected Points", icon: ProjectedPointsIcon },
  { href: "/fixtures", label: "Fixture Forecast", icon: FixturesIcon },
  { href: "/compare", label: "Player Face-Off", icon: CompareIcon },
];
const BUILD_LINKS: { href: string; label: string; icon: NavIcon }[] = [
  { href: "/my-squad", label: "My Squad", icon: MySquadIcon },
  { href: "/best-squad", label: "HM Best Squad", icon: SquadIcon },
  { href: "/top-picks", label: "HM Top Picks", icon: TopPicksIcon },
];

function NavGroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 mb-1 px-3 font-[family-name:var(--font-cond)] text-[10px] font-bold tracking-[0.2em] text-navy-600 uppercase first:mt-1">{children}</p>;
}

// Real bug found live (ported fix from dreamteam-projections): React
// attaches its own click handlers at the root container in the bubble
// phase, and Next's <Link> calls preventDefault() there to do client-side
// routing - a bubble-phase document listener here would always see the
// click AFTER that already happened. Capturing on `document` fires before
// any of that, so this reliably sees every real link click.
function useNavigationPending(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const previousRouteKey = useRef(routeKey);

  useEffect(() => {
    if (previousRouteKey.current !== routeKey) {
      previousRouteKey.current = routeKey;
      setPending(false);
    }
  }, [routeKey]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:") || anchor.target === "_blank") return;
      setPending(true);
    }
    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return pending;
}

// Thin loading bar under the brand logo+wordmark - real user request:
// "have the page have a little load icon that shows something has been
// clicked and its processing... maybe have the hail mary logo with a
// loading bar underneath". Positioned absolute relative to the whole
// Brand link so it sits flush under the logo/wordmark block itself, not
// pinned to the viewport edge.
function NavLoadingBar({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <div aria-hidden className="absolute inset-x-0 -bottom-1.5 h-0.5 overflow-hidden rounded-full bg-navy-800">
      <div className="animate-nav-bar h-full w-1/3 rounded-full bg-sky-400" />
    </div>
  );
}

function Brand({ onClick, pending }: { onClick?: () => void; pending: boolean }) {
  return (
    <Link href="/" className="relative flex min-w-0 items-center gap-2.5" onClick={onClick}>
      <Image src="/logo.png" alt="Hail Mary" width={26} height={27} priority className="shrink-0" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-bold tracking-wide text-navy-100">HAIL MARY</p>
        <p className="truncate text-xs font-medium text-navy-400">EFL Projections</p>
      </div>
      <NavLoadingBar pending={pending} />
    </Link>
  );
}

function NavLink({ href, label, icon: Icon, active, onClick }: { href: string; label: string; icon: NavIcon; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
        active ? "bg-sky-400/10 text-sky-300" : "text-navy-300 hover:bg-navy-900 hover:text-navy-100"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

// Same sidebar/mobile-hamburger split as dreamteam-projections'
// SiteHeaderClient - a thin async Server Component (SiteHeader.tsx) checks
// the real Supabase Auth session and passes isAdmin down, so the Admin
// link is hidden entirely for a signed-out visitor, not just the
// destination page.
export default function SiteHeaderClient({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const pending = useNavigationPending();

  const nav = (onLinkClick?: () => void) => (
    <nav className="flex flex-col gap-1">
      <NavGroupLabel>Switch Game</NavGroupLabel>
      {GAMES.map((game) =>
        game.key === CURRENT_GAME ? (
          <span
            key={game.key}
            className="flex items-center gap-3 rounded-lg bg-sky-400/10 px-3 py-2.5 text-sm font-semibold text-sky-300"
            aria-current="page"
          >
            <SwitchGameIcon className="h-5 w-5 shrink-0" />
            <span className="truncate">{game.label}</span>
          </span>
        ) : (
          <a
            key={game.key}
            href={game.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-navy-300 transition-colors hover:bg-navy-900 hover:text-navy-100"
          >
            <SwitchGameIcon className="h-5 w-5 shrink-0" />
            <span className="truncate">{game.label}</span>
          </a>
        )
      )}
      <div className="my-2 border-t border-navy-800" />
      <NavLink href="/" label="Home" icon={HomeIcon} active={pathname === "/"} onClick={onLinkClick} />
      <NavGroupLabel>Analyse</NavGroupLabel>
      {ANALYSE_LINKS.map((link) => (
        <NavLink key={link.href} {...link} active={pathname === link.href} onClick={onLinkClick} />
      ))}
      <NavGroupLabel>Build</NavGroupLabel>
      {BUILD_LINKS.map((link) => (
        <NavLink key={link.href} {...link} active={pathname === link.href} onClick={onLinkClick} />
      ))}
      {isAdmin && (
        <>
          <div className="my-2 border-t border-navy-800" />
          <NavLink href="/admin" label="Admin" icon={AdminIcon} active={pathname.startsWith("/admin")} onClick={onLinkClick} />
        </>
      )}
    </nav>
  );

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-navy-800 bg-navy-950/90 backdrop-blur-sm sm:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <Brand onClick={() => setMenuOpen(false)} pending={pending} />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-navy-300 hover:bg-navy-900 hover:text-sky-300"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
        {menuOpen && <div className="border-t border-navy-800 p-3">{nav(() => setMenuOpen(false))}</div>}
      </div>

      <aside className="hidden w-64 shrink-0 border-r border-navy-800 bg-navy-950 p-4 sm:flex sm:flex-col">
        <div className="mb-6 px-1">
          <Brand pending={pending} />
        </div>
        {nav()}
      </aside>
    </>
  );
}
