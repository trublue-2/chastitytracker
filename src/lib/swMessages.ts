/**
 * Sends a message to the active Service Worker if one is registered.
 * Fire-and-forget — callers do not need to await.
 */
export function postSwMessage(message: Record<string, unknown>): void {
  if (typeof navigator === "undefined") return;
  navigator.serviceWorker?.controller?.postMessage(message);
}

/**
 * Clears the SW's user-specific API response cache and IndexedDB entries store.
 * Call on login and logout so no stale data from a previous user persists.
 */
export function clearSwUserCache(): void {
  postSwMessage({ type: "CLEAR_USER_CACHE" });
}
