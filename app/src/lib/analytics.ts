// Analytics: forwards every PRD-spec'd event to Mixpanel, but suppresses
// emission for seed users so demo / QA traffic doesn't pollute real
// metrics (PRD AC-SD-06).
//
// The is_seed gate flips on once the AuthProvider loads the profile and
// calls setSeedUser(). Until that happens we buffer events; if the user
// turns out to be a seed account, the buffer is dropped.

import { Mixpanel } from "mixpanel-react-native";

type EventProperties = Record<string, any>;

interface BufferedEvent {
  name: string;
  properties: EventProperties;
}

const TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;
const TRACK_AUTOMATIC_EVENTS = false;

let mixpanel: Mixpanel | null = null;
let initialized = false;
let isSeedUser: boolean | null = null; // null = unknown, true = seed, false = real
let buffer: BufferedEvent[] = [];

async function ensureMixpanel(): Promise<Mixpanel | null> {
  if (!TOKEN) return null;
  if (mixpanel && initialized) return mixpanel;
  if (!mixpanel) {
    mixpanel = new Mixpanel(TOKEN, TRACK_AUTOMATIC_EVENTS);
  }
  if (!initialized) {
    try {
      await mixpanel.init();
      initialized = true;
    } catch (e) {
      console.warn("[analytics] Mixpanel init failed:", e);
      return null;
    }
  }
  return mixpanel;
}

function flushBuffer() {
  if (isSeedUser === true) {
    buffer = [];
    return;
  }
  if (isSeedUser !== false) return; // still unknown
  const toFlush = buffer;
  buffer = [];
  void (async () => {
    const mp = await ensureMixpanel();
    if (!mp) return;
    for (const ev of toFlush) {
      try {
        await mp.track(ev.name, ev.properties);
      } catch (e) {
        if (__DEV__) console.warn(`[analytics] track(${ev.name}) failed:`, e);
      }
    }
  })();
}

/**
 * Called by AuthProvider once the profile has loaded so we know whether
 * to forward or drop events.
 */
export function setSeedUser(isSeed: boolean, userId?: string) {
  isSeedUser = isSeed;
  if (!isSeed && userId) {
    void (async () => {
      const mp = await ensureMixpanel();
      if (mp) {
        try {
          await mp.identify(userId);
        } catch (e) {
          if (__DEV__) console.warn("[analytics] identify failed:", e);
        }
      }
    })();
  }
  flushBuffer();
}

/**
 * Called on signOut so the next signed-in user starts fresh.
 */
export function resetAnalytics() {
  isSeedUser = null;
  buffer = [];
  void (async () => {
    const mp = await ensureMixpanel();
    if (mp) {
      try {
        await mp.reset();
      } catch (e) {
        if (__DEV__) console.warn("[analytics] reset failed:", e);
      }
    }
  })();
}

export function track(event: string, properties: EventProperties = {}) {
  if (__DEV__) {
    console.log(`[analytics] ${event}`, properties);
  }
  if (isSeedUser === true) return;
  if (isSeedUser === null) {
    buffer.push({ name: event, properties });
    return;
  }
  void (async () => {
    const mp = await ensureMixpanel();
    if (!mp) return;
    try {
      await mp.track(event, properties);
    } catch (e) {
      if (__DEV__) console.warn(`[analytics] track(${event}) failed:`, e);
    }
  })();
}
