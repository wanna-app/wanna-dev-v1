import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

interface ModCounts {
  reports: number;
  photo_flags: number;
  verifications: number;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Returns whether the current user is a moderator and (if so) the
 * pending counts across the three queues. The Admin tab is only
 * rendered when isModerator === true.
 */
export function useModeratorStatus() {
  const { profile } = useAuth();
  const isModerator = !!profile?.is_moderator;
  const [counts, setCounts] = useState<ModCounts>({
    reports: 0,
    photo_flags: 0,
    verifications: 0,
  });

  useEffect(() => {
    if (!isModerator) {
      setCounts({ reports: 0, photo_flags: 0, verifications: 0 });
      return;
    }
    let cancelled = false;
    const fetchCounts = async () => {
      const { data, error } = await supabase.rpc("mod_pending_counts");
      if (cancelled || error || !data) return;
      const row = (data as ModCounts[])[0] ?? data;
      setCounts({
        reports: row?.reports ?? 0,
        photo_flags: row?.photo_flags ?? 0,
        verifications: row?.verifications ?? 0,
      });
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isModerator]);

  const total = counts.reports + counts.photo_flags + counts.verifications;
  return { isModerator, counts, total };
}
