"use client";

import { useLocale } from "next-intl";
import { formatElapsedMs } from "@/lib/utils";
import useTick from "@/app/hooks/useTick";

/** Ab hier tragen Sekunden nichts mehr bei: eine Stunde. */
const SEKUNDEN_BIS_MS = 3_600_000;

export default function SessionDurationBadge({ since, pausedMs = 0 }: { since: string; pausedMs?: number }) {
  const locale = useLocale();
  useTick(1000);
  const ms = Date.now() - new Date(since).getTime() - pausedMs;

  // Sekunden nur, solange sie etwas sagen.
  //
  // Bei einer Session von drei Tagen ist die Sekundenstelle kein Informationsgewinn — sie ist der
  // Grund, warum die grosse Zahl umbricht: „3T 10h 22min 40s" braucht 16 Stellen, „3T 10h 22min"
  // zwölf. Eine Zahl, die auf zwei Zeilen umbricht, ist keine grosse Zahl mehr, sondern ein
  // Absatz. In der ersten Stunde dagegen ist das Ticken genau das, was man sehen will.
  //
  // Die Schwelle liegt bei einer Stunde und nicht bei einem Tag, weil die Stellenzahl dort
  // springt: darunter „58min 12s", darüber „1h 0min".
  //
  // `tabular-nums` gehört HIERHER, nicht zu den Aufrufern — die Anzeige tickt, und eine
  // Ziffernbreite, die sich beim Ticken ändert, lässt die Zeile zappeln. Bisher hing das daran,
  // dass alle drei Aufrufer es von aussen mitgaben; der nächste hätte es vergessen.
  return (
    <span suppressHydrationWarning className="tabular-nums">
      {formatElapsedMs(ms, locale, ms < SEKUNDEN_BIS_MS)}
    </span>
  );
}
