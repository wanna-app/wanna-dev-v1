#!/usr/bin/env python3
"""
One-off: re-backfill seed activities' photo_url with per-title Unsplash
search results. Replaces the original migration 00021 backfill (which
used a single photo per category, leading to ~3× repetition).

For each seed activity:
  1. Search Unsplash with a query derived from title + category
  2. Pick the top result, store photo_url + photo_attribution
  3. Fire the download trigger to comply with Unsplash API guidelines

Usage:
  cd ~/Developer/wanna-dev-v1
  python3 supabase/scripts/backfill_seed_photos.py

Requires the following keys in ~/Developer/wanna-dev-v1/.env.local:
  - SUPABASE_DB_PASSWORD    (postgres password for the pooler)
  - UNSPLASH_ACCESS_KEY     (server-side; for /search/photos)
  - SUPABASE_ACCESS_TOKEN   (used to look up the service role key)
"""
import os
import re
import sys
import time
import json
import urllib.request
import urllib.parse
import subprocess

ROOT = os.path.expanduser("~/Developer/wanna-dev-v1")
ENV_LOCAL = os.path.join(ROOT, ".env.local")

# --- Helpers ---------------------------------------------------------------

def read_env_value(key: str) -> str:
    """Pull KEY="VALUE" from .env.local."""
    with open(ENV_LOCAL) as f:
        for line in f:
            m = re.match(rf'{key}="([^"]+)"', line.strip())
            if m:
                return m.group(1)
    raise SystemExit(f"{key} not found in {ENV_LOCAL}")


def query_for(title: str, category: str) -> str:
    """Build a focused Unsplash search query.

    Strategy: the title alone gets us closer to the intent (e.g. 'Brunch at
    Sqirl' → 'brunch'); the category supplements when the title is generic.
    Strip 'at <place>' / 'in <city>' clauses since they confuse the search.
    """
    t = title.lower()
    # Drop common noise so 'Brunch at Sqirl' -> 'brunch'
    for drop in [" at ", " in ", " on ", " — ", " - "]:
        if drop in t:
            t = t.split(drop)[0].strip()
    # Pull the meaningful category half (before '&')
    cat_short = category.split(" & ")[0].strip().lower()
    # Combine if title is short
    if len(t) < 25 and cat_short not in t:
        return f"{t} {cat_short}"
    return t


def unsplash_search(query, access_key):
    url = (
        "https://api.unsplash.com/search/photos?"
        + urllib.parse.urlencode(
            {"query": query, "per_page": 1, "content_filter": "high"}
        )
    )
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Client-ID {access_key}",
            "Accept-Version": "v1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
            results = data.get("results", [])
            return results[0] if results else None
    except Exception as e:
        print(f"  unsplash search error: {e}")
        return None


def trigger_download(download_location: str, access_key: str) -> None:
    """Fire the required Unsplash 'photo used' beacon (per API guidelines)."""
    req = urllib.request.Request(
        download_location,
        headers={
            "Authorization": f"Client-ID {access_key}",
            "Accept-Version": "v1",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        # Non-fatal — log and move on
        print(f"  trigger download warn: {e}")


def psql(db_password: str, sql: str) -> str:
    """Run psql against the Supabase pooler. Returns stdout (trimmed)."""
    conn = (
        f"postgresql://postgres.ymztxrpkhenbcbjjfbxr:{db_password}"
        "@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
    )
    env = {**os.environ, "PGPASSWORD": db_password}
    out = subprocess.check_output(
        [
            "/opt/homebrew/Cellar/libpq/18.3/bin/psql",
            conn,
            "-At",  # tab-separated, no headers
            "-F", "\t",
            "-c", sql,
        ],
        env=env,
        text=True,
    )
    return out.strip()


def update_photo(db_password: str, activity_id: str, photo_url: str, attribution: dict) -> None:
    attribution_json = json.dumps(attribution).replace("'", "''")
    safe_url = photo_url.replace("'", "''")
    sql = (
        f"UPDATE activities SET "
        f"photo_url = '{safe_url}', "
        f"photo_source = 'unsplash', "
        f"photo_attribution = '{attribution_json}'::jsonb "
        f"WHERE id = '{activity_id}';"
    )
    psql(db_password, sql)


# --- Main ------------------------------------------------------------------

def main():
    db_password = read_env_value("SUPABASE_DB_PASSWORD")
    access_key = read_env_value("UNSPLASH_ACCESS_KEY")

    print("Loading seed activities...")
    rows = psql(
        db_password,
        "SELECT id, title, category FROM activities WHERE is_seed = true ORDER BY title;",
    )
    activities = [r.split("\t") for r in rows.splitlines() if r]
    print(f"  found {len(activities)} seed activities")

    updated = 0
    skipped = 0
    for i, (activity_id, title, category) in enumerate(activities, 1):
        q = query_for(title, category)
        print(f"[{i}/{len(activities)}] {title!r}")
        print(f"  query: {q!r}")
        photo = unsplash_search(q, access_key)
        if photo is None:
            print("  ✗ no result — skipping")
            skipped += 1
            continue

        photo_url = photo["urls"]["regular"]
        attribution = {
            "photographer_name": photo["user"]["name"],
            "photographer_username": photo["user"]["username"],
            "photographer_url": photo["user"]["links"]["html"],
            "photo_id": photo["id"],
            "photo_url": photo["links"]["html"],
            "download_location": photo["links"]["download_location"],
        }
        update_photo(db_password, activity_id, photo_url, attribution)
        # Fire trigger (compliance)
        trigger_download(photo["links"]["download_location"], access_key)
        print(
            f"  ✓ {photo['user']['name']} (@{photo['user']['username']}) — id {photo['id']}"
        )
        updated += 1
        # Be polite — Unsplash demo has 50 req/hour; we use 2 calls per activity
        time.sleep(0.6)

    print(f"\nDone. Updated {updated} activities, skipped {skipped}.")


if __name__ == "__main__":
    main()
