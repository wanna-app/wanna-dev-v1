# link-preview edge function

Fetches OpenGraph metadata for a URL server-side and returns
`{ url, title, description, image, domain }`. Used by `<LinkPreview>`
in chat bubbles and the Discover expanded card.

## Deploy

```bash
# One-time: install the Supabase CLI
brew install supabase/tap/supabase

# Log in (paste a personal access token from https://supabase.com/dashboard/account/tokens)
supabase login

# From the repo root:
supabase link --project-ref ymztxrpkhenbcbjjfbxr
supabase functions deploy link-preview --no-verify-jwt
```

The `--no-verify-jwt` flag lets the client invoke without an access token,
which is fine here since the function only fetches public OG metadata.
Pre-launch consider tightening `ALLOWED_ORIGINS` inside `index.ts` to
the app's own origin once we know it.

## Test

```bash
curl -s -X POST 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/link-preview' \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/Los_Angeles"}' | jq
```

Expected: title, description, image, domain. If it returns 404 the
function isn't deployed yet.

## Behavior

- Caps response body at 200 KB to avoid pulling huge pages
- 5-second fetch timeout
- Looks for `og:title`, `twitter:title`, `<title>` in that order
- Looks for `og:description`, `twitter:description`, `description`
- Resolves relative `og:image` paths against the page URL
- Returns 200 with all-null fields when the page can't be parsed
  (the client falls back to a plain tappable URL)
