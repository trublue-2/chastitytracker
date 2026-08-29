// Geteilte, client-sichere Box-Status-Ableitung. EINE Quelle für Ist/Soll/Frische, genutzt von der
// Dashboard-Box-Status-Karte (BoxStatusCard). Keine Server-Imports — reine Formatierung; i18n bleibt
// beim Aufrufer (Labels via übergebenem `t`).

import type { ReinigungView, ReinigungsFenster } from "@/lib/reinigungService";
import type { CleaningBlockReason } from "@/lib/queries";

export type BoxRow = {
  boxId: string;
  name: string;
  /** SOLL: soll die Box zu sein (Heimdall-Entscheid, gespiegelt). */
  locked: boolean;
  /** Physisches IST der letzten Sync-Meldung — kann vom SOLL abweichen (Präsenz-Guard: „soll zu,
   *  steht offen und wartet auf Knopf/USB"). null = Alt-Zeile ohne IST-Meldung → SOLL gilt. */
  reportedLocked: boolean | null;
  /** Noch nicht von der Box abgeholtes Eintrags-Kommando (tracker-lokal, sofort nach dem Eintrag
   *  gesetzt) — der Spiegel hinkt bis zum nächsten Box-Sync nach. */
  pendingCommand: "lock" | "open" | null;
  simpleLock: boolean;
  keyholderLocked: boolean;
  /** Effektives Soll-Ende (Sperrzeit-Ende oder eigene Frist); null = ohne Zeitlimit / kein Soll. */
  lockUntil: string | null;
  /** Letzter Box-Sync (ISO) — Grundlage der Frische-Anzeige. null = noch nie gesynct. */
  lastSyncAt: string | null;
  /** Funkstille-Failsafe der Box: nach so vielen Stunden ohne Sync öffnet sie AUTONOM. Von Heimdall
   *  gepusht; null = Alt-Zeile → keine Vorwarnung (die Schwelle wird nicht geraten). */
  offlineOpenHours: number | null;
  /** Zuletzt gemeldeter Akkustand in Prozent; null = nie gemeldet oder kein Sensor. */
  battery: number | null;
  /** Hing die Box beim letzten Sync am Strom? Nur für die Anzeige („lädt") — der Akku-Failsafe
   *  kennt den Ladezustand bewusst NICHT (siehe `boxFailsafeWarnings`). */
  charging: boolean | null;
  /** Akku-Failsafe der Box: unter diesem Prozentwert öffnet sie AUTONOM. Von Heimdall gepusht statt
   *  hier hartkodiert — dann steht die Zahl wenigstens EINMAL pro System und nicht ein drittes Mal.
   *  Die Box meldet sie NICHT selbst: Heimdall spiegelt die Firmware-Konstante (`BATTERY_OPEN_PCT`
   *  in seiner `lib/utils.ts`), ein Firmware-Bump ohne Nachzug dort bleibt also unbemerkt.
   *  null = unbekannt → keine Vorwarnung. */
  lowBatteryOpenPercent: number | null;
  /** Firmware-Stand der Box, wie zuletzt gemeldet; null = nie gemeldet. Reine Anzeige neben dem
   *  Namen — beim Nachfragen zu einem Box-Problem ist die erste Frage immer die Version. */
  fwVersion: string | null;
};

/** Reinigungs-Regeln des Subs: die `ReinigungView` des Servers plus das nächste Fenster.
 *  Nicht neu deklariert — sonst müsste ein neues Feld in `buildReinigungView` hier von Hand
 *  nachgezogen werden und die Karte läse still `undefined`. `import type` wird zur Laufzeit
 *  gelöscht, zieht also kein Prisma in dieses client-sichere Modul. */
export type BoxReinigungView = ReinigungView & {
  nextWindow: ReinigungsFenster | null;
  /** Das Live-Urteil des Servers (`cleaningBlockReason`), inklusive der AKTIVEN Sperrzeit. `allowed`
   *  allein kennt sie nicht — deshalb versprach die Karte Fenster, die eine reinigungsverbietende
   *  Sperre längst gesperrt hatte. */
  blockedBy: CleaningBlockReason | null;
};

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** `BoxStatus.pendingCommand` ist in Prisma ein freier `String?` — hier auf die zwei gültigen Werte
 *  verengen. Geteilt von allen Stellen, die die DB-Zeile nach aussen reichen (`/api/box`, MCP),
 *  damit die Whitelist nicht an jeder Ausgabestelle einzeln steht und auseinanderläuft. */
export function toPendingCommand(raw: string | null | undefined): "lock" | "open" | null {
  return raw === "lock" || raw === "open" ? raw : null;
}

/**
 * Das gerade OFFENE Reinigungsfenster — und nur das.
 *
 * Es ist das einzige Stück aus der Reinigungs-Familie, das ins Dauerbild der Box gehört: eine
 * Gelegenheit mit ABLAUF. Das nächste Fenster ist ein Kalendereintrag, das Kontingent eine Regel,
 * und „diese Sperrzeit verbietet Reinigung" die Antwort auf eine Frage, die auf dem Dashboard
 * niemand stellt. Alle drei stehen auf `/dashboard/regeln`, und den Grund nennt ausserdem das
 * Öffnen-Formular am Ort der Handlung (`OeffnenFormCore`).
 *
 * Die Vorgängerin beantwortete alle vier Fälle in einem Rückgabewert und zwang die Karte damit,
 * dauerhaft eine Zeile dafür freizuhalten — auch für „es gibt keine Fenster".
 */
export function boxCleaningWindowOpenLabel(r: BoxReinigungView | null, t: Translate): string | null {
  if (!r?.allowed || r.blockedBy) return null;
  return r.windowOpenNow ? t("cleaningWindowOpen", { until: r.windowOpenNow.until }) : null;
}

/**
 * Steht die Box offen, obwohl etwas sie zu haben will?
 *
 * Die EINE Ableitung für beide Leser: der Störblock meldet den Konflikt laut, die Hardware-Zeile im
 * Zustands-Helden schweigt dann. Vorher stand die Bedingung nur im Block, und der Held sagte trotzdem
 * „Riegel offen" — dieselbe Tatsache zweimal auf einem Bildschirm, also genau die Dublette, deren
 * Beseitigung der Umbau versprach.
 *
 * PHYSISCH offen, nicht SOLL-offen: eine erst scharfgestellte Öffnung (Riegel noch zu, wartet auf
 * den Knopf) ist kein Alarm — dafür gibt es die Übergangs-Zeile.
 */
export function boxHasConflict(b: BoxRow): boolean {
  return !boxIsPhysicallyLocked(b) && boxSollLocked(b);
}

/**
 * Welche EINE Aussage über den Riegel gilt — oder keine.
 *
 * Es gibt zwei Arten, wie ein Riegel falsch steht, und sie überschneiden sich fast, aber nicht
 * ganz: `boxHasConflict` fragt „etwas will die Box zu, sie steht offen" über `boxSollLocked`
 * (Sperrzeit, Frist, lokale Verriegelung), {@link boxBoltOpenDespiteLocked} fragt es über den
 * gespiegelten `locked`-Entscheid und schliesst ein noch wartendes Kommando aus.
 *
 * **Warum die Rangfolge hierher gehört und nicht in die Karte.** Sie hatte sie als Negativ-Wächter
 * an der unterlegenen Zeile stehen (`conflict && !boltOpen`), und der Zustands-Held wusste nichts
 * davon: er schwieg über den Riegel nur bei `boxHasConflict`. In der Lage, in der die beiden
 * auseinandergehen, sagte er darum leise „Riegel offen", während die Karte darunter laut warnte —
 * dieselbe Tatsache zweimal, also genau die Dublette, deren Beseitigung `boxHasConflict` verspricht.
 * Jetzt lesen beide dieselbe Reihenfolge.
 *
 * `"omission"` gewinnt, weil es dasselbe sagt wie `"conflict"` plus den Grund und die Handlung.
 */
export function boxBoltAlert(b: BoxRow, keyInBox: boolean | null): "omission" | "conflict" | null {
  if (boxBoltOpenDespiteLocked(b, keyInBox)) return "omission";
  if (boxHasConflict(b)) return "conflict";
  return null;
}

/** Frischer als das → „gerade aktiv"; darüber → „zuletzt online vor X". */
const LIVE_THRESHOLD_MS = 2 * 60_000;

/**
 * Meldet sich die Box gerade? — als WERT, nicht als Textvergleich.
 *
 * Eine Aufrufstelle wollte wissen, ob die Frische überhaupt erwähnenswert ist, und verglich dafür
 * `boxFreshnessLabel(...) === t("live")`. Das ist derselbe Griff, an dem die Akku-Stufe gescheitert
 * ist: er hält nur, solange das Label nie einen Zusatz anhängt. `boxFreshnessLabel` benutzt diese
 * Funktion jetzt selbst, damit die beiden gar nicht auseinanderlaufen können.
 */
export function boxIsLive(lastSyncAt: string | null, now: number): boolean {
  if (!lastSyncAt) return false;
  return Math.max(0, now - new Date(lastSyncAt).getTime()) < LIVE_THRESHOLD_MS;
}

/** Physisches IST der Box: das gemeldete `reportedLocked`, bei Alt-Zeilen ohne Meldung das SOLL. */
export const boxIsPhysicallyLocked = (b: Pick<BoxRow, "locked" | "reportedLocked">): boolean => b.reportedLocked ?? b.locked;

/**
 * Laufender Übergang, den erst ein Knopfdruck an der Box vollzieht (Präsenz-Gate, FW ≥ 0.2.34):
 * `"closing"`/`"opening"` — oder null, wenn nichts unterwegs ist.
 *
 * Zwei Quellen: SOFORT nach dem Eintrag das tracker-lokale `pendingCommand` (der Spiegel weiss
 * noch nichts); danach der Soll/Ist-Mismatch in der Richtung „soll offen, Riegel noch zu".
 * `pendingCommand` gewinnt: es ist die jüngere Absicht.
 *
 * Nur diese Richtung: eine scharfgestellte Öffnung vollzieht der Träger von selbst (er will raus).
 * Das ausstehende SCHLIESSEN tut er gerade nicht — das ist kein Übergang, sondern ein Versäumnis,
 * siehe {@link boxBoltOpenDespiteLocked}.
 */
export function boxPendingTransition(b: BoxRow): "closing" | "opening" | null {
  if (b.pendingCommand === "lock") return "closing";
  if (b.pendingCommand === "open") return "opening";
  // KEIN `reportedLocked === null`-Ausstieg mehr: den brauchte nur die entfernte Gegenrichtung
  // (`locked && !reportedLocked` wäre bei `null` wahr geworden). Der verbliebene Zweig ist bei
  // `null` von sich aus falsch. In `boxBoltOpenDespiteLocked` ist derselbe Guard dagegen tragend.
  if (!b.locked && b.reportedLocked) return "opening";
  return null;
}

/**
 * Der Riegel steht offen, obwohl er zu sein soll — und es wartet kein Kommando mehr darauf.
 *
 * **Warum das ein eigener Zustand ist und kein Übergang.** Ein anstehendes `lock` löst sich von
 * selbst: die Box holt es beim nächsten Sync ab, jemand drückt den Knopf, fertig. Hier ist das
 * Kommando längst abgeholt (`/api/integration/box/status` löscht es beim Consume) und der Riegel
 * steht trotzdem offen. Es fehlt der Knopfdruck am Gerät, und der kommt nicht von allein — das
 * Präsenz-Gate (FW 0.2.34) verlangt jemanden davor.
 *
 * Bewusst OHNE Dauer: es gibt keinen Zeitstempel für den Beginn dieses Zustands. `pendingCommandAt`
 * wird beim Consume-Sync gelöscht, also genau dann, wenn er anfängt. „Offen seit …" liesse sich nur
 * mit einem neuen Feld sagen.
 */
export function boxBoltOpenDespiteLocked(
  // `pendingCommand` als ROHER `string | null`: geprüft wird nur, OB eines aussteht — welches, ist
  // hier gleichgültig. So passt auch eine unverengte Prisma-Zeile hinein, ohne dass die Aufrufstelle
  // die Whitelist aus `toPendingCommand` ein zweites Mal von Hand hinschreibt.
  b: Pick<BoxRow, "locked" | "reportedLocked"> & { pendingCommand: string | null },
  /** Liegt der Schlüssel überhaupt in der Box? `false` schliesst das Versäumnis aus, `null` (nicht
   *  bekannt) nicht — siehe unten. Bewusst ein PFLICHT-Argument: eine Vorgabe hätte an jeder neuen
   *  Aufrufstelle still die falsche Hälfte gewählt. */
  keyInBox: boolean | null,
): boolean {
  // **Der Reisefall ist kein Versäumnis.** Verschliesst sich der Träger und behält den Schlüssel
  // (`keyInBox: false`), schickt `boxCommandForEntry` bewusst KEIN Kommando — die Box bleibt offen,
  // völlig zu Recht. Eine Keyholder-Sperrzeit zieht Heimdall trotzdem als Dauerauftrag, `locked`
  // steht also auf zu. Ohne diese Zeile läse das jede Sicht als Versäumnis: der Träger bekäme
  // wochenlang „JETZT Knopf drücken!" für einen Knopf, der tausend Kilometer entfernt ist, und die
  // Keyholderin sähe ihn die ganze Zeit unter den auffälligen Trägern. Jede andere Riegel-Aussage
  // im Projekt rechnet den Fall heraus (`hardwareEnforced`, `keySecured`, `hardwareEnforcedReason`).
  if (keyInBox === false) return false;
  // Noch unterwegs ist kein Versäumnis — erst wenn niemand mehr darauf wartet. Über
  // `toPendingCommand`, damit ein Wert ausserhalb der Whitelist hier genauso zählt wie an den
  // Ausgabestellen: sonst schwiege diese Ableitung über einen Junk-Wert, den `/api/box` und der MCP
  // längst als `null` weiterreichen — dieselbe Zeile, zwei Lesarten.
  if (toPendingCommand(b.pendingCommand)) return false;
  if (b.reportedLocked === null) return false; // Alt-Zeile ohne IST → nichts ableitbar
  return b.locked && !b.reportedLocked;
}

/** Ist-Zustand der Box (Hardware-Wahrheit): offen, oder verschlossen (mit/ohne bestätigten Riegel).
 *  Nutzt das ECHTE IST — seit dem Präsenz-Guard kann die Box offen stehen, obwohl sie zu sein soll. */
export function boxIstLabel(b: BoxRow, t: Translate): string {
  if (!boxIsPhysicallyLocked(b)) return t("istOpen");
  // Kein Zusatz mehr für `simpleLock`. Der alte Text lautete „Verschlossen · mechanisch bestätigt"
  // und war eine vierte Lesart des Wortes „Verschlossen" — dem Wort, das seit v6 allein dem Träger
  // gehört. Er war ausserdem sachlich schief: `simpleLock` heisst laut Funktionsmodell „einfache
  // lokale Verriegelung ohne Frist", ist also ein VERRIEGELUNGS-MODUS und wird von `boxSollLocked`
  // auch genau so gelesen — keine Aussage darüber, ob das Gerät eine echte Riegelmeldung liefert.
  // Die stünde in `boltPos`, das nie nach `BoxRow` gemappt wurde. Bis das jemand entscheidet, sagt
  // die Zeile über die Bauform lieber nichts.
  return t("istLocked");
}

/**
 * Verlangt gerade irgendeine Quelle, dass die Box zu ist? Die EINE Ableitung des SOLL — genutzt von
 * der Soll-Zeile UND von der Konflikt-Optik der Karte, damit die beiden nicht auseinanderlaufen.
 *
 * Die drei Quellen sind unterschiedlich frisch, und genau daran hängt die Reihenfolge hier:
 *
 *  • `keyholderLocked`/`lockUntil` sind NICHT aus dem Spiegel — `/api/box` überlagert sie bei jedem
 *    Poll mit der aktiven Sperrzeit aus der Tracker-DB. Immer frisch, immer verbindlich.
 *  • `simpleLock` kommt per Push von Heimdall und steht bis zum nächsten Box-Sync auf dem Stand VOR
 *    dem Öffnungs-Eintrag.
 *
 * Deshalb schlägt ein anstehendes `open` nur den Spiegel-Anteil, nie die Sperrzeit. Ohne diese
 * Trennung würde eine Box, die nach dem `open` nie wieder synct (leerer Akku, WLAN weg), eine
 * Keyholder-Sperre DAUERHAFT verstecken: `pendingCommand` löscht ausschliesslich der Box-Sync, es
 * bliebe also für immer stehen (Review-Befund 24.07 an genau dieser Funktion).
 *
 * Warum der Spiegel-Anteil überhaupt weichen muss: sonst behauptet die Karte nach einer
 * eingetragenen Öffnung minutenlang „Soll: verschlossen" und malt dazu einen Konflikt-Alarm („steht
 * offen, obwohl zu verlangt") — für einen Konflikt, den der Sub gerade selbst und regelkonform
 * aufgelöst hatte (Vorfall 24.07). Das ist derselbe Vorrang, den `boxPendingTransition` schon kennt:
 * das Kommando ist die JÜNGERE Absicht.
 *
 * Dass der Alarm dabei verstummt, ist sicher, weil eine VERBOTENE Öffnung gar kein `open` erzeugt:
 * `boxCommandForEntry` gibt bei gebrochener Sperrzeit `null` zurück („das Dokumentieren des
 * Verstosses darf ihn nicht vollstrecken"). Ein Sperrbruch lässt den Spiegel also unangetastet.
 *
 * Bewusst NICHT symmetrisch: ein anstehendes `lock` erzwingt hier kein „verschlossen". Ein `open`
 * ENTWERTET den gespiegelten SOLL (er sagte „zu", jetzt gilt er nicht mehr); ein `lock` würde ihn nur
 * ERGÄNZEN, und die Details kennt erst Heimdalls nächster Push — sie hier zu erfinden wäre schlechter
 * als kurz zu warten. Den laufenden Übergang zeigt ohnehin `boxPendingTransition` an.
 *
 * BEKANNTE RESTLÜCKE: der Sync, der das Kommando abholt, pusht im selben Request noch den Zustand
 * VOR der Öffnung und löscht dabei `pendingCommand`. Für ein Sync-Intervall fällt die Zeile deshalb
 * auf den (noch alten) `simpleLock` zurück. Vorher galt das die ganze Zeit, jetzt nur in diesem
 * Fenster — behoben ist es damit aber nicht.
 */
export function boxSollLocked(b: BoxRow): boolean {
  if (b.keyholderLocked || b.lockUntil !== null) return true;
  if (b.pendingCommand === "open") return false;
  return b.simpleLock;
}

/** Soll-Zustand (Keyholder-Wahrheit): Sperre bis / ohne Zeitlimit / eigene Frist / kein Soll. */
export function boxSollLabel(b: BoxRow, t: Translate, fmtDateTime: (iso: string) => string): string {
  if (!boxSollLocked(b)) return t("sollNone");
  if (b.keyholderLocked) return b.lockUntil ? t("sollLockedUntil", { date: fmtDateTime(b.lockUntil) }) : t("sollLockedIndefinite");
  if (b.lockUntil) return t("sollUntil", { date: fmtDateTime(b.lockUntil) });
  return t("sollIndefinite");
}

/**
 * Vorwarnung vor den Failsafes, die die Box AUTONOM öffnen — ohne Knopfdruck, ohne Server, ohne
 * dass jemand am Gerät ist. Es sind genau zwei (`firmware/src/failsafe.h`): Funkstille
 * (`offlineOpenHours` ohne Sync) und Akku-Not (unter `lowBatteryOpenPercent`). Der dritte Weg zum
 * Offen — die abgelaufene Frist — ist seit FW 0.2.34 nur noch SCHARFGESTELLT und braucht Präsenz;
 * den zeigt `boxPendingTransition` an und er gehört bewusst nicht hierher.
 *
 * Warum das überhaupt existiert (heimdall#1): eine Box kann einen Tag lang jeden stündlichen Sync
 * verfehlen, ohne dass irgendwo etwas steht — und das erste sichtbare Signal ist dann die
 * Not-Öffnung selbst. Für den Träger überraschend, für die Keyholderin unbemerkt. Der einzige Weg,
 * sie zu verhindern, ist rechtzeitig für Netz zu sorgen; dafür braucht es diese Vorwarnung.
 *
 * Nur bei verschlossener Box: an einer offenen ist eine Not-Öffnung ein Nicht-Ereignis. Gemessen
 * wird das physische IST (`boxIsPhysicallyLocked`) — bei einer Alt-Zeile ohne IST-Meldung fällt das
 * wie überall auf das SOLL zurück.
 *
 * Der Offline-Zähler wird aus der VERGANGENEN ZEIT berechnet, nie aus einem Box-Feld — eine Box,
 * die nicht syncen kann, kann ihren eigenen Offline-Zähler auch nicht melden.
 *
 * EHRLICHKEITSGRENZE, beide Richtungen — gemessen wird „seit wann hat der TRACKER nichts gehört",
 * und das ist nicht dasselbe wie der Zähler in der Box:
 *
 *  • ZU FRÜH (der Normalfall): scheitert Heimdalls Status-Push, altert `lastSyncAt` hier, obwohl die
 *    Box gesynct hat. Harmlos — einmal umsonst nach dem WLAN sehen.
 *  • ZU SPÄT (selten, aber real): die Box setzt ihren Zähler erst zurück, wenn sie die ANTWORT des
 *    Servers erfolgreich gelesen hat; Heimdall stempelt `lastSyncAt` schon beim EINGANG der Anfrage.
 *    Kommt die Anfrage durch und die Antwort nicht (genau die wackelige Verbindung, um die es hier
 *    geht), zählt die Box weiter, während hier alles frisch aussieht. Dann fehlt die Warnung.
 *
 * Die zweite Richtung liesse sich nur schliessen, indem die Box ihren eigenen Zähler meldet — was
 * sie ohne Netz gerade nicht kann. Deshalb bleibt sie offen und steht hier.
 */
export type BoxFailsafeWarning =
  | { kind: "offlineOpen"; severity: BoxFailsafeSeverity; hoursOffline: number; thresholdHours: number; hoursLeft: number }
  // Kein `info` bei der Akku-Not: der Vorwarn-Abstand ist bewusst schmal (wenige Prozentpunkte),
  // ein dezenter Zwischenschritt wäre dort nur eine Farbe ohne Aussage.
  | { kind: "lowBatteryOpen"; severity: "warn" | "due"; percent: number; opensAtPercent: number };

/** `info` = dezenter Hinweis, `warn` = deutlich, `due` = Schwelle erreicht (die Not-Öffnung ist
 *  erfolgt oder steht unmittelbar bevor — welches von beidem, weiss erst der nächste Sync). */
export type BoxFailsafeSeverity = "info" | "warn" | "due";

/** Ab dem halben Fenster dezent, ab drei Vierteln deutlich (Schwellen aus heimdall#1). */
const OFFLINE_INFO_RATIO = 0.5;
const OFFLINE_WARN_RATIO = 0.75;

/** Vorwarn-Abstand zur Akku-Schwelle in Prozentpunkten. Reine ANZEIGE-Entscheidung (wie früh soll
 *  gewarnt werden), kein Firmware-Wert — die echte Auslöse-Schwelle kommt als `opensAtPercent`
 *  aus dem Heimdall-Push und wird hier nie geraten. */
const BATTERY_WARN_MARGIN_PCT = 5;

/** Untergrenzen der beiden oberen Anzeige-Stufen — ebenfalls reine Anzeige-Wahl, kein Hardware-Wert
 *  (anders als die kritische Stufe, die an der gemeldeten Auslöse-Schwelle hängt). */
const BATTERY_FULL_PCT = 80;
const BATTERY_MID_PCT = 40;

/** Die Akku-Auslöse-Schwelle, wie sie hier gelten darf — oder null, wenn es keine gibt.
 *
 *  `0` zählt als KEINE Schwelle, nicht als „öffnet bei 0 %": das ist die natürliche Kodierung für
 *  einen abgeschalteten Akku-Failsafe, und dieselbe Lesart hat der Funkstille-Zwilling schon
 *  (`offlineOpenHours > 0`). Ohne diese Klammer behauptete eine leergemeldete Box eine
 *  Selbst-Öffnung, die nie kommt.
 *
 *  EINE Quelle für beide Leser — die Warnung und die Dauer-Anzeige: „ab hier öffnet die Box selbst"
 *  darf nicht zweimal definiert sein, sonst zieht eine künftige Änderung (z.B. das Modellieren des
 *  Firmware-Latches) nur eine der beiden nach. */
function batteryOpenThreshold(lowBatteryOpenPercent: number | null): number | null {
  return lowBatteryOpenPercent != null && lowBatteryOpenPercent > 0 ? lowBatteryOpenPercent : null;
}

/** Die Felder, aus denen sich die Failsafe-Nähe ergibt — schmaler als `BoxRow`, damit der MCP
 *  dieselbe Ableitung mit seiner Prisma-Zeile fahren kann. Zwei Rechnungen über dieselbe Frage
 *  (Karte hier, Keyholder-Agentin dort) liefen sonst mit der Zeit auseinander.
 *
 *  `lastSyncAt` nimmt beide Formen: die Karte hat den ISO-String aus `/api/box`, der Server das
 *  `Date` aus Prisma. Jeder reicht seine native Form durch, statt sie für den Aufruf zu serialisieren
 *  und hier wieder zu parsen. */
export type BoxFailsafeInput =
  Pick<BoxRow, "locked" | "reportedLocked" | "offlineOpenHours" | "battery" | "lowBatteryOpenPercent"> &
  { lastSyncAt: string | Date | null };

export function boxFailsafeWarnings(b: BoxFailsafeInput, now: number): BoxFailsafeWarning[] {
  if (!boxIsPhysicallyLocked(b)) return [];
  const out: BoxFailsafeWarning[] = [];

  if (b.lastSyncAt && b.offlineOpenHours != null && b.offlineOpenHours > 0) {
    // Math.max(0, …): ein gemeldeter Sync minimal vor der Server-Uhr (Latenz, Uhr-Drift) darf nie
    // eine negative Offline-Dauer ergeben.
    const elapsedH = Math.max(0, now - new Date(b.lastSyncAt).getTime()) / 3_600_000;
    const ratio = elapsedH / b.offlineOpenHours;
    const severity: BoxFailsafeSeverity | null =
      ratio >= 1 ? "due" : ratio >= OFFLINE_WARN_RATIO ? "warn" : ratio >= OFFLINE_INFO_RATIO ? "info" : null;
    if (severity) {
      out.push({
        kind: "offlineOpen",
        severity,
        hoursOffline: Math.floor(elapsedH),
        thresholdHours: b.offlineOpenHours,
        // Aufgerundet: „in 1 h" ist die ehrlichere letzte Warnung als ein „in 0 h", das schon wie
        // vollzogen klingt. Bei erreichter Schwelle steht ohnehin 0.
        hoursLeft: Math.max(0, Math.ceil(b.offlineOpenHours - elapsedH)),
      });
    }
  }

  // BEWUSST ohne „schweigt am Kabel"-Ausnahme: `Failsafe::isLowBattery` (firmware/src/failsafe.h)
  // fragt den Ladezustand gar nicht — eine Box, die am Kabel unter die Schwelle fällt, öffnet
  // trotzdem, und sie hört damit erst bei der (höheren) Erholungsschwelle wieder auf. Genau dort zu
  // schweigen hiesse, ausgerechnet im Moment des Handelns die Folge zu verschweigen.
  //
  // BEKANNTE LÜCKE: die Firmware LATCHT (ab Schwelle gesetzt, erst bei ihrer Erholungsschwelle
  // gelöscht). Dieses Band meldet die Box nicht, der Vorwarn-Abstand hier deckt es nur zum Teil —
  // zwischen Abstand und Erholung kann die Box also noch öffnungsbereit sein, ohne dass es hier steht.
  const opensAt = batteryOpenThreshold(b.lowBatteryOpenPercent);
  if (b.battery != null && opensAt !== null) {
    if (b.battery <= opensAt + BATTERY_WARN_MARGIN_PCT) {
      out.push({
        kind: "lowBatteryOpen",
        severity: b.battery <= opensAt ? "due" : "warn",
        percent: b.battery,
        opensAtPercent: opensAt,
      });
    }
  }

  return out;
}

/** Beschriftung einer Failsafe-Vorwarnung. i18n bleibt beim Aufrufer (Labels via `t`) — wie im Rest
 *  dieses Moduls. */
export function boxFailsafeLabel(w: BoxFailsafeWarning, t: Translate): string {
  if (w.kind === "lowBatteryOpen") {
    return w.severity === "due"
      ? t("failsafeBatteryDue", { percent: w.percent, opensAt: w.opensAtPercent })
      : t("failsafeBatteryWarn", { percent: w.percent, opensAt: w.opensAtPercent });
  }
  return w.severity === "due"
    ? t("failsafeOfflineDue", { hours: w.hoursOffline })
    : t("failsafeOfflineWarn", { hours: w.hoursOffline, left: w.hoursLeft });
}

/**
 * Grober Akkustand für die DAUER-Anzeige. Bewusst vier Stufen statt der gemeldeten Prozentzahl: wie
 * genau eine Box misst, hängt daran, ob sie sich schon einmal am Ladeschluss selbst justiert hat —
 * eine nie voll geladene ist bis heute unkalibriert. Für eine Zeile, die immer mitläuft und zu der
 * niemand hinsieht, wäre „63 %" eine Genauigkeit, die je nach Box nicht da ist.
 *
 * Das ist KEIN Urteil über die Zahl an sich: die Failsafe-Warnung nennt sie weiter (`percent`), und
 * das zu Recht — wer handeln soll, braucht den Abstand zur Schwelle, nicht eine Stufe. Grob ist die
 * Wahl für den passiven Dauerzustand, nicht für den Alarm. Steht die Warnung, lässt die Karte diese
 * Stufe deshalb ganz weg (`BoxStatusCard`).
 *
 * Die KRITISCH-Stufe hängt an der echten, von Heimdall gemeldeten Auslöse-Schwelle, nicht an einer
 * runden Zahl — sie sagt „ab hier öffnet die Box selbst". Die beiden oberen Grenzen sind reine
 * Anzeige-Entscheidungen und behaupten nichts über die Hardware. Fehlt die Schwelle (Alt-Zeile,
 * Heimdall vor dem Feld), entfällt nur die kritische Stufe — geraten wird sie nie.
 *
 * null = nichts anzuzeigen (kein Akkuwert gemeldet, z.B. Board ohne Akku-Messung).
 *
 * ACHTUNG beim Lesen: der Wert ist so alt wie der letzte Kontakt. Deshalb steht er auf der Karte in
 * DERSELBEN Zeile wie die Frische — „zuletzt online vor 19 Std · Akku niedrig" liest die Alterung mit.
 */
export type BoxBatteryLevel = "critical" | "low" | "medium" | "full";

/**
 * Die STUFE des Akkus — als Wert, nicht als Text.
 *
 * Sie gab es nur als übersetzte Zeichenkette, und eine Aufrufstelle, die wissen wollte „ist der
 * Akku knapp?", verglich deshalb gegen `t("batteryLow")`. Das ist doppelt falsch: es koppelt Logik
 * an eine Übersetzung, und es geht bei geladenem Akku IMMER daneben, weil das Label dann
 * „· lädt" anhängt. Bei 5 % am Ladekabel wäre die Warnung damit stillschweigend ausgeblieben.
 */
export function boxBatteryLevel(
  b: Pick<BoxRow, "battery" | "lowBatteryOpenPercent">,
): BoxBatteryLevel | null {
  if (b.battery == null) return null;
  const opensAt = batteryOpenThreshold(b.lowBatteryOpenPercent);
  // Die Anzeige-Grenzen weichen der Schwelle AUS, statt fix zu bleiben: sonst stünde bei einer hoch
  // gemeldeten Schwelle „Akku voll" unter einer Warnung, die bei genau diesem Stand schon die
  // Selbst-Öffnung ankündigt. Alles, was die Warnung erreicht (Schwelle + Vorwarn-Abstand), ist
  // mindestens „niedrig"; die oberen Stufen rutschen entsprechend nach oben.
  const lowEdge = Math.max(BATTERY_MID_PCT, opensAt === null ? 0 : opensAt + BATTERY_WARN_MARGIN_PCT + 1);
  if (opensAt !== null && b.battery <= opensAt) return "critical";
  if (b.battery < lowEdge) return "low";
  return b.battery < Math.max(BATTERY_FULL_PCT, lowEdge + 1) ? "medium" : "full";
}

/** Knapp genug, dass es der Träger wissen muss — die eine Frage, die die Oberfläche stellt. */
export function boxBatteryIsLow(b: Pick<BoxRow, "battery" | "lowBatteryOpenPercent">): boolean {
  const level = boxBatteryLevel(b);
  return level === "low" || level === "critical";
}

export function boxBatteryLabel(
  b: Pick<BoxRow, "battery" | "charging" | "lowBatteryOpenPercent">,
  t: Translate,
): string | null {
  const level = boxBatteryLevel(b);
  if (level === null) return null;
  // Literale Keys, kein zusammengesetzter String: sonst taucht kein einziger davon im Quelltext auf
  // — weder für ein grep noch für einen Rename — und ein in `en.json` fehlender Key würde als roher
  // Schlüsselname in der Oberfläche landen, ohne dass ein Test anschlägt.
  const label = t(
    level === "critical" ? "batteryCritical"
      : level === "low" ? "batteryLow"
      : level === "medium" ? "batteryMedium"
      : "batteryFull",
  );
  return b.charging ? `${label} · ${t("batteryCharging")}` : label;
}

/** Frische aus `lastSyncAt`: „gerade aktiv" (< 2 Min), sonst „zuletzt online vor X"; null → nie gesynct. */
export function boxFreshnessLabel(lastSyncAt: string | null, now: number, t: Translate): string {
  if (!lastSyncAt) return t("neverSynced");
  if (boxIsLive(lastSyncAt, now)) return t("live");
  const ageMs = Math.max(0, now - new Date(lastSyncAt).getTime());
  const min = Math.floor(ageMs / 60_000);
  if (min < 60) return t("lastSeenMinutes", { count: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("lastSeenHours", { count: hours });
  return t("lastSeenDays", { count: Math.floor(hours / 24) });
}
