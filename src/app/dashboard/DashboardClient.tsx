"use client";


import Link from "next/link";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import EmptyState from "@/app/components/EmptyState";
import Section from "@/app/components/Section";
import DashboardBlock from "@/app/components/DashboardBlock";
import { formatTotalHours } from "@/lib/utils";
import { coveragePct } from "@/lib/percent";
import { useLiveHours } from "@/app/hooks/useLiveHours";

// ── Types ────────────────────────────────────
export interface DashboardProps {
  currentStatus: { type: "VERSCHLUSS" | "OEFFNEN"; since: string } | null;
  hasEntries: boolean;

  // Die Anforderungen mit Frist (Kontrolle, Einschliessen, Orgasmus) stehen NICHT hier, sondern
  // im eigenen Block `DashboardAlerts` ganz oben auf der Seite — Begründung dort.

  // Stats
  tagH: number;
  wocheH: number;
  monatH: number;
  serverNow: string;
  elapsedTagH: number;
  elapsedWocheH: number;
  elapsedMonatH: number;
}

// ── Helpers ──────────────────────────────────

/**
 * Der Anteil der bisher VERSTRICHENEN Periode, den der Träger verschlossen war — nicht der Anteil
 * an einem Ziel. Der Unterschied war bis Etappe A unsichtbar: hier stand ein nacktes „81 %",
 * wenige Zeilen darüber in der Session-Karte ein „87 %" für dieselbe Dauer (dort gegen das
 * Tagesziel gerechnet). Zwei richtige Zahlen, kein Hinweis, wovon sie ein Anteil sind.
 *
 * Deshalb trägt diese Zahl ihren Nenner jetzt im Text (`{percent} % der bisherigen Tageszeit`) —
 * wie es die Jahresübersicht mit `percentLocked` schon immer tat. Die Zielbalken brauchen das
 * nicht: dort steht das `ist / soll` unmittelbar daneben.
 *
 * Der Text allein reichte nicht. Gelesen wird die FORM, nicht die 10-px-Zeile darunter: oben ein
 * zu einem Drittel gefüllter Ziel-Balken, 400 px tiefer ein randvoller für dieselbe Dauer — wer
 * scrollt, hält das Tagesziel für erfüllt und legt den Gürtel ab. Deshalb ist der verstrichene
 * Anteil keine Balkenform mehr.
 */
function WearPercent({ wornH, elapsedH, periodKey }: { wornH: number; elapsedH: number; periodKey: "coverageDay" | "coverageWeek" | "coverageMonth" }) {
  const t = useTranslations("dashboard");
  const pct = coveragePct(wornH, elapsedH);
  if (pct === null) return null;
  // Zehn Punkte = zehn Zehntel der bisher VERSTRICHENEN Periode. Ein Balken ist eine Füllgeste, er
  // läuft auf ein Ende zu, und ein volles Ende liest sich als „erreicht" — genau die Lesart, die
  // hier falsch ist. Eine Punktreihe ist abzählbar statt gefüllt. Dazu gedämpft statt in der
  // Zustandsfarbe: Vergangenes will nichts vom Nutzer, und Farbe trägt in diesem Entwurf nur, was
  // gerade etwas will. Damit unterscheiden sich die beiden Anzeigen doppelt — Form UND Farbe.
  //
  // Bewusst grob: der Zeitanteil ist eine Textur, die genaue Auskunft steht in der Zeile darunter.
  // `ceil` unten, Deckel oben: `round` liess die Reihe an BEIDEN Enden lügen. 95 % ergaben zehn von
  // zehn Punkten — also genau das Bild von 100 % und damit wieder das „voll heisst erreicht", gegen
  // das diese Form überhaupt gebaut wurde. Und 3 % ergaben null Punkte, ununterscheidbar von „gar
  // nicht getragen". Voll ist die Reihe jetzt nur bei 100.
  const filledDots = pct >= 100 ? 10 : Math.min(9, Math.max(1, Math.ceil(pct / 10)));
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`size-1.5 rounded-full ${i < filledDots ? "bg-border-strong" : "bg-border-subtle"}`} />
        ))}
      </div>
      <p className="text-[10px] text-foreground-faint mt-1 tabular-nums">{t(periodKey, { percent: pct })}</p>
    </div>
  );
}

// ── Component ────────────────────────────────
export default function DashboardClient(props: DashboardProps) {
  const t = useTranslations("dashboard");
  const {
    currentStatus,
    hasEntries,
    tagH: baseTagH,
    wocheH: baseWocheH,
    monatH: baseMonatH,
    serverNow,
    elapsedTagH: baseElapsedTagH,
    elapsedWocheH: baseElapsedWocheH,
    elapsedMonatH: baseElapsedMonatH,
  } = props;

  const isLocked = currentStatus?.type === "VERSCHLUSS";



  const tagH = useLiveHours(baseTagH, serverNow, isLocked);
  const wocheH = useLiveHours(baseWocheH, serverNow, isLocked);
  const monatH = useLiveHours(baseMonatH, serverNow, isLocked);
  const elapsedTagH = useLiveHours(baseElapsedTagH, serverNow, true);
  const elapsedWocheH = useLiveHours(baseElapsedWocheH, serverNow, true);
  const elapsedMonatH = useLiveHours(baseElapsedMonatH, serverNow, true);

  if (!hasEntries) {
    return (
      <DashboardBlock className="flex flex-col gap-4">
        <EmptyState
          icon={<Lock size={48} />}
          title={t("welcomeTitle")}
          description={t("welcomeDesc")}
          action={{ label: t("welcomeCta"), href: "/dashboard/new/verschluss" }}
        />
      </DashboardBlock>
    );
  }

  return (
    <DashboardBlock className="flex flex-col gap-4">
      {/* Anforderungs-Banner: siehe `DashboardAlerts` (eigener Block ganz oben).
           Sperrzeit-Banner entfernt — steht bereits im Sperrzeit-Footer der LaufendeSessionCard. */}

      {/* ── Stats Summary ── */}
      <Section
        title={t("statsTitle")}
        action={
          <Link href="/dashboard/stats" className="text-neben text-foreground-faint hover:text-foreground-muted transition">
            {t("allStats")} →
          </Link>
        }
      >
        {/* Weder ein Kasten um den Block noch drei Kacheln darin — vier Zäune für drei Zahlen.
            Die Zahlen tragen sich selbst, der Abstand trennt sie.

            Die Kennzahl-Stufe gilt erst ab `sm`. Sie ist für eine DRITTEL-Spalte zu gross: mit der
            Wort-Schreibweise ist „475h 5min" bei 25 px breiter als 110 px und bricht zweizeilig um.
            Eine Zahl, die umbricht, ist keine Zahl mehr — dieselbe Regel wie beim Helden, nur
            andersherum angewandt. Darunter trägt `text-zeile`.

            `whitespace-nowrap` als Riegel dahinter: der Monatswert kann bis 1000 h die Minuten
            mitführen („744h 30min"), und dann ist der Rand auch bei 16 px dünn. Lieber überläuft
            die Spalte sichtbar, als dass die Zahl still zweizeilig wird. */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-zeile sm:text-kennzahl font-semibold text-lock tabular-nums whitespace-nowrap">{formatTotalHours(tagH)}</p>
            <p className="text-neben text-foreground-faint mt-0.5">{t("wearToday")}</p>
            <WearPercent wornH={tagH} elapsedH={elapsedTagH} periodKey="coverageDay" />
          </div>
          <div>
            <p className="text-zeile sm:text-kennzahl font-semibold text-lock tabular-nums whitespace-nowrap">{formatTotalHours(wocheH)}</p>
            <p className="text-neben text-foreground-faint mt-0.5">{t("wearWeek")}</p>
            <WearPercent wornH={wocheH} elapsedH={elapsedWocheH} periodKey="coverageWeek" />
          </div>
          <div>
            <p className="text-zeile sm:text-kennzahl font-semibold text-lock tabular-nums whitespace-nowrap">{formatTotalHours(monatH)}</p>
            <p className="text-neben text-foreground-faint mt-0.5">{t("wearMonth")}</p>
            <WearPercent wornH={monatH} elapsedH={elapsedMonatH} periodKey="coverageMonth" />
          </div>
        </div>
      </Section>

      {/* Actions accessible via Neu-Button in bottom nav */}

    </DashboardBlock>
  );
}

