import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { resetAnalytics, setSeedUser, track } from "../lib/analytics";
import { unregisterDeviceToken } from "./usePushRegistration";
import type { Profile } from "../types/database";

type OnboardingState = "loading" | "needs_onboarding" | "complete";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  onboardingState: OnboardingState;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingState, setOnboardingState] =
    useState<OnboardingState>("loading");

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.warn("loadProfile error:", error.message);
      setProfile(null);
      setOnboardingState("needs_onboarding");
      return;
    }

    // Auto-reactivate paused / recently-deactivated accounts on login.
    // Runs BEFORE setProfile so the BannedScreen never flashes.
    let profile = data;
    if (profile) {
      profile = await maybeReactivate(profile);
    }
    if (profile) {
      profile = await maybeWriteTimezone(profile);
    }

    setProfile(profile);
    if (profile) {
      // Tell analytics whether this user is real or seed; events are
      // suppressed for seed users (PRD AC-SD-06).
      setSeedUser(!!profile.is_seed, profile.id);

      // Fire account_created exactly once per account, on the first
      // profile load where the flag is still false. Works for every
      // signup method (email / Google / Apple) since all create a
      // profiles row. Seed users are filtered downstream by analytics.
      if (!profile.signup_event_sent) {
        track("account_created");
        // Flip the flag so it never re-fires (app reloads, re-auth).
        // Fire-and-forget; if the update fails we accept a rare repeat
        // rather than blocking the load.
        void supabase
          .from("profiles")
          .update({ signup_event_sent: true })
          .eq("id", profile.id);
      }
    }
    if (!profile || !isProfileComplete(profile)) {
      setOnboardingState("needs_onboarding");
    } else {
      setOnboardingState("complete");
    }
  };

  /**
   * If the profile is paused or self-deactivated (and not banned), flip the
   * relevant flag(s) back so the user can use the app immediately.
   *
   * - is_paused=true                     → set to false
   * - is_active=false AND deactivated_at NOT NULL
   *   AND ban_reason IS NULL AND banned_until IS NULL → set is_active=true,
   *                                                     deactivated_at=null
   *
   * Moderator bans (ban_reason or banned_until set) are NEVER touched here —
   * those are the BannedScreen's job.
   *
   * Returns the (possibly patched) profile row.
   */
  const maybeReactivate = async (p: Profile): Promise<Profile> => {
    const isBanned = !!p.ban_reason || !!p.banned_until;
    const updates: Partial<Profile> = {};

    if (p.is_paused) {
      updates.is_paused = false;
    }
    if (!p.is_active && p.deactivated_at && !isBanned) {
      updates.is_active = true;
      updates.deactivated_at = null;
    }

    if (Object.keys(updates).length === 0) return p;

    const { data: updated, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", p.id)
      .select("*")
      .single();
    if (error || !updated) {
      console.warn("auto-reactivate failed:", error?.message);
      return p; // fall back to whatever we read
    }
    return updated as Profile;
  };

  /**
   * Write `profiles.timezone` if it's null or has drifted from the device's
   * current IANA TZ. Used by the meetup + new-activities pg_cron jobs to
   * decide when "9am local" or "Friday 3pm local" is for this user.
   */
  const maybeWriteTimezone = async (p: Profile): Promise<Profile> => {
    let deviceTz: string | null = null;
    try {
      deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      deviceTz = null;
    }
    if (!deviceTz) return p;
    if (p.timezone === deviceTz) return p;

    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ timezone: deviceTz })
      .eq("id", p.id)
      .select("*")
      .single();
    if (error || !updated) {
      console.warn("timezone write failed:", error?.message);
      return p;
    }
    return updated as Profile;
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setOnboardingState("loading");
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setOnboardingState("loading");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await unregisterDeviceToken().catch(() => {});
    resetAnalytics();
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await loadProfile(session.user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        onboardingState,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function isProfileComplete(profile: Profile): boolean {
  return (
    !!profile.first_name &&
    !!profile.date_of_birth &&
    profile.date_of_birth !== "2000-01-01" &&
    !!profile.gender &&
    Array.isArray(profile.photos) &&
    profile.photos.length >= 1 &&
    Array.isArray(profile.activity_preferences) &&
    profile.activity_preferences.length >= 1
  );
}
