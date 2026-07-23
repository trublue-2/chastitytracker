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
  /** Foto des WEAR_BEGIN-Eintrags; null, wenn keines aufgenommen wurde (nur Kategorien mit
   *  `requirePhoto` erzwingen eines). Die Liste zeigt dann weiter das Kategorie-Icon. */
  imageUrl: string | null;
  /** Getragenes Gerät — fürs Detail-Panel der Foto-Vollbildansicht. Eine Trage-Session ist je Gerät
   *  gepaart, `deviceBreakdown` hat hier also genau einen Eintrag. */
  deviceName: string | null;
}

type WearCategory = { id: string; name: string; color: string; icon: string };

/** Nur die Felder, die für das Beginn-Foto gebraucht werden — die Seiten reichen ihre ohnehin
 *  geladenen Einträge durch, ohne sie hier auf einen breiteren Typ festzunageln. */
type EntryImage = { id: string; imageUrl?: string | null };

/**
 * Die abgeschlossenen Trage-Sessions der Nicht-KG-Kategorien als Zeilen — JE GERÄT, weil
 * `buildWearSessions` je Gerät paart (die Begründung steht dort). Zwei gleichzeitig getragene
 * Plugs derselben Kategorie geben damit zwei Zeilen statt zweier erfundener Dauern.
 *
 * Nimmt fertige Sessions: das Dashboard baut sie einmal und leitet Zeilen UND Stunden daraus ab.
 * `categories` sind die vom User getrackten Nicht-KG-Kategorien — Sessions anderer Kategorien
 * fallen raus. Laufende Sessions erscheinen nicht: die zeigt `ActiveWearSessions` oben im
 * Dashboard.
 *
 * `entries` sind die ohnehin geladenen Einträge der Seite; daraus kommt das Beginn-Foto. Das
 * Session-Modell führt bewusst keine Bilder (`SegmentEntry` hat kein `imageUrl`), und es dafür zu
 * erweitern hiesse, den von KG, MCP und Statistik geteilten Kern anzufassen — für ein reines
 * Darstellungs-Detail. Die Zuordnung ist eindeutig: `Session.id` IST die id des Kopf-Eintrags,
 * bei einer Trage-Session also der WEAR_BEGIN-Eintrag.
 */
export function buildWearSessionRows(
  categories: WearCategory[],
  sessions: Session[],
  dl: string,
  entries: EntryImage[] = [],
): WearSessionRow[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const imageByEntryId = new Map(entries.map((e) => [e.id, e.imageUrl ?? null]));

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
      imageUrl: imageByEntryId.get(s.id) ?? null,
      deviceName: s.deviceBreakdown[0]?.deviceName ?? null,
    }];
  });
}
