"use client";

import { useState, useEffect } from "react";
import { Fingerprint } from "lucide-react";
import { useTranslations } from "next-intl";
import { signIn, getSession } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import Button from "@/app/components/Button";

/**
 * PasskeyLoginButton — shows a "Sign in with Passkey" button on the login page.
 * Only renders if WebAuthn is supported by the browser.
 *
 * Flow:
 * 1. Get authentication options from server (POST /api/auth/passkey/authenticate)
 * 2. Browser shows biometric/security key prompt
 * 3. Send response to server (PUT /api/auth/passkey/authenticate)
 * 4. Server returns one-time token
 * 5. Use token with signIn("credentials", { passkeyToken }) to create session
 */
export default function PasskeyLoginButton() {
  const t = useTranslations("passkey");
  const [supported, setSupported] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && "PublicKeyCredential" in window) {
      // Also check for conditional UI / autofill support
      setSupported(true);
    }
  }, []);

  async function handlePasskeyLogin() {
    setAuthenticating(true);
    setError("");

    try {
      // 1. Get authentication options
      const optionsRes = await fetch("/api/auth/passkey/authenticate", { method: "POST" });
      if (!optionsRes.ok) {
        setError(t("authFailed"));
        return;
      }
      const options = await optionsRes.json();

      // 2. Authenticate with browser/authenticator
      const credential = await startAuthentication(options);

      // 3. Verify on server
      const verifyRes = await fetch("/api/auth/passkey/authenticate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: credential }),
      });

      if (!verifyRes.ok) {
        setError(t("authFailed"));
        return;
      }

      const { token } = await verifyRes.json();

      // 4. Create NextAuth session via credentials provider bridge
      const result = await signIn("credentials", {
        passkeyToken: token,
        redirect: false,
      });

      if (result?.ok) {
        const session = await getSession();
        const dest = (session?.user as { role?: string })?.role === "admin" ? "/admin" : "/dashboard";
        window.location.href = dest;
      } else {
        setError(t("authFailed"));
      }
    } catch (err) {
      if ((err as Error)?.name !== "NotAllowedError") {
        setError(t("authFailed"));
      }
      // NotAllowedError = user cancelled, don't show error
    } finally {
      setAuthenticating(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        fullWidth
        icon={<Fingerprint size={18} />}
        loading={authenticating}
        onClick={handlePasskeyLogin}
      >
        {t("loginButton")}
      </Button>
      {error && (
        <p className="text-xs text-warn text-center">{error}</p>
      )}
    </div>
  );
}
