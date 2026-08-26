"use client";

import { HelpCircle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import StateHero from "@/app/components/StateHero";
import SessionDurationBadge from "@/app/dashboard/SessionDurationBadge";
import { blockInsetCls } from "@/app/components/inputStyles";
import { toDateLocale, APP_TZ } from "@/lib/utils";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

interface Props {
  type: "VERSCHLUSS" | "OEFFNEN" | null;
  since: string | null;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}

/**
 * Der Zustand eines Subs, wenn gerade KEINE Tragezeit läuft — die Fassung, die die Keyholderin
 * sieht (`keyholderSubBlocks.tsx`, Zweig ohne `running`).
 *
 * **Dieselbe Figur wie der Held des Träger-Dashboards** (`LaufendeSessionCard`): leises Wort,
 * grosse Zahl, leise Zeile, kein Kasten.
 *
 * Bis v6 stand hier die alte App, und zwar vollständig: ein Verlaufskasten mit weisser Schrift, ein
 * Zeichen in einer getönten Kachel, und der Zustand DREIMAL angesagt — „STATUS" in 11 px, darunter
 * „Verschlossen" in 24 px, darunter „DAUER:" plus die Zahl. Genau diese Dreifachnennung beschreibt
 * `docs/design/umsetzung.md` als die Kernarbeit des Entwurfs; sie war am Träger-Dashboard entfernt
 * und hier stehengeblieben. Die Keyholderin wechselte damit zwischen zwei Subs und wechselte dabei
 * die App-Generation.
 *
 * **Beide Zustände tragen Farbe** — grün verschlossen, rosa offen. Hier stand einmal die Regel
 * „Farbe markiert, was gerade etwas will", und offen deshalb in Grau. Sie galt, solange die
 * Farbwelt eine Vorliebe war; seit sie den Zustand SAGT, sind es zwei Zustände statt einer und
 * seines Fehlens.
 *
 * Der Unterschied zum Träger-Dashboard ist kein Widerspruch, sondern der Kern der Sache: dort sagt
 * die FLÄCHE, ob offen ist, und der Held bleibt ruhig (`OpenStateHero` mit `quiet`). Hier sieht die
 * Keyholderin mehrere Träger nacheinander in ein und derselben Indigo-Welt — der Zustand kann
 * deshalb nur im Akzent stehen, und Grau liesse offen, ob da niemand verschlossen ist oder nur
 * niemand nachgesehen hat.
 */
export default function StatusBanner({ type, since, tz = APP_TZ }: Props) {
  const t = useTranslations("statusBanner");
  const dl = toDateLocale(useLocale());
  if (!type || !since) {
    return (
      <div className={`${blockInsetCls} py-6 flex items-center gap-2.5 text-foreground-faint`}>
        <HelpCircle size={18} className="shrink-0" />
        <p className="text-fliess">{t("noEntry")}</p>
      </div>
    );
  }

  const sinceDate = new Date(since);
  const isVerschlossen = type === "VERSCHLUSS";

  return (
    <StateHero
      tone={isVerschlossen ? "lock" : "unlock"}
      word={isVerschlossen ? t("locked") : t("opened")}
      icon={isVerschlossen
        ? <LockClosedIcon size={15} strokeWidth={2.2} className="shrink-0" />
        : <LockOpenIcon size={15} strokeWidth={2.2} className="shrink-0" />}
      /* Über `SessionDurationBadge`, nicht über eine eigene Rechnung: die Komponente bringt Takt,
         Formatierung und `suppressHydrationWarning` schon mit. Hier standen dafür ein
         handgeschriebenes `setInterval` und ein zweiter Aufruf von `formatElapsedMs`. */
      value={<SessionDurationBadge since={sinceDate.toISOString()} pausedMs={0} />}
      footnote={`${t("since")} ${sinceDate.toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz })}`}
    />
  );
}
