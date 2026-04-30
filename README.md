# Wanna

A 1:1 social app that matches people by what they like to do, not what they look like.

Users post activity cards (concerts, hikes, restaurants, tennis) and others swipe on the plans they want to join. When a match is made, you chat and meet up.

## Tech Stack

- **Frontend:** React Native (Expo) — iOS + Android
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- **Push:** APNs + FCM via Edge Functions

## Structure

```
/app                    — React Native (Expo) application
/supabase/migrations    — SQL migration files
/supabase/functions     — Edge functions
/supabase/seed.sql      — Seed data for dev/demo
```

## Getting Started

```bash
cd app
npm install
npx expo start
```
