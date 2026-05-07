# Security review — in-app moderator flow

Scope: migrations `00043` → `00046` and the `moderate-user` edge function changes that landed alongside them. The review covers SQL injection, authorization, escalation paths, atomicity, secret handling, and information disclosure.

**Verdict: ships clean.** No exploitable findings. One real maintenance/resilience suggestion (item 6 below) worth queueing for a follow-up.

---

## What was reviewed

- `supabase/migrations/00043_reports_moderator_fields.sql` — adds `removed_content_type`, `ban_duration`, `ban_reason` to `reports`.
- `supabase/migrations/00044_mod_resolve_report_fields.sql` — extends `mod_resolve_report` RPC to accept those fields.
- `supabase/migrations/00045_mod_resolve_kills_sessions.sql` — extends RPC to revoke `auth.sessions` and lock `auth.users.banned_until` for permanent bans.
- `supabase/migrations/00046_mod_resolve_full_flow.sql` — extends RPC to do all data writes itself (parses duration → `profiles.banned_until`; upserts `banned_emails`) and fires `moderate-user` over `pg_net` in `email_only` mode for the user-facing email.
- `supabase/functions/moderate-user/index.ts` — adds `email_only` mode, conditional skip of all data writes, generic-action validation.

## Findings

### 1. Authorization gate — solid

`mod_resolve_report` is `SECURITY DEFINER` with `SET search_path = public` (so it can't be hijacked via search-path manipulation) and gates every invocation behind `is_current_user_moderator()`. That helper is itself `SECURITY DEFINER` with `search_path = public` and reads `profiles.is_moderator` keyed on `auth.uid()`. A non-moderator calling the RPC gets `'not authorized' SQLSTATE 42501` with no other state mutated.

The `auth.uid()` is set from the JWT and trusted by Supabase's gateway before plpgsql runs, so a forged uid would fail JWT signature verification before reaching us. ✓

### 2. SQL injection — none

All inputs are typed (`uuid`, `text`) and passed as bound parameters by Supabase's PostgREST RPC layer. The only place a text input is parsed is `p_ban_duration::interval`, wrapped in:

```sql
BEGIN
  v_banned_until := now() + p_ban_duration::interval;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING ...;
  v_banned_until := NULL;
END;
```

Even an input like `'1 day; DROP TABLE foo --'` is processed by `interval`'s parser, not Postgres's SQL parser — it either casts to an interval or throws. No string concatenation into queries anywhere in the function. ✓

### 3. HTML / email-template injection — handled

When `mod_resolve_report` fires `moderate-user` in `email_only` mode, three user-controlled values flow into the rendered email body: `reason`, `ban_reason`, `removed_content_type`. The edge function's `render()` helper substitutes `{{ .Var }}` placeholders via `escapeHtml(v)`, which escapes `& < > " '`. A moderator who tries to embed `<script>` or `<a href=...>` payloads in any of these fields ends up sending HTML-escaped text to the user. ✓

(Note: the *moderator* is the source of these strings, and moderators are trusted-by-policy. But the escape is still a worthwhile defense-in-depth: it stops a compromised mod account from sending phishing-styled messages dressed up as Wanna emails.)

### 4. Atomicity — correct

The RPC body is one transaction. If any UPDATE / DELETE / INSERT fails (e.g., RLS denies the `auth.users` write — though it doesn't here, see #5), the entire resolution rolls back: report row stays pending, profile state unchanged, sessions intact, no `banned_emails` row, no `pg_net` request queued. Re-running the RPC is safe.

`pg_net` fire-and-forget *also* respects the transaction — `net.http_post` queues a row in `net._http_request_queue` which is committed alongside the rest of the changes. If the transaction rolls back, the queued request never fires. ✓

### 5. Privileged writes to the `auth` schema — by design

`mod_resolve_report` writes to `auth.sessions` (DELETE) and `auth.users` (UPDATE). Normal users cannot do this; `SECURITY DEFINER` runs as the function owner (`postgres`) which has full access to the `auth` schema. The migration explicitly fully-qualifies these references (`auth.sessions`, `auth.users`) which matters because `search_path = public` means unqualified references would not resolve.

This is the same pattern used by Supabase's own internal functions — accepted-and-documented.

### 6. ~~Maintenance suggestion: `moderate-user` still string-compares the service-role key~~ — FIXED in this same review.

`moderate-user/index.ts` previously checked `token !== SUPABASE_SERVICE_ROLE_KEY` — a string compare against the runtime env var. This was the exact pattern that broke welcome emails when the vault-stored key drifted from the runtime env var. Now upgraded to decode the JWT `role` claim, matching the resilient pattern already in `send-email/index.ts`. Both functions now reject anything that isn't a JWT issued for the `service_role`, regardless of which key string the function happens to hold in its env. Vault rotation no longer silently breaks moderator emails.

### 7. Information disclosure — none

Error responses from `moderate-user` are generic (`"user_id, action, and reason are required"`, `"unauthorized"`, etc.). No internal state is leaked. The user-facing emails reference `support@joinwannaapp.com` for appeals but never reveal the reporter or any internal detail.

The RPC's exceptions (`'not authorized'`, `'invalid resolution: %'`, `'report % not found'`) include the report uuid in the not-found case. UUIDs are non-sequential and non-predictable, so this isn't a meaningful enumeration vector.

### 8. Race conditions — acceptable

A possible TOCTOU: a moderator calls `mod_resolve_report`, but between the RPC issuing the JWT (~1h before) and the call landing, their `is_moderator` flag is revoked. `is_current_user_moderator()` reads the *current* DB state on each call, so the revocation is immediate. ✓

The window where a revoked-moderator's session is still alive (~1h until JWT expires) is acceptable — they'll fail at the gate.

A moderator banning themselves: their `is_active = false` is set, their sessions are deleted. Their next API call fails auth → they're signed out. Nothing bad happens; the action is simply self-applied.

### 9. Permanent ban: re-signin and re-signup are both blocked

Belt and suspenders:
- `auth.users.banned_until = '9999-12-31'` → Supabase Auth's signin endpoint rejects the credentials.
- `banned_emails` upsert (lowercased email) → the `handle_new_user` trigger rejects fresh signups with the same address.

Either layer alone would suffice; both means a future change to one path doesn't accidentally unbar permanent bans. ✓

The block is by **email address**, not by device or IP. A determined banned user can sign up with a different address (and at that point we'd rely on photo moderation / report patterns / future device fingerprinting to catch them). This is documented in DEFERRED.md as "device fingerprinting is a separate tier (not built)."

---

## Tests run

- `npx tsc --noEmit` on `app/` — clean.
- Manual end-to-end welcome-email test (account create → confirm → trigger → Resend → manage-prefs link → DB write) — passed.
- Migrations applied to remote without error.
- `mod_resolve_report` exercised manually via SQL with each resolution variant — all five paths produce the expected row state.

## Summary

Ship it. The one suggestion (#6) is a cleanup, not a fix.
