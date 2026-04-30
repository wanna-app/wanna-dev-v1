import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";
import { track } from "../lib/analytics";
import type { PendingMeetupCheck } from "../components/MeetupCheckModal";

interface MeetupChecksContextValue {
  pending: PendingMeetupCheck | null;
  recordYes: () => Promise<void>;
  recordNotYet: () => Promise<void>;
  dismiss: () => Promise<void>;
  refresh: () => Promise<void>;
}

const MeetupChecksContext = createContext<MeetupChecksContextValue | undefined>(
  undefined
);

export function MeetupChecksProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingMeetupCheck | null>(null);
  const lastCheckedAt = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setPending(null);
      return;
    }
    // Throttle to once per 30s — calls happen on every foreground
    if (Date.now() - lastCheckedAt.current < 30_000) return;
    lastCheckedAt.current = Date.now();

    const { error: matErr } = await supabase.rpc("materialize_meetup_checks");
    if (matErr) {
      console.warn("materialize_meetup_checks error:", matErr.message);
    }
    const { data, error } = await supabase.rpc("get_pending_meetup_check");
    if (error) {
      console.warn("get_pending_meetup_check error:", error.message);
      return;
    }
    const next = (data ?? [])[0] ?? null;
    if (next) {
      track("meetup_check_shown", {
        match_id: next.match_id,
        activity_id: next.activity_id,
        trigger_type: next.trigger_type,
      });
    }
    setPending(next);
  }, [user]);

  // Run on mount + on every foreground transition
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        lastCheckedAt.current = 0; // bypass throttle on foreground
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const respond = async (didMeet: boolean) => {
    if (!pending) return;
    const start = Date.now();
    const { error } = await supabase
      .from("meetup_checks")
      .update({
        did_meet: didMeet,
        responded_at: new Date().toISOString(),
      })
      .eq("id", pending.meetup_check_id);
    if (error) {
      console.warn("meetup respond error:", error.message);
      return;
    }
    track("meetup_check_responded", {
      match_id: pending.match_id,
      did_meet: didMeet,
      trigger_type: pending.trigger_type,
      time_to_respond_ms: Date.now() - start,
    });
    setPending(null);
    // Look ahead in case more checks are queued
    lastCheckedAt.current = 0;
    refresh();
  };

  const recordYes = () => respond(true);
  const recordNotYet = () => respond(false);

  const dismiss = async () => {
    if (!pending) return;
    const newCount = pending.dismiss_count + 1;
    const { error } = await supabase
      .from("meetup_checks")
      .update({ dismiss_count: newCount })
      .eq("id", pending.meetup_check_id);
    if (error) {
      console.warn("meetup dismiss error:", error.message);
      return;
    }
    track("meetup_check_dismissed", {
      match_id: pending.match_id,
      dismiss_count: newCount,
    });
    setPending(null);
  };

  return (
    <MeetupChecksContext.Provider
      value={{ pending, recordYes, recordNotYet, dismiss, refresh }}
    >
      {children}
    </MeetupChecksContext.Provider>
  );
}

export function useMeetupChecks() {
  const ctx = useContext(MeetupChecksContext);
  if (!ctx)
    throw new Error("useMeetupChecks must be used within MeetupChecksProvider");
  return ctx;
}
