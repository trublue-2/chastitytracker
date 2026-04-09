"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { NativeBiometric, BiometryType } from "capacitor-native-biometric";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

export default function AppLock() {
  const t = useTranslations("appLock");

  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [biometryType, setBiometryType] = useState<BiometryType>(BiometryType.NONE);

  // Refs so appStateChange listener never captures stale closures
  const authenticatingRef = useRef(false);
  const lockedRef = useRef(false);

  function lock() {
    setLocked(true);
    lockedRef.current = true;
  }

  async function authenticate() {
    console.log("[AppLock] authenticate() called, authenticatingRef=", authenticatingRef.current);
    if (authenticatingRef.current) {
      console.log("[AppLock] already authenticating, skipping");
      return;
    }
    authenticatingRef.current = true;
    setAuthenticating(true);
    try {
      console.log("[AppLock] calling verifyIdentity...");
      // Race against a 20 s timeout — if the native call hangs (e.g. "Failed to
      // change to usage state 2" on iOS), we must still reset authenticating so
      // the button doesn't stay permanently grayed out.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("biometric_timeout")), 20_000)
      );
      await Promise.race([
        NativeBiometric.verifyIdentity({
          title: "ChastityTracker",
          useFallback: true, // fall back to device passcode if biometric fails
        }),
        timeout,
      ]);
      console.log("[AppLock] verifyIdentity SUCCESS");
      setLocked(false);
      lockedRef.current = false;
    } catch (err) {
      console.log("[AppLock] verifyIdentity ERROR:", JSON.stringify(err), String(err));
    } finally {
      authenticatingRef.current = false;
      setAuthenticating(false);
      console.log("[AppLock] authenticate() done, authenticatingRef reset");
    }
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function init() {
      try {
        const result = await NativeBiometric.isAvailable({ useFallback: true });
        console.log("[AppLock] isAvailable:", JSON.stringify(result));
        if (!result.isAvailable) return;
        setBiometryType(result.biometryType);
        lock();
        authenticate();
      } catch {
        // Biometric not available — no lock needed
      }
    }

    init();

    // Re-lock when app goes to background.
    // Do NOT auto-authenticate on foreground — the iOS LAContext is often in an
    // invalid state immediately after the device is unlocked, causing verifyIdentity()
    // to hang silently and leaving authenticatingRef stuck at true (which makes
    // manual button taps do nothing). The user taps the button instead.
    const listenerPromise = App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        // Reset any stuck authenticating state when going to background
        authenticatingRef.current = false;
        setAuthenticating(false);
        lock();
      }
    });

    return () => {
      listenerPromise.then((h) => h.remove());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function unlockLabel() {
    if (authenticating) return t("unlocking");
    if (biometryType === BiometryType.FACE_ID) return t("unlockFaceId");
    if (biometryType === BiometryType.TOUCH_ID) return t("unlockTouchId");
    return t("unlockPasscode");
  }

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5"
      style={{ background: "var(--color-background, #111827)" }}>
      <div className="w-20 h-20 rounded-3xl bg-surface-raised flex items-center justify-center shadow-lg">
        <Lock size={36} className="text-foreground-muted" />
      </div>
      <p className="text-foreground text-xl font-bold tracking-tight">ChastityTracker</p>
      <p className="text-foreground-faint text-sm">{t("subtitle")}</p>
      <button
        type="button"
        onClick={authenticate}
        disabled={authenticating}
        className="mt-2 px-6 py-3 bg-surface-raised border border-border rounded-xl text-foreground-muted text-sm font-medium hover:bg-surface active:scale-95 disabled:opacity-40 transition"
      >
        {unlockLabel()}
      </button>
    </div>
  );
}
