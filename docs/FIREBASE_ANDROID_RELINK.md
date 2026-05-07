# Re-link Firebase Android app to the new package name

**When to do this:** before testing Android push notifications on a real device. Not blocking iOS work — iOS APNs uses Team-ID-level keys (the `.p8`) that don't care about bundle IDs, so the iOS dev build + push pipeline are unaffected.

**Why this is needed:** the Android package name was renamed from `com.wanna.app` → `com.joinwannaapp.wanna`. The Firebase project still has the old package registered in its Android-app config, and EAS still has the old service-account-to-package linkage. Without re-linking, FCM v1 sends from `send-push` to Android devices will fail because Firebase doesn't know about the new package.

---

## Part A — Firebase Console (~3 min)

1. Open **https://console.firebase.google.com/** → sign in with the account that owns the `wanna-app-484519` project.
2. Click into the **wanna-app-484519** project.
3. Top-left gear icon → **Project settings**.
4. Scroll to the **"Your apps"** section.
5. Find the existing Android entry (package `com.wanna.app`). You have two choices:

   **Option A1 — Add a new Android app (recommended).** Keeps both packages registered, useful if you ever need to roll back.
   - Click **Add app** → choose Android (the green Android icon).
   - **Android package name:** `com.joinwannaapp.wanna` (must match exactly).
   - **App nickname:** `Wanna Android (joinwannaapp)` or similar — for your own reference.
   - **Debug signing certificate SHA-1:** leave blank for now. (Needed if/when you do Google sign-in via FCM, which you don't.)
   - Click **Register app**.
   - Skip the "Download google-services.json" step — Expo handles this server-side via the service account key. Click through to **Continue to console**.
   - Skip "Add Firebase SDK" and "Run your app" too — none of that's needed for FCM v1 push.

   **Option A2 — Delete the old app and add the new one.** Cleaner, slightly more permanent.
   - On the existing `com.wanna.app` entry, click the three-dot menu → **Remove app** → confirm.
   - Then proceed as in A1 to add `com.joinwannaapp.wanna`.

6. The new Android app should now appear in **Your apps**. That's all on the Firebase side.

## Part B — EAS credentials (~2 min)

The FCM v1 service-account key was originally uploaded to Expo and linked to `com.wanna.app`. It needs to be linked to `com.joinwannaapp.wanna` instead.

The service account key itself **doesn't need to change** — it's project-level (`wanna-app-484519`), not app-level. Just the linkage.

```bash
cd /Users/averyneal/Developer/wanna-dev-v1/app
eas credentials -p android
```

You'll get an interactive menu. Step through:

1. **Which build profile do you want to configure?** → `development` (then repeat later for `preview` / `production` if those exist).
2. **What do you want to do?** → look for an option like "Google Service Account" or "FCM v1 service account key" or "Configure FCM V1 service account".
3. **Existing key?** → there should already be a service account key uploaded under the project (the same one used for the old package). Choose to **use the existing** key rather than uploading a new one. The menu wording varies between eas-cli versions — common phrasings:
   - "Set up a Google Service Account Key for Push Notifications (FCM V1)"
   - "Use existing Google Service Account Key"
   - "Assign existing key to this configuration"
4. EAS will associate the existing key with the build configuration tied to the new package name.
5. Repeat for any other build profile (`preview`, `production`) you want push to work on.

## Part C — Verify

```bash
eas credentials -p android
```

Step into the menu again, look for the FCM v1 / Google Service Account section, confirm the package name shown is `com.joinwannaapp.wanna`. Exit the menu (Ctrl+C is fine, no save needed).

You can also verify on the Expo dashboard:
- https://expo.dev/accounts/wanna-dev/projects/wanna/credentials
- Under Android → Push notifications → confirm the FCM v1 Service Account Key is configured for `com.joinwannaapp.wanna`.

## Part D — Test (when you have an Android device)

1. Build the dev client: `eas build --profile development --platform android`.
2. Install on a real Android device (the link Expo emails you).
3. Sign in to Wanna; confirm `usePushRegistration` registers a push token (check `device_tokens` table for a row with `platform = 'android'`).
4. From another account, send yourself a swipe-right or chat message that should fire a push.
5. Push should land on the Android device.

If pushes silently disappear, the most common cause is the FCM v1 linkage didn't actually take — re-run Part B. The `eas build --profile production` builds for the Play Store later will need their own credential association too.

---

## Notes

- The old `com.wanna.app` Android app entry in Firebase, if you keep it, doesn't actively hurt anything — it just sits unused. Pre-launch is a fine time to delete it (Option A2 above) to avoid future confusion.
- The Firebase project ID `wanna-app-484519` and the service account email `firebase-adminsdk-fbsvc@wanna-app-484519.iam.gserviceaccount.com` stay the same; only the per-app package association changes.
- iOS APNs is completely unaffected. The `.p8` key is at the Apple Team ID level (`J442U4M7JC`) and doesn't reference the bundle ID at all. The bundle-ID rename is a no-op for iOS push.
