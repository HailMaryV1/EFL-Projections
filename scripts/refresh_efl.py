"""
refresh_efl.py
-----------------
Single entrypoint for the automated data-refresh pipeline (free sources
only - see CLAUDE.md Status for the deferred Premium market-odds scraper).
Runs every real ingestion script in the order its own output depends on the
step before it, then exits non-zero if anything failed (so a GitHub Actions
run goes red) - but a step's own failure doesn't stop the rest of the
pipeline running, same reasoning as dreamteam-projections/scripts/
refresh_dreamteam.py's run_step(): a transient API hiccup in one step
shouldn't also block every step after it.

Order, and why:
  1. seed_teams.py          - idempotent; everything below assumes teams exist
  2. scrape_fixtures.py     - needs teams resolved to link home/away team ids
  3. scrape_player_stats.py - independent of fixtures, but needs teams resolved
  4. scrape_club_stats.py   - needs teams resolved

This is data ingestion only - the projection engine (Phase 3) that turns
these real rows into a projection is a separate, later step, not run here.

RUN:
    python scripts/refresh_efl.py
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

STEPS = [
    "seed_teams.py",
    "scrape_fixtures.py",
    "scrape_player_stats.py",
    "scrape_club_stats.py",
]


def run_step(script_name):
    print(f"\n=== {script_name} ===")
    result = subprocess.run([sys.executable, str(ROOT / "scripts" / script_name)], cwd=ROOT)
    ok = result.returncode == 0
    if not ok:
        print(f"[FAILED] {script_name} (exit {result.returncode})")
    return ok


def main():
    results = {step: run_step(step) for step in STEPS}

    print("\n=== Summary ===")
    for step, ok in results.items():
        print(f"  {'OK' if ok else 'FAILED'} - {step}")

    if not all(results.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
