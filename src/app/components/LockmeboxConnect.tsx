"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bluetooth } from "lucide-react";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import FormSuccess from "@/app/components/FormSuccess";
import { useApiError } from "@/app/hooks/useApiError";
import {
  lockmeboxBleMode, runLockmeboxAutoSession, runLockmeboxSession, type LockmeboxSessionError,
  type LockmeboxSessionOutcome,
} from "@/lib/lockmeboxBle";

/** Nach einem gescheiterten Versuch so lange warten, bevor die App wieder sucht — die Box schläft
 *  nach etwa einer Minute ein, ein Dauer-Neuversuch hülfe also nicht, er belastete nur den Akku. */
const AUTO_RETRY_MS = 3_000;

/** Fehler, die ein neuer Versuch beheben kann: die Box schlief wieder ein oder die Leitung hakte. */
const RETRYABLE = new Set<LockmeboxSessionError>(["noDevice", "noReply", "notApplied"]);

/**
 * Die Verbindung zur LockMeBox (Werks-Firmware, nur Bluetooth) — EIN Bauteil für beide Wege.
 *
 * - **In der App mit `autoBoxId`:** sie sucht im Hintergrund nach genau dieser Box und führt den
 *   anstehenden Befehl aus, sobald die Box nach dem Knopfdruck auftaucht. Kein zweiter Knopf.
 * - **Im Browser** (oder ohne `autoBoxId`, z.B. beim Koppeln): der Knopf „Mit Box verbinden". Web
 *   Bluetooth verbindet nur nach einem Klick auf der Seite.
 *
 * Kann das Gerät kein Bluetooth, zeigt sie nichts (`unsupportedHint` aus) — in der Karte wäre der
 * Satz eine Dauerzeile ohne Handlung. In den Einstellungen sagt sie, warum es nicht geht.
 */
export default function LockmeboxConnect({ unsupportedHint = false, autoBoxId }: {
  unsupportedHint?: boolean;
  /** Die gekoppelte Box, nach der die App selbst sucht. Ohne sie: nur der Knopf. */
  autoBoxId?: string;
}) {
  const t = useTranslations("lockmebox");
  const apiError = useApiError();
  const router = useRouter();
  const [mode, setMode] = useState<"native" | "web" | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    lockmeboxBleMode().then((m) => { if (alive) setMode(m); });
    return () => { alive = false; };
  }, []);

  const report = (outcome: LockmeboxSessionOutcome) => {
    if (outcome.ok) {
      setError(null);
      setSuccess(outcome.locked === null ? t("done") : outcome.locked ? t("doneLocked") : t("doneOpen"));
      // Held, Einträge und Karte gleich mit — der Tracker hat eben umgeschaltet.
      router.refresh();
    } else {
      setError(outcome.error !== "server" ? t(outcome.error) : outcome.code ? apiError(outcome.code) : t("serverUnreachable"));
    }
  };

  const auto = mode === "native" && !!autoBoxId;
  // Sucht nur, solange die App sichtbar ist — im Hintergrund liefe der Scan sonst stundenlang, und
  // an der Box steht dann ohnehin niemand. Beim Zurückkehren beginnt er von vorn.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!auto || !autoBoxId || !visible) return;
    const ctrl = new AbortController();
    const pause = (ms: number) => new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      ctrl.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    void (async () => {
      while (!ctrl.signal.aborted) {
        const outcome = await runLockmeboxAutoSession(autoBoxId, ctrl.signal).catch(() => null);
        if (!outcome || ctrl.signal.aborted) return;
        report(outcome);
        // Erfolg — oder ein Fehler, den ein neuer Versuch nicht behebt (fehlende Berechtigung, fremdes
        // Passwort, Ablehnung des Servers): nicht im Kreis suchen.
        if (outcome.ok || !RETRYABLE.has(outcome.error)) return;
        await pause(AUTO_RETRY_MS);
      }
    })();
    return () => ctrl.abort();
    // `report` bewusst nicht: es entsteht je Render neu, die Suche soll davon nicht neu starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, autoBoxId, visible]);

  if (mode === undefined) return null;
  if (mode === null) return unsupportedHint ? <p className="text-sm text-foreground-muted">{t("notSupported")}</p> : null;

  const connect = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      report(await runLockmeboxSession());
    } catch {
      setError(t("noReply"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {auto ? (
        <p className="text-sm text-foreground-muted">{t("autoSearching")}</p>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">{t("pressButton")}</p>
          <Button variant="secondary" size="sm" onClick={connect} loading={saving} icon={<Bluetooth size={16} />}>
            {saving ? t("connecting") : t("connect")}
          </Button>
        </>
      )}
      <FormSuccess message={success} variant="inline" />
      <FormError message={error} />
    </div>
  );
}
