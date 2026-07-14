import { formatDate, formatDuration, formatTime } from "@/lib/utils";
import { type Session } from "@/lib/sessionModel";

/** Die Darstellungs-Schicht über `buildWearSessions` (Session-Modell): fertige Zeilen für die
 *  Trage-Session-Liste im Dashboard und in der Keyholder-Ansicht. Das Modell selbst bleibt
 *  formatfrei — hier fallen Locale, Datumsstrings und Kategorie-Optik an. */

/** Eine abgeschlossene Trage-Session, fertig formatiert für die Liste. */
export interface WearSessionRow {
  id: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  startDateStr: string;
  startTimeStr: string;
  endDateStr: string;
  endTimeStr: string;
  durationStr: string;
}

type WearCategory = { id: string; name: string; color: string; icon: string };

/**
 * Die abgeschlossenen Trage-Sessions der Nicht-KG-Kategorien als Zeilen — JE GERÄT, weil
 * `buildWearSessions` je Gerät paart (die Begründung steht dort). Zwei gleichzeitig getragene
 * Plugs derselben Kategorie geben damit zwei Zeilen statt zweier erfundener Dauern.
 *
 * Nimmt fertige Sessions: das Dashboard baut sie einmal und leitet Zeilen UND Stunden daraus ab.
 * `categories` sind die vom User getrackten Nicht-KG-Kategorien — Sessions anderer Kategorien
 * fallen raus. Laufende Sessions erscheinen nicht: die zeigt `ActiveWearSessions` oben im
 * Dashboard.
 */
export function buildWearSessionRows(
  categories: WearCategory[],
  sessions: Session[],
  dl: string,
): WearSessionRow[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return sessions.flatMap((s) => {
    const cat = s.categoryId ? categoryById.get(s.categoryId) : undefined;
    if (!cat || !s.end) return [];
    return [{
      id: s.id,
      categoryName: cat.name,
      categoryColor: cat.color,
      categoryIcon: cat.icon,
      startDateStr: formatDate(s.start, dl),
      startTimeStr: formatTime(s.start, dl),
      endDateStr: formatDate(s.end, dl),
      endTimeStr: formatTime(s.end, dl),
      durationStr: formatDuration(s.start, s.end, dl),
    }];
  });
}
