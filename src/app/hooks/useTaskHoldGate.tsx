"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import Sheet from "@/app/components/Sheet";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import type { TaskWarning } from "@/lib/taskIntervals";

/**
 * Die Bremse vor dem Ablegen: Warnkarte im Formular plus Rückfrage vor dem Absenden, wenn eine
 * laufende Aufgabe genau das verlangt, was hier gerade abgelegt bzw. geöffnet wird.
 *
 * Als Hook statt als Komponente, weil beide Teile zusammengehören und beide Formulare
 * (Trageende, KG öffnen) dieselbe Kombination brauchen — getrennt gebaut, hätte das eine Formular
 * über kurz oder lang die Karte ohne die Rückfrage.
 *
 * Ehrliche Grenze: das ist eine Prüfung zur RENDER-Zeit. Offline (`offlineFetch` legt die Mutation in
 * die Warteschlange) greift sie nicht. Das Ergebnis bleibt trotzdem richtig — der Zustand einer
 * Aufgabe wird aus den Einträgen abgeleitet, nicht hier gestempelt; es fehlt nur die Vorwarnung.
 */
export default function useTaskHoldGate({
  warnings,
  tz,
  onConfirm,
}: {
  warnings: TaskWarning[];
  /** Zeitzone des Subs — die Frist steht in SEINER Zeit. */
  tz: string;
  onConfirm: () => void;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const dl = toDateLocale(useLocale());
  const [asking, setAsking] = useState(false);

  /** Vor dem Absenden aufrufen: `true` = Rückfrage läuft, Absenden abbrechen. */
  const armed = () => {
    if (warnings.length === 0) return false;
    setAsking(true);
    return true;
  };

  const lines = warnings.map((w) => (
    <p key={w.title} className="text-sm text-warn-text break-words">
      {t("warnText", { title: w.title, until: formatDateTime(w.holdUntil, dl, tz) })}
    </p>
  ));

  const warningCard = warnings.length === 0 ? null : (
    <Card variant="semantic" semantic="warn">
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="text-warn shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex flex-col gap-1">
          <p className="text-sm font-semibold text-warn-text">{t("warnTitle")}</p>
          {lines}
        </div>
      </div>
    </Card>
  );

  // Bewusst dieselbe Bauform wie die beiden Warnungen in `OeffnenFormCore`: `Sheet`, und der
  // RISIKOFREIE Knopf ist der primäre. Ein Modal mit „Trotzdem ablegen" in Primärfarbe stünde im
  // selben Formular neben zwei Sheets mit umgekehrter Hierarchie — die riskante Wahl wäre
  // ausgerechnet die optisch betonte.
  const modal = (
    <Sheet open={asking} onClose={() => setAsking(false)} title="">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={28} className="flex-shrink-0 text-warn mt-0.5" />
          <div className="flex flex-col gap-1.5">
            <p className="font-bold text-foreground text-base leading-snug">{t("warnTitle")}</p>
            {lines}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="primary" fullWidth onClick={() => setAsking(false)}>
            {tc("cancel")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => {
              setAsking(false);
              onConfirm();
            }}
          >
            {t("warnConfirm")}
          </Button>
        </div>
      </div>
    </Sheet>
  );

  return { armed, warningCard, modal };
}
