"use client";

import { useState, useEffect, useCallback } from "react";
import { Fingerprint, Trash2, Plus, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { startRegistration } from "@simplewebauthn/browser";
import ActionModal from "@/app/components/ActionModal";
import Button from "@/app/components/Button";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import Input from "@/app/components/Input";
import useToast from "@/app/hooks/useToast";
import { formatDate, toDateLocale } from "@/lib/utils";

interface PasskeyEntry {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Name für den eben angelegten Passkey. Der Schlüssel liegt zu diesem Zeitpunkt schon im Gerät —
 * Schliessen (Escape, X) heisst deshalb „ohne Namen speichern", wie das leere Feld im früheren
 * `prompt()`; ein verworfener Dialog liesse einen Passkey im Gerät zurück, den der Server nie kennt.
 */
function PasskeyNameDialog({ open, saving, onSubmit }: { open: boolean; saving: boolean; onSubmit: (name: string | null) => void }) {
  const t = useTranslations("passkey");
  const [name, setName] = useState("");
  const submit = (n: string) => onSubmit(n.trim() || null);
  return (
    <ActionModal
      open={open}
      onClose={() => submit("")}
      busy={saving}
      title={t("deviceNameTitle")}
      icon={<Fingerprint size={20} className="text-foreground-muted" />}
      iconBg="var(--color-surface-raised)"
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(name); }} className="flex flex-col gap-3">
        <Input
          label={t("deviceNameLabel")}
          hint={t("deviceNameHint")}
          value={name}
          maxLength={60}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" fullWidth loading={saving}>{t("deviceNameSave")}</Button>
        <Button variant="ghost" fullWidth disabled={saving} onClick={() => submit("")}>{t("deviceNameSkip")}</Button>
      </form>
    </ActionModal>
  );
}

/**
 * PasskeyManager — lists, adds, and removes passkeys.
 * Shown in the user settings page.
 * Only renders on browsers that support WebAuthn.
 */
export default function PasskeyManager({ timezone }: { timezone: string }) {
  const t = useTranslations("passkey");
  const dateLocale = toDateLocale(useLocale());
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Die frisch erzeugte Antwort des Geräts, solange der Nutzer den Namen wählt. */
  const [pendingCredential, setPendingCredential] = useState<Awaited<ReturnType<typeof startRegistration>> | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (typeof window !== "undefined" && "PublicKeyCredential" in window) {
      setSupported(true);
    }
  }, []);

  const loadPasskeys = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/passkey/list");
      if (res.ok) {
        setPasskeys(await res.json());
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (supported) loadPasskeys();
  }, [supported, loadPasskeys]);

  async function handleRegister() {
    setRegistering(true);
    try {
      // 1. Get registration options from server
      const optionsRes = await fetch("/api/auth/passkey/register", { method: "POST" });
      if (!optionsRes.ok) {
        toast.error(t("registerFailed"));
        return;
      }
      const options = await optionsRes.json();

      // 2. Create credential with browser/authenticator
      // 3. Ask for the device name (dialog), then 4. verify and store — see `finishRegistration`
      setPendingCredential(await startRegistration({ optionsJSON: options }));
    } catch (err) {
      // User cancelled or error
      if ((err as Error)?.name !== "NotAllowedError") {
        toast.error(t("registerFailed"));
      }
    } finally {
      setRegistering(false);
    }
  }

  async function finishRegistration(deviceName: string | null) {
    if (!pendingCredential) return;
    setRegistering(true);
    try {
      const verifyRes = await fetch("/api/auth/passkey/register", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: pendingCredential, deviceName }),
      });

      if (verifyRes.ok) {
        toast.success(t("registered"));
        loadPasskeys();
      } else {
        toast.error(t("registerFailed"));
      }
    } catch {
      toast.error(t("registerFailed"));
    } finally {
      setPendingCredential(null);
      setRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      const res = await fetch("/api/auth/passkey/list", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        toast.success(t("deleted"));
        setPasskeys((prev) => prev.filter((p) => p.id !== id));
      } else {
        toast.error(t("deleteFailed"));
      }
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  if (!supported) return null;

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Fingerprint size={18} className="text-foreground-muted" />
          <span className="text-sm font-medium text-foreground">{t("title")}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus size={16} />}
          onClick={handleRegister}
          loading={registering}
        >
          {t("add")}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-foreground-faint py-2">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : passkeys.length === 0 ? (
        <p className="text-xs text-foreground-faint">{t("noPasskeys")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {passkeys.map((pk) => (
            <div
              key={pk.id}
              className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {pk.deviceName || t("unnamedDevice")}
                </span>
                <span className="text-[10px] text-foreground-faint">
                  {t("addedOn", { date: formatDate(pk.createdAt, dateLocale, timezone) })}
                  {pk.lastUsedAt && ` · ${t("lastUsed", { date: formatDate(pk.lastUsedAt, dateLocale, timezone) })}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(pk.id)}
                disabled={deletingId === pk.id}
                className="text-foreground-faint hover:text-warn transition-colors p-1 flex-shrink-0"
                aria-label={t("delete")}
              >
                {deletingId === pk.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Nur gemountet, solange ein Schlüssel wartet: der Name vom letzten Mal soll nicht im Feld stehen. */}
      {pendingCredential && <PasskeyNameDialog open saving={registering} onSubmit={finishRegistration} />}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        danger
        title={t("delete")}
        message={t("deleteConfirm")}
        confirmLabel={t("delete")}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
