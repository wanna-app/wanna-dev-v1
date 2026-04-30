import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

const POLL_INTERVAL_MS = 30_000;

export function usePendingInterestBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!user) {
      setCount(0);
      return;
    }
    const { data, error } = await supabase.rpc("get_total_pending_interest", {
      p_user_id: user.id,
    });
    if (error) {
      console.warn("get_total_pending_interest error:", error.message);
      return;
    }
    setCount(typeof data === "number" ? data : 0);
  }, [user]);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return count;
}
