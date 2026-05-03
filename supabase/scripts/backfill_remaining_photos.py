#!/usr/bin/env python3
"""Retry the 7 seed activities still on shared/placeholder photos.

Uses simpler, hand-tuned fallback queries (the museums/specifics fail
with the auto-derived query, so we go category-only). Includes backoff
on 403 rate-limit responses so we don't burn through the hourly window
on retries.
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

# Hand-tuned queries per remaining title — chosen to be specific but
# generic enough to actually return results from Unsplash's library.
RETRY_QUERIES = {
    "Tennis at Plummer Park": "tennis player",
    "The Echo show next Friday": "indie concert venue",
    "Weekend tennis at Venice Beach courts": "tennis court outdoor",
    "LACMA + lunch": "art museum gallery",
    "Used bookstore crawl": "used bookstore",
    "Hammer Museum + matcha at Maru": "matcha latte",
    "Trying Daikokuya Ramen in Little Tokyo": "ramen bowl tonkotsu",
}


def read_env_value(key):
    with open(ENV_LOCAL) as f:
        for line in f:
            m = re.match(rf'{key}="([^"]+)"', line.strip())
            if m:
                return m.group(1)
    raise SystemExit(f"{key} not found")


def unsplash_search(query, access_key, attempts=3):
    url = (
        "https://api.unsplash.com/search/photos?"
        + urllib.parse.urlencode(
            {"query": query, "per_page": 1, "content_filter": "high"}
        )
    )
    for attempt in range(attempts):
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
        except urllib.error.HTTPError as e:
            if e.code == 403:
                wait = 60 * (attempt + 1)
                print(f"  rate limited; waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"  unsplash error: {e}")
            return None
        except Exception as e:
            print(f"  unsplash error: {e}")
            return None
    return None


def trigger_download(url, access_key):
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Client-ID {access_key}",
            "Accept-Version": "v1",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        print(f"  trigger warn: {e}")


def psql(db_password, sql):
    conn = (
        f"postgresql://postgres.ymztxrpkhenbcbjjfbxr:{db_password}"
        "@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
    )
    env = {**os.environ, "PGPASSWORD": db_password}
    return subprocess.check_output(
        [
            "/opt/homebrew/Cellar/libpq/18.3/bin/psql",
            conn,
            "-At", "-F", "\t",
            "-c", sql,
        ],
        env=env,
        text=True,
    ).strip()


def update_photo(db_password, activity_id, photo_url, attribution):
    safe_url = photo_url.replace("'", "''")
    safe_attr = json.dumps(attribution).replace("'", "''")
    psql(
        db_password,
        f"UPDATE activities SET photo_url='{safe_url}', "
        f"photo_source='unsplash', "
        f"photo_attribution='{safe_attr}'::jsonb "
        f"WHERE id='{activity_id}';",
    )


def main():
    db_password = read_env_value("SUPABASE_DB_PASSWORD")
    access_key = read_env_value("UNSPLASH_ACCESS_KEY")

    # Find the seeds whose photos are still shared / missing attribution
    rows = psql(
        db_password,
        "SELECT id, title FROM activities "
        "WHERE is_seed = true AND ("
        "  photo_attribution IS NULL OR "
        "  photo_url IN ("
        "    SELECT photo_url FROM activities WHERE is_seed = true "
        "    GROUP BY photo_url HAVING count(*) > 1"
        "  )"
        ");",
    )
    targets = [r.split("\t") for r in rows.splitlines() if r]
    print(f"Retry queue: {len(targets)} activities")

    updated = 0
    for i, (activity_id, title) in enumerate(targets, 1):
        query = RETRY_QUERIES.get(title)
        if not query:
            # Fallback: just use the title's first word
            query = title.split()[0].lower()
        print(f"[{i}/{len(targets)}] {title!r}")
        print(f"  query: {query!r}")

        photo = unsplash_search(query, access_key)
        if photo is None:
            print("  ✗ no result")
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
        trigger_download(photo["links"]["download_location"], access_key)
        print(f"  ✓ {photo['user']['name']}")
        updated += 1
        time.sleep(0.8)

    print(f"\nDone. Updated {updated} of {len(targets)}.")


if __name__ == "__main__":
    main()
