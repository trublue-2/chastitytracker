"use client";

// Lock screen is handled natively in AppDelegate.swift (iOS) via LAContext.
// This component is intentionally empty — the native overlay is shown before
// the WebView becomes interactive, so no JS-side lock is needed.
export default function AppLock() {
  return null;
}
