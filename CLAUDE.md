# Wanna — Development Context

## What Is Wanna
A 1:1 social app where people connect over shared activities. Users post activity cards, others swipe on the plans they want to join, and matches unlock chat. Friendship is default; dating and networking are opt-in intents. People swipe on plans, not profiles.

## Target Users
Young professionals (22–35), city newcomers, career transitioners, anyone in a new chapter.

## Tech Stack
- **Frontend:** React Native (Expo) with TypeScript
- **Backend:** Supabase (PostgreSQL) — auth, database, storage, real-time, edge functions
- **Auth:** Supabase Auth (email/password, Google OAuth, Apple Sign-In)
- **Storage:** Supabase Storage (private buckets, signed URLs)
- **Real-time:** Supabase Realtime (WebSocket for chat, typing, notifications)
- **Push:** APNs + FCM via Supabase Edge Functions
- **Photo Moderation:** Google Cloud Vision SafeSearch
- **Source Control:** GitHub (private monorepo)

## Supabase Project
- **URL:** `https://ymztxrpkhenbcbjjfbxr.supabase.co`
- **Anon Key:** stored in `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Never hardcode credentials

## Repo Structure
```
/                          — Root (README, .gitignore, CLAUDE.md)
/app                       — React Native application (Expo)
/app/src/screens           — Screen components
/app/src/components        — Reusable UI components
/app/src/navigation        — React Navigation setup
/app/src/lib               — Supabase client, utilities
/app/src/hooks             — Custom React hooks
/app/src/types             — TypeScript type definitions
/app/src/theme             — Brand colors, typography, spacing
/app/src/constants         — App constants (categories, enums)
/supabase/migrations       — SQL migration files (numbered)
/supabase/functions        — Edge functions
/supabase/seed.sql         — Seed data
```

## Brand Identity
### Colors
- **Primary:** #D4BBFF Lavender Mist, #B388FF Soft Violet, #8C52FF Wanna Purple, #6B3ACC Deep Violet, #4A2299 Royal Purple
- **Secondary:** #C8F4F8 Ice Cyan, #86E2EB Wanna Cyan, #57B8D0 Wanna Teal, #3D9AB0 Ocean Teal, #276880 Deep Teal
- **Neutral:** #FFFFFF White, #F5F5F7 Cloud, #B0B0B8 Slate, #2D2D3A Charcoal, #000000 Black
- **Gradient:** Purple (#8C52FF) → Cyan (#86E2EB)

### Typography
- **Display/Headings:** VAG Rounded Next Bold
- **Body:** Helvetica
- **Type Scale:** Display 32pt, Heading 24pt, Subhead 18pt, Body 16pt, Caption 12pt

### Personality
Youthful, modern, rounded, friendly, playful, inclusive.

## App Navigation
Bottom tab bar (always visible):
1. **Discover** (Compass) — Feed of activities, one card at a time
2. **Who's In** (Raised hands) — Your activities, swipe through interested users
3. **+** (Plus circle) — Post a new activity
4. **Matches** (Chat bubbles) — Consolidated conversations per user
5. **Profile** (Person) — Edit profile, preferences, settings, verification

## Database Tables
All tables have RLS enabled. Key tables:
- `profiles` — user identity, photos, preferences
- `discovery_preferences` — mode, gender, age, distance filters
- `activities` — posted activity cards
- `swipes` — like/pass actions
- `interest_queue` — batched queue per activity (10 per batch)
- `matches` — one active match per activity (lock logic)
- `messages` — chat messages with delivery status
- `meetup_checks` — post-match meetup confirmation
- `reports` — user/content reports
- `blocks` — user blocks

## Activity Categories
Arts & Culture, Bars & Nightlife, Books & Learning, Fitness & Sports, Food & Dining, Gaming & Tech, Movies & Shows, Music & Concerts, Outdoors & Adventure, Other

## Key Business Rules
- Single match per activity (queue locks after match, unlocks on unmatch)
- Interest queue batches of 10
- Feed: interest match priority → distance priority, with intent/gender/age/distance filters
- Chat consolidated per user across multiple activity matches
- Public activity requirement enforced via popups (educational first, confirmation after)
- Photo verification: camera-only selfie, manual review <24h
- Age gate: ≥18, DOB immutable
- Seed data flagged with is_seed=true on every table, excluded from real user feeds

## Commands
```bash
cd app && npx expo start        # Start dev server
cd app && npx expo start --ios  # iOS simulator
cd app && npm run lint          # Lint
```

## Deferred / Manual Tasks
A running log of every task that needs human hands (OAuth setup, paid
services, custom fonts, etc.) lives at [`DEFERRED.md`](./DEFERRED.md) at
the repo root. Update it whenever new manual work surfaces.

## Conventions
- TypeScript strict mode
- Functional components with hooks
- File naming: PascalCase for components, camelCase for utilities
- All Supabase credentials via environment variables
- Commit after every completed feature
- PRD is source of truth for features; Brand Guide is source of truth for visual design
