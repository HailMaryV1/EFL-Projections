"use client";
import { useEffect, useRef, useState } from "react";

// Ported from dreamteam-projections: the fixed-width TopFiveCard preview
// (deliberately fixed at 420px for a crisp export, see
// DownloadTopFiveButton.tsx) was wrapped in a plain horizontal-scroll box
// - technically scrollable, but on a real phone that just reads as a
// cut-off, broken card, with the wrong half visible by default. This
// shrinks the card to fit its container instead, via a measured CSS
// transform (never touching the export components themselves, which stay
// full-resolution for anyone who downloads from the real tool page).
// Falls back to rendering at natural size before hydration - the parent's
// own overflow-x-auto wrapper (kept as a defensive no-JS fallback) still
// makes that scrollable rather than broken in that brief window.
export default function ScaleToFit({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);
  const [marginLeft, setMarginLeft] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const recompute = () => {
      const naturalWidth = inner.scrollWidth;
      const naturalHeight = inner.scrollHeight;
      const availableWidth = outer.clientWidth;
      if (naturalWidth === 0 || availableWidth === 0) return;
      const s = Math.min(1, availableWidth / naturalWidth);
      setScale(s);
      setHeight(naturalHeight * s);
      // `transform-origin: top left` means the pre-transform (natural,
      // unscaled) layout box always starts at x=0 - centering that with
      // its own margin, computed from the real *scaled* width, is what
      // keeps it centred when there's slack (s === 1) while landing
      // flush left with zero overflow once actually shrunk (s < 1).
      // Centering via `transform-origin: center` + `margin-inline: auto`
      // instead leaves half of the natural, UNSCALED box's width sitting
      // left of x=0 - invisible once scaled down, but still real layout
      // geometry, so it keeps contributing to the parent's scrollable
      // overflow even though nothing is there to see.
      setMarginLeft(Math.max(0, (availableWidth - naturalWidth * s) / 2));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(inner);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="w-full" style={height !== null ? { height } : undefined}>
      <div ref={innerRef} style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: "max-content", marginLeft }}>
        {children}
      </div>
    </div>
  );
}
