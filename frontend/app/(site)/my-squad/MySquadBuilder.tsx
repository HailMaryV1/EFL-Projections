"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FORMATIONS, MAX_PER_CLUB, type SquadCandidate, type ClubCandidate } from "@/lib/squadBuilder";
import TeamBadge from "../../TeamBadge";

type FormationName = keyof typeof FORMATIONS;
const FORMATION_NAMES = Object.keys(FORMATIONS) as FormationName[];
const POSITION_ORDER: SquadCandidate["position"][] = ["GK", "DEF", "MID", "FWD"];
const STORAGE_KEY = "efl-my-squad-v1";

type StoredSquad = { formation: FormationName; playerIds: (number | null)[]; clubIds: (number | null)[] };

function slotsForFormation(formation: FormationName): SquadCandidate["position"][] {
  const counts = FORMATIONS[formation];
  return POSITION_ORDER.flatMap((pos) => Array(counts[pos]).fill(pos));
}

function loadStored(): StoredSquad | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSquad;
    if (!FORMATION_NAMES.includes(parsed.formation)) return null;
    return parsed;
  } catch {
    return null; // real corrupt/old-shape localStorage value - start fresh rather than crash.
  }
}

type SquadProps = { players: SquadCandidate[]; clubs: (ClubCandidate & { team: { id: number; name: string; abbreviation: string; background_color: string; text_color: string } })[] };

// Real picks live only in this browser - never sent anywhere (see
// page.tsx's own docstring for why: fantasy.efl.com's own team page needs
// a real login this project never handles). Reading localStorage during
// render (rather than setting state from inside an effect) means this
// component genuinely must never render during SSR - MySquadBuilder below
// gates on a real mount check first, so MySquadBuilderInner's own useState
// initializers only ever run client-side, with no server-rendered version
// to mismatch against.
// The official React-recommended hydration-safe "am I really on the
// client yet" check - the subscription never actually fires (nothing
// external changes this value after mount), it exists purely so
// useSyncExternalStore reports the real server snapshot (false) during
// SSR/hydration and the real client snapshot (true) on every render after,
// without ever calling setState from inside an effect.
function subscribeNever() {
  return () => {};
}

export default function MySquadBuilder(props: SquadProps) {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (!mounted) return <SquadSkeleton />;
  return <MySquadBuilderInner {...props} />;
}

function SquadSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex flex-wrap gap-1">
        {FORMATION_NAMES.map((f) => (
          <div key={f} className="h-8 w-24 rounded-full bg-navy-900" />
        ))}
      </div>
      <div className="mt-6 h-24 rounded-lg border border-navy-800 bg-navy-900" />
      <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-navy-800 bg-navy-900" />
        ))}
      </div>
    </div>
  );
}

function MySquadBuilderInner({ players, clubs }: SquadProps) {
  const [formation, setFormation] = useState<FormationName>(() => loadStored()?.formation ?? "1-2-2-2");
  const [playerIds, setPlayerIds] = useState<(number | null)[]>(() => {
    const stored = loadStored();
    if (!stored) return Array(7).fill(null);
    const slots = slotsForFormation(stored.formation);
    return stored.playerIds.slice(0, slots.length).concat(Array(Math.max(0, slots.length - stored.playerIds.length)).fill(null));
  });
  const [clubIds, setClubIds] = useState<(number | null)[]>(() => {
    const stored = loadStored();
    if (!stored) return Array(2).fill(null);
    return stored.clubIds.slice(0, 2).concat(Array(Math.max(0, 2 - stored.clubIds.length)).fill(null));
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ formation, playerIds, clubIds }));
  }, [formation, playerIds, clubIds]);

  const playersById = useMemo(() => new Map(players.map((p) => [p.playerId, p])), [players]);
  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.teamId, c])), [clubs]);
  const slots = slotsForFormation(formation);

  function changeFormation(next: FormationName) {
    const nextSlots = slotsForFormation(next);
    // Real, honest remap: keep as many already-picked players as still
    // fit the new formation's own position counts, in the order they were
    // picked - a real player dropped by shrinking a position's slot count
    // is removed, not silently swapped for someone else.
    const remaining = [...playerIds];
    const nextIds: (number | null)[] = nextSlots.map((pos) => {
      const idx = remaining.findIndex((id) => id !== null && playersById.get(id!)?.position === pos);
      if (idx === -1) return null;
      const id = remaining[idx];
      remaining[idx] = null;
      return id;
    });
    setFormation(next);
    setPlayerIds(nextIds);
  }

  function clubCounts(excludeIndex: number): Map<number, number> {
    const counts = new Map<number, number>();
    playerIds.forEach((id, i) => {
      if (i === excludeIndex || id === null) return;
      const p = playersById.get(id);
      if (!p) return;
      counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1);
    });
    return counts;
  }

  function setPlayerAt(index: number, id: number | null) {
    setPlayerIds((prev) => prev.map((v, i) => (i === index ? id : v)));
  }
  function setClubAt(index: number, id: number | null) {
    setClubIds((prev) => prev.map((v, i) => (i === index ? id : v)));
  }

  const filledPlayers = playerIds.map((id) => (id !== null ? playersById.get(id) ?? null : null));
  const filledClubs = clubIds.map((id) => (id !== null ? clubsById.get(id) ?? null : null));
  const totalPoints = filledPlayers.reduce((sum, p) => sum + (p?.points ?? 0), 0) + filledClubs.reduce((sum, c) => sum + (c?.points ?? 0), 0);
  const complete = filledPlayers.every((p) => p !== null) && filledClubs.every((c) => c !== null);

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {FORMATION_NAMES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => changeFormation(f)}
            className={`rounded-full px-4 py-1.5 font-[family-name:var(--font-cond)] text-sm font-bold uppercase tracking-wide ${
              f === formation ? "bg-sky-500 text-navy-950" : "bg-navy-900 text-navy-400 hover:bg-navy-800"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-sky-900/60 bg-sky-950/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Your squad&rsquo;s projected total</p>
        <p className="mt-1 font-[family-name:var(--font-cond)] text-3xl font-extrabold text-navy-100">{totalPoints.toFixed(1)} pts</p>
        {!complete && <p className="mt-1 text-xs text-navy-400">Fill every slot below to see your complete real total.</p>}
      </div>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-cond)] text-lg font-extrabold uppercase tracking-wide text-navy-200">Your 7 players</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {slots.map((pos, i) => (
            <PlayerSlot
              key={i}
              position={pos}
              player={filledPlayers[i] ?? null}
              candidates={players.filter((p) => p.position === pos && !playerIds.includes(p.playerId))}
              clubCounts={clubCounts(i)}
              onSelect={(id) => setPlayerAt(i, id)}
              onClear={() => setPlayerAt(i, null)}
            />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-cond)] text-lg font-extrabold uppercase tracking-wide text-navy-200">Your 2 club picks</h2>
        <p className="mt-1 text-xs text-navy-400">
          Remember the real rule: you can only select an individual club a maximum of 5 times over the whole season - this
          tool doesn&rsquo;t track your own season history, just this gameweek&rsquo;s real projection.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <ClubSlot
              key={i}
              club={filledClubs[i] ?? null}
              candidates={clubs.filter((c) => !clubIds.includes(c.teamId))}
              onSelect={(id) => setClubAt(i, id)}
              onClear={() => setClubAt(i, null)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function PlayerSlot({
  position,
  player,
  candidates,
  clubCounts,
  onSelect,
  onClear,
}: {
  position: SquadCandidate["position"];
  player: SquadCandidate | null;
  candidates: SquadCandidate[];
  clubCounts: Map<number, number>;
  onSelect: (id: number) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => c.name.toLowerCase().includes(q) && (clubCounts.get(c.teamId) ?? 0) < MAX_PER_CLUB)
      .sort((a, b) => b.points - a.points)
      .slice(0, 8);
  }, [candidates, query, clubCounts]);

  if (player) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-navy-800 bg-navy-900 p-3">
        <TeamBadge team={{ abbreviation: player.teamAbbreviation, backgroundColor: player.teamBackgroundColor, textColor: player.teamTextColor }} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-cond)] text-sm font-bold uppercase text-navy-100">{player.name}</p>
          <p className="text-xs text-navy-500">
            {position} · {player.teamName}
          </p>
        </div>
        <span className="shrink-0 font-[family-name:var(--font-cond)] text-lg font-bold text-sky-300">{player.points.toFixed(1)}</span>
        <button type="button" onClick={onClear} className="shrink-0 text-xs text-navy-500 hover:text-red-400" aria-label="Remove player">
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-dashed border-navy-700 bg-navy-950/40 p-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy-400">{position}</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search a real ${position}…`}
          className="w-full min-w-0 bg-transparent text-sm text-navy-100 placeholder:text-navy-600 focus:outline-none"
        />
      </div>
      {matches.length > 0 && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-md border border-navy-700 bg-navy-950 shadow-xl">
          {matches.map((m) => (
            <button
              key={m.playerId}
              type="button"
              onClick={() => {
                onSelect(m.playerId);
                setQuery("");
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-navy-200 hover:bg-navy-900"
            >
              <span className="truncate">{m.name}</span>
              <span className="shrink-0 text-xs text-navy-500">
                {m.teamName} · {m.points.toFixed(1)}pts
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClubSlot({
  club,
  candidates,
  onSelect,
  onClear,
}: {
  club: (ClubCandidate & { team: { id: number; name: string; abbreviation: string; background_color: string; text_color: string } }) | null;
  candidates: (ClubCandidate & { team: { id: number; name: string; abbreviation: string; background_color: string; text_color: string } })[];
  onSelect: (id: number) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => c.teamName.toLowerCase().includes(q))
      .sort((a, b) => b.points - a.points)
      .slice(0, 8);
  }, [candidates, query]);

  if (club) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-navy-800 bg-navy-900 p-3">
        <TeamBadge team={{ abbreviation: club.team.abbreviation, backgroundColor: club.team.background_color, textColor: club.team.text_color }} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-cond)] text-sm font-bold uppercase text-navy-100">{club.teamName}</p>
        </div>
        <span className="shrink-0 font-[family-name:var(--font-cond)] text-lg font-bold text-sky-300">{club.points.toFixed(1)}</span>
        <button type="button" onClick={onClear} className="shrink-0 text-xs text-navy-500 hover:text-red-400" aria-label="Remove club">
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-dashed border-navy-700 bg-navy-950/40 p-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a real club…"
        className="w-full min-w-0 bg-transparent text-sm text-navy-100 placeholder:text-navy-600 focus:outline-none"
      />
      {matches.length > 0 && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-md border border-navy-700 bg-navy-950 shadow-xl">
          {matches.map((m) => (
            <button
              key={m.teamId}
              type="button"
              onClick={() => {
                onSelect(m.teamId);
                setQuery("");
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-navy-200 hover:bg-navy-900"
            >
              <span className="truncate">{m.teamName}</span>
              <span className="shrink-0 text-xs text-navy-500">{m.points.toFixed(1)}pts</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
