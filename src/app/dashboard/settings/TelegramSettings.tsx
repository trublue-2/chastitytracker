"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import Toggle from "@/app/components/Toggle";
import FormError from "@/app/components/FormError";
import useToast from "@/app/hooks/useToast";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useNotificationChannelToggle } from "@/app/hooks/useNotificationChannelToggle";

export interface TelegramSettingsProps {
  /** Kontrolliert vom Elter (`SettingsForm`), damit es alle drei Kanäle für die „letzter Kanal
   *  aus"-Warnung live kennt — Verbindung wie Empfangs-Schalter. */
  linked: boolean;
  onLinkedChange: (v: boolean) => void;
  messageTelegram: boolean;
  onMessageTelegramChange: (v: boolean) => void;
}

/**
 * Selbstbedienung des Nutzers für den dritten Kanal: eigenen Telegram-Chat verbinden/entkoppeln und
 * — solange verknüpft — den Telegram-Empfang neuer Nachrichten schalten. Kein Keyholder-Feld,
 * deshalb kein MCP-Weg (die KI verknüpft keinen eigenen Chat). Muster wie {@link PushManager}:
 * eigenes Laden/Toast, optimistischer Schalter mit Revert.
 */
export default function TelegramSettings({ linked, onLinkedChange, messageTelegram, onMessageTelegramChange }: TelegramSettingsProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const toast = useToast();
  const apiError = useApiError();

  const [connecting, setConnecting] = useState(false);
  const [awaiting, setAwaiting] = useState(false); // Deep-Link geöffnet, warten auf /start im Chat
  const [error, setError] = useState<string | null>(null);

  // Der Webhook setzt die Verknüpfung, während der Nutzer im Telegram-Client ist. Kehrt er zurück
  // (Fenster-Fokus), den Status einmal nachschlagen — dann erscheint die Verbindung ohne Reload.
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/telegram");
      if (res.ok) {
        const data = await res.json();
        onLinkedChange(!!data.linked);
        if (data.linked) setAwaiting(false);
      }
    } catch { /* still — der Knopf bleibt bedienbar */ }
  }, [onLinkedChange]);

  useEffect(() => {
    if (!awaiting) return;
    const onFocus = () => { void refreshStatus(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [awaiting, refreshStatus]);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      const res = await fetch("/api/settings/telegram", { method: "POST" });
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        return;
      }
      const { url } = await res.json();
      setAwaiting(true);
      window.open(url, "_blank", "noopener");
    } catch {
      setError(tc("error"));
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setConnecting(true);
    try {
      const res = await fetch("/api/settings/telegram", { method: "DELETE" });
      if (res.ok) {
        onLinkedChange(false);
        setAwaiting(false);
      } else {
        setError(apiError(await parseApiErrorCode(res)));
      }
    } catch {
      setError(tc("error"));
    } finally {
      setConnecting(false);
    }
  }

  // Telegram-Kanal für neue Nachrichten — derselbe geteilte Hook wie Mail/Push, nur die Fehler-
  // Fläche ist ein Toast (der Abschnitt hat keine eigene Inline-Card für den Schalter).
  const toggleTelegramNotify = useNotificationChannelToggle(
    "MESSAGE_RECEIVED",
    useCallback((message: string | null) => { if (message) toast.error(message); }, [toast]),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground-muted">{t("telegramDesc")}</p>

      {linked ? (
        <>
          <p className="text-sm text-ok-text">{t("telegramConnected")}</p>
          {/* Telegram-Empfang neuer Nachrichten — parallel zum Mail/Push-Schalter, nur bei
              verknüpftem Chat. Die Nachricht selbst kommt ohnehin in den Posteingang. */}
          <Toggle
            label={t("telegramNotifyLabel")}
            description={t("telegramNotifyHint")}
            checked={messageTelegram}
            onChange={(c) => toggleTelegramNotify("telegram", onMessageTelegramChange, c)}
          />
          <Button variant="secondary" onClick={handleDisconnect} loading={connecting}>
            {t("telegramDisconnect")}
          </Button>
        </>
      ) : (
        <>
          {awaiting && <p className="text-sm text-foreground-muted">{t("telegramAwaiting")}</p>}
          <Button variant="primary" onClick={handleConnect} loading={connecting}>
            {t("telegramConnect")}
          </Button>
        </>
      )}

      <FormError message={error} />
    </div>
  );
}
