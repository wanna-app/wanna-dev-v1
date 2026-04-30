import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

export function useUnreadMessagesBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!user) {
      setCount(0);
      return;
    }
    const { data, error } = await supabase.rpc("get_total_unread_messages");
    if (error) {
      console.warn("get_total_unread_messages error:", error.message);
      return;
    }
    setCount(typeof data === "number" ? data : 0);
  }, [user]);

  useEffect(() => {
    fetchCount();
    if (!user) return;

    // Subscribe to message inserts in any of the user's matches
    const channel = supabase
      .channel(`unread-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user, fetchCount]);

  return count;
}
