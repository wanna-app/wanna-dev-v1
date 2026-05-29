import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Drives the closeable "Confirm your email" nudge.
 *
 * Confirm-email is OFF in Supabase, so a freshly signed-up user gets a
 * session immediately and lands in onboarding without confirming. This
 * hook re-prompts them on every app open / foreground until their email
 * is confirmed:
 *   - On mount and on each foreground, re-checks the live confirmation
 *     status via supabase.auth.getUser() (the local session doesn't
 *     auto-update when the user clicks the link in their inbox).
 *   - Shows the modal if still unconfirmed and not dismissed this cycle.
 *   - "I'll do it later" hides it until the next foreground.
 *   - OAuth users (Google/Apple) are confirmed at creation, so this
 *     never fires for them.
 */
export function useEmailConfirmation() {
  const { session } = useAuth();
  const email = session?.user?.email ?? "";

  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [visible, setVisible] = useState(false);
  const [resending, setResending] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const refreshStatus = useCallback(async () => {
    if (!session) {
      setNeedsConfirm(false);
      setVisible(false);
      return;
    }
    // Fast path: the session we already hold says confirmed.
    if (session.user?.email_confirmed_at) {
      setNeedsConfirm(false);
      setVisible(false);
      return;
    }
    // The session may be stale (user just clicked the link). Hit the
    // server for the authoritative status.
    const { data } = await supabase.auth.getUser();
    const confirmed = !!data.user?.email_confirmed_at;
    setNeedsConfirm(!confirmed);
    if (!confirmed) setVisible(true);
    else setVisible(false);
  }, [session]);

  // On mount / when the session changes.
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Re-check + re-show on every foreground transition.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        void refreshStatus();
      }
    });
    return () => sub.remove();
  }, [refreshStatus]);

  const dismiss = useCallback(() => setVisible(false), []);

  const resend = useCallback(async () => {
    if (!email) return;
    setResending(true);
    try {
      await supabase.auth.resend({ type: "signup", email });
    } catch {
      // Swallow — the modal stays up; user can retry. A transient resend
      // failure shouldn't surface a scary error on a non-blocking nudge.
    } finally {
      setResending(false);
    }
  }, [email]);

  return {
    visible: visible && needsConfirm && !!email,
    email,
    resending,
    resend,
    dismiss,
  };
}
