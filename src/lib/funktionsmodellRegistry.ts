/**
 * Die Bedeutungs-Schicht des Funktionsmodells: was jedes Feld STEUERT.
 *
 * Warum das nicht im Schema steht: `schema.prisma` weiss, dass `reinigungErlaubt` ein Boolean mit
 * Default `false` ist. Es weiss nicht, dass nur der Keyholder es setzen darf, dass eine aktive
 * Sperrzeit es zusätzlich erlauben muss und dass ein Gerätewechsel daran hängt. Genau diese
 * Zusammenhänge sind es, die im Betrieb als „unlogisch“ auffallen — also stehen sie hier, in einer
 * Form, die geprüft werden kann.
 *
 * Die Regel, die das Register am Leben hält: **jedes Skalarfeld der Modelle in
 * {@link FM_SCANNED_MODELS} braucht einen Eintrag** — auch die uninteressanten, dann eben als
 * `identity`/`record`/`runtime`/`audit` mit Begründung. `funktionsmodellDoc.test.ts` bricht sonst.
 * Ein Register, das nur die bekannten Schalter kennt, dokumentiert nicht das System, sondern die
 * eigene Erinnerung daran.
 *
 * Pflegen: neues Feld im Schema → Test schlägt fehl → Eintrag hier ergänzen → `npm run funktionsmodell`.
 */

/** Wer ein Feld schreiben darf. Nicht wer es LESEN darf — das tut halb die App. */
export type FmWriter = "sub" | "admin" | "mcp" | "portal" | "system";

/**
 * Die Mechanik, die ein Feld beeinflusst. Als Union statt als freier Text: ein vertippter
 * Wirkungs-Name fiele sonst niemandem auf, und die Spalte „wirkt auf“ wäre nur noch ungefähr wahr.
 */
export type FmTarget =
  | "Sperrzeit" | "Reinigung" | "Kontrollen" | "Auto-Kontrollen" | "Box" | "Strafbuch"
  | "Aufgaben" | "Trainingsziele" | "Orgasmus" | "Geräte" | "Einträge" | "Sessions/Statistik"
  | "Benachrichtigungen" | "Nachrichten" | "MCP" | "Oberfläche" | "Zugang" | "Bildersafe" | "Gewicht";

/**
 * Wie lange ein Wert gilt. Die Unterscheidung ist load-bearing: `User.reinigungErlaubt` ist ein
 * Dauerzustand, `VerschlussAnforderung.reinigungErlaubt` gilt für GENAU EINE Sperrzeit. Beide heissen
 * gleich, beide müssen zutreffen, und wer sie verwechselt, sucht den Fehler an der falschen Stelle.
 *
 * `entry` ist die dritte Form: ein Wert, den der Träger BEIM ERFASSEN mitgibt und der von dort aus
 * Mechanik steuert (`oeffnenGrund`, `keyInBox`). Keine Einstellung im Wortsinn, aber sehr wohl eine
 * Stellschraube — und eine, die dem Keyholder nicht gehört.
 */
export type FmScope = "standing" | "directive" | "entry";

/** Ein Feld, das etwas steuert. */
export interface FmSetting {
  kind: "setting";
  model: string;
  field: string;
  domain: string;
  scope: FmScope;
  /** Ein Satz: was der Wert bewirkt. Keine Typ-/Default-Angaben — die kommen aus dem Schema. */
  effect: string;
  writers: FmWriter[];
  affects: FmTarget[];
  /** Wo die Regel im Code steht (`datei.ts:symbol`), für den Sprung von der Doku in den Code. */
  anchor?: string;
  /**
   * Gesetzt, wenn ein Umlegen die VERGANGENHEIT verändert — mit dem Satz, was genau.
   *
   * Eine eigene Achse neben `scope`, nicht ein vierter Wert davon: `scope` sagt, wie lange ein Wert
   * gilt, dies hier, ob er nach hinten wirkt. Die meisten Einstellungen tun das nicht, weil die
   * Regeln historisiert sind — die wenigen, die es doch tun, sind die gefährlichsten im Register und
   * sollen nicht in der Menge untergehen.
   */
  retroactive?: string;
}

/** Ein Feld, das nichts steuert — mit dem Grund, warum nicht. */
export interface FmNonSetting {
  kind: "identity" | "record" | "runtime" | "audit";
  model: string;
  field: string;
  note: string;
}

export type FmEntry = FmSetting | FmNonSetting;

export interface FmDomain {
  id: string;
  title: string;
  /** Dateiname des Steckbriefs in `docs/funktionsmodell/`, sofern schon geschrieben. */
  doc?: string;
  /**
   * Die Mechanik, DER diese Domäne entspricht — die Gegenrichtung zu `affects`.
   *
   * Ohne sie liesse sich aus der Registry nur ablesen, worauf eine Stellschraube wirkt, nicht von
   * wem eine Mechanik abhängt: die Kante `Feld → Ziel` hat sonst kein benanntes Ausgangs-Ende.
   * Genau diese Gegenrichtung ist aber die Frage, die man im Betrieb stellt („was greift hier alles
   * hinein?"). Eine Zeile je Domäne — und daraus fällt die ganze Abhängigkeits-Ansicht heraus.
   */
  mechanic?: FmTarget;
}

/**
 * Abhängigkeiten OHNE Schalter — Regeln, die fest verdrahtet sind.
 *
 * Eine rein aus `affects` abgeleitete Karte zeigt nur, was über ein FELD zusammenhängt. Die
 * wirkungsvollsten Kopplungen des Trackers haben aber gar kein Feld: dass ein Wiederverschluss nach
 * einer Reinigungspause eine Kontrolle auslöst, steht in keiner Spalte. Wer die Karte ohne diese
 * Liste liest, hält genau die Kanten für nicht vorhanden, die ihn später überraschen.
 *
 * Aufgenommen wird, was TRÄGT — nicht jede denkbare Kante. Eine Zeile hier ist eine Behauptung über
 * das Verhalten des Systems und gehört mit einem Code-Anker belegt.
 */
export interface FmWiredEdge {
  from: FmTarget;
  to: FmTarget;
  /** Die Regel in einem Satz. */
  rule: string;
  anchor?: string;
}

/**
 * Die Modelle unter VOLLSTÄNDIGER Prüfung. Erweitern = Zeile ergänzen; der Test nennt danach jedes
 * Feld, das noch keinen Eintrag hat. Bewusst eine kurze Liste statt „alle Modelle“: ein Register,
 * das mit 39 Modellen auf einmal beginnt, wird nie fertig und ist dann gar nichts wert.
 */
export const FM_SCANNED_MODELS = [
  "User", "Entry", "Device", "DeviceCategory", "DeviceReferenceImage",
  "VerschlussAnforderung", "KontrollAnforderung", "OrgasmusAnforderung", "TrainingVorgabe",
  "Task", "TaskRequirement", "TaskProof",
  "StrafeRecord", "ManualOffense", "OffenseRuleChange", "CleaningRuleChange", "TimezoneChange",
  "AdminPasswordChange",
  "BoxStatus", "BoxEvent",
  "Message", "MessageRead", "NotificationPreference", "PushSubscription", "NativePushToken",
  "KeyholderNote", "NoteRef", "KeyholderActionLog", "HealthHold", "RecurringContext", "Appointment",
  "AdminUserRelationship", "Passkey", "PasswordResetToken", "PortalTokenUsed", "RateLimit",
  "OAuthClient", "OAuthCode", "OAuthToken", "OAuthRefreshToken", "AppMeta",
] as const;

export const FM_DOMAINS: FmDomain[] = [
  { id: "eintraege", title: "Einträge & Sessions", doc: "15-eintraege.md", mechanic: "Einträge" },
  { id: "sperrzeit", title: "Sperrzeit & Verschluss", doc: "10-sperrzeit.md", mechanic: "Sperrzeit" },
  { id: "reinigung", title: "Reinigung", doc: "20-reinigung.md", mechanic: "Reinigung" },
  { id: "kontrollen", title: "Kontrollen", doc: "30-kontrollen.md", mechanic: "Kontrollen" },
  { id: "orgasmus", title: "Orgasmus-Direktive", doc: "35-orgasmus.md", mechanic: "Orgasmus" },
  { id: "aufgaben", title: "Aufgaben", doc: "40-aufgaben.md", mechanic: "Aufgaben" },
  { id: "training", title: "Trainingsziele", doc: "45-trainingsziele.md", mechanic: "Trainingsziele" },
  { id: "strafbuch", title: "Vergehen & Strafbuch", doc: "50-strafbuch.md", mechanic: "Strafbuch" },
  { id: "geraete", title: "Geräte & Kategorien", doc: "55-geraete.md", mechanic: "Geräte" },
  { id: "box", title: "Box (Heimdall)", doc: "60-box.md", mechanic: "Box" },
  { id: "nachrichten", title: "Nachrichten", doc: "70-nachrichten.md", mechanic: "Nachrichten" },
  { id: "benachrichtigung", title: "Benachrichtigungen", doc: "75-benachrichtigungen.md", mechanic: "Benachrichtigungen" },
  { id: "kontext", title: "Keyholder-Wissen & Kontext", doc: "80-kontext.md", mechanic: "MCP" },
  { id: "konto", title: "Konto, Zugang & Darstellung", doc: "85-zugang.md", mechanic: "Zugang" },
  { id: "gewicht", title: "Gewicht", mechanic: "Gewicht" },
  { id: "betrieb", title: "Betrieb & Stichtage" },
];

/**
 * Steckbrief einer Mechanik, die KEINE eigene Domäne hat.
 *
 * Nicht jede Mechanik ist ein Ort, an dem man etwas einstellt: die automatischen Kontrollen werden
 * über die Kontroll-Domäne konfiguriert, sind aber in der Wirkungskarte etwas anderes als eine von
 * Hand gestellte Kontrolle — die feste Regel aus der Reinigung trifft nur sie. Ohne diese Tabelle
 * stünden solche Mechaniken in der Karte ohne Verweis darauf, wo sie beschrieben sind.
 */
export const FM_TARGET_DOC: Partial<Record<FmTarget, string>> = {
  "Auto-Kontrollen": "30-kontrollen.md",
  "Sessions/Statistik": "15-eintraege.md",
  "Bildersafe": "15-eintraege.md",
};

/** Siehe {@link FmWiredEdge} — die Kopplungen, hinter denen kein Schalter steht. */
export const FM_WIRED_EDGES: FmWiredEdge[] = [
  {
    from: "Reinigung", to: "Auto-Kontrollen",
    rule: "Jeder SELBST erfasste Wiederverschluss nach einer Reinigungspause erzeugt eine Kontrolle (15–45 min, im Schlaf-Fenster 5–15). Sie ersetzt die nächste noch nicht zugestellte Auto-Kontrolle des Tages. Feste Regel, keine Einstellung — nur der Hauptschalter der Automatik schaltet sie ab.",
    anchor: "autoKontrolleService.ts:scheduleCleaningRelockInspection",
  },
  {
    from: "Reinigung", to: "Sessions/Statistik",
    rule: "Eine Pause zerlegt die KG-Session in Segmente und wird von der Tragedauer abgezogen — die Session bricht dabei nicht.",
    anchor: "sessionModel.ts:buildSessions",
  },
  {
    from: "Reinigung", to: "Geräte",
    rule: "Es gibt keinen eigenen Gerätewechsel: er läuft über eine Reinigungsöffnung und verbraucht damit deren Tageskontingent.",
  },
  {
    from: "Einträge", to: "Sperrzeit",
    rule: "Eine Öffnung ohne Deckung hebt JEDE aktive Sperrzeit auf. Eine erlaubte Reinigungsöffnung und ein Orgasmus-Öffnungsfenster tun das nicht.",
    anchor: "queries.ts:releaseLockPeriodsOnOpen",
  },
  {
    from: "Einträge", to: "Sessions/Statistik",
    rule: "Sessions, Segmente und jede Stundenzahl entstehen beim LESEN aus den Einträgen. Nichts davon ist gestempelt — ein korrigierter Eintrag korrigiert alles Nachgelagerte mit.",
    anchor: "sessionModel.ts:buildSessions",
  },
  {
    from: "Einträge", to: "Kontrollen",
    rule: "Ein Prüfungs-Eintrag erfüllt nur die Kontrolle DESSELBEN Ziels; ein Plug-Foto hakt keine KG-Kontrolle ab.",
    anchor: "kontrolleService.ts",
  },
  {
    from: "Einträge", to: "Orgasmus",
    rule: "Ein passender Orgasmus-Eintrag im Fenster erfüllt die Direktive selbsttätig — passend heisst: die vorgegebene Art stimmt, sofern eine gesetzt ist.",
    anchor: "entryFulfilment.ts",
  },
  {
    from: "Einträge", to: "Box",
    rule: "Die Box folgt den Einträgen: aus Verschluss und Öffnen leitet der Tracker ihr Kommando ab. Eine VERBOTENE Öffnung bekommt keines — sonst vollzöge er das Vergehen, das er dokumentiert.",
    anchor: "boxCommand.ts",
  },
  {
    from: "Sperrzeit", to: "Box",
    rule: "Läuft eine Sperrzeit, hält die Box den Schlüssel fest. Die Sperre ist damit mehr als ein Datenbank-Eintrag.",
    anchor: "boxCommand.ts",
  },
  {
    from: "Box", to: "Sperrzeit",
    rule: "Die Failsafes (leerer Akku, zu lange offline, absolutes Hard-Cap) öffnen physisch auch gegen eine laufende Sperrzeit und gegen den Keyholder. Der Tracker-Zustand ändert sich dabei NICHT — beide laufen dann auseinander.",
    anchor: "boxOpenOutlook.ts",
  },
  {
    from: "Kontrollen", to: "Einträge",
    rule: "Eskalationsstufe 2 legt selbst einen Öffnen-Eintrag an — ohne Zutun des Subs und ohne dass die Box aufgeht. Eine Sperrzeit hebt sie dabei bewusst nicht auf.",
    anchor: "inspectionEscalationService.ts",
  },
  {
    from: "Kontrollen", to: "Strafbuch",
    rule: "Versäumt, abgelehnt oder automatisch als abgenommen gebucht — in jedem Fall ein erkanntes Vergehen, unabhängig davon, ob die Eskalation eingeschaltet ist.",
  },
  {
    from: "Geräte", to: "Einträge",
    rule: "Das massgebliche Gerät eines Segments ist das EFFEKTIVE: bei einem Konflikt zwischen Bild und Deklaration gewinnt das Bild — ausser innerhalb eines Lookalike-Clusters.",
    anchor: "sessionModel.ts:effectiveDevice",
  },
  {
    from: "Aufgaben", to: "Einträge",
    rule: "Die Bedingungen einer Aufgabe werden bei jedem Lesen aus den Einträgen abgeleitet. Ein nachgetragener Eintrag korrigiert die Aufgabe von selbst; es gibt nichts zu bestätigen.",
    anchor: "tasks.ts",
  },
  {
    from: "Aufgaben", to: "Strafbuch",
    rule: "Eine nicht erfüllte Aufgabe ergibt GENAU EIN Vergehen — welcher der drei Vorwürfe gemeint ist, sagt erst die Ausfall-Art.",
  },
  {
    from: "Strafbuch", to: "Aufgaben",
    rule: "Eine Strafe kann eine gestellte Aufgabe sein. Wird das Urteil ersetzt oder zurückgenommen, zieht der Tracker die Aufgabe zurück; eine ERFÜLLTE Strafaufgabe schliesst das Urteil umgekehrt von selbst ab.",
    anchor: "strafurteilService.ts",
  },
  {
    from: "Trainingsziele", to: "Sessions/Statistik",
    rule: "Ein Ziel MISST nur. Es fordert nichts ein, erzeugt keine Frist, keine Meldung und kein Vergehen — es liefert eine Zahl, die der Keyholder bewertet.",
    anchor: "vorgaben.ts",
  },
  {
    from: "Strafbuch", to: "Nachrichten",
    rule: "Erkannte, bestrafte und verworfene Vergehen werden beiden Seiten gemeldet — abgeleitete aber erst ab dem Stichtag der Instanz, sonst kippte das erste Update die ganze Historie in den Posteingang.",
    anchor: "offenseAnnounce.ts",
  },
  {
    from: "Zugang", to: "Strafbuch",
    rule: "Wird das Passwort eines ADMIN-Kontos geändert, während eine Sperrzeit läuft, entsteht ein Vergehen — als einziges im Moment des Vorgangs festgeschrieben statt live abgeleitet.",
    anchor: "passwordAudit.ts",
  },
];

const s = (e: Omit<FmSetting, "kind">): FmSetting => ({ kind: "setting", ...e });
const x = (kind: FmNonSetting["kind"], model: string, field: string, note: string): FmNonSetting =>
  ({ kind, model, field, note });

/** Die drei Felder, die fast jedes Modell hat. Ausgeschrieben wären das ~100 gleichlautende Zeilen,
 *  in denen die wenigen echten Aussagen untergingen. */
const pk = (model: string) => x("identity", model, "id", "Primärschlüssel.");
const owner = (model: string, field = "userId") => x("identity", model, field, "Eigentümer der Zeile.");
const stamp = (model: string, field = "createdAt") => x("record", model, field, "Anlage-Zeitpunkt.");

export const FM_REGISTRY: FmEntry[] = [
  // ── User: Reinigung ────────────────────────────────────────────────────────────────────────
  s({
    model: "User", field: "reinigungErlaubt", domain: "reinigung", scope: "standing",
    effect: "Ob Reinigungspausen überhaupt erlaubt sind. Notwendig, nicht hinreichend — eine aktive Sperrzeit muss es zusätzlich erlauben.",
    writers: ["admin", "mcp"], affects: ["Reinigung", "Sperrzeit", "Box", "Strafbuch", "Geräte"],
    anchor: "queries.ts:cleaningBlockReason",
  }),
  s({
    model: "User", field: "reinigungMaxMinuten", domain: "reinigung", scope: "standing",
    effect: "Höchstdauer EINER Pause. Darüber hinaus zählt die Pause als Tragezeit-Unterbrechung und wird zum erkannten Vergehen.",
    writers: ["admin", "mcp"], affects: ["Reinigung", "Strafbuch", "Sessions/Statistik"],
    anchor: "cleaningRules.ts:reinigungRulesAt",
  }),
  s({
    model: "User", field: "reinigungMaxProTag", domain: "reinigung", scope: "standing",
    effect: "ANZAHL Öffnungen pro Kalendertag des Subs (kein Minutenbudget). 0 = unbegrenzt. Wird nur erkannt, nie durchgesetzt.",
    writers: ["admin", "mcp"], affects: ["Reinigung", "Strafbuch"],
    anchor: "reinigungService.ts:maxPausesPerDaySentinel",
  }),
  s({
    model: "User", field: "reinigungsFenster", domain: "reinigung", scope: "standing",
    effect: "Tages-Zeitfenster (JSON-Liste). Binden NUR während einer Sperrzeit, die die Reinigung erlaubt. Leere Liste = nicht zeitgebunden, kein Verbot.",
    writers: ["admin", "mcp"], affects: ["Reinigung", "Box"],
    anchor: "queries.ts:cleaningWindowBindingStatus",
  }),

  // ── User: automatische Kontrollen ──────────────────────────────────────────────────────────
  s({
    model: "User", field: "autoKontrolleAktiv", domain: "kontrollen", scope: "standing",
    effect: "Hauptschalter der Automatik. Aus schaltet BEIDES ab: den gewürfelten Tagesplan und die Kontrolle nach dem Wiederverschluss.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen", "Kontrollen", "Strafbuch"],
    anchor: "autoKontrolleService.ts",
  }),
  s({
    model: "User", field: "autoKontrollePerDayMin", domain: "kontrollen", scope: "standing",
    effect: "Untergrenze der pro Tag gewürfelten Anzahl. Zusammen mit Max auf 0 bleibt nur die Kontrolle nach dem Wiederverschluss.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen"], anchor: "autoKontrolleService.ts:generateAutoKontrollen",
  }),
  s({
    model: "User", field: "autoKontrollePerDayMax", domain: "kontrollen", scope: "standing",
    effect: "Obergrenze derselben Auslosung. Unter Min gesetzt wird er auf Min angehoben statt abgelehnt.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen"], anchor: "autoKontrolleService.ts:clampPerDay",
  }),
  s({
    model: "User", field: "autoKontrolleRuheVon", domain: "kontrollen", scope: "standing",
    effect: "Beginn des Schlaf-Fensters (Wanduhr des Subs). Darin wird weder ausgelöst noch eine Frist platziert.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen"], anchor: "autoKontrolleService.ts:isInQuietMinutes",
  }),
  s({
    model: "User", field: "autoKontrolleRuheBis", domain: "kontrollen", scope: "standing",
    effect: "Ende des Schlaf-Fensters. Das Komplement daraus ist das Wach-Fenster, über das der Tagesplan verteilt wird.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen"], anchor: "autoKontrolleService.ts:awakeWindow",
  }),
  s({
    model: "User", field: "autoKontrolleFristVon", domain: "kontrollen", scope: "standing",
    effect: "Untergrenze der Erfüllungsfrist je Kontrolle (Minuten). Bleibt sie vor dem Schlaf-Beginn nicht mehr ganz übrig, entfällt der Slot.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen"], anchor: "autoKontrolleService.ts:windowDeadline",
  }),
  s({
    model: "User", field: "autoKontrolleFristBis", domain: "kontrollen", scope: "standing",
    effect: "Obergrenze derselben Frist; je Kontrolle wird zufällig aus der Spanne gezogen.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen"], anchor: "autoKontrolleService.ts:clampFrist",
  }),
  s({
    model: "User", field: "autoKontrolleFensterVon", domain: "kontrollen", scope: "standing",
    effect: "Beginn eines optionalen festen Auslöse-Fensters. Leer = ganzes Wach-Fenster. Wrappt bewusst nicht über Mitternacht.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen"], anchor: "autoKontrolleService.ts:fixedWindowMinutes",
  }),
  s({
    model: "User", field: "autoKontrolleFensterBis", domain: "kontrollen", scope: "standing",
    effect: "Ende desselben Fensters. Liegt es vollständig im Schlaf-Fenster, wird die Kombination abgelehnt statt wirkungslos gespeichert.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen"], anchor: "autoKontrolleService.ts:triggerWindowAllQuiet",
  }),
  s({
    model: "User", field: "autoKontrolleNurBeiSperre", domain: "kontrollen", scope: "standing",
    effect: "Stellt den Tagesplan nur während einer laufenden Sperrzeit zu. Gilt NICHT für die Kontrolle nach dem Wiederverschluss.",
    writers: ["admin", "mcp"], affects: ["Auto-Kontrollen", "Sperrzeit"], anchor: "autoKontrolleService.ts",
  }),

  // ── User: Kontroll-Eskalation ──────────────────────────────────────────────────────────────
  s({
    model: "User", field: "inspectionReminderEnabled", domain: "kontrollen", scope: "standing",
    effect: "Stufe 1: mahnt eine überfällige Kontrolle an. Setzt nur den Uhr-Anker für Stufe 2 — ohne sie beginnt Stufe 2 nie.",
    writers: ["admin", "mcp"], affects: ["Kontrollen", "Benachrichtigungen"], anchor: "inspectionEscalationService.ts",
  }),
  s({
    model: "User", field: "inspectionReminderDelayMinutes", domain: "kontrollen", scope: "standing",
    effect: "Verzug bis zur Mahnung, gemessen ab dem Ablauf der Kontroll-Frist.",
    writers: ["admin", "mcp"], affects: ["Kontrollen", "Benachrichtigungen"], anchor: "inspectionEscalationService.ts",
  }),
  s({
    model: "User", field: "inspectionAutoMarkEnabled", domain: "kontrollen", scope: "standing",
    effect: "Stufe 2: bucht die unbeantwortete Kontrolle selbst als Öffnung bzw. Ablegen. Hebt dabei bewusst KEINE Sperrzeit auf.",
    writers: ["admin", "mcp"], affects: ["Kontrollen", "Einträge", "Sessions/Statistik", "Strafbuch"],
    anchor: "queries.ts:releaseLockPeriodsOnOpen",
  }),
  s({
    model: "User", field: "inspectionAutoMarkDelayMinutes", domain: "kontrollen", scope: "standing",
    effect: "Verzug bis zu dieser Buchung, gemessen ab dem Stempel der Stufe 1.",
    writers: ["admin", "mcp"], affects: ["Kontrollen"], anchor: "inspectionEscalationService.ts",
  }),

  // ── User: Erfassung, Darstellung, Zugang ───────────────────────────────────────────────────
  s({
    model: "User", field: "mobileDesktopUpload", domain: "eintraege", scope: "standing",
    effect: "Erlaubt auf Mobilgeräten die Dateiauswahl statt nur die Kamera — schwächt jeden Foto-Nachweis, deshalb Admin-Feld.",
    writers: ["admin"], affects: ["Kontrollen", "Aufgaben", "Einträge", "Oberfläche"],
  }),
  s({
    model: "User", field: "timezone", domain: "konto", scope: "standing",
    effect: "Die Wanduhr des Subs. Kalendertag, Reinigungsfenster und Schlaf-Fenster rechnen darin — nicht in der Serverzone. Historisiert: eine Umstellung wirkt ab jetzt, vergangene Öffnungen bleiben nach der damaligen Zone beurteilt.",
    writers: ["sub"], affects: ["Reinigung", "Auto-Kontrollen", "Sessions/Statistik"],
    anchor: "timezoneRules.ts:timezoneRulesFrom",
  }),
  s({
    model: "User", field: "startPage", domain: "konto", scope: "standing",
    effect: "Startseite nach der Anmeldung; `auto` wählt sie nach Rolle.",
    writers: ["sub"], affects: ["Oberfläche"], anchor: "userSelfField.ts",
  }),
  s({
    model: "User", field: "noticeSeenVersion", domain: "konto", scope: "standing",
    effect: "Welche Umstellung dieser Nutzer quittiert hat, als Versionsnummer. Leer = der Hinweis zur laufenden Umstellung erscheint beim nächsten Aufruf. Reine Anzeige-Quittung: er ändert nichts an Regeln, Fristen oder Beurteilung.",
    writers: ["sub"], affects: ["Oberfläche"], anchor: "notice.ts:NOTICE_VERSION",
  }),
  s({
    model: "User", field: "dashboardLayout", domain: "konto", scope: "standing",
    effect: "Abweichungen vom Standard-Dashboard (ausgeblendete Blöcke, eigene Reihenfolge) als JSON je Oberfläche. Leer = Standard.",
    writers: ["sub"], affects: ["Oberfläche"], anchor: "dashboardLayout.ts:resolveLayout",
  }),
  s({
    model: "User", field: "hideOwnTracker", domain: "konto", scope: "standing",
    effect: "Blendet den eigenen Tracker in der Keyholder-Ansicht aus — für Admin-Konten, die selbst keinen führen.",
    writers: ["sub"], affects: ["Oberfläche"], anchor: "ownTracker.ts",
  }),
  s({
    model: "User", field: "locale", domain: "konto", scope: "standing",
    effect: "Sprache der Oberfläche UND aller Anschreiben — auch der Portal-Mails, die sie von hier lesen.",
    writers: ["sub", "admin"], affects: ["Oberfläche", "Benachrichtigungen"], anchor: "emailI18n.ts",
  }),
  s({
    model: "User", field: "role", domain: "konto", scope: "standing",
    effect: "`user` oder `admin`. Entscheidet über Admin-Oberfläche, MCP-Zugang und das Handeln für fremde Konten.",
    writers: ["admin", "portal"], affects: ["Zugang", "MCP"], anchor: "authGuards.ts:requireAdminApi",
  }),
  s({
    model: "User", field: "orgasmusArtenConfig", domain: "eintraege", scope: "standing",
    effect: "Auswahlliste der Orgasmus-Arten im Erfassungsformular (JSON). Leer = die eingebauten Arten.",
    writers: ["admin"], affects: ["Einträge", "Orgasmus"], anchor: "reasonsService.ts",
  }),
  s({
    model: "User", field: "oeffnenGruendeConfig", domain: "eintraege", scope: "standing",
    effect: "Auswahlliste der Öffnungsgründe. `REINIGUNG` ist der Grund, an dem die gesamte Reinigungslogik hängt — er lässt sich nicht wegkonfigurieren.",
    writers: ["admin"], affects: ["Einträge", "Reinigung", "Sperrzeit"], anchor: "reasonsService.ts",
  }),
  s({
    model: "User", field: "mcpKeyholderInstructions", domain: "kontext", scope: "standing",
    effect: "Dauerauftrag an die Keyholder-KI; wird ihr bei jeder MCP-Verbindung mitgegeben. Der Sub sieht ihn nie.",
    writers: ["admin"], affects: ["MCP"], anchor: "app/api/[transport]/route.ts",
  }),

  // ── User: Gewicht ──────────────────────────────────────────────────────────────────────────
  s({
    model: "User", field: "weightTrackingEnabled", domain: "gewicht", scope: "standing",
    effect: "Schaltet das Gewichtstracking für diesen Träger frei. Aus = Erfassung, Anzeigen und MCP-Schreiben verschwinden; die Daten bleiben. Zusätzlich muss die Instanz das Feature führen (`ENABLE_WEIGHT_TRACKING`).",
    writers: ["admin"], affects: ["Gewicht", "Oberfläche"], anchor: "authGuards.ts:weightTrackingGate",
  }),
  s({
    model: "User", field: "heightCm", domain: "gewicht", scope: "standing",
    effect: "Aktuelle Körpergrösse — die Grundlage jedes BMI. Jede Änderung wird zusätzlich in `HeightChange` protokolliert; gerechnet wird heute überall mit diesem aktuellen Wert.",
    writers: ["sub"], affects: ["Gewicht"], anchor: "weight.ts:bmi",
    retroactive: "Eine neue Zahl verschiebt JEDEN angezeigten BMI, auch den zu alten Messungen — gerechnet wird stets mit der aktuellen Grösse, nicht mit der von damals.",
  }),
  s({
    model: "User", field: "unitSystem", domain: "gewicht", scope: "standing",
    effect: "Anzeige-Einheit DESSEN, DER SCHAUT (metrisch/imperial). Gespeichert wird immer metrisch — eine Keyholderin darf Pfund sehen, während ihr Träger in Kilogramm einträgt.",
    writers: ["sub"], affects: ["Oberfläche"], anchor: "weight.ts:weightForDisplay",
  }),
  s({
    model: "User", field: "targetWeightKg", domain: "gewicht", scope: "standing",
    effect: "Zielgewicht, das sich der Träger selbst vorgenommen hat. Wirksam, solange die Keyholderin keines führt; erreicht oder wieder verloren meldet es ihr — sie entscheidet, ob etwas folgt.",
    writers: ["sub"], affects: ["Gewicht", "Nachrichten"], anchor: "weight.ts:effectiveTarget",
  }),
  s({
    model: "User", field: "targetWeightSetAt", domain: "gewicht", scope: "standing",
    effect: "Wann er sein Ziel gesetzt hat — der Bezugspunkt des Fortschritts: gerechnet wird ab der Messung, die damals galt. Ein unveränderter Wert bewegt den Zeitpunkt nicht.",
    writers: ["system"], affects: ["Gewicht"], anchor: "weightService.ts:targetStartWeight",
  }),
  s({
    model: "User", field: "targetWeightKeyholderKg", domain: "gewicht", scope: "standing",
    effect: "Zielgewicht der Keyholderin. Es GILT, solange sie eines führt — auch wenn es strenger ist als seines; seines bleibt daneben sichtbar. Zurückgenommen gilt wieder seines.",
    writers: ["admin"], affects: ["Gewicht", "Nachrichten"], anchor: "weight.ts:effectiveTarget",
  }),
  s({
    model: "User", field: "targetWeightKeyholderSetAt", domain: "gewicht", scope: "standing",
    effect: "Wann sie ihr Ziel gesetzt hat — derselbe Bezugspunkt des Fortschritts wie auf seiner Seite.",
    writers: ["system"], affects: ["Gewicht"], anchor: "weightService.ts:targetStartWeight",
  }),
  s({
    model: "User", field: "weighingWindows", domain: "gewicht", scope: "standing",
    effect: "Tägliche Zeitfenster fürs Wiegen (Wanduhrzeit des Trägers). Leer = keine Fensterpflicht. Ein Wert ausserhalb wird markiert, nicht geahndet — er misst nur eine andere Tageszeit mit.",
    writers: ["admin"], affects: ["Gewicht"], anchor: "weightWindows.ts:inWeighingWindow",
  }),

  x("runtime", "User", "weightReminderMark",
    "Für welches Wiege-Fenster zuletzt erinnert wurde (`<Tag>#<Startzeit>`). Kein Schalter, sondern die Merkfähigkeit des Minuten-Pollers: sie verhindert die Wiederholung und erlaubt zugleich das Nachholen nach einem Neustart."),

  pk("User"),
  x("identity", "User", "username", "Anmeldename, zugleich die Kennung in Meldungen."),
  x("identity", "User", "passwordHash", "bcrypt-Hash. Kein Verhalten, sondern der Zugang selbst."),
  x("identity", "User", "email", "Zustelladresse; steuert nichts, ausser dass ohne sie keine Mail geht."),
  x("identity", "User", "createdAt", "Anlage-Zeitpunkt."),
  x("runtime", "User", "autoInspectionPlannedFor",
    "Merker des Planers: bis wann der Tagesplan gewürfelt ist. Wird vom Poller gesetzt, nicht von Hand."),

  // ── Device ─────────────────────────────────────────────────────────────────────────────────
  s({
    model: "Device", field: "categoryId", domain: "geraete", scope: "standing",
    effect: "Zuordnung zur Kategorie — entscheidet, welche Kategorie-Regeln (Tracking, Pflichtfoto, Trainingsziele) für dieses Gerät gelten.",
    writers: ["sub", "admin", "mcp"], affects: ["Geräte", "Kontrollen", "Trainingsziele", "Sessions/Statistik"],
    anchor: "deviceCategoryService.ts:resolveOwnedCategory",
  }),
  s({
    model: "Device", field: "requireInspectionCode", domain: "kontrollen", scope: "standing",
    effect: "Verlangt eine Kontrolle mit DIESEM Gerät den handschriftlichen Code im Foto? Aus: die Erfüllung läuft über die eine offene Anforderung statt über den Code-Vergleich.",
    writers: ["admin", "mcp"], affects: ["Kontrollen"], anchor: "kontrolleService.ts",
  }),
  s({
    model: "Device", field: "securityLevel", domain: "geraete", scope: "standing",
    effect: "SECURING oder TRUST_ONLY — Einordnung für die Keyholder-Entscheidung. Wird nirgends durchgesetzt.",
    writers: ["mcp"], affects: ["MCP"], anchor: "mcp/devices.ts:set_device_meta",
  }),
  s({
    model: "Device", field: "lookalikeClusterId", domain: "geraete", scope: "standing",
    effect: "Gleiche Optik = gleicher Cluster. Ein Bild-Konflikt INNERHALB eines Clusters ist nie ein Vergehen.",
    writers: ["mcp"], affects: ["Geräte", "Sessions/Statistik", "Strafbuch"], anchor: "mcp/devices.ts:set_device_meta",
    retroactive: "Rechnet die Geräte-Zuordnung JEDER historischen Session mit Bild-Konflikt neu. Vorher die Vorschau prüfen.",
  }),
  s({
    model: "Device", field: "pullOffRisk", domain: "geraete", scope: "standing",
    effect: "Abstreifbar? `null` = nie beurteilt, nicht „sicher“. Reine Beurteilung ohne Durchsetzung.",
    writers: ["mcp"], affects: ["MCP"], anchor: "mcp/devices.ts:set_device_meta",
  }),
  s({
    model: "Device", field: "name", domain: "geraete", scope: "standing",
    effect: "Anzeigename. Geht zusätzlich in die Geräte-Erkennung ein, zusammen mit den Bildern und den drei optischen Feldern.",
    writers: ["sub", "admin", "mcp"], affects: ["Geräte", "Oberfläche"],
  }),
  s({
    model: "Device", field: "archivedAt", domain: "geraete", scope: "standing",
    effect: "Soft-Delete: gesetzt = archiviert, aus Auswahllisten raus, Historie bleibt.",
    writers: ["sub", "admin", "mcp"], affects: ["Geräte", "Sessions/Statistik"],
  }),
  pk("Device"),
  owner("Device"),
  s({
    model: "Device", field: "description", domain: "geraete", scope: "standing",
    effect: "Freitext — und eines der drei optischen Felder, die in die Geräte-Erkennung eingehen. Prosa über das Tragegefühl verwässert sie hier; die gehört in die Sitz-Notizen.",
    writers: ["sub", "admin", "mcp"], affects: ["Geräte", "Oberfläche"], anchor: "deviceReferenceService.ts:visualTraitsOf",
  }),
  x("record", "Device", "imageUrl", "Titelbild. Referenzbilder für die Erkennung stehen in DeviceReferenceImage."),
  x("record", "Device", "purchasePrice", "Inventarangabe."),
  x("record", "Device", "currency", "Währung zur Inventarangabe."),
  stamp("Device"),
  s({
    model: "Device", field: "material", domain: "geraete", scope: "standing",
    effect: "Werkstoff. Geht als optisches Merkmal in die Geräte-Erkennung ein.",
    writers: ["sub", "admin"], affects: ["Geräte"], anchor: "deviceReferenceService.ts:visualTraitsOf",
  }),
  s({
    model: "Device", field: "bauform", domain: "geraete", scope: "standing",
    effect: "Bauform. Ebenfalls ein optisches Merkmal der Erkennung.",
    writers: ["sub", "admin"], affects: ["Geräte"], anchor: "deviceReferenceService.ts:visualTraitsOf",
  }),
  x("record", "Device", "healthFlags",
    "Beobachtungen zur Verträglichkeit (JSON-Liste). Bewusst NICHT in der Erkennung: ein Urteil über Tragekomfort ist im Bild nicht nachprüfbar."),
  x("record", "Device", "retentionNotes",
    "Freitext zum Sitz des Geräts. Aus demselben Grund von der Erkennung ausgenommen."),
  x("runtime", "Device", "version", "Optimistic-Concurrency-Token der MCP-Edits."),

  // ── DeviceCategory ─────────────────────────────────────────────────────────────────────────
  s({
    model: "DeviceCategory", field: "trackingEnabled", domain: "geraete", scope: "standing",
    effect: "Aus = reine Inventar-Kategorie: keine Trage-Sessions, keine Statistik. Abwesenheit in den Auswertungen ist dann keine Nichtnutzung. Bei der eingebauten Kategorie unveränderlich.",
    writers: ["admin", "mcp"], affects: ["Sessions/Statistik", "Geräte", "Einträge"],
    anchor: "deviceCategoryService.ts:resolveCategoryRuleChanges",
  }),
  s({
    model: "DeviceCategory", field: "requirePhoto", domain: "geraete", scope: "standing",
    effect: "Ein Trage-Beginn dieser Kategorie verlangt ein Bild. Bei der eingebauten Kategorie unveränderlich.",
    writers: ["admin", "mcp"], affects: ["Einträge", "Geräte"],
    anchor: "deviceCategoryService.ts:resolveCategoryRuleChanges",
  }),
  s({
    model: "DeviceCategory", field: "allowVorgaben", domain: "geraete", scope: "standing",
    effect: "Aus = die Kategorie lässt sich in keinem Trainingsziel verwenden — deshalb Keyholder-Feld: der Träger könnte sonst das Ziel aus der Hand nehmen. Bei der eingebauten Kategorie unveränderlich.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele"],
    anchor: "deviceCategoryService.ts:resolveCategoryRuleChanges",
  }),
  s({
    model: "DeviceCategory", field: "name", domain: "geraete", scope: "standing",
    effect: "Anzeigename der Kategorie; frei änderbar, der `slug` bleibt.",
    writers: ["sub", "admin", "mcp"], affects: ["Oberfläche"],
  }),
  s({
    model: "DeviceCategory", field: "sortOrder", domain: "geraete", scope: "standing",
    effect: "Reihenfolge in Listen und Auswahlfeldern.",
    writers: ["sub", "admin", "mcp"], affects: ["Oberfläche"],
  }),
  s({
    model: "DeviceCategory", field: "color", domain: "geraete", scope: "standing",
    effect: "Farbmarke der Kategorie (CSS-Variablen-Suffix).",
    writers: ["sub", "admin", "mcp"], affects: ["Oberfläche"],
  }),
  s({
    model: "DeviceCategory", field: "icon", domain: "geraete", scope: "standing",
    effect: "Symbol der Kategorie (Name aus CATEGORY_ICONS).",
    writers: ["sub", "admin", "mcp"], affects: ["Oberfläche"],
  }),
  pk("DeviceCategory"),
  owner("DeviceCategory"),
  x("identity", "DeviceCategory", "slug", "Stabile Kennung; `kg` ist die eingebaute Kategorie."),
  x("record", "DeviceCategory", "isBuiltIn", "Nur für den KG gesetzt; verhindert das Löschen."),
  stamp("DeviceCategory"),

  // ── VerschlussAnforderung: Sperrzeit & Einschliess-Anforderung ─────────────────────────────
  s({
    model: "VerschlussAnforderung", field: "reinigungErlaubt", domain: "sperrzeit", scope: "directive",
    effect: "Erlaubt DIESE Sperrzeit eine Reinigungsöffnung (und damit einen Gerätewechsel)? Es müssen ALLE gleichzeitig aktiven Sperrzeiten erlauben, nicht nur die neueste.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit", "Reinigung", "Box", "Geräte"],
    anchor: "queries.ts:foldActiveLockPeriods",
  }),
  s({
    model: "VerschlussAnforderung", field: "endsAt", domain: "sperrzeit", scope: "directive",
    effect: "Bei einer SPERRZEIT das Ende (leer = indefinite), bei einer ANFORDERUNG die Frist zum Einschliessen.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit", "Box", "Strafbuch"],
    anchor: "queries.ts:foldActiveLockPeriods",
  }),
  s({
    model: "VerschlussAnforderung", field: "dauerH", domain: "sperrzeit", scope: "directive",
    effect: "Mindest-Tragedauer einer Anforderung; die Uhr startet beim tatsächlichen Verschluss. Alternative zu `lockEndsAt`.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit"], anchor: "entryFulfilment.ts",
  }),
  s({
    model: "VerschlussAnforderung", field: "lockEndsAt", domain: "sperrzeit", scope: "directive",
    effect: "Absolutes Sperr-Ende einer Anforderung (feste Wanduhr). Ein später Verschluss verschiebt es NICHT — anders als `dauerH`.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit"], anchor: "entryFulfilment.ts",
  }),
  s({
    model: "VerschlussAnforderung", field: "deviceId", domain: "sperrzeit", scope: "directive",
    effect: "Verlangt ein bestimmtes Gerät. Nur hieraus entsteht das Vergehen „falsches Gerät“ — der Bild-Abgleich allein tut es nie.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit", "Geräte", "Strafbuch"],
  }),
  s({
    model: "VerschlussAnforderung", field: "wirksamAb", domain: "sperrzeit", scope: "directive",
    effect: "Terminierte Auslösung. Bis dahin existiert die Direktive für den Sub nicht: keine Anzeige, keine Meldung, keine laufende Frist.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit", "Benachrichtigungen"],
  }),
  s({
    model: "VerschlussAnforderung", field: "message", domain: "sperrzeit", scope: "directive",
    effect: "Begleittext an den Sub; erscheint in der Meldung und im Posteingang.",
    writers: ["admin", "mcp"], affects: ["Nachrichten"],
  }),
  pk("VerschlussAnforderung"),
  owner("VerschlussAnforderung"),
  x("record", "VerschlussAnforderung", "art",
    "`ANFORDERUNG` oder `SPERRZEIT` — die Bauart der Zeile, nicht einstellbar: sie ergibt sich daraus, welche Direktive gestellt wurde."),
  x("audit", "VerschlussAnforderung", "createdBy",
    "Wer die Direktive angeordnet hat; wird an die daraus entstehende Sperrzeit vererbt. `null` = System."),
  stamp("VerschlussAnforderung"),
  x("runtime", "VerschlussAnforderung", "fulfilledAt", "Gesetzt, wenn der Sub sich eingeschlossen hat."),
  x("runtime", "VerschlussAnforderung", "withdrawnAt", "Gesetzt beim Zurückziehen oder beim Bruch durch eine Öffnung."),
  x("audit", "VerschlussAnforderung", "endedReason",
    "WARUM zurückgezogen: `keyholder` (bewusst), `released` (vorzeitig freigegeben per Sofort-Aufschluss), `opening` (vom Sub gebrochen) oder `obsolete` (beim Auslösen schon gegenstandslos). Ohne das Feld sähen alle gleich aus; nur `opening` speist die Anzeige der gebrochenen Sperrzeit."),
  x("runtime", "VerschlussAnforderung", "benachrichtigtAt", "Wann die Zustellung rausging."),

  // ── KontrollAnforderung ────────────────────────────────────────────────────────────────────
  s({
    model: "KontrollAnforderung", field: "categoryId", domain: "kontrollen", scope: "directive",
    effect: "ZIEL der Kontrolle: leer = der KG (verlangt einen aktiven Verschluss), gesetzt = eine Trage-Kategorie. Je Ziel darf nur eine Kontrolle laufen.",
    writers: ["admin", "mcp"], affects: ["Kontrollen"], anchor: "kontrolleService.ts:hasActiveKontrolle",
  }),
  s({
    model: "KontrollAnforderung", field: "deviceId", domain: "kontrollen", scope: "directive",
    effect: "Verengt das Ziel auf genau ein Gerät und hat Vorrang vor der Kategorie. Es muss das getragene sein, sonst ist die Kontrolle nicht erfüllbar.",
    writers: ["admin", "mcp"], affects: ["Kontrollen", "Geräte"],
  }),
  s({
    model: "KontrollAnforderung", field: "deadline", domain: "kontrollen", scope: "directive",
    effect: "Erfüllungsfrist. Nach Ablauf verschwindet die Kontrolle nicht, sie wird überfällig — und ist der Startpunkt der Eskalation.",
    writers: ["admin", "mcp"], affects: ["Kontrollen", "Strafbuch"], anchor: "inspectionEscalationService.ts",
  }),
  s({
    model: "KontrollAnforderung", field: "wirksamAb", domain: "kontrollen", scope: "directive",
    effect: "Terminierte Zustellung; bis dahin für den Sub unsichtbar und ohne laufende Frist. Auch der Weg, auf dem der Tagesplan vorab angelegt wird.",
    writers: ["admin", "mcp", "system"], affects: ["Kontrollen", "Auto-Kontrollen"],
  }),
  s({
    model: "KontrollAnforderung", field: "kommentar", domain: "kontrollen", scope: "directive",
    effect: "Begleittext an den Sub.",
    writers: ["admin", "mcp"], affects: ["Nachrichten"],
  }),
  pk("KontrollAnforderung"),
  owner("KontrollAnforderung"),
  x("runtime", "KontrollAnforderung", "code",
    "Zufallscode fürs Foto — vom Server erzeugt. `null`, wenn das Gerät keinen verlangt (`Device.requireInspectionCode`)."),
  x("audit", "KontrollAnforderung", "createdBy", "Wer die Kontrolle gestellt hat; `null` = die Automatik."),
  stamp("KontrollAnforderung"),
  x("runtime", "KontrollAnforderung", "fulfilledAt", "Serverseitig beim erfüllenden Prüf-Eintrag gesetzt, nie editierbar."),
  x("runtime", "KontrollAnforderung", "withdrawnAt", "Gesetzt beim Zurückziehen."),
  x("runtime", "KontrollAnforderung", "benachrichtigtAt", "Wann die Zustellung rausging."),
  x("runtime", "KontrollAnforderung", "auto", "Kennzeichnet die vom Tagesplan erzeugten Zeilen."),
  x("runtime", "KontrollAnforderung", "entryId", "Der erfüllende Prüf-Eintrag."),
  x("runtime", "KontrollAnforderung", "benachrichtigtReminderAt",
    "Stempel der Stufe 1 — zugleich der Uhr-Anker, ab dem Stufe 2 zählt."),
  x("runtime", "KontrollAnforderung", "autoMarkedRemovedAt", "Stempel der Stufe 2."),
  x("runtime", "KontrollAnforderung", "autoMarkedEntryId",
    "Der von Stufe 2 erzeugte Öffnen-Eintrag — bewusst eine eigene Spalte, nicht die des erfüllenden Eintrags."),
  x("runtime", "KontrollAnforderung", "cleaningRelock",
    "Herkunft: aus einem Wiederverschluss nach einer Reinigungspause statt aus dem Tagesplan. Nicht aus der Zeile rekonstruierbar."),

  // ── NotificationPreference ─────────────────────────────────────────────────────────────────
  s({
    model: "NotificationPreference", field: "mail", domain: "benachrichtigung", scope: "standing",
    effect: "Ob dieses Ereignis per Mail zugestellt wird.",
    writers: ["sub", "admin"], affects: ["Benachrichtigungen"], anchor: "notificationPrefs.ts",
  }),
  s({
    model: "NotificationPreference", field: "push", domain: "benachrichtigung", scope: "standing",
    effect: "Ob dieses Ereignis als Push zugestellt wird (Web-Push und native Geräte).",
    writers: ["sub", "admin"], affects: ["Benachrichtigungen"], anchor: "notificationPrefs.ts",
  }),
  pk("NotificationPreference"),
  owner("NotificationPreference"),
  x("record", "NotificationPreference", "eventType",
    "Welches Ereignis die Zeile betrifft — die Zeile selbst ist der Schalter, nicht dieses Feld."),

  // ── Entry: der Rohstoff, aus dem alles andere abgeleitet wird ───────────────────────────────
  s({
    model: "Entry", field: "oeffnenGrund", domain: "eintraege", scope: "entry",
    effect: "Grund einer Öffnung. `REINIGUNG` ist der eine Wert, an dem die gesamte Reinigungsmechanik hängt — er entscheidet, ob die Sperrzeit fällt.",
    writers: ["sub", "admin"], affects: ["Reinigung", "Sperrzeit", "Strafbuch", "Sessions/Statistik"],
    anchor: "queries.ts:isAllowedCleaningOpen",
  }),
  s({
    model: "Entry", field: "keyInBox", domain: "eintraege", scope: "entry",
    effect: "Erklärung beim Verschluss, ob der Schlüssel in die Box wandert. `false` = er behält ihn, die Box bekommt bewusst KEIN Sperr-Kommando. `null` = nicht gefragt.",
    writers: ["sub"], affects: ["Box", "Sperrzeit"], anchor: "boxCommand.ts",
  }),
  s({
    model: "Entry", field: "deviceId", domain: "eintraege", scope: "entry",
    effect: "Welches Gerät der Eintrag betrifft. Bei einem Konflikt mit dem Bild gewinnt das Bild, nicht diese Deklaration.",
    writers: ["sub", "admin"], affects: ["Geräte", "Sessions/Statistik", "Kontrollen"],
  }),
  s({
    model: "Entry", field: "startTime", domain: "eintraege", scope: "entry",
    effect: "Der Zeitpunkt, den der Eintrag behauptet. Auf dem Sub-Pfad gegen Rückdatierung begrenzt, auf dem Keyholder-Pfad frei — dort erfüllt ein Nachtrag nur, was es zu seinem Zeitpunkt schon gab.",
    writers: ["sub", "admin"], affects: ["Sessions/Statistik", "Strafbuch"], anchor: "entryFulfilment.ts",
  }),
  x("record", "Entry", "type",
    "VERSCHLUSS | OEFFNEN | PRUEFUNG | ORGASMUS | WEAR_BEGIN | WEAR_END — die Art des Ereignisses, nicht einstellbar."),
  x("record", "Entry", "imageUrl", "Foto des Geräts bzw. des Siegels."),
  x("record", "Entry", "imageExifTime", "Aufnahmezeit aus den EXIF-Daten; massgeblich, wo Reihenfolge zählt."),
  x("record", "Entry", "codeImageUrl",
    "Bildersafe: versiegeltes Foto des Schlüsselbox-Codes, wird erst freigegeben, wenn Öffnen erlaubt ist."),
  x("runtime", "Entry", "codeReadable",
    "Ob im Bildersafe-Foto überhaupt Ziffern erkennbar waren. Die Zahl selbst wird bewusst nicht gespeichert."),
  x("record", "Entry", "boxImageUrl", "Aufnahme durch das Sichtfenster der Box als Schlüssel-Nachweis."),
  x("runtime", "Entry", "keyDetected",
    "Hat die Bilderkennung im Sichtfenster einen Schlüssel gesehen? Beratend, blockiert nichts — und erkennt 'ein Schlüssel', nicht 'der richtige'."),
  x("runtime", "Entry", "clientRequestId",
    "Merkfähigkeit gegen die doppelte Zustellung: erkennt einen wiederholten Anlege-Versuch als denselben, statt einen zweiten Eintrag zu schreiben. Kein Teil dessen, was der Eintrag festhält — leer, wo der Versuch nicht wiederholbar ist."),
  x("record", "Entry", "note", "Freitext des Erfassenden."),
  x("record", "Entry", "orgasmusArt", "Art des Orgasmus; die Auswahlliste steuert `User.orgasmusArtenConfig`."),
  x("runtime", "Entry", "kontrollCode", "Der bei dieser Kontrolle geforderte Code."),
  x("runtime", "Entry", "verifikationStatus",
    "Ergebnis der Foto-Prüfung. `null` heisst 'nicht bestätigt' und ist ohne den Grund daneben nicht deutbar."),
  x("runtime", "Entry", "verifikationReason", "Warum die Prüfung nicht gematcht hat (sprachneutraler Code)."),
  x("runtime", "Entry", "verifikationReasonDetected", "Die abweichend gelesene Nummer, wo es eine gibt."),
  x("runtime", "Entry", "deviceCheck",
    "Geräte-Abgleich des Kontroll-Fotos. Beratend: 'wrong' ist KEIN Vergehen, das entsteht nur aus einer Anforderung."),
  x("runtime", "Entry", "deviceCheckNote", "Das erkannte Gerät, zum Prüfzeitpunkt eingefroren."),
  x("runtime", "Entry", "deviceCheckExpected", "Das erwartete Gerät, zum Prüfzeitpunkt eingefroren."),
  stamp("Entry"),
  x("audit", "Entry", "source",
    "`user` oder `system`. `system` trägt heute nur der Öffnen-Eintrag, den die Kontroll-Eskalation selbst bucht."),
  pk("Entry"),
  owner("Entry"),

  // ── OrgasmusAnforderung ────────────────────────────────────────────────────────────────────
  s({
    model: "OrgasmusAnforderung", field: "art", domain: "orgasmus", scope: "directive",
    effect: "ANWEISUNG = Pflicht (ungenutzt ist ein Vergehen), GELEGENHEIT = Erlaubnis (ungenutzt folgenlos). Der ganze Unterschied der Direktive.",
    writers: ["admin", "mcp"], affects: ["Orgasmus", "Strafbuch"],
  }),
  s({
    model: "OrgasmusAnforderung", field: "beginntAt", domain: "orgasmus", scope: "directive",
    effect: "Beginn des Fensters. Es ist immer nur EINE Direktive aktiv.",
    writers: ["admin", "mcp"], affects: ["Orgasmus"],
  }),
  s({
    model: "OrgasmusAnforderung", field: "endsAt", domain: "orgasmus", scope: "directive",
    effect: "Ende des Fensters. Danach ist eine ANWEISUNG versäumt.",
    writers: ["admin", "mcp"], affects: ["Orgasmus", "Strafbuch"],
  }),
  s({
    model: "OrgasmusAnforderung", field: "vorgegebeneArt", domain: "orgasmus", scope: "directive",
    effect: "Verlangt eine bestimmte Orgasmus-Art; leer = beliebig. Nur ein passender Eintrag erfüllt.",
    writers: ["admin", "mcp"], affects: ["Orgasmus", "Einträge"],
  }),
  s({
    model: "OrgasmusAnforderung", field: "oeffnenErlaubt", domain: "orgasmus", scope: "directive",
    effect: "Erlaubt das Öffnen im Fenster, ohne dass es als unautorisiert zählt — der einzige Weg, eine Sperrzeit gezielt zu durchbrechen.",
    writers: ["admin", "mcp"], affects: ["Orgasmus", "Sperrzeit", "Strafbuch"],
  }),
  s({
    model: "OrgasmusAnforderung", field: "wirksamAb", domain: "orgasmus", scope: "directive",
    effect: "Terminierte Auslösung. Vorher gilt das Fenster nicht, erlaubt kein Öffnen und erfüllt sich nicht.",
    writers: ["admin", "mcp"], affects: ["Orgasmus"], anchor: "delayedTrigger.ts",
  }),
  s({
    model: "OrgasmusAnforderung", field: "message", domain: "orgasmus", scope: "directive",
    effect: "Begleittext an den Sub.",
    writers: ["admin", "mcp"], affects: ["Nachrichten"],
  }),
  pk("OrgasmusAnforderung"),
  owner("OrgasmusAnforderung"),
  stamp("OrgasmusAnforderung"),
  x("runtime", "OrgasmusAnforderung", "fulfilledAt", "Gesetzt beim passenden Orgasmus-Eintrag im Fenster."),
  x("runtime", "OrgasmusAnforderung", "entryId", "Der erfüllende Eintrag."),
  x("runtime", "OrgasmusAnforderung", "withdrawnAt", "Gesetzt beim Zurückziehen."),
  x("audit", "OrgasmusAnforderung", "createdBy", "Wer die Direktive angeordnet hat; `null` = System."),
  x("runtime", "OrgasmusAnforderung", "benachrichtigtAt", "Wann die Zustellung rausging."),

  // ── TrainingVorgabe ────────────────────────────────────────────────────────────────────────
  s({
    model: "TrainingVorgabe", field: "categoryId", domain: "training", scope: "directive",
    effect: "Für welche Kategorie das Ziel gilt. Kategorien mit `allowVorgaben: false` sind hier nicht wählbar.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele", "Geräte"],
  }),
  s({
    model: "TrainingVorgabe", field: "gueltigAb", domain: "training", scope: "directive",
    effect: "Beginn der Geltung. Ziele derselben Kategorie werden daran automatisch aneinandergekettet.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele"], anchor: "vorgabeService.ts:reorderVorgabenDates",
  }),
  s({
    model: "TrainingVorgabe", field: "gueltigBis", domain: "training", scope: "directive",
    effect: "Ende der Geltung. Ohne `validUntilManual` ergibt es sich aus dem Beginn des Folgeziels.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele"],
  }),
  s({
    model: "TrainingVorgabe", field: "validUntilManual", domain: "training", scope: "directive",
    effect: "Schützt ein bewusst gesetztes Enddatum vor der automatischen Verkettung.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele"], anchor: "vorgabeService.ts:reorderVorgabenDates",
  }),
  s({
    model: "TrainingVorgabe", field: "minProTagH", domain: "training", scope: "directive",
    effect: "Mindest-Tragestunden pro Tag. Gemessen wird Wanduhr-Zeit der Kategorie, nicht Gerätestunden.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele", "Sessions/Statistik"], anchor: "vorgaben.ts",
  }),
  s({
    model: "TrainingVorgabe", field: "minProWocheH", domain: "training", scope: "directive",
    effect: "Dasselbe je Woche. Die vier Perioden gelten nebeneinander, nicht alternativ.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele", "Sessions/Statistik"],
  }),
  s({
    model: "TrainingVorgabe", field: "minProMonatH", domain: "training", scope: "directive",
    effect: "Dasselbe je Monat.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele", "Sessions/Statistik"],
  }),
  s({
    model: "TrainingVorgabe", field: "minProJahrH", domain: "training", scope: "directive",
    effect: "Dasselbe je Jahr.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele", "Sessions/Statistik"],
  }),
  s({
    model: "TrainingVorgabe", field: "notiz", domain: "training", scope: "directive",
    effect: "Begleittext zum Ziel.",
    writers: ["admin", "mcp"], affects: ["Trainingsziele"],
  }),
  pk("TrainingVorgabe"),
  owner("TrainingVorgabe"),
  stamp("TrainingVorgabe"),
  x("runtime", "TrainingVorgabe", "deletedAt",
    "Soft-Delete: die Zeile bleibt für die Historie stehen. Supersession statt Löschen ist hier durchgängiges Prinzip."),

  // ── Task ───────────────────────────────────────────────────────────────────────────────────
  s({
    model: "Task", field: "title", domain: "aufgaben", scope: "directive",
    effect: "Was zu tun ist. Der Textteil ist maschinell nicht prüfbar — dafür gibt es die Selbstmeldung.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"],
  }),
  s({
    model: "Task", field: "description", domain: "aufgaben", scope: "directive",
    effect: "Ausführlichere Fassung des Auftrags.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"],
  }),
  s({
    model: "Task", field: "holdUntil", domain: "aufgaben", scope: "directive",
    effect: "Festes Ende: bis dahin müssen alle Bedingungen durchgehend gelten. Im Dauer-Modus nur noch die obere Schranke.",
    writers: ["admin", "mcp"], affects: ["Aufgaben", "Strafbuch"], anchor: "tasks.ts:effectiveHoldUntil",
  }),
  s({
    model: "Task", field: "holdDurationMin", domain: "aufgaben", scope: "directive",
    effect: "Dauer-Modus: die Uhr läuft ab dem tatsächlichen Anlegen. Gemeint ist eine Tragezeit — mit festem Ende bekäme der Sub nachweislich weniger.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"], anchor: "tasks.ts:effectiveHoldUntil",
  }),
  s({
    model: "Task", field: "startGraceMin", domain: "aufgaben", scope: "directive",
    effect: "Kulanz zum Anlegen ab dem Nullpunkt. Wer später beginnt, hat nicht durchgehend gehalten — sonst wäre 'kurz vor Schluss alles anlegen' eine Erfüllung.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"], anchor: "tasks.ts:taskAnchor",
  }),
  s({
    model: "Task", field: "proofOrderMatters", domain: "aufgaben", scope: "directive",
    effect: "Müssen die Aufnahmezeiten der Nachweise ihrer Reihenfolge folgen? Aus entfällt auch die Sichtung wegen fehlender Aufnahmezeit. Nach dem Stellen nicht mehr änderbar.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"], anchor: "taskProofService.ts",
  }),
  s({
    model: "Task", field: "isPunishment", domain: "aufgaben", scope: "directive",
    effect: "Als Strafe gestellt. Rein kennzeichnend — die Verknüpfung zum Urteil steht in `StrafeRecord.taskId`.",
    writers: ["admin", "mcp"], affects: ["Aufgaben", "Strafbuch"],
  }),
  s({
    model: "Task", field: "penaltyReason", domain: "aufgaben", scope: "directive",
    effect: "Begründung der Strafaufgabe.",
    writers: ["admin", "mcp"], affects: ["Aufgaben", "Strafbuch"],
  }),
  s({
    model: "Task", field: "wirksamAb", domain: "aufgaben", scope: "directive",
    effect: "Terminierte Auslösung UND Nullpunkt jeder Frist dieser Aufgabe. Bei der Zustellung rückt der Poller ihn auf den echten Zeitpunkt vor, damit ein verspäteter Tick keine Kulanz frisst.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"], anchor: "delayedTrigger.ts:deadlineFromDispatch",
  }),
  pk("Task"),
  owner("Task"),
  x("audit", "Task", "createdBy", "Wer die Aufgabe gestellt hat; `null` = System."),
  stamp("Task"),
  x("runtime", "Task", "benachrichtigtAt", "Wann die Zustellung rausging."),
  x("runtime", "Task", "completedAt",
    "Selbstmeldung des Subs. Mit Bedingungen zusätzlich nötig, ohne Bedingungen IST sie die Erfüllung."),
  x("record", "Task", "completionNote", "Begleittext seiner Meldung."),
  x("runtime", "Task", "withdrawnAt", "Gesetzt beim Zurückziehen; wird nie ein Vergehen."),
  x("runtime", "Task", "resultNotifiedAt",
    "Versand-Stempel der Ergebnismeldung. Kein Zustand — der wird immer aus den Einträgen abgeleitet."),

  // ── TaskRequirement ────────────────────────────────────────────────────────────────────────
  s({
    model: "TaskRequirement", field: "type", domain: "aufgaben", scope: "directive",
    effect: "`KG_LOCKED` (verschlossen bleiben) oder `WEAR` (etwas tragen). Der KG ist bewusst keine Trage-Kategorie.",
    writers: ["admin", "mcp"], affects: ["Aufgaben", "Einträge"],
  }),
  s({
    model: "TaskRequirement", field: "categoryId", domain: "aufgaben", scope: "directive",
    effect: "Geforderte Kategorie bei einer Trage-Bedingung.",
    writers: ["admin", "mcp"], affects: ["Aufgaben", "Geräte"],
  }),
  s({
    model: "TaskRequirement", field: "deviceId", domain: "aufgaben", scope: "directive",
    effect: "Das konkrete Gerät; enger als die Kategorie und hat Vorrang.",
    writers: ["admin", "mcp"], affects: ["Aufgaben", "Geräte"],
  }),
  s({
    model: "TaskRequirement", field: "sortOrder", domain: "aufgaben", scope: "directive",
    effect: "Anzeigereihenfolge der Bedingungen. Keine zeitliche Reihenfolge — alle gelten gleichzeitig.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"],
  }),
  pk("TaskRequirement"),
  x("identity", "TaskRequirement", "taskId", "Zugehörige Aufgabe."),

  // ── TaskProof ──────────────────────────────────────────────────────────────────────────────
  s({
    model: "TaskProof", field: "description", domain: "aufgaben", scope: "directive",
    effect: "Was auf dem Bild zu sehen sein muss.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"],
  }),
  s({
    model: "TaskProof", field: "requireCode", domain: "aufgaben", scope: "directive",
    effect: "Verlangt einen handschriftlichen Zufallscode. NUR damit ist der Nachweis maschinell entscheidbar; jeder andere geht zur Sichtung.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"], anchor: "taskProofService.ts",
  }),
  s({
    model: "TaskProof", field: "dueOffsetMin", domain: "aufgaben", scope: "directive",
    effect: "Eigene Frist dieses Nachweises, in Minuten ab dem Nullpunkt der Aufgabe. Verstreicht sie unerfüllt, ist die Aufgabe SOFORT versäumt, nicht erst am Ende.",
    writers: ["admin", "mcp"], affects: ["Aufgaben", "Strafbuch"], anchor: "tasks.ts:proofDeadline",
  }),
  s({
    model: "TaskProof", field: "sortOrder", domain: "aufgaben", scope: "directive",
    effect: "Soll-Reihenfolge der Aufnahmen — wirksam nur, solange `Task.proofOrderMatters` gilt.",
    writers: ["admin", "mcp"], affects: ["Aufgaben"],
  }),
  pk("TaskProof"),
  x("identity", "TaskProof", "taskId", "Zugehörige Aufgabe."),
  x("runtime", "TaskProof", "code", "Der geforderte Zufallscode; leer ohne Code-Pflicht."),
  x("record", "TaskProof", "imageUrl", "Das eingereichte Foto."),
  x("record", "TaskProof", "imageExifTime",
    "Aufnahmezeit — massgeblich für die Reihenfolge. Die Upload-Zeit wäre wertlos, weil dann alles am Schluss hochgeladen passte."),
  x("runtime", "TaskProof", "submittedAt", "Wann eingereicht. Nach dem Ende der Aufgabe zählt es nicht mehr."),
  x("runtime", "TaskProof", "verifikationStatus", "Ergebnis der Code-Erkennung."),
  x("runtime", "TaskProof", "verifikationReason", "Warum sie nicht gematcht hat (sprachneutraler Code)."),
  x("runtime", "TaskProof", "verifikationReasonDetected", "Die abweichend gelesene Nummer."),
  x("runtime", "TaskProof", "lateNotifiedAt", "Wann der Keyholderin ein verspäteter Nachweis gemeldet wurde."),
  x("audit", "TaskProof", "reviewedAt", "Wann gesichtet wurde."),
  x("audit", "TaskProof", "reviewAccepted",
    "Das Urteil der Sichtung. Eine Annahme heilt Verspätung, fehlende Aufnahmezeit und falsche Reihenfolge gleichermassen."),
  x("audit", "TaskProof", "reviewNote", "Begründung der Sichtung."),

  // ── Strafbuch: Regeln, Urteile, Notizen ────────────────────────────────────────────────────
  s({
    model: "OffenseRuleChange", field: "offenseType", domain: "strafbuch", scope: "standing",
    effect: "Welche Vergehensart die Zeile umlegt (kanonischer Schlüssel, z.B. `unauthorized_opening`).",
    writers: ["admin", "mcp"], affects: ["Strafbuch"], anchor: "offenseRulesService.ts",
  }),
  s({
    model: "OffenseRuleChange", field: "mode", domain: "strafbuch", scope: "standing",
    effect: "Ob diese Art zählt (aus / nur während Sperrzeit / immer). Eine HISTORIE, kein Schalter: jede Tat wird nach der Fassung ihrer Zeit beurteilt.",
    writers: ["admin", "mcp"], affects: ["Strafbuch"], anchor: "offenseRulesService.ts:setOffenseRule",
  }),
  s({
    model: "OffenseRuleChange", field: "effectiveFrom", domain: "strafbuch", scope: "standing",
    effect: "Ab wann diese Fassung gilt. Die Grundzeile trägt Epoch — vor der ersten Änderung ist nur bekannt, DASS die Werte galten, nicht seit wann.",
    writers: ["admin", "mcp"], affects: ["Strafbuch"],
  }),
  pk("OffenseRuleChange"),
  owner("OffenseRuleChange"),
  x("audit", "OffenseRuleChange", "changedBy", "Wer umgelegt hat."),
  stamp("OffenseRuleChange"),

  s({
    model: "ManualOffense", field: "occurredAt", domain: "strafbuch", scope: "directive",
    effect: "Wann es passiert ist, nicht wann notiert wurde. Danach richtet sich die Einordnung UND welche Regel-Fassung gilt.",
    writers: ["admin", "mcp"], affects: ["Strafbuch"],
  }),
  s({
    model: "ManualOffense", field: "title", domain: "strafbuch", scope: "directive",
    effect: "Worum es geht. Für alles, was der Tracker nicht sehen kann — gebrochene Abmachung, Unhöflichkeit.",
    writers: ["admin", "mcp"], affects: ["Strafbuch", "Nachrichten"],
  }),
  s({
    model: "ManualOffense", field: "description", domain: "strafbuch", scope: "directive",
    effect: "Ausführlichere Fassung.",
    writers: ["admin", "mcp"], affects: ["Strafbuch"],
  }),
  pk("ManualOffense"),
  owner("ManualOffense"),
  x("audit", "ManualOffense", "createdBy",
    "Wer notiert hat. UNVERÄNDERLICH — darauf beruht, dass die Meldung an den Träger den Namen kopieren darf."),
  stamp("ManualOffense"),
  x("runtime", "ManualOffense", "withdrawnAt",
    "Zurückgezogen: fällt aus dem Strafbuch, bleibt nachlesbar, und ein bereits gefälltes Urteil überlebt."),

  pk("StrafeRecord"),
  owner("StrafeRecord"),
  x("record", "StrafeRecord", "offenseType", "Welche Art von Vergehen beurteilt wurde."),
  x("record", "StrafeRecord", "refId", "Das beurteilte Vergehen. Eindeutig — ein Vergehen trägt höchstens ein Urteil."),
  x("audit", "StrafeRecord", "bestraftDatum", "Zeitpunkt des Urteils."),
  x("record", "StrafeRecord", "notiz", "Interne Notiz zum Urteil."),
  x("audit", "StrafeRecord", "status", "PUNISHED oder DISMISSED — das Urteil selbst, kein einstellbarer Wert."),
  x("record", "StrafeRecord", "reason", "Der Straftext bei PUNISHED, ein optionaler Grund bei DISMISSED."),
  x("audit", "StrafeRecord", "judgedBy",
    "`ai`, `admin` oder `system` — ein Kürzel. Die Anzeige unterscheidet daran KI von Mensch; WELCHER Mensch, steht daneben."),
  x("audit", "StrafeRecord", "judgedByName",
    "Der Name des Urteilenden. `null` bei der KI (ihre Kennung steht im Kürzel), bei der automatischen Ahndung (dahinter steht niemand) und im Altbestand."),
  x("runtime", "StrafeRecord", "erledigtAt", "Nur bei PUNISHED: leer = Strafe offen, gesetzt = erledigt."),
  stamp("StrafeRecord"),
  x("record", "StrafeRecord", "taskId",
    "Die Aufgabe, die DIESE Strafe ist. Eine erfüllte Aufgabe schliesst das Urteil von selbst ab."),

  pk("AdminPasswordChange"),
  x("identity", "AdminPasswordChange", "subUserId", "Der Sub, dessen Sperrzeit lief — Eigentümer des Vergehens."),
  x("identity", "AdminPasswordChange", "adminUserId", "Das Admin-Konto, dessen Passwort geändert wurde."),
  x("audit", "AdminPasswordChange", "adminUsername", "Abbild des Namens; überlebt Umbenennung und Löschung."),
  x("audit", "AdminPasswordChange", "via",
    "`reset_token` (über das Postfach Zugang verschafft), `self` oder `set_by_other`. Der interessante Fall ist der erste."),
  x("audit", "AdminPasswordChange", "actorUserId", "Wer ausgelöst hat; leer beim Token-Weg, dort gibt es keine Sitzung."),
  x("record", "AdminPasswordChange", "lockPeriodId", "Die damals laufende Sperrzeit — für die Anzeige, ohne Fremdschlüssel-Zwang."),
  x("record", "AdminPasswordChange", "lockPeriodEndsAt", "Deren Ende zum Zeitpunkt des Vorgangs."),
  stamp("AdminPasswordChange"),

  // ── CleaningRuleChange: Abbild, nicht Schalter ─────────────────────────────────────────────
  pk("CleaningRuleChange"),
  owner("CleaningRuleChange"),
  x("record", "CleaningRuleChange", "allowed",
    "Abbild von `User.reinigungErlaubt` in dieser Fassung. Gesetzt wird über die User-Spalte, nie hier."),
  x("record", "CleaningRuleChange", "maxMinutes", "Abbild von `User.reinigungMaxMinuten`."),
  x("record", "CleaningRuleChange", "maxPerDay", "Abbild von `User.reinigungMaxProTag`."),
  x("record", "CleaningRuleChange", "windows", "Abbild von `User.reinigungsFenster`."),
  x("record", "CleaningRuleChange", "effectiveFrom",
    "Ab wann die Fassung gilt. Die Grundzeile trägt Epoch, damit keine Lücke bleibt, in die eine Öffnung fallen könnte."),
  x("audit", "CleaningRuleChange", "changedBy", "Wer geändert hat; leer bei der Grundzeile, die niemand gesetzt hat."),
  stamp("CleaningRuleChange"),

  // ── TimezoneChange: Abbild wie CleaningRuleChange ──────────────────────────────────────────
  pk("TimezoneChange"),
  owner("TimezoneChange"),
  x("record", "TimezoneChange", "timezone",
    "Abbild von `User.timezone` in dieser Fassung. Gesetzt wird über die User-Spalte, nie hier."),
  x("record", "TimezoneChange", "effectiveFrom",
    "Ab wann die Zone gilt. Die Grundzeile trägt Epoch, damit keine Lücke bleibt, in die eine Öffnung fallen könnte."),
  x("audit", "TimezoneChange", "changedBy", "Wer umgestellt hat; leer bei der Grundzeile."),
  stamp("TimezoneChange"),

  // ── Box ────────────────────────────────────────────────────────────────────────────────────
  pk("BoxStatus"),
  owner("BoxStatus"),
  x("identity", "BoxStatus", "boxId", "Stabile Geräte-Kennung der Box."),
  x("record", "BoxStatus", "name", "Anzeigename der Box; kommt aus Heimdall."),
  x("runtime", "BoxStatus", "locked", "Das SOLL: so soll die Box stehen."),
  x("runtime", "BoxStatus", "reportedLocked",
    "Das IST der letzten Meldung. Seit dem Präsenz-Guard kann die Box offen stehen, obwohl sie zu sein soll."),
  x("runtime", "BoxStatus", "lockUntil", "Die effektive Sperre aus eigener Frist und Tracker-Sperrzeit, gekappt."),
  x("runtime", "BoxStatus", "simpleLock", "Einfache lokale Verriegelung ohne Frist."),
  x("runtime", "BoxStatus", "keyholderLocked", "Durch eine Tracker-Sperrzeit gehalten; lokal nicht zu öffnen."),
  x("runtime", "BoxStatus", "battery", "Ladestand in Prozent."),
  x("runtime", "BoxStatus", "charging", "Ob gerade geladen wird."),
  x("runtime", "BoxStatus", "boltPos", "Stellung des Riegels."),
  x("runtime", "BoxStatus", "fwVersion", "Firmware-Stand der Box."),
  x("runtime", "BoxStatus", "lastSyncAt", "Letzter Kontakt. Grundlage der Offline-Vorwarnung."),
  x("record", "BoxStatus", "offlineOpenHours",
    "Offline-Schwelle der Box, aus Heimdall gespiegelt. Nicht im Tracker einstellbar — er soll die Firmware-Konstante nicht kopieren."),
  x("record", "BoxStatus", "lowBatteryOpenPercent",
    "Akku-Schwelle, unter der die Box autonom öffnet. Ebenfalls gespiegelt; leer heisst keine Vorwarnung, nicht 'keine Schwelle'."),
  x("runtime", "BoxStatus", "pendingCommand",
    "Aus einem Eintrag abgeleitetes, noch nicht vollzogenes Kommando. Die Box öffnet auf `open` und bleibt offen, bis ein `lock` kommt."),
  x("runtime", "BoxStatus", "pendingCommandAt", "Wann das Kommando entstand."),
  x("runtime", "BoxStatus", "updatedAt", "Letzte Änderung der Zeile."),

  pk("BoxEvent"),
  owner("BoxEvent"),
  x("record", "BoxEvent", "deviceId", "Betroffenes Gerät, sofern zuordenbar."),
  x("record", "BoxEvent", "type", "LOCKED | UNLOCKED | EARLY_OPEN | UNAUTHORIZED_OPEN."),
  x("record", "BoxEvent", "wakeReason", "Der von der Box gemeldete Öffnungsgrund."),
  x("record", "BoxEvent", "battery", "Ladestand zum Ereignis."),
  x("record", "BoxEvent", "fwVersion", "Firmware-Stand zum Ereignis."),
  x("record", "BoxEvent", "at", "Zeitpunkt des Ereignisses, server-autoritativ aus dem Sync."),
  stamp("BoxEvent"),

  // ── Nachrichten ────────────────────────────────────────────────────────────────────────────
  pk("Message"),
  x("identity", "Message", "subjectUserId",
    "Der Sub, um den es geht — IMMER der Scope-Schlüssel, auch bei Meldungen AN die Keyholder."),
  x("record", "Message", "senderKind", "`system`, `keyholder` oder `ai`. Eine Art, kein Name."),
  x("record", "Message", "senderName",
    "Der Name, wo ein Mensch dahintersteht. Nur zusammen mit `keyholder` gefüllt und bewusst KOPIERT statt nachgelesen."),
  x("record", "Message", "audience",
    "`sub` oder `keyholders`. Eine Keyholder-Meldung ist EINE Zeile, die sich alle Keyholder teilen — jeder mit eigenem Lesestand."),
  x("record", "Message", "bodyKey", "Übersetzungsschlüssel des Textes."),
  x("record", "Message", "bodyParams", "Dessen Parameter als JSON."),
  x("record", "Message", "body", "Vorformulierter Text, wo kein Schlüssel passt."),
  x("record", "Message", "refEntityType",
    "Bezug aufs Tracking-Objekt. Freitexte werden VERLINKT statt kopiert, damit eine Korrektur rückwirkend richtig wirkt."),
  x("record", "Message", "refEntityId", "Die id des bezogenen Objekts."),
  stamp("Message"),
  pk("MessageRead"),
  x("identity", "MessageRead", "messageId", "Die gelesene Nachricht."),
  x("identity", "MessageRead", "userId", "Der LESER — nicht der Betroffene. Darauf beruht der geteilte Keyholder-Kanal."),
  x("runtime", "MessageRead", "readAt", "Wann gelesen wurde."),

  // ── Benachrichtigungs-Kanäle ───────────────────────────────────────────────────────────────
  pk("PushSubscription"),
  owner("PushSubscription"),
  x("identity", "PushSubscription", "endpoint", "Zustelladresse des Browsers."),
  x("identity", "PushSubscription", "p256dh", "Öffentlicher Schlüssel der Verschlüsselung."),
  x("identity", "PushSubscription", "auth", "Auth-Geheimnis der Verschlüsselung."),
  stamp("PushSubscription"),
  pk("NativePushToken"),
  owner("NativePushToken"),
  x("record", "NativePushToken", "platform", "`ios` oder `android`."),
  x("identity", "NativePushToken", "token", "Gerätetoken der nativen App."),
  stamp("NativePushToken"),
  x("runtime", "NativePushToken", "updatedAt", "Letzte Erneuerung des Tokens."),

  // ── Keyholder-Wissen & Kontext ─────────────────────────────────────────────────────────────
  s({
    model: "KeyholderNote", field: "pinned", domain: "kontext", scope: "directive",
    effect: "Gepinnte Notizen vom Typ DIRECTIVE oder BOUNDARY erscheinen im Keyholder-Dashboard.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "KeyholderNote", field: "type", domain: "kontext", scope: "directive",
    effect: "DIRECTIVE | BOUNDARY | OBSERVATION | CORRECTION | EQUIPMENT | DATA | HISTORY. Entscheidet mit, ob die Notiz gepinnt sichtbar wird.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "KeyholderNote", field: "status", domain: "kontext", scope: "directive",
    effect: "`active`, `superseded` oder `archived`. Supersession statt Löschen — eine abgelöste Notiz bleibt lesbar.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "KeyholderNote", field: "validFrom", domain: "kontext", scope: "directive",
    effect: "Ab wann die Notiz gilt.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "KeyholderNote", field: "validUntil", domain: "kontext", scope: "directive",
    effect: "Bis wann sie gilt.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  pk("KeyholderNote"),
  owner("KeyholderNote"),
  x("record", "KeyholderNote", "kg", "Altfeld: freier Bezug auf den Keuschheitsgürtel."),
  x("record", "KeyholderNote", "kategorie", "Altfeld: freie Einordnung."),
  x("record", "KeyholderNote", "text", "Der Notiztext. Der Sub sieht ihn nie."),
  stamp("KeyholderNote"),
  x("record", "KeyholderNote", "supersedesId", "Die Notiz, die diese hier ablöst."),
  x("record", "KeyholderNote", "source", "`user-stated` oder `inferred` — trennt Nutzer-Fakt vom Schluss des Agenten."),
  x("record", "KeyholderNote", "confidence", "Wie sicher der Schluss ist; vor allem bei `inferred`."),
  x("record", "KeyholderNote", "doDont", "Strukturierte Do/Dont-Liste als JSON, für Grenzen-Notizen."),
  x("runtime", "KeyholderNote", "version", "Optimistic-Concurrency-Token der MCP-Edits."),
  pk("NoteRef"),
  x("identity", "NoteRef", "noteId", "Die verknüpfte Notiz."),
  x("record", "NoteRef", "entityType", "Art des bezogenen Objekts (Gerät, Session, Kontrolle, Vergehen …)."),
  x("record", "NoteRef", "entityId", "Dessen id."),
  stamp("NoteRef"),

  pk("KeyholderActionLog"),
  x("identity", "KeyholderActionLog", "userId", "Der Sub, auf den die Aktion gewirkt hat."),
  x("audit", "KeyholderActionLog", "tool", "Welches MCP-Werkzeug gelaufen ist."),
  x("audit", "KeyholderActionLog", "actor", "Der handelnde Keyholder; leer bei Altbestand."),
  x("audit", "KeyholderActionLog", "reason",
    "Pflicht-Begründung. Jeder schreibende MCP-Aufruf braucht sie — es gibt keine stille Mutation."),
  x("audit", "KeyholderActionLog", "source", "`agent` oder `user-stated`."),
  x("audit", "KeyholderActionLog", "argsJson", "Die Eingaben des Aufrufs."),
  x("audit", "KeyholderActionLog", "resultRef", "Das erzeugte oder betroffene Objekt."),
  stamp("KeyholderActionLog"),

  s({
    model: "HealthHold", field: "active", domain: "kontext", scope: "directive",
    effect: "Gesundheits-Halt: setzt die Direktiven aus. Die eine Bremse, die über allem steht.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit", "Kontrollen", "Aufgaben", "Auto-Kontrollen"],
  }),
  s({
    model: "HealthHold", field: "reason", domain: "kontext", scope: "directive",
    effect: "Warum ausgesetzt wurde.",
    writers: ["admin", "mcp"], affects: ["MCP"],
  }),
  pk("HealthHold"),
  owner("HealthHold"),
  stamp("HealthHold"),
  x("runtime", "HealthHold", "resolvedAt", "Wann der Halt aufgehoben wurde."),

  s({
    model: "RecurringContext", field: "label", domain: "kontext", scope: "directive",
    effect: "Name des wiederkehrenden Termins (Home Office, Pilates).",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "RecurringContext", field: "weekday", domain: "kontext", scope: "directive",
    effect: "Wochentag, 0 = Sonntag.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "RecurringContext", field: "ordinal", domain: "kontext", scope: "directive",
    effect: "Leer = jede Woche. 1..5 = n-ter Wochentag im Monat, -1 = letzter.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "RecurringContext", field: "deviceFree", domain: "kontext", scope: "directive",
    effect: "Der Slot verlangt Gerätefreiheit — die Information, wegen der der Keyholder ihn überhaupt führt.",
    writers: ["mcp"], affects: ["MCP", "Sperrzeit"],
  }),
  s({
    model: "RecurringContext", field: "exclusionDates", domain: "kontext", scope: "directive",
    effect: "Ausnahme-Daten, an denen der Slot entfällt (JSON-Liste, iCalendar-Modell).",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "RecurringContext", field: "note", domain: "kontext", scope: "directive",
    effect: "Begleitnotiz.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  pk("RecurringContext"),
  owner("RecurringContext"),
  x("runtime", "RecurringContext", "version", "Optimistic-Concurrency-Token der MCP-Edits."),
  stamp("RecurringContext"),

  s({
    model: "Appointment", field: "when", domain: "kontext", scope: "directive",
    effect: "Zeitpunkt des einmaligen Termins.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "Appointment", field: "typ", domain: "kontext", scope: "directive",
    effect: "Art des Termins (Therapie, Arzt).",
    writers: ["mcp"], affects: ["MCP"],
  }),
  s({
    model: "Appointment", field: "deviceFree", domain: "kontext", scope: "directive",
    effect: "Der Termin verlangt Gerätefreiheit.",
    writers: ["mcp"], affects: ["MCP", "Sperrzeit"],
  }),
  s({
    model: "Appointment", field: "note", domain: "kontext", scope: "directive",
    effect: "Begleitnotiz.",
    writers: ["mcp"], affects: ["MCP"],
  }),
  pk("Appointment"),
  owner("Appointment"),
  x("runtime", "Appointment", "version", "Optimistic-Concurrency-Token der MCP-Edits."),
  stamp("Appointment"),

  // ── Geräte-Referenzbilder ──────────────────────────────────────────────────────────────────
  pk("DeviceReferenceImage"),
  x("identity", "DeviceReferenceImage", "deviceId", "Das Gerät, das dieses Bild zeigt."),
  x("record", "DeviceReferenceImage", "imageUrl",
    "Referenzbild der Erkennung. Sie sieht nur Bilder und Namen — keine Metadaten."),
  x("record", "DeviceReferenceImage", "sourceEntryId", "Herkunft, falls aus einem bestehenden Eintrag übernommen."),
  x("record", "DeviceReferenceImage", "note", "Begleitnotiz."),
  x("runtime", "DeviceReferenceImage", "embedding", "Vektor-Darstellung des Bildes."),
  x("runtime", "DeviceReferenceImage", "embeddingModel", "Welches Modell ihn erzeugt hat — für die Invalidierung."),
  stamp("DeviceReferenceImage"),

  // ── Zugang ─────────────────────────────────────────────────────────────────────────────────
  s({
    model: "AdminUserRelationship", field: "adminId", domain: "konto", scope: "standing",
    effect: "Wer diesen Sub steuern darf. Ohne Zeile sieht ein Admin ihn nicht — die Zuordnung ist die eigentliche Berechtigung.",
    writers: ["admin"], affects: ["Zugang", "MCP", "Nachrichten"],
  }),
  s({
    model: "AdminUserRelationship", field: "userId", domain: "konto", scope: "standing",
    effect: "Der zugeordnete Sub.",
    writers: ["admin"], affects: ["Zugang"],
  }),
  pk("AdminUserRelationship"),
  stamp("AdminUserRelationship"),

  pk("Passkey"),
  owner("Passkey"),
  x("identity", "Passkey", "credentialId", "Kennung des Schlüssels."),
  x("identity", "Passkey", "publicKey", "Öffentlicher Schlüssel."),
  x("runtime", "Passkey", "counter", "Signaturzähler gegen Wiedereinspielung."),
  x("record", "Passkey", "transports", "Übertragungswege, die das Gerät anbietet."),
  x("record", "Passkey", "deviceName", "Anzeigename des Geräts."),
  stamp("Passkey"),
  x("runtime", "Passkey", "lastUsedAt", "Letzte Verwendung."),

  pk("PasswordResetToken"),
  x("identity", "PasswordResetToken", "token", "Das Rücksetz-Geheimnis."),
  owner("PasswordResetToken"),
  x("runtime", "PasswordResetToken", "expiresAt", "Ablauf; eine Stunde."),
  stamp("PasswordResetToken"),
  x("identity", "PortalTokenUsed", "jti", "Kennung eines bereits eingelösten Portal-Tokens."),
  x("runtime", "PortalTokenUsed", "usedAt", "Wann eingelöst. Zusammen der Wiedereinspielungs-Schutz des Portal-Logins."),
  x("identity", "RateLimit", "key", "Zähler-Schlüssel, meist Route plus Client-IP."),
  x("runtime", "RateLimit", "count", "Versuche im laufenden Fenster."),
  x("runtime", "RateLimit", "resetAt", "Wann das Fenster neu beginnt."),

  pk("OAuthClient"),
  x("identity", "OAuthClient", "clientId", "Kennung der verbundenen Anwendung."),
  x("record", "OAuthClient", "clientName", "Anzeigename der Anwendung."),
  x("record", "OAuthClient", "redirectUris", "Erlaubte Rücksprung-Adressen."),
  stamp("OAuthClient"),
  pk("OAuthCode"),
  x("identity", "OAuthCode", "code", "Einmal-Code des Autorisierungsflusses."),
  x("identity", "OAuthCode", "clientId", "Anfragende Anwendung."),
  owner("OAuthCode"),
  x("record", "OAuthCode", "redirectUri", "Verwendete Rücksprung-Adresse."),
  x("record", "OAuthCode", "scopes", "Erteilte Berechtigungen."),
  x("identity", "OAuthCode", "codeChallenge", "PKCE-Challenge."),
  x("record", "OAuthCode", "codeChallengeMethod", "Verfahren der Challenge."),
  x("runtime", "OAuthCode", "expiresAt", "Ablauf des Codes."),
  x("runtime", "OAuthCode", "usedAt", "Wann eingelöst; verhindert die zweite Einlösung."),
  stamp("OAuthCode"),
  pk("OAuthToken"),
  x("identity", "OAuthToken", "tokenHash", "Hash des Zugriffstokens; das Token selbst wird nie gespeichert."),
  x("identity", "OAuthToken", "clientId", "Anwendung, für die es gilt."),
  owner("OAuthToken"),
  x("record", "OAuthToken", "scopes", "Erteilte Berechtigungen."),
  x("runtime", "OAuthToken", "expiresAt", "Ablauf."),
  stamp("OAuthToken"),
  pk("OAuthRefreshToken"),
  x("identity", "OAuthRefreshToken", "tokenHash", "Hash des Erneuerungstokens."),
  x("identity", "OAuthRefreshToken", "clientId", "Anwendung, für die es gilt."),
  owner("OAuthRefreshToken"),
  x("record", "OAuthRefreshToken", "scopes", "Erteilte Berechtigungen."),
  x("runtime", "OAuthRefreshToken", "expiresAt", "Ablauf."),
  stamp("OAuthRefreshToken"),

  // ── Betrieb ────────────────────────────────────────────────────────────────────────────────
  s({
    model: "AppMeta", field: "key", domain: "betrieb", scope: "standing",
    effect: "Name eines instanzweiten Werts. Hier liegen die STICHTAGE, ab denen eine Regel auf DIESER Instanz gilt — etwa die Reinigungsfenster-Regel und die Vergehens-Meldungen.",
    writers: ["system"], affects: ["Strafbuch", "Reinigung", "Nachrichten"], anchor: "appMeta.ts:deployCutoff",
  }),
  s({
    model: "AppMeta", field: "value", domain: "betrieb", scope: "standing",
    effect: "Der Wert dazu. Migrationen schreiben ihn beim ersten Start selbst; eine ENV-Variable kann ihn bewusst überschreiben.",
    writers: ["system"], affects: ["Strafbuch", "Reinigung", "Nachrichten"], anchor: "appMeta.ts:deployCutoff",
    retroactive: "Einen Stichtag zurückzudatieren beurteilt Vergehen vor diesem Datum neu und kann sie nachträglich melden.",
  }),
  x("runtime", "AppMeta", "updatedAt", "Letzte Änderung. Das Portal liest daraus die Aktivität der Instanz."),
];
