# Moderation Guide

This is what to do when a report comes in.

You handle reports from the **Mod tab** in the Wanna app. The tab only appears if your profile has `is_moderator = true` in the database.

---

## The flow at a glance

1. Open the **Mod tab** → **Reports**.
2. Tap any pending report. The **Resolve Report** modal opens.
3. Pick an action.
4. Fill in the form fields that appear (which fields show up depends on the action).
5. Tap **Resolve report**.

That single tap does everything: writes the database row, applies any account changes, kills active sessions for bans, blocks re-signin/re-signup for permanent bans, and emails the user with the moderator's exact wording.

You almost never need the Supabase Dashboard. The one exception is removing the actual offending content (an activity row, a photo URL, a message) — see [Where to find offending content](#where-to-find-offending-content) below.

---

## The five actions

### No action

Use when: the report is unfounded, frivolous, or the situation already resolved itself.

What it does: closes the report. Nothing else.

What the user sees: nothing — no email, no profile change.

### Warn user

Use when: there's a problem, but a remove or ban would be too much. Borderline behavior, first offense, low severity.

Form fields:
- **Explanation shown to user** (required, ≥ 4 characters): one line summary they'll read in the email. Be factual and specific. Don't reveal the reporter or quote them. Example: *"Your message in chat was disrespectful. Please re-read the community guidelines."*

What it does: nothing happens to the account. Logs the warning on the report row.

What the user sees: an email titled "An update on your Wanna account" containing the explanation you wrote.

### Remove content

Use when: a specific piece of content (an activity, a photo, a message) violates guidelines but the user themselves doesn't merit further action yet.

Form fields:
- **What got removed** (required): chip selector for **Activity / Photo / Message**. The modal pre-fills this with whatever the reporter originally flagged; only change it if the moderator's read of the situation differs.
- **Explanation shown to user** (required, ≥ 4 characters).

What it does:
- Logs the decision and the content type on the report row.
- Sends the user the content-removal email.
- **Does NOT physically delete the content.** That step is on you — see [Where to find offending content](#where-to-find-offending-content).

What the user sees: an email titled "An update on your Wanna account" naming the removed content type and your explanation.

### Temp ban

Use when: a clear violation that warrants a cooling-off period but not permanent removal.

Form fields:
- **Duration** (required): pick a preset chip (24 hours / 7 days / 30 days) **or** type a custom duration in the text field. Custom durations need to be valid: `"24 hours"`, `"3 days"`, `"14 days"`, `"3 hours"`, etc. Bare numbers (`"5"`) won't work.
- **Explanation shown to user** (required, ≥ 4 characters).

What it does, end-to-end:
- Marks the user inactive (`profiles.is_active = false`).
- Sets `profiles.banned_until` to the parsed expiry timestamp. The `auto-unban` cron flips them back to active automatically when this passes — you don't have to remember.
- Deletes every row in `auth.sessions` for that user. They're force-signed-out across every device immediately. Their next API call fails auth and the app falls into the BannedScreen.
- Sends the temp-ban email.

What the user sees: an email titled "Your Wanna account has been temporarily suspended" with your reason, the duration, and the date access is restored.

### Permanent ban

Use when: severe violations, repeat offenders, anything that warrants no second chance. Underage users always go here.

Form fields:
- **Explanation shown to user** (required, ≥ 4 characters).

What it does, end-to-end:
- Marks the user inactive (same as temp ban).
- Sets `auth.users.banned_until` to year 9999 — Supabase Auth rejects any sign-in attempt while this is set in the future. They cannot get back in with the same credentials.
- Adds the user's email to `banned_emails` — our signup trigger rejects re-signups from this address with a generic "signup_not_allowed" error (so attackers can't tell ban-rejection apart from any other signup failure).
- Deletes every active session.
- Sends the permanent-ban email.

What the user sees: an email titled "Your Wanna account has been permanently suspended" with your reason. They cannot sign in or sign up again with the same email.

---

## Optional internal notes

Every action also has an **Internal notes** field. Anything you put here is **not** shown to the user — it's just for you and your co-moderators in the future. Use it for context that's useful but doesn't belong in the user-facing email ("Reporter is the user's ex; corroborating screenshots in DM").

---

## Where to find offending content

The "Remove content" action logs your decision and emails the user, but it does NOT delete the actual content. You still have to remove it. Use the `reported_content_id` from the original report.

| Type | Where | What to do |
|------|-------|------------|
| **Activity** | Supabase Dashboard → Table Editor → `activities` | Find the row by `id` → set `status` to `deleted`. |
| **Photo** | Supabase Dashboard → Table Editor → `profiles` | Find the reported user → remove the offending URL from the `photos` array. |
| **Message** | Supabase Dashboard → Table Editor → `messages` | Find the row by `id` → delete it. |

If you can't find the content (e.g. the user already deleted it themselves), just go through with **Remove content** anyway — the email still goes, the decision is logged.

---

## Things you no longer need to do (but used to)

If you ever followed an older version of this guide, the following manual steps are **obsolete** as of 2026-05-07. The in-app modal handles all of them:

- ❌ Editing `status`, `resolution`, `resolved_at` on the `reports` row by hand.
- ❌ Editing `is_active`, `banned_until`, `ban_reason` on the `profiles` row by hand.
- ❌ Going to **Authentication → Users → Ban user** in the Supabase Dashboard for permanent bans.
- ❌ Manually adding rows to `banned_emails`.
- ❌ Calling the `moderate-user` edge function directly via curl to send the email.

Any of these will overwrite or duplicate work the modal already did. Don't.

---

## When something goes wrong

### "Wrong action picked"

Currently irreversible from the app. Manual SQL fix on the affected `reports` and `profiles` rows. Reach out to the dev team for help — there's no Undo button yet.

### "Wrong duration on a temp ban"

Edit the user's `banned_until` directly in the `profiles` table to the correct timestamp. The `auto-unban` cron will pick up the new expiry on its next hourly run.

### "Need to lift a permanent ban"

Three steps:
1. `profiles`: set `is_active = true`, clear `banned_until`, clear `ban_reason`.
2. `auth.users`: clear `banned_until` (currently set to year 9999).
3. `banned_emails`: delete the row matching their email.

### "User says they didn't get the email"

Check the `email_log` table filtered by `recipient_id`. If `status = 'sent'` with a `resend_message_id`, Resend accepted it — the issue is on the recipient's end (spam folder, mailbox bounce). If `status = 'failed'`, the `reason` column tells you why; usually a Resend API issue worth a retry.

### "Modal won't open / RPC errors"

If `mod_resolve_report` returns "not authorized" — your `profiles.is_moderator` flag is off. If it returns "report not found" — the report was already resolved by another moderator (refresh the queue).

---

## Triage cheatsheet

Quick mental mapping when you're skimming a report:

| Reporter wrote… | Likely action |
|------|------|
| Vague complaint, no specifics | **No action** |
| Mild rudeness, first offense | **Warn user** |
| Inappropriate photo / NSFW activity post | **Remove content** + warn or temp-ban depending on severity |
| Pattern of harassment in chat | **Temp ban** (start at 24h or 7d) |
| Underage user (any age below 18) | **Permanent ban** — non-negotiable, AC-PR-04 |
| Threatening behavior, doxxing, scams | **Permanent ban** |
| Activity not in a public place | **Remove content** + warn |
| Repeat offender (×3+ shown on the row) | Escalate one tier from where you'd otherwise land |

Lean conservative on first offenses, lean strict on patterns and on anything that touches safety.
