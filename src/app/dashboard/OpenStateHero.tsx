"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import { useApiError } from "@/app/hooks/useApiError";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
import Button from "@/app/components/Button";
import StateHero from "@/app/components/StateHero";
import TimerDisplay from "@/app/components/TimerDisplay";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

/**
 * Der Held des OFFENEN Zustands — das Gegenstück zu `LaufendeSessionCard`.
 *
 * **Warum eine eigene Datei und nicht mehr in `DashboardClient`:** beide Helden beantworten
 * dieselbe Frage („in welchem Zustand bin ich, seit wann"), also gehören sie an denselben Platz.
 * Der verschlossene stand als Block `runningSession` an Position 6, der offene steckte in
 * `statusAndStats` an Position 11 — wer öffnete, sah dieselbe Auskunft von oben nach unten
 * springen. Jetzt rendert derselbe Block beide, und dafür muss der offene Held für sich stehen.
 *
 * **`tone`:** offen sein WILL nichts, also ohne Farbe und ohne Leuchten. Läuft eine
 * Reinigungspause, gibt es eine Frist — und die will etwas.
 */
export default function OpenStateHero({
  since,
  cleaningPauseUntil,
  cleaningRelockWarnTime,
  cleaningRelockWarnPassed,
  lockCall,
}: {
  /** Beginn des offenen Zustands (ISO). */
  since: string;
  /** Ende der laufenden Reinigungspause (ISO) — bis dahin führt ein Wiederverschluss dieselbe
   *  Session fort. `null`, wenn keine läuft. Reine Anzeige: der Verschluss-Zustand ist unberührt. */
  cleaningPauseUntil: string | null;
  /** Die STRAFFRIST als fertige Uhrzeit in der Zone des Subs — nur gesetzt, wenn sie FRÜHER liegt
   *  als der Countdown, sonst sagt der Countdown schon alles. */
  cleaningRelockWarnTime: string | null;
  /** Bereits verstrichen? Dann sagt die Zeile es im Perfekt, statt eine Frist zu versprechen, die
   *  es nicht mehr gibt — die Pause läuft ja weiter. */
  cleaningRelockWarnPassed: boolean;
  /** Der wartende Verschluss-AUFRUF (docs/riegel-konzept.md): erfasst, aber noch nicht vollzogen —
   *  es fehlt der Knopfdruck an der Box. `null`, wenn keiner läuft.
   *
   *  Er ersetzt den Wiederverschluss-Knopf, und zwar nicht nur der Optik wegen: das Formular
   *  dahinter lehnt einen zweiten Aufruf ab (`LOCK_ALREADY_PENDING`). Ein Knopf, der in eine Absage
   *  führt, ist schlimmer als keiner. */
  lockCall: { id: string; at: string } | null;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const [withdrawing, setWithdrawing] = useState(false);

  /** Den Aufruf zurücknehmen = den Eintrag löschen. Kein eigener Endpunkt: „ist nie passiert" IST
   *  das Löschen, und die Route räumt dabei auch das noch nicht abgeholte Box-Kommando ab.
   *
   *  Ohne `force`: ein schwebender Aufruf steht nicht in der Verschluss-Kette, die Route nimmt ihn
   *  deshalb von der Ketten-Prüfung aus. Fehler über `parseApiErrorCode`/`useApiError` wie überall,
   *  statt den Code der Route wegzuwerfen. */
  async function withdraw(id: string) {
    setWithdrawing(true);
    try {
      const res = await fetchWithTimeout(`/api/entries/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error(apiError(await parseApiErrorCode(res))); return; }
      router.refresh();
    } catch {
      toast.error(t("lockCallWithdrawFailed"));
    } finally {
      setWithdrawing(false);
    }
  }

  // Nach Fristablauf zurück in den normalen „offen"-Zustand — EIN Timer, ausgelöst vom Effekt.
  // Nicht über `onExpire` von TimerDisplay: das feuert aus dem Render heraus und im Sekundentakt,
  // was React verbietet (setState einer fremden Komponente während des Renderns) und bei einer
  // vorgehenden Client-Uhr sekündlich einen vollständigen Server-Render auslösen würde.
  useEffect(() => {
    if (!cleaningPauseUntil) return;
    const restMs = new Date(cleaningPauseUntil).getTime() - Date.now();
    // Schon abgelaufen (Uhr-Versatz): einmal refreshen, nicht wiederholt.
    const timer = setTimeout(() => router.refresh(), Math.max(0, restMs) + 1000);
    return () => clearTimeout(timer);
  }, [cleaningPauseUntil, router]);

  // Während der Pause die Restfrist, sonst die Zeit seit dem Öffnen. `format="short"` (mm:ss) für
  // den Countdown — `long` zeigt unter einer Stunde nur volle Minuten und stünde die letzte,
  // entscheidende Minute lang auf „0m".
  // **Was der Held zeigt, entscheidet EINE Rangfolge**, nicht fünf einzelne Ternäre: läuft eine
  // Reinigungspause, ist ihre Frist die Aussage — sie läuft ab, und ihr Ablauf hat Folgen. Wartet
  // nur ein Aufruf, ist er der Zustand. Sonst: offen seit.
  //
  // Zwei bewusste Ausnahmen von dieser Rangfolge, beide unten am Ort:
  //  • das ZEICHEN folgt dem Aufruf, weil er die jüngere Absicht ist,
  //  • die HANDLUNG unter dem Helden ebenso (der Wiederverschluss-Knopf führte in eine Absage).
  const mode = cleaningPauseUntil ? "pause" : lockCall ? "call" : "open";

  const timer = mode === "pause"
    ? { targetDate: cleaningPauseUntil!, mode: "countdown" as const, format: "short" as const }
    : { targetDate: mode === "call" ? lockCall!.at : since, mode: "countup" as const, format: "long" as const };

  return (
    <StateHero
      tone={mode === "open" ? "quiet" : "warn"}
      word={mode === "pause" ? t("cleaningPauseLabel") : mode === "call" ? t("lockCallLabel") : t("openSince")}
      icon={lockCall
        ? <LockClosedIcon size={15} strokeWidth={2.2} className="shrink-0" />
        : <LockOpenIcon size={15} strokeWidth={2.2} className="shrink-0" />}
      value={<TimerDisplay {...timer} />}
      /* Die Folge, bevor sie eintritt. Der Countdown darüber sagt, wie lange die Session
         fortgeführt wird; wo die STRAFFRIST früher endet (Reinigungsfenster kürzer als das
         Kontingent), muss diese Zeile das sagen — sonst verschliesst er bei laufendem Countdown und
         hat ein Vergehen, das er sich nicht erklären kann. */
      footnote={cleaningRelockWarnTime && (
        <span className="font-medium text-warn">
          {t(cleaningRelockWarnPassed ? "cleaningRelockWarnPassed" : "cleaningRelockWarn", { time: cleaningRelockWarnTime })}
        </span>
      )}
    >
      {lockCall ? (
        <div className="relative mt-4 flex flex-col gap-2">
          <p className="text-sm font-medium text-warn">{t("lockCallPressButton")}</p>
          <Button variant="secondary" loading={withdrawing} onClick={() => withdraw(lockCall.id)}>
            {t("lockCallWithdraw")}
          </Button>
        </div>
      ) : cleaningPauseUntil && (
        <Link href="/dashboard/new/verschluss" className="relative mt-4 block">
          <Button variant="semantic" semantic="lock" fullWidth icon={<LockClosedIcon size={16} />}>
            {t("cleaningPauseRelock")}
          </Button>
        </Link>
      )}
    </StateHero>
  );
}
