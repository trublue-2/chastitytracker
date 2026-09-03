/**
 * Der Funktionskatalog: was man mit dem Tracker TUN kann — eine Zeile je Fähigkeit.
 *
 * Die dritte Sicht neben den beiden anderen, und bewusst eine eigene Einheit:
 * - `funktionsmodellRegistry.ts` listet FELDER (was lässt sich einstellen),
 * - die Steckbriefe beschreiben MECHANIKEN (wie hängt das zusammen),
 * - hier stehen HANDLUNGEN (wer kann was auslösen, und wo).
 *
 * Von Hand geschrieben, weil „was kann man tun" eine Beurteilung ist: eine Fähigkeit deckt sich
 * selten mit genau einem Endpunkt — „Kontrolle anfordern" gibt es als Admin-Route UND als
 * MCP-Werkzeug, und der Tagesplan der automatischen Kontrollen hat gar keinen Endpunkt.
 *
 * Gegen das stille Veralten hilft `funktionsmodellSurfaces.ts`: jede API-Route und jedes
 * MCP-Werkzeug muss hier beansprucht oder ausdrücklich ausgenommen sein, und was hier steht, muss es
 * geben. Eine neue Route ohne Katalog-Eintrag lässt `npm test` fehlschlagen — sonst wäre die Lücke
 * von Vollständigkeit nicht zu unterscheiden.
 *
 * Nicht gedeckt von dieser Prüfung: Fähigkeiten OHNE Endpunkt (Poller, abgeleitete Auswertungen,
 * reine Server-Komponenten). Die stehen mit `surfaces: ["automatik"]` bzw. ohne `routes`/`tools`
 * hier — für sie ist der Katalog die einzige Liste, die es gibt.
 */
import type { FmTarget, FmWriter } from "./funktionsmodellRegistry";

/** Wo eine Fähigkeit ausgelöst wird. */
export type FmSurface = "sub-ui" | "admin-ui" | "mcp" | "automatik" | "extern";

export interface FmCapability {
  /** Stabile Kennung, für Verweise. */
  id: string;
  /** Zu welcher Mechanik sie gehört — dieselbe Achse wie in der Abhängigkeits-Ansicht. */
  mechanic: FmTarget;
  title: string;
  /** Ein Satz: was sie tut. */
  what: string;
  actors: FmWriter[];
  surfaces: FmSurface[];
  /** API-Routen, die sie bedienen. Werden gegen den Dateibaum geprüft. */
  routes?: string[];
  /** MCP-Werkzeuge. Werden gegen die Registrierung geprüft. */
  tools?: string[];
  /** Was man wissen muss, wenn man sie benutzt. */
  note?: string;
}

/**
 * Fähigkeiten, die es in der Keyholder-Oberfläche gibt, über den MCP aber NICHT — jede mit Grund.
 *
 * Die Regel dazu steht in `CLAUDE.md` („MCP-Vollständigkeit"): was ein Keyholder in der Oberfläche
 * kann, muss auch die KI-Keyholderin können. Sie liess sich bisher nur aufschreiben, nicht prüfen —
 * und eine Lücke fällt niemandem beim Bauen auf, sondern erst dem Nutzer, der die KI darum bittet
 * und eine Absage bekommt (Auslöser: die Wiege-Fenster, 23.08.2026).
 *
 * Diese Liste macht die Regel testbar (`funktionsmodellDoc.test.ts`). Sie kennt zwei Sorten
 * Einträge, und die Unterscheidung gehört in den Text:
 *
 * - **Absicht** — die Fähigkeit gehört nicht in die Hand einer KI, oder sie ist technisch nicht
 *   KI-fähig. Solche Einträge bleiben stehen.
 * - **OFFEN** — eine echte Lücke, die noch niemand geschlossen hat. Wer sie schliesst, streicht die
 *   Zeile; der Test erzwingt das (eine Ausnahme ohne Lücke lässt ihn scheitern).
 *
 * Was hier NICHT hineingehört: eine neue Fähigkeit, für die man sich den MCP-Weg sparen will. Der
 * ganze Zweck der Liste ist, dass diese Entscheidung einen Namen und einen Satz Begründung bekommt.
 */
export const FM_MCP_EXEMPT: Record<string, string> = {
  // ── Absicht: gehört nicht in die Hand einer KI ─────────────────────────────────────────────
  "user-manage": "Absicht: Passwörter, E-Mail, Benutzername, Löschen — Zugang und Identität. Eine KI mit Passwort-Hoheit könnte den Träger aussperren.",
  "keyholder-assign": "Absicht: die KI entschiede über ihre eigene Berufung mit.",
  "demo-data": "Absicht: Werkzeug des Betreibers, nicht der Keyholderin (zusätzlich ENV-gegated).",
  // ── Absicht: technisch nicht KI-fähig ──────────────────────────────────────────────────────
  "upload": "Absicht: eine KI liefert keine Fotos. Die Leserichtung deckt `get_image` ab.",
  "stats-pages": "Absicht: Seiten, keine Handlung. Dieselben Zahlen liefern `period_summary`, `records` und `device_stats`.",
  "inbox-keyholder": "Absicht: der Posteingang sammelt Meldungen FÜR den Menschen; die KI bekommt dieselben Befunde direkt aus den Deep-Views.",
  "weight-record": "Absicht: über `log_weight` (Fähigkeit `weight-mcp-write`) abgedeckt — der Katalog führt die MCP-Seite des Gewichts als eigene Zeile.",
  "weight-delete": "Absicht: eine Messung ist eine BEOBACHTUNG, keine Einstellung. Korrigieren kann die KI sie über `log_weight` (ein Wert je Tag, der neue ersetzt den alten) — eine Beobachtung ganz zu entfernen, samt Foto, bleibt beim Menschen. Der Unterschied ist nicht die Gefahr, sondern die Art der Handlung: die KI ändert, was gilt; was NIE gegolten haben soll, entscheidet die Keyholderin.",

  // ── OFFEN: echte Lücken, noch nicht geschlossen ────────────────────────────────────────────
  "entry-admin-create": "OFFEN: Ereignis für den Träger nachtragen. Braucht zuerst eine Service-Extraktion — die Logik liegt inline in `/api/admin/entries`.",
  "entry-admin-edit": "OFFEN: das LÖSCHEN eines fremden Eintrags sowie die Felder `oeffnenGrund` und `orgasmusArt`. Gerät, Zeitpunkt und Notiz deckt `edit_entry` ab (Fähigkeit `entry-correct-mcp`, eigene Zeile wie beim Gewicht). Löschen bleibt vorerst beim Menschen: es bricht die Paar-Kette und verlangt die Entscheidung über den Partner-Eintrag.",
  "device-references": "OFFEN: Referenzbilder der Geräte-Erkennung pflegen (Liste, Löschen).",
  "device-references-import": "OFFEN: vorhandene Verschluss-Fotos als Referenz übernehmen — braucht keinen Upload und wäre damit KI-fähig.",
  "notify-prefs-admin": "OFFEN: Benachrichtigungs-Matrix des Trägers. Nutzen für eine KI gering — sie bekommt weder Mail noch Push.",
};

/** Routen, die keine Fähigkeit im Sinne dieses Katalogs sind — mit Grund. */
export const FM_EXCLUDED_ROUTES: Record<string, string> = {
  "/api/auth/[...nextauth]": "Der NextAuth-Handler selbst; die Fähigkeit dahinter ist die Anmeldung.",
};

const c = (x: FmCapability): FmCapability => x;

export const FM_CAPABILITIES: FmCapability[] = [
  // ── Einträge ───────────────────────────────────────────────────────────────────────────────
  c({
    id: "entry-create", mechanic: "Einträge", title: "Ereignis erfassen",
    what: "Verschluss, Öffnen, Prüfung, Orgasmus oder Trage-Beginn/-Ende mit Zeitpunkt, Foto und Notiz anlegen. Der Vorgang, aus dem fast alles andere abgeleitet wird.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/entries"],
    note: "Rückdatieren ist auf diesem Weg begrenzt — sonst datierte sich der Träger aus jeder Frist heraus.",
  }),
  c({
    id: "entry-edit", mechanic: "Einträge", title: "Eigenen Eintrag ändern oder löschen",
    what: "Korrigiert einen bereits erfassten Eintrag; alle abgeleiteten Zustände folgen automatisch.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/entries/[id]"],
  }),
  c({
    id: "entry-admin-create", mechanic: "Einträge", title: "Eintrag für einen Sub nachtragen",
    what: "Legt einen Eintrag im Namen des Trägers an — hier ist Rückdatieren erlaubt.",
    actors: ["admin"], surfaces: ["admin-ui"], routes: ["/api/admin/entries"],
    note: "Löst bewusst KEINE Reinigungs-Kontrolle aus: der Planer rechnet ab jetzt, nicht ab der Eintrags-Zeit.",
  }),
  c({
    id: "entry-admin-edit", mechanic: "Einträge", title: "Fremden Eintrag ändern",
    what: "Korrigiert den Eintrag eines Trägers.",
    actors: ["admin"], surfaces: ["admin-ui"], routes: ["/api/admin/entries/[id]"],
  }),
  c({
    id: "entry-correct-mcp", mechanic: "Einträge", title: "Eintrag korrigieren (KI-Keyholderin)",
    what: "Stellt Gerät, Zeitpunkt oder Notiz eines erfassten Verschluss-/Öffnen- oder Trage-Eintrags richtig — der Griff daneben beim Erfassen, meist das falsch gewählte Gerät.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["edit_entry"],
    note: "Fotos, Kontrollcode und Verifikations-Status bleiben aussen vor: sie sind die Beweisführung. Still — der Träger bekommt keine Meldung, der Write steht im Action-Log.",
  }),
  c({
    id: "entry-read-mcp", mechanic: "Einträge", title: "Roh-Einträge lesen",
    what: "Die unaufbereitete Eintragsliste für die Keyholder-KI.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["list_entries"],
  }),
  c({
    id: "upload", mechanic: "Einträge", title: "Foto hochladen und ausliefern",
    what: "Nimmt Bilder entgegen (Endungs-Whitelist, Magic-Byte-Prüfung, Grössenlimit) und liefert sie nur authentifiziert wieder aus.",
    actors: ["sub", "admin"], surfaces: ["sub-ui", "admin-ui"], routes: ["/api/upload", "/api/uploads/[...path]"],
  }),
  c({
    id: "get-image", mechanic: "Einträge", title: "Bild an die Keyholder-KI geben",
    what: "Liefert ein hinterlegtes Foto an den MCP, damit die KI es selbst ansehen kann.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["get_image"],
  }),

  // ── Sessions & Statistik ───────────────────────────────────────────────────────────────────
  c({
    id: "stats-read", mechanic: "Sessions/Statistik", title: "Auswertungen lesen",
    what: "Session mit Segmenten und Geräte-Aufschlüsselung, Geräte-Statistik, Rekorde, Perioden-Zusammenfassung, Enthaltsamkeits-Trend und Zeitleiste.",
    actors: ["mcp"], surfaces: ["mcp"],
    tools: ["get_session", "device_stats", "records", "period_summary", "denial_trend", "timeline"],
  }),
  c({
    id: "stats-pages", mechanic: "Sessions/Statistik", title: "Statistik-Seiten",
    what: "Kalender, Monatsübersicht und Zielerreichung — dieselbe Ansicht für den Träger und für den Keyholder.",
    actors: ["sub", "admin"], surfaces: ["sub-ui", "admin-ui"],
    note: "Server-Komponente ohne eigene Route.",
  }),

  // ── Sperrzeit ──────────────────────────────────────────────────────────────────────────────
  c({
    id: "lock-request", mechanic: "Sperrzeit", title: "Einschliessen anfordern",
    what: "Fordert den Träger auf, sich bis zu einem Zeitpunkt einzuschliessen — wahlweise mit Mindest-Tragedauer oder festem Sperr-Ende.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/verschluss-anforderung"], tools: ["request_lock"],
    note: "Mehrere dürfen offen sein; EIN Verschluss erfüllt alle, und die strengste Sperrzeit setzt sich durch.",
  }),
  c({
    id: "lock-request-edit", mechanic: "Sperrzeit", title: "Anforderung ändern",
    what: "Verschiebt Frist, Dauer oder Zielgerät einer offenen Einschliess-Anforderung.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/verschluss-anforderung/[id]"], tools: ["edit_lock_request"],
  }),
  c({
    id: "lock-period", mechanic: "Sperrzeit", title: "Sperrzeit setzen",
    what: "Ordnet unmittelbar eine Sperrzeit an — befristet oder unbefristet, wahlweise mit Reinigungserlaubnis.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"], tools: ["set_lock_period"],
    note: "Läuft über dieselbe Route wie die Anforderung; die Box hält daraufhin den Schlüssel fest.",
  }),
  c({
    id: "lock-period-edit", mechanic: "Sperrzeit", title: "Sperrzeit ändern",
    what: "Verlängert, verkürzt oder öffnet die Reinigung einer laufenden Sperrzeit.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"], tools: ["edit_lock_period"],
  }),
  c({
    id: "release-now", mechanic: "Sperrzeit", title: "Sofort aufschliessen",
    what: "Das Gegenstück zur Sperrzeit, in einem Griff: beendet eine laufende Sperrzeit, öffnet die Box und erfasst die Öffnung — wahlweise mit einem Orgasmus-Fenster.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/release-now"], tools: ["release_now"],
    note: "Die beendete Sperrzeit gilt als freigegeben, nicht als gebrochen — die Öffnung ist deshalb kein Vergehen.",
  }),
  c({
    id: "withdraw", mechanic: "Sperrzeit", title: "Direktive zurückziehen",
    what: "Nimmt eine Sperrzeit, Anforderung, Kontrolle, Orgasmus-Direktive, Aufgabe oder ein notiertes Vergehen zurück.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"], tools: ["withdraw"],
    note: "Ein Rückzug wird nie ein Vergehen. Bei Kontrollen gezielt per id, sonst trifft er auch ungesehene.",
  }),

  // ── Reinigung ──────────────────────────────────────────────────────────────────────────────
  c({
    id: "cleaning-rules", mechanic: "Reinigung", title: "Reinigungs-Regeln setzen",
    what: "Erlaubnis, Höchstdauer je Pause, Anzahl pro Tag und die Tages-Zeitfenster.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/users/[id]"], tools: ["set_cleaning"],
    note: "Historisiert: jede Öffnung wird nach der Fassung ihrer Zeit beurteilt. Die Fensterliste wird als Ganzes ersetzt.",
  }),
  c({
    id: "cleaning-open", mechanic: "Reinigung", title: "Zur Reinigung öffnen",
    what: "Eine Öffnung mit dem Grund REINIGUNG — sie bricht die Sperrzeit nicht, sofern alle drei Bedingungen erfüllt sind.",
    actors: ["sub"], surfaces: ["sub-ui"],
    note: "Zugleich der einzige Weg zum Gerätewechsel; verbraucht dessen Tageskontingent.",
  }),

  // ── Kontrollen ─────────────────────────────────────────────────────────────────────────────
  c({
    id: "inspection-request", mechanic: "Kontrollen", title: "Kontrolle anfordern",
    what: "Verlangt ein Beweisfoto — vom Keuschheitsgürtel, von einer Trage-Kategorie oder von genau einem Gerät.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/kontrolle"], tools: ["request_inspection"],
    note: "Je Ziel darf nur eine laufen; eine zweite auf dasselbe Ziel wird abgelehnt.",
  }),
  c({
    id: "inspection-targets", mechanic: "Kontrollen", title: "Mögliche Kontroll-Ziele abfragen",
    what: "Nennt die Kategorien und Geräte, auf die gerade eine Kontrolle gestellt werden kann.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"], routes: ["/api/admin/inspection-targets"],
    tools: ["keyholder_dashboard"],
    note: "Für die KI ist es keine eigene Abfrage: `keyholder_dashboard.wornNow` nennt alles, was gerade verschlossen oder getragen wird — und die Ziel-Menge IST das (`listInspectionTargets`). Zu nehmen ist `category` + `deviceDeclared`, NICHT `deviceName`: letzteres ist das per Bildabgleich EFFEKTIVE Gerät, und `request_inspection` prüft gegen das deklarierte — bei einem Bild-Konflikt endete der Aufruf sonst mit `INSPECTION_DEVICE_NOT_ACTIVE`.",
  }),
  c({
    id: "inspection-list", mechanic: "Kontrollen", title: "Kontroll-Verlauf einsehen",
    what: "Alle Kontrollen eines Trägers mit Status, Frist und dem erfüllenden Eintrag.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"], routes: ["/api/admin/kontrollen"],
    tools: ["list_inspections"],
    note: "Beide Seiten leiten Zustand, Ziel und Verifikation aus `buildKontrolleRows` ab — eine eigene Status-Rechnung im MCP wäre eine zweite Wahrheit über denselben Sachverhalt.",
  }),
  c({
    id: "inspection-resolve", mechanic: "Kontrollen", title: "Kontrolle zurückziehen oder von Hand bestätigen",
    what: "Nimmt eine Kontrolle zurück oder erkennt ein Foto an, das die automatische Prüfung nicht bestätigen konnte.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/kontrollen/[id]"], tools: ["resolve_inspection"],
  }),
  c({
    id: "inspection-fulfil", mechanic: "Kontrollen", title: "Kontrolle erfüllen",
    what: "Der Träger reicht das Foto ein — bei einem Gerät mit Code-Pflicht mit handschriftlichem Code im Bild.",
    actors: ["sub"], surfaces: ["sub-ui"],
    note: "Erfüllt wird nur die Kontrolle desselben Ziels.",
  }),
  c({
    id: "inspection-verify", mechanic: "Kontrollen", title: "Code im Foto erkennen",
    what: "Liest den handschriftlichen Kontroll-Code aus dem Bild und vergleicht ihn mit dem geforderten.",
    actors: ["system"], surfaces: ["automatik"], routes: ["/api/verify-kontrolle"],
    note: "Bei fehlgeschlagener Erkennung entsteht ein Grund-Code, kein stilles Scheitern.",
  }),
  c({
    id: "inspection-code-push", mechanic: "Kontrollen", title: "Kontroll-Code erneut zustellen",
    what: "Schickt den Code einer offenen Kontrolle noch einmal als Push.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/kontrollen/code-push", "/api/kontrollen/[id]/code-push"],
  }),
  c({
    id: "auto-inspections", mechanic: "Auto-Kontrollen", title: "Automatische Kontrollen einstellen",
    what: "Hauptschalter, Anzahl pro Tag, Schlaf-Fenster, Fristspanne, festes Auslöse-Fenster und die Beschränkung auf Sperrzeiten.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/users/[id]"], tools: ["set_auto_inspections"],
  }),
  c({
    id: "auto-inspection-plan", mechanic: "Auto-Kontrollen", title: "Tagesplan würfeln und zustellen",
    what: "Zieht zur Mitternacht des Trägers eine Anzahl aus der Spanne, verteilt die Kontrollen überlappungsfrei über das Wach-Fenster und stellt sie bei Fälligkeit zu.",
    actors: ["system"], surfaces: ["automatik"],
    note: "Weder Auslösung noch Frist landen je im Schlaf-Fenster; reicht die Mindestfrist nicht, entfällt der Slot. Wird der Tag verspätet gewürfelt (die Instanz stand über die Mitternacht des Trägers), plant er anteilig in die Rest-Zeit, statt die vergangenen Zeitpunkte ersatzlos zu verlieren.",
  }),
  c({
    id: "cleaning-relock-inspection", mechanic: "Auto-Kontrollen", title: "Kontrolle nach dem Wiederverschluss",
    what: "Nach jedem selbst erfassten Wiederverschluss aus einer Reinigungspause folgt selbsttätig eine Kontrolle.",
    actors: ["system"], surfaces: ["automatik"],
    note: "Feste Regel, keine Einstellung — nur der Hauptschalter der Automatik schaltet sie ab.",
  }),
  c({
    id: "inspection-escalation", mechanic: "Kontrollen", title: "Überfällige Kontrolle eskalieren",
    what: "Stufe 1 mahnt, Stufe 2 bucht die Öffnung bzw. das Ablegen selbst.",
    actors: ["system"], surfaces: ["automatik"],
    note: "Stufe 2 zählt ab dem Stempel von Stufe 1 — ohne Stufe 1 feuert sie nie. Eine Sperrzeit hebt sie nicht auf.",
  }),

  // ── Orgasmus ───────────────────────────────────────────────────────────────────────────────
  c({
    id: "orgasm-directive", mechanic: "Orgasmus", title: "Orgasmus-Fenster stellen",
    what: "Ein Zeitfenster als Pflicht (Anweisung) oder Erlaubnis (Gelegenheit), wahlweise mit vorgegebener Art und Öffnungserlaubnis.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/orgasmus-anforderung"], tools: ["request_orgasm"],
    note: "Es ist immer nur EINE Direktive aktiv; die Erfüllung passiert automatisch beim passenden Eintrag.",
  }),
  c({
    id: "orgasm-directive-withdraw", mechanic: "Orgasmus", title: "Orgasmus-Fenster zurückziehen",
    what: "Nimmt eine offene Direktive zurück. Die Route kennt nur diese eine Aktion.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"], routes: ["/api/admin/orgasmus-anforderung/[id]"],
    tools: ["withdraw"],
    note: "ÄNDERN gibt es für diese Direktive nirgends — weder in der App noch über den MCP. Anders wollen heisst zurückziehen und neu stellen; als einzige Direktive fehlt ihr das Gegenstück zu `edit_lock_period`, `edit_task` und `edit_training_goal`.",
  }),

  // ── Aufgaben ───────────────────────────────────────────────────────────────────────────────
  c({
    id: "task-create", mechanic: "Aufgaben", title: "Aufgabe stellen",
    what: "Text plus beliebig viele durchgehend zu haltende Bedingungen und Nachweis-Fotos, mit festem Ende oder als Haltedauer ab dem Anlegen.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/tasks"], tools: ["create_task"],
    note: "Meint man eine Tragezeit, ist die Haltedauer die richtige Form — bei festem Ende geht die Kulanzfrist davon ab.",
  }),
  c({
    id: "task-edit", mechanic: "Aufgaben", title: "Aufgabe ändern oder zurückziehen",
    what: "Verschiebt Frist und Text.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/tasks/[id]"], tools: ["edit_task"],
    note: "Bedingungen, Nachweise und die Reihenfolge-Regel sind NICHT änderbar — sonst würde der Träger an etwas gemessen, das er nie bekam.",
  }),
  c({
    id: "task-selfreport", mechanic: "Aufgaben", title: "Aufgabe als erledigt melden",
    what: "Die Selbstmeldung des Trägers — bei Aufgaben mit Bedingungen zusätzlich zur Erfüllung nötig, ohne Bedingungen ist sie die Erfüllung.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/tasks/[id]"],
    note: "Bei Bedingungen erst nach Ablauf der Haltefrist möglich.",
  }),
  c({
    id: "task-proof-submit", mechanic: "Aufgaben", title: "Nachweis einreichen",
    what: "Lädt ein Nachweis-Foto zu einer Aufgabe hoch.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/tasks/proofs/[id]"],
    note: "Massgeblich ist die Aufnahmezeit, nicht die Upload-Zeit.",
  }),
  c({
    id: "task-proof-review", mechanic: "Aufgaben", title: "Nachweis sichten",
    what: "Nimmt einen Nachweis an oder lehnt ihn ab — der einzige Ausweg aus dem Wartezustand.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/tasks/proofs/[id]"], tools: ["review_task_proof"],
    note: "Eine Annahme heilt Verspätung, fehlende Aufnahmezeit und falsche Reihenfolge gleichermassen.",
  }),
  c({
    id: "task-evaluation", mechanic: "Aufgaben", title: "Aufgaben auswerten und melden",
    what: "Leitet den Zustand jeder Aufgabe aus den Einträgen ab, stellt terminierte zu und meldet das Ergebnis an beide Seiten.",
    actors: ["system"], surfaces: ["automatik"],
    note: "Nichts daran ist gestempelt — ein nachgetragener Eintrag korrigiert die Aufgabe von selbst.",
  }),

  // ── Trainingsziele ─────────────────────────────────────────────────────────────────────────
  c({
    id: "goal-create", mechanic: "Trainingsziele", title: "Trainingsziel setzen",
    what: "Mindest-Tragestunden je Tag, Woche, Monat und Jahr für eine Kategorie und einen Zeitraum.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/vorgaben"], tools: ["set_training_goal"],
  }),
  c({
    id: "goal-edit", mechanic: "Trainingsziele", title: "Trainingsziel ändern oder löschen",
    what: "Ändert Zeitraum und Vorgaben; das Löschen ist ein Soft-Delete, die Zeile bleibt für die Historie.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/vorgaben/[id]"], tools: ["edit_training_goal", "delete_training_goal"],
    note: "Ohne ausdrücklich gesetztes Enddatum überschreibt die automatische Verkettung es.",
  }),
  c({
    id: "goal-read", mechanic: "Trainingsziele", title: "Trainingsziele lesen",
    what: "Die Ziele eines Trägers samt gelöschter, wenn ausdrücklich verlangt.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["list_training_goals"],
  }),

  // ── Strafbuch ──────────────────────────────────────────────────────────────────────────────
  c({
    id: "offense-read", mechanic: "Strafbuch", title: "Vergehen einsehen",
    what: "Die erkannten Vergehen mit Urteilsstand — dreizehn Arten, die meisten live aus den Einträgen abgeleitet.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"], tools: ["get_offenses"],
  }),
  c({
    id: "offense-manual", mechanic: "Strafbuch", title: "Vergehen von Hand notieren",
    what: "Hält fest, was der Tracker nicht sehen kann — gebrochene Abmachung, Unhöflichkeit.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/offense"], tools: ["record_offense"],
    note: "Notieren ist noch kein Urteil. Ein Rückzug nimmt es aus dem Strafbuch, lässt es aber nachlesbar.",
  }),
  c({
    id: "offense-judge", mechanic: "Strafbuch", title: "Urteilen",
    what: "Verwerfen, bestrafen (Freitext oder als gestellte Aufgabe), erledigen oder wieder aufnehmen.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/strafe"], tools: ["judge_offense"],
    note: "Es gibt keine automatische Strafe und keinen Straftypen-Zoo. Eine erfüllte Strafaufgabe schliesst das Urteil selbst.",
  }),
  c({
    id: "offense-rules", mechanic: "Strafbuch", title: "Vergehens-Regeln umlegen",
    what: "Legt je Art fest, ob sie zählt — aus, nur während einer Sperrzeit, oder immer.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/offense-rules"], tools: ["set_offense_rules"],
    note: "Historisiert: eine Änderung schreibt die Vergangenheit nicht um, sie wirkt nach vorn. `manual_offense` ist nicht schaltbar — eine selbst notierte Tat verwirft man mit dem Urteil, nicht mit der Regel.",
  }),
  c({
    id: "offense-announce", mechanic: "Strafbuch", title: "Vergehen melden",
    what: "Stellt erkannte, bestrafte und verworfene Vergehen beiden Seiten in den Posteingang.",
    actors: ["system"], surfaces: ["automatik"],
    note: "Abgeleitete Vergehen erst ab dem Stichtag der Instanz — sonst kippte das erste Update die ganze Historie hinein.",
  }),

  // ── Geräte ─────────────────────────────────────────────────────────────────────────────────
  c({
    id: "device-manage", mechanic: "Geräte", title: "Geräte verwalten",
    what: "Anlegen, benennen, beschreiben, einer Kategorie zuordnen und archivieren.",
    actors: ["sub", "admin", "mcp"], surfaces: ["sub-ui", "admin-ui", "mcp"],
    routes: ["/api/devices", "/api/devices/[id]"], tools: ["get_devices", "upsert_device"],
    note: "Die Code-Pflicht je Gerät darf nur der Keyholder umlegen.",
  }),
  c({
    id: "device-delete", mechanic: "Geräte", title: "Gerät wegräumen",
    what: "Löscht das Gerät hart, solange kein Eintrag daran hängt — sonst wird es nur archiviert, damit die Historie bleibt.",
    actors: ["sub", "admin", "mcp"], surfaces: ["sub-ui", "admin-ui", "mcp"], tools: ["delete_device"],
    note: "Das harte Löschen nimmt Geräte- und Referenzfotos mit; die Vorschau sagt vorher, welcher der beiden Fälle eintritt.",
  }),
  c({
    id: "device-meta", mechanic: "Geräte", title: "Geräte-Beurteilung hinterlegen",
    what: "Sicherheitsstufe, Abstreif-Risiko und Lookalike-Cluster — Einordnungen für die Keyholder-Entscheidung.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["set_device_meta"],
    note: "Ein Lookalike-Cluster rechnet die Geräte-Zuordnung historischer Sessions rückwirkend neu.",
  }),
  c({
    id: "device-references", mechanic: "Geräte", title: "Referenzbilder pflegen",
    what: "Kuratiert das Bildmaterial, mit dem die Geräte-Erkennung arbeitet.",
    actors: ["sub", "admin"], surfaces: ["sub-ui", "admin-ui"],
    routes: ["/api/devices/[id]/references", "/api/devices/[id]/references/[refId]"],
  }),
  c({
    id: "device-references-import", mechanic: "Geräte", title: "Referenzbilder aus Einträgen übernehmen",
    what: "Übernimmt jüngere Verschluss-Fotos als Referenzbilder, als Dateikopie.",
    actors: ["sub", "admin"], surfaces: ["sub-ui", "admin-ui"],
    routes: ["/api/devices/[id]/references/import-recent"],
  }),
  c({
    id: "category-manage", mechanic: "Geräte", title: "Kategorien verwalten",
    what: "Anlegen, benennen, einfärben und sortieren. Die drei Regeln — Zeiterfassung, Pflichtfoto, Trainingsziele erlaubt — darf nur der Keyholder umlegen.",
    actors: ["sub", "admin", "mcp"], surfaces: ["sub-ui", "admin-ui", "mcp"],
    routes: ["/api/categories", "/api/categories/[id]"], tools: ["upsert_category"],
    note: "Die eingebaute Kategorie lässt sich nicht löschen, und ihre drei Regeln sind für niemanden änderbar. Kategorien führen kein Versions-Token — hier gilt last write wins.",
  }),
  c({
    id: "category-delete", mechanic: "Geräte", title: "Kategorie löschen",
    what: "Entfernt eine Kategorie endgültig — nur, solange weder Geräte noch Trainingsziele darauf verweisen.",
    actors: ["sub", "admin", "mcp"], surfaces: ["sub-ui", "admin-ui", "mcp"], tools: ["delete_category"],
    note: "Archivierte Geräte und soft-gelöschte Trainingsziele blockieren mit — sonst verlöre deren Historie still die Zuordnung.",
  }),
  c({
    id: "device-detect", mechanic: "Geräte", title: "Gerät im Foto vorschlagen",
    what: "Schlägt beim Erfassen anhand des Bildes das getragene Gerät vor.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/detect-device"],
  }),
  c({
    id: "device-check", mechanic: "Geräte", title: "Geräte-Abgleich beim Kontroll-Foto",
    what: "Vergleicht nach dem Einreichen das Bild mit den Referenzbildern des deklarierten Geräts.",
    actors: ["system"], surfaces: ["automatik"],
    note: "Beratend: ein Abweichen ist KEIN Vergehen — das entsteht nur aus einer Anforderung.",
  }),

  // ── Box ────────────────────────────────────────────────────────────────────────────────────
  c({
    id: "box-state", mechanic: "Box", title: "Box-Zustand ansehen",
    what: "Verriegelung (Soll und Ist), Akku, Riegelstellung, letzter Kontakt und die Vorwarnungen der Failsafes.",
    actors: ["sub", "admin", "mcp"], surfaces: ["sub-ui", "admin-ui", "mcp"],
    routes: ["/api/box"], tools: ["get_box_state"],
  }),
  c({
    id: "box-bolt-gate", mechanic: "Box", title: "Verschluss an den Riegel binden",
    what: "Ob der Verschluss des Trägers erst gilt, wenn die Box „Riegel zu\" meldet — bis dahin ist sein Eintrag nur der Aufruf.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/users/[id]"], tools: ["set_box"],
    note: "Vorgabe aus; sichtbar nur, wo eine Box gemeldet hat. Das ABSCHALTEN vollzieht einen gerade wartenden Aufruf sofort — das ist zugleich der Ausweg, wenn die Box nicht mehr meldet. Details: docs/riegel-konzept.md.",
  }),
  c({
    id: "box-relock", mechanic: "Box", title: "Box wieder verriegeln",
    what: "Löst das Verriegeln nach einer Reinigungspause aus.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/box/relock"],
  }),
  c({
    id: "box-integration", mechanic: "Box", title: "Gegenstelle für die Box",
    what: "Liefert der Box ihre Konfiguration und nimmt Zustandsmeldungen und Ereignisse entgegen.",
    actors: ["system"], surfaces: ["extern"],
    routes: ["/api/integration/box/config", "/api/integration/box/status", "/api/integration/box/event"],
    note: "Der Tracker konfiguriert die Box nicht — Schwellen und Failsafes kommen von dort.",
  }),
  c({
    id: "seal-detect", mechanic: "Box", title: "Siegel im Foto erkennen",
    what: "Prüft, ob das Siegel auf dem Bild unversehrt und lesbar ist.",
    actors: ["system"], surfaces: ["automatik"], routes: ["/api/detect-seal"],
  }),
  c({
    id: "bildersafe", mechanic: "Bildersafe", title: "Schlüsselbild versiegeln",
    what: "Legt das Foto des Schlüsselbox-Codes versiegelt ab; freigegeben wird es erst, wenn Öffnen erlaubt ist.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/bildersafe/seal"],
    note: "Gespeichert wird nur, ob Ziffern lesbar waren — nie die Zahl selbst.",
  }),

  // ── Nachrichten ────────────────────────────────────────────────────────────────────────────
  c({
    id: "inbox-sub", mechanic: "Nachrichten", title: "Posteingang des Trägers",
    what: "Lesen, als gelesen oder ungelesen markieren, löschen, alles auf einmal — einzeln oder als Stapel.",
    actors: ["sub"], surfaces: ["sub-ui"],
    routes: ["/api/messages", "/api/messages/[id]", "/api/messages/[id]/read", "/api/messages/bulk", "/api/messages/read-all"],
  }),
  c({
    id: "message-prune", mechanic: "Nachrichten", title: "Posteingang beschneiden",
    what: "Löscht einmal täglich gelesene Meldungen jenseits der Aufbewahrungsfrist (Vorgabe ein Jahr, per MESSAGE_RETENTION_DAYS einstellbar, 0 = aus).",
    actors: ["system"], surfaces: ["automatik"],
    note: "Ungelesene Meldungen bleiben liegen, egal wie alt — eine nie gesehene Zustellung ist kein Altpapier. Die Frist hängt am Zustand, nicht nur am Alter.",
  }),
  c({
    id: "inbox-keyholder", mechanic: "Nachrichten", title: "Posteingang des Keyholders",
    what: "Dieselbe Liste für die Meldungen an die Keyholder — eine gemeinsame Zeile je Träger, mit eigenem Lesestand.",
    actors: ["admin"], surfaces: ["admin-ui"],
    routes: ["/api/admin/messages", "/api/admin/messages/[id]", "/api/admin/messages/[id]/read", "/api/admin/messages/bulk", "/api/admin/messages/read-all"],
    note: "Löschen trifft alle Keyholder — es gibt nur diese eine Zeile.",
  }),

  // ── Benachrichtigungen ─────────────────────────────────────────────────────────────────────
  c({
    id: "notify-prefs-sub", mechanic: "Benachrichtigungen", title: "Eigene Benachrichtigungen einstellen",
    what: "Mail und Push je Ereignis-Art, neun Arten.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/settings/notifications"],
  }),
  c({
    id: "notify-prefs-admin", mechanic: "Benachrichtigungen", title: "Benachrichtigungen eines Trägers einstellen",
    what: "Dieselben Schalter aus der Keyholder-Sicht.",
    actors: ["admin"], surfaces: ["admin-ui"], routes: ["/api/admin/notifications"],
  }),
  c({
    id: "push-register", mechanic: "Benachrichtigungen", title: "Push-Empfang einrichten",
    what: "Meldet Browser-Abonnements und Gerätetoken der App an und wieder ab.",
    actors: ["sub", "admin"], surfaces: ["sub-ui"],
    routes: ["/api/push/subscribe", "/api/push/native-subscribe", "/api/push/vapid-public-key"],
  }),
  c({
    id: "directive-dispatch", mechanic: "Benachrichtigungen", title: "Terminierte Direktiven zustellen",
    what: "Der Minuten-Takt stellt Kontrollen, Sperrzeiten, Orgasmus-Fenster und Aufgaben zu, sobald sie wirksam werden.",
    actors: ["system"], surfaces: ["automatik"],
    note: "Bis dahin existiert die Direktive für den Träger nicht — keine Anzeige, keine laufende Frist.",
  }),

  // ── Keyholder-Wissen ───────────────────────────────────────────────────────────────────────
  c({
    id: "dashboard-read", mechanic: "MCP", title: "Keyholder-Übersicht",
    what: "Die eine Abfrage, die den grössten Teil beantwortet: laufende Strecke gegen Bestwert, was gerade getragen wird, Nächstes, Ziele, offene Vergehen, Box und Gesundheits-Halt.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["keyholder_dashboard"],
  }),
  c({
    id: "context-read", mechanic: "MCP", title: "Regelstand lesen",
    what: "Reinigungs-Regeln, Auto-Kontroll-Einstellungen und die geltenden Vergehens-Regeln in einem Zug.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["get_context"],
  }),
  c({
    id: "model-doc", mechanic: "MCP", title: "Modell-Referenz abrufen",
    what: "Erklärt der Keyholder-KI die Begriffe und ihre Zusammenhänge, ohne dass sie Code sehen muss.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["explain_model"],
  }),
  c({
    id: "notes", mechanic: "MCP", title: "Notizen führen",
    what: "Private, versionierte Beobachtungen anlegen, suchen und an Objekte hängen.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["upsert_note", "query_notes", "link_note"],
    note: "Supersession statt Löschen; der Träger sieht nichts davon.",
  }),
  c({
    id: "context-write", mechanic: "MCP", title: "Termine und wiederkehrende Kontexte pflegen",
    what: "Einmalige Termine und Wochen-Slots, jeweils mit der Angabe, ob sie Gerätefreiheit verlangen.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["upsert_appointment", "upsert_recurring_context"],
  }),
  c({
    id: "health-hold", mechanic: "MCP", title: "Gesundheits-Halt setzen",
    what: "Setzt die Direktiven aus — die eine Bremse, die über allem steht.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"], tools: ["set_health_hold"],
    routes: ["/api/admin/users/[id]/health-hold"],
    note: "Solange er läuft: keine Zustellung (Kontrollen, Eskalation, terminierte Direktiven, Wiege-Erinnerung), eine Öffnung bricht keine Sperrzeit, und aus der Pausenzeit entsteht kein abgeleitetes Vergehen. Beim Setzen fallen die offenen Kontrollen, beim Aufheben rücken die Aufgaben-Fristen nach.",
  }),
  c({
    id: "action-log", mechanic: "MCP", title: "Handlungsprotokoll lesen",
    what: "Jeder schreibende MCP-Aufruf mit Werkzeug, Handelndem, Pflicht-Begründung und betroffenem Objekt.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["get_action_log"],
  }),
  c({
    id: "mcp-endpoint", mechanic: "MCP", title: "MCP-Endpunkt",
    what: "Die Gegenstelle, über die eine Keyholder-KI alle Werkzeuge erreicht.",
    actors: ["mcp"], surfaces: ["extern"], routes: ["/api/[transport]"],
    note: "Die Werkzeugliste ist pro Verbindung gecacht — ein neuer Chat allein genügt nicht.",
  }),

  // ── Zugang & Konto ─────────────────────────────────────────────────────────────────────────
  c({
    id: "login", mechanic: "Zugang", title: "Anmelden",
    what: "Benutzername und Passwort gegen den bcrypt-Hash, IP-begrenzt gegen Durchprobieren.",
    actors: ["sub", "admin"], surfaces: ["sub-ui"], routes: ["/api/auth/lockout"],
  }),
  c({
    id: "passkey", mechanic: "Zugang", title: "Passkey anlegen und damit anmelden",
    what: "Biometrische Anmeldung registrieren, verwenden, auflisten und entfernen.",
    actors: ["sub", "admin"], surfaces: ["sub-ui"],
    routes: ["/api/auth/passkey/register", "/api/auth/passkey/authenticate", "/api/auth/passkey/list"],
  }),
  c({
    id: "password-reset", mechanic: "Zugang", title: "Passwort zurücksetzen",
    what: "Token per Mail anfordern und damit ein neues Passwort setzen — der einzige Weg ohne Sitzung.",
    actors: ["sub", "admin"], surfaces: ["sub-ui"],
    routes: ["/api/auth/forgot-password", "/api/auth/reset-password"],
    note: "Bei einem Admin-Konto während laufender Sperrzeit entsteht daraus ein festgeschriebenes Vergehen.",
  }),
  c({
    id: "account-password", mechanic: "Zugang", title: "Passwort ändern",
    what: "Setzt ein neues Passwort; das alte wird bewusst nicht verlangt.",
    actors: ["sub", "admin"], surfaces: ["sub-ui"], routes: ["/api/settings/password"],
  }),
  c({
    id: "account-email", mechanic: "Zugang", title: "E-Mail-Adresse ändern",
    what: "Setzt die Zustelladresse des Kontos.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/settings/email"],
  }),
  c({
    id: "account-display", mechanic: "Zugang", title: "Darstellung einstellen",
    what: "Sprache, Startseite, das Ausblenden des eigenen Trackers, die Zusammenstellung des eigenen Dashboards und das Wegklicken des Umstellungs-Hinweises.",
    actors: ["sub"], surfaces: ["sub-ui"],
    routes: ["/api/settings/locale", "/api/settings/start-page", "/api/settings/hide-own-tracker", "/api/settings/dashboard-layout", "/api/settings/notice-seen"],
  }),
  c({
    id: "account-timezone", mechanic: "Zugang", title: "Zeitzone setzen",
    what: "Die Wanduhr des Trägers.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/settings/timezone"],
    note: "Mehr als Darstellung: Reinigungsfenster, Schlaf-Fenster und der Kalendertag des Kontingents rechnen darin.",
  }),
  c({
    id: "weight-self", mechanic: "Gewicht", title: "Gewichts-Angaben pflegen",
    what: "Körpergrösse, Anzeige-Einheit und das eigene Zielgewicht.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/settings/weight"],
    note: "Nur erreichbar, solange die Keyholderin das Gewichtstracking für diesen Träger freigeschaltet hat — die Route prüft das selbst, nicht nur die Oberfläche.",
  }),
  c({
    id: "weight-record", mechanic: "Gewicht", title: "Gewicht erfassen",
    what: "Eine Messung je Kalendertag — vom Träger selbst oder von der Keyholderin für ihn.",
    actors: ["sub", "admin"], surfaces: ["sub-ui", "admin-ui"], routes: ["/api/weight"],
    note: "Der Träger braucht einen Beleg (Foto oder Notiz), die Keyholderin nicht — sie steht nicht vor seiner Waage. Eine zweite Meldung desselben Tages ersetzt die erste.",
  }),
  c({
    id: "weight-mcp-read", mechanic: "Gewicht", title: "Gewichts-Reihe lesen (KI)",
    what: "Punkte, aktueller Wert samt BMI, Trend, Zielgewicht samt Fortschritt und Tage seit der letzten Meldung.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["weight_history"],
    note: "Alle Werte metrisch. `daysSinceLastReport` ist die Zahl, an der die Meldepflicht hängt.",
  }),
  c({
    id: "weight-mcp-write", mechanic: "Gewicht", title: "Gewicht eintragen (KI)",
    what: "Eine Messung je Kalendertag nachtragen — die Einstellungen liegen in `weight-keyholder`.",
    actors: ["mcp"], surfaces: ["mcp"], tools: ["log_weight"],
    note: "Ihr Eintrag braucht keinen Foto-Beleg — sie steht nicht vor seiner Waage.",
  }),
  c({
    id: "weight-detect", mechanic: "Gewicht", title: "Waagen-Anzeige lesen",
    what: "Liest aus dem Foto der Waage die angezeigte Zahl und, wo ablesbar, die Einheit.",
    actors: ["sub"], surfaces: ["sub-ui"], routes: ["/api/detect-weight"],
    note: "Ein VORSCHLAG für das Formular, kein Messwert: der Mensch bestätigt oder korrigiert. Gespeichert wird die gelesene Zahl getrennt vom bestätigten Wert. Ohne Vision-Provider gibt es keine Erkennung — lokales OCR liest auf Sieben-Segment-Anzeigen zuverlässig Unsinn.",
  }),
  c({
    id: "weight-keyholder", mechanic: "Gewicht", title: "Gewichtstracking einrichten",
    what: "Freischaltung, Wiege-Fenster (Zeit, Dauer, Wochentage, Erinnerung) und ihr Zielgewicht.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/users/[id]"], tools: ["set_weight_tracking"],
    note: "Ihr Zielgewicht gilt, seines bleibt sichtbar. Das Abschalten nimmt die Meldepflicht mit — sonst zählte die Aus-Zeit als lauter versäumte Meldungen.",
  }),
  c({
    id: "weight-delete", mechanic: "Gewicht", title: "Wiegung löschen",
    what: "Entfernt eine einzelne Messung samt Foto und Notiz.",
    actors: ["admin"], surfaces: ["admin-ui"], routes: ["/api/weight/[id]"],
    note: "Nur der Keyholder — der Träger korrigiert eigene Zeilen nicht selbst, wie bei den Einträgen. Ein bereits geöffnetes Orgasmus-Fenster bleibt bestehen: es ist danach eine eigene Zeile mit eigenem Rückzugsweg, und eine Freigabe rückwirkend einzukassieren wäre die härtere Überraschung.",
  }),
  c({
    id: "weight-release", mechanic: "Gewicht", title: "Freigabe an das Gewicht knüpfen",
    what: "Eine Vorgabe, die den nächsten Orgasmus freigibt, sobald das MITTEL der letzten Tage eine Schwelle erreicht. Erfüllt sie sich, entsteht beim nächsten Wiegen ein Orgasmus-Fenster (Gelegenheit).",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/weight-release"], tools: ["set_weight_release"],
    note: "Geprüft wird das Mittel, nicht der Tageswert — ein einzelnes Wiegen schwankt um ein bis zwei Kilo. Ausgewertet wird nur die ERSTE Messung eines Tages; wer nachwiegt, könnte sonst so lange wiegen, bis es passt. Die Vorgabe ist verbraucht, sobald sie ausgelöst hat; sie erzeugt NIE ein Vergehen — die Konsequenz ist Warten.",
  }),
  c({
    id: "user-manage", mechanic: "Zugang", title: "Konten verwalten",
    what: "Anlegen, bearbeiten, Rolle setzen, Passwort setzen und löschen.",
    actors: ["admin"], surfaces: ["admin-ui"], routes: ["/api/admin/users", "/api/admin/users/[id]"],
    note: "Dieselbe Route trägt auch die Reinigungs-, Auto-Kontroll- und Eskalations-Einstellungen.",
  }),
  c({
    id: "keyholder-assign", mechanic: "Zugang", title: "Keyholder zuordnen",
    what: "Verknüpft ein Admin-Konto mit einem Träger — die eigentliche Berechtigung.",
    actors: ["admin"], surfaces: ["admin-ui"], routes: ["/api/admin/users/[id]/keyholders"],
    note: "Ohne Zuordnung sieht ein Admin-Konto überall leere Listen, nicht alle Träger.",
  }),
  c({
    id: "escalation-settings", mechanic: "Kontrollen", title: "Eskalations-Stufen einstellen",
    what: "Ob und nach welcher Zeit gemahnt und die Abnahme gebucht wird.",
    actors: ["admin", "mcp"], surfaces: ["admin-ui", "mcp"],
    routes: ["/api/admin/users/[id]"], tools: ["set_inspection_escalation"],
    note: "Zwei Stufen, eine Kette: die Mahnung ohne den Vermerk ist eine Erinnerung, der Vermerk ohne die Mahnung eine Falle.",
  }),
  c({
    id: "oauth", mechanic: "Zugang", title: "Fremdanwendung verbinden",
    what: "Registrierung, Freigabe, Token-Ausgabe und Widerruf nach OAuth mit PKCE — der Weg, auf dem eine Keyholder-KI Zugang bekommt.",
    actors: ["admin"], surfaces: ["extern"],
    routes: ["/api/oauth/register", "/api/oauth/authorize", "/api/oauth/token", "/api/oauth/revoke"],
    note: "Gespeichert werden nur Hashes, nie die Token selbst.",
  }),
  c({
    id: "portal-login", mechanic: "Zugang", title: "Anmeldung aus dem Portal",
    what: "Nimmt ein Einmal-Token des Portals an und meldet den Träger an.",
    actors: ["portal"], surfaces: ["extern"], routes: ["/api/portal-login"],
    note: "Die Token-Kennung wird festgehalten — dieselbe zweimal einzulösen scheitert.",
  }),

  // ── Betrieb ────────────────────────────────────────────────────────────────────────────────
  c({
    id: "version", mechanic: "Zugang", title: "Version und Bau-Datum melden",
    what: "Womit die App prüft, ob eine neue Fassung läuft.",
    actors: ["system"], surfaces: ["extern"], routes: ["/api/version"],
  }),
  c({
    id: "update-check", mechanic: "Zugang", title: "Auf neue Fassung prüfen",
    what: "Liest den Changelog der veröffentlichten Fassung und meldet, wenn diese Instanz zurückliegt.",
    actors: ["system"], surfaces: ["automatik"], routes: ["/api/upstream-changelog"],
  }),
  c({
    id: "heartbeat", mechanic: "Zugang", title: "Lebenszeichen",
    what: "Der Takt, an dem die zeitgesteuerten Abläufe hängen.",
    actors: ["system"], surfaces: ["automatik"], routes: ["/api/heartbeat"],
  }),
  c({
    id: "feedback", mechanic: "Nachrichten", title: "Rückmeldung senden",
    what: "Nimmt eine Nachricht aus der App entgegen.",
    actors: ["sub", "admin"], surfaces: ["sub-ui"], routes: ["/api/feedback"],
  }),
  c({
    id: "app-links", mechanic: "Zugang", title: "App-Verknüpfung für iOS",
    what: "Die Datei, mit der iOS Links dieser Instanz der App zuordnet.",
    actors: ["system"], surfaces: ["extern"], routes: ["/api/apple-app-site-association"],
  }),
  c({
    id: "demo-data", mechanic: "Einträge", title: "Demo-Daten anlegen",
    what: "Erzeugt einen Beispiel-Träger mit Beispiel-Einträgen.",
    actors: ["admin"], surfaces: ["admin-ui"], routes: ["/api/admin/demo"],
    note: "Nur erreichbar, wenn ausdrücklich per Umgebungsvariable freigeschaltet — sonst 404.",
  }),
];
