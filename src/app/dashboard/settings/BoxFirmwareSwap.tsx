"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Copy, Cpu, Loader2 } from "lucide-react";
import Button from "@/app/components/Button";
import Input from "@/app/components/Input";
import FormError from "@/app/components/FormError";
import FormSuccess from "@/app/components/FormSuccess";
import { useApiError } from "@/app/hooks/useApiError";
import { useLockmeboxError } from "@/app/hooks/useLockmeboxError";
import { useDebugMode } from "@/app/hooks/useDebugMode";
import { fetchWithTimeout } from "@/lib/apiClient";
import { runLockmeboxFirmwareSwap, type FirmwareSwapTicket } from "@/lib/lockmeboxBle";
import { heimdallProvisionLink, isValidSwapWifi } from "@/lib/lockmeboxProtocol";

/** So oft fragt die Seite nach, wie weit die Box ist. */
const POLL_MS = 5_000;
/** Danach hört sie auf zu fragen — die Download-Adresse gilt 15 Minuten, eine Box, die sich bis dann
 *  nicht gemeldet hat, braucht den Betreiber. Ein Neuladen der Seite beendet den Ablauf ohnehin. */
const POLL_MAX_MS = 30 * 60_000;

type Progress = { downloaded: boolean; registered: boolean };

/**
 * „Firmware wechseln": die gekoppelte LockMeBox bekommt Heimdall (`firmwareSwapService.ts`).
 *
 * Ablauf für den Träger: WLAN angeben → Knopf an der Box, verbinden → die Box lädt selbst. Danach
 * spannt sie ihr Setup-WLAN auf; der Setup-Link dafür entsteht HIER aus dem eben eingegebenen WLAN
 * und dem Geräte-Token vom Server — das WLAN-Passwort verlässt den Browser dafür nicht noch einmal.
 * Die Seite fragt nach, bis sich die Box als Heimdall-Box meldet; dann erscheint sie in der Karte.
 */
export default function BoxFirmwareSwap({ boxId }: {
  /** Die gekoppelte LockMeBox; `null`, sobald der Wechsel die Kopplung gelöst hat (oder keine da ist).
   *  Ein laufender Ablauf bleibt davon unberührt. */
  boxId: string | null;
}) {
  const t = useTranslations("lockmebox");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const errorText = useLockmeboxError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<FirmwareSwapTicket | null>(null);
  const [progress, setProgress] = useState<Progress>({ downloaded: false, registered: false });
  const [copied, setCopied] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // Ein Umbau-Werkzeug, kein Alltags-Knopf: nur der EINSTIEG hängt am Debug-Modus (Changelog). Einmal
  // geöffnet, bleibt der Ablauf stehen, auch wenn der Modus inzwischen aus ist — sonst ginge mitten
  // im Wechsel der Setup-Link verloren.
  const [debugMode] = useDebugMode();

  // Nachfragen, bis die Box angemeldet ist — nach dem Muster von `useBoxStatus`: im Hintergrund nicht,
  // beim Zurückkommen sofort (wer aus dem Setup-WLAN der Box zurückkehrt, will den Stand jetzt), und
  // `no-store`, weil die iOS-WebView sonst aus dem Cache antwortet. Fehler zählen nicht: während der
  // Einrichtung hängt das Handy oft im Setup-WLAN der Box, ohne Internet.
  useEffect(() => {
    if (!ticket || progress.registered) return;
    const until = Date.now() + POLL_MAX_MS;
    let busy = false;
    const tick = async () => {
      if (Date.now() > until) return setTimedOut(true);
      if (document.hidden || busy) return;
      busy = true;
      try {
        const res = await fetchWithTimeout(`/api/box/ble/firmware?device=${encodeURIComponent(ticket.deviceId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Progress;
        setProgress((prev) => (prev.downloaded === next.downloaded && prev.registered === next.registered ? prev : next));
        if (next.registered) router.refresh();
      } catch {
        // offline — beim nächsten Takt wieder
      } finally {
        busy = false;
      }
    };
    const onVisible = () => { if (!document.hidden) void tick(); };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ticket, progress.registered, router]);

  const wifiValid = isValidSwapWifi(ssid, password);

  const start = async () => {
    if (saving || !boxId) return;
    if (!wifiValid) return setError(apiError("BOX_SWAP_BAD_WIFI"));
    setSaving(true);
    setError(null);
    try {
      const outcome = await runLockmeboxFirmwareSwap(boxId, { ssid, password });
      if (!outcome.ok) return setError(errorText(outcome));
      const { ok: _ok, ...next } = outcome;
      setTicket(next);
    } catch {
      setError(t("noReply"));
    } finally {
      setSaving(false);
    }
  };

  if (!ticket && !boxId) return null;

  if (!open) {
    if (!debugMode) return null;
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} icon={<Cpu size={16} />}>
        {t("swapButton")}
      </Button>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">{t("swapIntro")}</p>
        <p className="text-sm text-foreground-muted">{t("swapWifiHint")}</p>
        <Input label={t("swapSsid")} value={ssid} onChange={(e) => setSsid(e.target.value)} autoComplete="off" />
        <Input label={t("swapPassword")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        <p className="text-sm text-foreground-muted">{t("pressButton")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={start} loading={saving} disabled={!wifiValid} icon={<Cpu size={16} />}>
            {saving ? t("connecting") : t("swapStart")}
          </Button>
          <Button variant="secondary" size="sm" disabled={saving} onClick={() => { setOpen(false); setError(null); }}>
            {tc("cancel")}
          </Button>
        </div>
        <FormError message={error} />
      </div>
    );
  }

  const link = heimdallProvisionLink(ssid, password, ticket.serverUrl, ticket.provisionToken);
  const copy = async () => {
    await navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {});
  };

  return (
    <div className="flex flex-col gap-3">
      <Step done>{t("swapStepSent")}</Step>
      <Step done={progress.downloaded}>{progress.downloaded ? t("swapStepDownloaded") : t("swapStepDownload")}</Step>
      <Step done={progress.registered}>
        <span>{t("swapStepSetup")}</span>
        <code className="mt-1 block break-all rounded bg-surface-raised p-2 text-xs select-all">{link}</code>
        <Button variant="secondary" size="sm" onClick={copy} icon={copied ? <Check size={16} /> : <Copy size={16} />} className="mt-2 self-start">
          {copied ? t("swapCopied") : t("swapCopy")}
        </Button>
      </Step>
      {progress.registered
        ? <FormSuccess message={t("swapDone")} variant="inline" />
        : <p className="text-sm text-foreground-muted">{timedOut ? t("swapTimedOut") : t("swapKeepOpen")}</p>}
    </div>
  );
}

/** Eine Zeile des Fortschritts: Haken, sobald erledigt, sonst ein Kreisel. */
function Step({ done = false, children }: { done?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm text-foreground">
      {done
        ? <Check size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />
        : <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-foreground-muted" aria-hidden />}
      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  );
}
