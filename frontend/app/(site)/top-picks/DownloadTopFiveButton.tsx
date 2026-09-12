"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import TopFiveCard, { type TopFiveCardData } from "./TopFiveCard";

export default function DownloadTopFiveButton({ data }: { data: TopFiveCardData }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true });
      const link = document.createElement("a");
      const slug = data.title.replace(/\s+/g, "-").toLowerCase();
      const gwSlug = data.horizon > 1 ? `gw${data.gameweek}-gw${data.gameweek + data.horizon - 1}` : `gw${data.gameweek}`;
      link.download = `${slug}-${gwSlug}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={busy || data.players.length === 0}
        className="inline-flex items-center gap-2 rounded-md bg-sky-500 px-5 py-2.5 font-[family-name:var(--font-cond)] text-sm font-bold tracking-wide text-navy-950 uppercase hover:bg-sky-300 disabled:opacity-50"
      >
        {busy ? "Rendering…" : "↓ Download Card"}
      </button>
      {/* Off-screen real render target for the export - not display:none
          (html-to-image can't rasterize a display:none subtree). */}
      <div className="pointer-events-none fixed top-0 left-[-9999px]" aria-hidden="true">
        <div ref={cardRef}>
          <TopFiveCard data={data} />
        </div>
      </div>
    </div>
  );
}
