// Lightweight analytics stub. Wire up Mixpanel/Amplitude later (see DEFERRED.md).
// All PRD-defined events are funneled through this file so the swap is one place.

type EventProperties = Record<string, any>;

export function track(event: string, properties: EventProperties = {}) {
  if (__DEV__) {
    console.log(`[analytics] ${event}`, properties);
  }
  // TODO: forward to Mixpanel/Amplitude when configured
}
