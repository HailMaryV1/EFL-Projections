// Unlike dreamteam-projections' own TeamBadge (which hardcodes real brand
// colours for 20 Premier League clubs in lib/teamBranding.ts), this one
// takes the real colour/abbreviation directly as props - fantasy.efl.com's
// own squads.json already gives real backgroundColor/textColor/
// abbreviation for all 72 real clubs (see teams.background_color/
// text_color/abbreviation), so there's no need to hand-maintain a second
// copy of the same real data for 3x as many clubs.
const SIZES = {
  sm: { box: 30, font: 11.5, radius: 8 },
  md: { box: 46, font: 14, radius: 12 },
  lg: { box: 60, font: 19, radius: 14 },
};

export type TeamBadgeInfo = { abbreviation: string | null; backgroundColor: string | null; textColor: string | null };

export default function TeamBadge({ team, size = "sm" }: { team: TeamBadgeInfo; size?: keyof typeof SIZES }) {
  const { box, font, radius } = SIZES[size];
  const bg = team.backgroundColor || "#46617f";
  const fg = team.textColor || "#f8fafc";
  return (
    <div
      className="flex shrink-0 items-center justify-center font-[family-name:var(--font-cond)] font-bold"
      style={{
        width: box,
        height: box,
        fontSize: font,
        borderRadius: radius,
        color: fg,
        background: `linear-gradient(145deg, color-mix(in srgb, ${bg} 100%, white 25%), ${bg})`,
        boxShadow: `0 6px 18px -4px color-mix(in srgb, ${bg} 70%, transparent), inset 0 1px 0 #ffffff40`,
      }}
    >
      {team.abbreviation || "?"}
    </div>
  );
}
