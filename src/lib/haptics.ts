// ---------------------------------------------------------------------------
// Haptic feedback helpers (Android Vibration API)
// No-ops on iOS and browsers without vibration support.
// Respects prefers-reduced-motion via CSS — but vibration has no CSS hook,
// so we check the media query directly.
// ---------------------------------------------------------------------------

function canVibrate(): boolean {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return false;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return true;
}

/** Light tap feedback — button press, tab switch (10ms) */
export function hapticLight() {
  if (canVibrate()) navigator.vibrate(10);
}

/** Medium feedback — action confirmed, sheet open (25ms) */
export function hapticMedium() {
  if (canVibrate()) navigator.vibrate(25);
}

/** Heavy feedback — error, warning, destructive action (30-10-30ms pattern) */
export function hapticHeavy() {
  if (canVibrate()) navigator.vibrate([30, 10, 30]);
}
