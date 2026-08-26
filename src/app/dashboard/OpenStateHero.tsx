"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import StateHero from "@/app/components/StateHero";
import TimerDisplay from "@/app/components/TimerDisplay";
import LockOpenIcon from "@/app/components/LockOpenIcon";

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
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();

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
  const timer = cleaningPauseUntil
    ? { targetDate: cleaningPauseUntil, mode: "countdown" as const, format: "short" as const }
    : { targetDate: since, mode: "countup" as const, format: "long" as const };

  return (
    <StateHero
      tone={cleaningPauseUntil ? "warn" : "quiet"}
      word={cleaningPauseUntil ? t("cleaningPauseLabel") : t("openSince")}
      icon={<LockOpenIcon size={15} strokeWidth={2.2} className="shrink-0" />}
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
      {cleaningPauseUntil && (
        <Link href="/dashboard/new/verschluss" className="relative mt-4 block">
          <Button variant="semantic" semantic="lock" fullWidth icon={<Lock size={16} />}>
            {t("cleaningPauseRelock")}
          </Button>
        </Link>
      )}
    </StateHero>
  );
}
