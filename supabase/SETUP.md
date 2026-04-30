# Supabase Setup

## ✅ Done (applied via psql)
- All 10 tables (`profiles`, `discovery_preferences`, `activities`, `swipes`, `interest_queue`, `matches`, `messages`, `meetup_checks`, `reports`, `blocks`)
- RLS enabled on every table with 29 policies
- `updated_at` triggers on `profiles` and `activities`
- `on_auth_user_created` trigger that creates a stub profile + discovery prefs row on signup
- `get_feed` RPC (interest + distance ranking with all filters)
- `haversine_miles` distance helper
- Storage buckets `profile-photos` and `verification-selfies` (private, 10MB)
- Storage RLS policies (users can manage their own folder; verification selfies are write-only for users)

## ⚠️ Manual steps you need to do in the dashboard

### 1. Connection pooler region
Project lives in `aws-1-us-east-1`. Connection string for any future migrations:
```
postgres://postgres.ymztxrpkhenbcbjjfbxr:<DB_PASSWORD>@aws-1-us-east-1.pooler.supabase.com:5432/postgres
```
(Port 5432 = session mode, needed for DDL/multi-statement scripts. Port 6543 = transaction mode for app queries.)

### 2. Google OAuth (~10 min)
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create or pick a project for Wanna
3. Click **Create Credentials** → **OAuth client ID** → **Web application**
4. Authorized redirect URI:
   ```
   https://ymztxrpkhenbcbjjfbxr.supabase.co/auth/v1/callback
   ```
5. Save the Client ID and Client Secret
6. In Supabase: [Auth → Providers → Google](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/auth/providers), enable, paste Client ID + Secret
7. For native iOS/Android, also create an iOS OAuth client and Android OAuth client in Google Cloud Console (different than the web one)

### 3. Apple Sign-In (~30 min, requires $99/yr Apple Developer account)
1. [Apple Developer → Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
2. Register an App ID (e.g., `com.wanna.app`) — enable **Sign In with Apple**
3. Register a Service ID (e.g., `com.wanna.app.signin`)
4. Configure the Service ID with redirect:
   ```
   https://ymztxrpkhenbcbjjfbxr.supabase.co/auth/v1/callback
   ```
5. Create a Sign In with Apple key (.p8 file)
6. In Supabase: [Auth → Providers → Apple](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/auth/providers), enable, paste:
   - Service ID
   - Team ID (from your Apple developer account)
   - Key ID
   - Private key (.p8 file contents)

### 4. Email confirmation settings
[Auth → Email Templates](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/auth/templates) — for development you may want to disable email confirmation:
[Auth → URL Configuration](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/auth/url-configuration) — add `wanna://auth-callback` as a redirect URL once we wire deep links.

### 5. Demo user (deferred — will be done when we build seed data)
The demo account `demo@joinwannaapp.com` / `WannaDemo2026!` will be created as part of the seed-data milestone. For now, signing up via email/password works.
