"""Shared .env loader + DB connection helper for every script in this
directory. Ported unchanged from dreamteam-projections/scripts/env_utils.py -
game-agnostic, no reason to duplicate it."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Real scraped data (club codes, player names) can include any real Unicode
# character - Windows' console defaults to cp1252, which can't encode
# plenty of them, and CRASHES on print() rather than mangling the glyph.
# dreamteam-projections hit exactly this (a crash mid-transaction from one
# Turkish club code's letter) - fixing it here once covers every script that
# imports this module. No-op on Linux CI, where stdout is already UTF-8.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def load_env():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def db_connect():
    import psycopg2

    load_env()
    return psycopg2.connect(os.environ["DATABASE_URL"])
