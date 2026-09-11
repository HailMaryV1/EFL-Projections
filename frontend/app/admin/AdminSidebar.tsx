"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

type NavItem = { href: string; label: string };

// Same responsive hamburger-on-mobile / fixed-sidebar-on-desktop pattern
// as dreamteam-projections' own AdminSidebar.tsx (ported unchanged -
// game-agnostic already).
export default function AdminSidebar({
  navItems,
  email,
  signOutAction,
}: {
  navItems: NavItem[];
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const signOutBlock = (
    <div className="mt-6 border-t border-navy-800 pt-4 text-xs text-navy-400">
      <p className="truncate">{email}</p>
      <form action={signOutAction}>
        <button type="submit" className="mt-1 underline underline-offset-2 hover:text-navy-100">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      <div className="border-b border-navy-800 bg-navy-900 sm:hidden">
        <div className="flex items-center justify-between gap-3 p-4">
          <Link href="/" className="flex min-w-0 items-center gap-2" onClick={() => setMenuOpen(false)}>
            <Image src="/logo.png" alt="Hail Mary" width={20} height={21} priority className="shrink-0" />
            <p className="truncate text-sm font-semibold text-navy-100">EFL Projections</p>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-navy-300 hover:bg-navy-800 hover:text-sky-300"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-navy-800 p-4">
            <nav className="flex flex-col gap-1 text-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-md px-2 py-1.5 text-navy-200 hover:bg-navy-800 hover:text-navy-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {signOutBlock}
          </div>
        )}
      </div>

      <aside className="hidden w-56 shrink-0 border-r border-navy-800 bg-navy-900 p-4 sm:block">
        <Link href="/" className="mb-4 flex items-center gap-2">
          <Image src="/logo.png" alt="Hail Mary" width={20} height={21} priority />
          <p className="text-sm font-semibold text-navy-100">EFL Projections</p>
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-2 py-1.5 text-navy-200 hover:bg-navy-800 hover:text-navy-100">
              {item.label}
            </Link>
          ))}
        </nav>
        {signOutBlock}
      </aside>
    </>
  );
}
