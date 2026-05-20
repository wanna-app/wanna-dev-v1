# Wanna disaster recovery runbook

What to do when the Supabase project is unavailable, corrupted, or accidentally destroyed.

The point of this doc is to compress "30 minutes of panic Googling" into a 15-minute walk-through. Print it / keep it offline / share with anyone who has admin access.

---

## Severity 1 — Project still exists but is unhealthy

Symptoms: app shows errors, queries hang, edge functions return 500s.

### 1. Check Supabase status page
https://status.supabase.com — incidents here mean wait, not act. Most service degradations resolve within 30 min.

### 2. Check our project's logs
- Dashboard → Logs → **Postgres** (look for OOM, long-running queries, deadlocks)
- Dashboard → Edge Functions → individual function → Logs

### 3. Look at the Database health page
Dashboard → Reports → **Performance / Health**. CPU pegged? Storage at 100%? Connection pool exhausted?

### 4. Common fixes
- **Connection pool exhausted:** restart the project (Dashboard → Project Settings → General → Restart). 2-min downtime. Last resort.
- **Stuck long-running query:** Dashboard → SQL Editor → run `SELECT pid, query, state, wait_event FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;` → `SELECT pg_terminate_backend(<pid>)` on the offender.
- **Storage full:** delete unused buckets, increase compute size, or upgrade plan.

## Severity 2 — Data corruption or accidental destructive change

Symptoms: rows missing, wrong values, dropped table.

### Restore from automated backup

Supabase auto-snapshots **daily** at midnight UTC. 7-day retention on Free/Pro.

1. Dashboard → Project Settings → Database → **Backups** (or "Backups" tab on Database page).
2. Pick the most recent snapshot from BEFORE the corruption.
3. Click **Restore**. This **creates a NEW project** at the snapshot point — your current project is untouched. Restoration takes 5-15 minutes for our DB size.
4. Once the new project is ready, you have to **repoint the app and edge functions** at the new project. See "Repointing the app" below.

> **Important:** Free tier only has daily backups. If you need point-in-time recovery (any moment in the last 7 days, not just midnight UTC), you need Pro plan ($25/mo). Worth upgrading if data loss tolerance is < 24h.

### Pulling specific rows back without a full restore

If only a small set of rows got dropped/clobbered, faster to:

1. Spin up the snapshot as a NEW project (steps above).
2. Open the SQL Editor on the snapshot project.
3. Export the specific rows you need: right-click table → Export, or `\COPY` via psql.
4. Import into the live project: SQL Editor → INSERT statements.

This avoids the full repointing dance.

## Severity 3 — Project deleted or unrecoverable

Symptoms: project ID returns 404, Supabase support says they can't help.

### Spin up a fresh project from the most recent backup

If you have a snapshot anywhere (Supabase's daily, your own pg_dump, etc.):

1. Supabase Dashboard → **New project**. Pick same region (us-east-1) so latency matches.
2. Restore the snapshot into the new project via Project Settings → Database → Import.
3. **Repoint everything**:
   - Update `app/.env`:
     ```
     EXPO_PUBLIC_SUPABASE_URL=https://<NEW_PROJECT>.supabase.co
     EXPO_PUBLIC_SUPABASE_ANON_KEY=<NEW_ANON_KEY>
     ```
   - Rebuild + redeploy the app (`eas build --profile production --platform ios`).
   - Update edge function secrets: re-paste `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_PREFS_SECRET`, `RESEND_API_KEY`, vault `service_role_key`.
   - Redeploy ALL edge functions: `supabase functions deploy --project-ref <NEW_REF>`.
   - Update `web/notifications/index.html` API_BASE constant + redeploy Netlify.
   - Update cron jobs' hardcoded URLs (currently each pg_cron schedule has the project URL baked in — `ymztxrpkhenbcbjjfbxr.supabase.co` appears in migrations 00013/00017/00037/00038/00055). You'll need to either edit those migrations and re-run them, or rewrite via SQL.

### If you have NO snapshot anywhere

Game over for that data. Recovery becomes:
- Email Supabase support (`support@supabase.com`) immediately — they may have backups they can offer
- Reach out to your hosting tier's support contact
- Restore from the most recent `pg_dump` you took manually (you DID take manual dumps too, right?)

**Lesson learned:** take a manual `pg_dump` weekly and store it somewhere off-Supabase (S3, Google Drive, anything). See "Manual backup" below.

---

## Manual backup (do this weekly)

```bash
# Set DB password from Supabase → Project Settings → Database → Connection string
export PGPASSWORD='<your-db-password>'

pg_dump \
  --host=aws-1-us-east-1.pooler.supabase.com \
  --port=5432 \
  --username='postgres.ymztxrpkhenbcbjjfbxr' \
  --dbname=postgres \
  --no-owner --no-privileges \
  --schema=public \
  --file=wanna-backup-$(date +%Y%m%d).sql

# Copy to Google Drive, S3, anywhere off-Supabase
mv wanna-backup-*.sql ~/Backups/
```

Keep at least the last 4 weekly dumps.

---

## Repointing the app (the painful part)

Files / config to update when migrating to a new Supabase project ref:

| File / location | What to change |
|---|---|
| `app/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Supabase Dashboard → Edge Functions → Secrets | `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_PREFS_SECRET`, `RESEND_API_KEY`, `RESEND_FROM` |
| Supabase Dashboard → SQL Editor → Vault | `service_role_key` (used by `get_service_role_key()` plpgsql helper) |
| `web/notifications/index.html` line 58 | `API_BASE` constant |
| `supabase/migrations/00013_*.sql`, `00017_*.sql`, `00019_*.sql`, `00037_*.sql`, `00038_*.sql`, `00042_*.sql`, `00055_*.sql` | Hardcoded project URLs in pg_cron schedules + welcome trigger |
| Apple Developer portal → Email Sources | re-verify `send.joinwannaapp.com` if domain ownership changed |

Most of this is mechanical; budget ~2 hours for a clean repoint + smoke test.

---

## Rotate compromised secrets

If the service_role key, EMAIL_PREFS_SECRET, RESEND_API_KEY, or Apple `.p8` are ever exposed (committed to a public repo, leaked in a screenshot, etc.):

1. **Service role key:** Dashboard → Project Settings → API → **Rotate JWT secret**. Then update all places that hold the key (function secrets + vault).
2. **EMAIL_PREFS_SECRET:** generate a new random string, update in function secrets. Old prefs-page URLs in already-sent emails will break (acceptable trade-off vs. exposure).
3. **RESEND_API_KEY:** Resend dashboard → API Keys → rotate. Update Supabase function secrets.
4. **APNs .p8:** Apple Developer → Keys → revoke compromised key, generate new one. Re-upload to Expo via the existing GraphQL flow.

---

## Tested?

This runbook has NOT been end-to-end tested with a real restore — the next time we're between sprints, do a dry run: create a throwaway snapshot, "restore" it as a second project, walk through repointing, then delete it. Catches the steps this doc gets wrong.
