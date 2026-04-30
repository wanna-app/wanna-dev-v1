import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
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

    setProfile(data);
    if (!data || !isProfileComplete(data)) {
      setOnboardingState("needs_onboarding");
    } else {
      setOnboardingState("complete");
    }
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
