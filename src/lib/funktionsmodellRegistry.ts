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
  | "Benachrichtigungen" | "Nachrichten" | "MCP" | "Oberfläche" | "Zugang";

/**
 * Wie lange ein Wert gilt. Die Unterscheidung ist load-bearing: `User.reinigungErlaubt` ist ein
 * Dauerzustand, `VerschlussAnforderung.reinigungErlaubt` gilt für GENAU EINE Sperrzeit. Beide heissen
 * gleich, beide müssen zutreffen, und wer sie verwechselt, sucht den Fehler an der falschen Stelle.
 */
export type FmScope = "standing" | "directive";

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
}

/**
 * Die Modelle unter VOLLSTÄNDIGER Prüfung. Erweitern = Zeile ergänzen; der Test nennt danach jedes
 * Feld, das noch keinen Eintrag hat. Bewusst eine kurze Liste statt „alle Modelle“: ein Register,
 * das mit 39 Modellen auf einmal beginnt, wird nie fertig und ist dann gar nichts wert.
 */
export const FM_SCANNED_MODELS = [
  "User", "Device", "DeviceCategory", "VerschlussAnforderung", "KontrollAnforderung",
  "NotificationPreference",
] as const;

export const FM_DOMAINS: FmDomain[] = [
  { id: "sperrzeit", title: "Sperrzeit & Verschluss", doc: "10-sperrzeit.md" },
  { id: "reinigung", title: "Reinigung", doc: "20-reinigung.md" },
  { id: "kontrollen", title: "Kontrollen", doc: "30-kontrollen.md" },
  { id: "geraete", title: "Geräte & Kategorien" },
  { id: "erfassung", title: "Erfassung & Vokabular" },
  { id: "benachrichtigung", title: "Benachrichtigungen" },
  { id: "keyholder", title: "Keyholder-Steuerung & MCP" },
  { id: "konto", title: "Konto, Zugang & Darstellung" },
];

const s = (e: Omit<FmSetting, "kind">): FmSetting => ({ kind: "setting", ...e });
const x = (kind: FmNonSetting["kind"], model: string, field: string, note: string): FmNonSetting =>
  ({ kind, model, field, note });

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
    writers: ["admin"], affects: ["Kontrollen", "Benachrichtigungen"], anchor: "inspectionEscalationService.ts",
  }),
  s({
    model: "User", field: "inspectionReminderDelayMinutes", domain: "kontrollen", scope: "standing",
    effect: "Verzug bis zur Mahnung, gemessen ab dem Ablauf der Kontroll-Frist.",
    writers: ["admin"], affects: ["Kontrollen", "Benachrichtigungen"], anchor: "inspectionEscalationService.ts",
  }),
  s({
    model: "User", field: "inspectionAutoMarkEnabled", domain: "kontrollen", scope: "standing",
    effect: "Stufe 2: bucht die unbeantwortete Kontrolle selbst als Öffnung bzw. Ablegen. Hebt dabei bewusst KEINE Sperrzeit auf.",
    writers: ["admin"], affects: ["Kontrollen", "Einträge", "Sessions/Statistik", "Strafbuch"],
    anchor: "queries.ts:releaseSperrzeitenOnOpen",
  }),
  s({
    model: "User", field: "inspectionAutoMarkDelayMinutes", domain: "kontrollen", scope: "standing",
    effect: "Verzug bis zu dieser Buchung, gemessen ab dem Stempel der Stufe 1.",
    writers: ["admin"], affects: ["Kontrollen"], anchor: "inspectionEscalationService.ts",
  }),

  // ── User: Erfassung, Darstellung, Zugang ───────────────────────────────────────────────────
  s({
    model: "User", field: "mobileDesktopUpload", domain: "erfassung", scope: "standing",
    effect: "Erlaubt auf Mobilgeräten die Dateiauswahl statt nur die Kamera — schwächt jeden Foto-Nachweis, deshalb Admin-Feld.",
    writers: ["admin"], affects: ["Kontrollen", "Aufgaben", "Einträge", "Oberfläche"],
  }),
  s({
    model: "User", field: "timezone", domain: "konto", scope: "standing",
    effect: "Die Wanduhr des Subs. Kalendertag, Reinigungsfenster und Schlaf-Fenster rechnen darin — nicht in der Serverzone.",
    writers: ["sub"], affects: ["Reinigung", "Auto-Kontrollen", "Sessions/Statistik"], anchor: "utils.ts:APP_TZ",
  }),
  s({
    model: "User", field: "startPage", domain: "konto", scope: "standing",
    effect: "Startseite nach der Anmeldung; `auto` wählt sie nach Rolle.",
    writers: ["sub"], affects: ["Oberfläche"], anchor: "userSelfField.ts",
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
    model: "User", field: "orgasmusArtenConfig", domain: "erfassung", scope: "standing",
    effect: "Auswahlliste der Orgasmus-Arten im Erfassungsformular (JSON). Leer = die eingebauten Arten.",
    writers: ["admin"], affects: ["Einträge", "Orgasmus"], anchor: "reasonsService.ts",
  }),
  s({
    model: "User", field: "oeffnenGruendeConfig", domain: "erfassung", scope: "standing",
    effect: "Auswahlliste der Öffnungsgründe. `REINIGUNG` ist der Grund, an dem die gesamte Reinigungslogik hängt — er lässt sich nicht wegkonfigurieren.",
    writers: ["admin"], affects: ["Einträge", "Reinigung", "Sperrzeit"], anchor: "reasonsService.ts",
  }),
  s({
    model: "User", field: "mcpKeyholderInstructions", domain: "keyholder", scope: "standing",
    effect: "Dauerauftrag an die Keyholder-KI; wird ihr bei jeder MCP-Verbindung mitgegeben. Der Sub sieht ihn nie.",
    writers: ["admin"], affects: ["MCP"], anchor: "app/api/[transport]/route.ts",
  }),

  x("identity", "User", "id", "Primärschlüssel."),
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
    writers: ["sub", "admin"], affects: ["Geräte", "Kontrollen", "Trainingsziele", "Sessions/Statistik"],
  }),
  s({
    model: "Device", field: "requireInspectionCode", domain: "kontrollen", scope: "standing",
    effect: "Verlangt eine Kontrolle mit DIESEM Gerät den handschriftlichen Code im Foto? Aus: die Erfüllung läuft über die eine offene Anforderung statt über den Code-Vergleich.",
    writers: ["admin"], affects: ["Kontrollen"], anchor: "kontrolleService.ts",
  }),
  s({
    model: "Device", field: "securityLevel", domain: "geraete", scope: "standing",
    effect: "SECURING oder TRUST_ONLY — Einordnung für die Keyholder-Entscheidung. Wird nirgends durchgesetzt.",
    writers: ["mcp"], affects: ["MCP"], anchor: "mcp/devices.ts:set_device_meta",
  }),
  s({
    model: "Device", field: "lookalikeClusterId", domain: "geraete", scope: "standing",
    effect: "Gleiche Optik = gleicher Cluster. Ein Bild-Konflikt INNERHALB eines Clusters ist nie ein Vergehen; Setzen rechnet die Geräte-Zuordnung historischer Sessions rückwirkend neu.",
    writers: ["mcp"], affects: ["Geräte", "Sessions/Statistik", "Strafbuch"], anchor: "mcp/devices.ts:set_device_meta",
  }),
  s({
    model: "Device", field: "pullOffRisk", domain: "geraete", scope: "standing",
    effect: "Abstreifbar? `null` = nie beurteilt, nicht „sicher“. Reine Beurteilung ohne Durchsetzung.",
    writers: ["mcp"], affects: ["MCP"], anchor: "mcp/devices.ts:set_device_meta",
  }),
  s({
    model: "Device", field: "name", domain: "geraete", scope: "standing",
    effect: "Anzeigename. Geht zusätzlich in die Bilderkennung ein — sie sieht Bilder und Namen, sonst nichts.",
    writers: ["sub", "admin"], affects: ["Geräte", "Oberfläche"],
  }),
  s({
    model: "Device", field: "archivedAt", domain: "geraete", scope: "standing",
    effect: "Soft-Delete: gesetzt = archiviert, aus Auswahllisten raus, Historie bleibt.",
    writers: ["sub", "admin"], affects: ["Geräte", "Sessions/Statistik"],
  }),
  x("identity", "Device", "id", "Primärschlüssel."),
  x("identity", "Device", "userId", "Eigentümer."),
  x("record", "Device", "description", "Freitext des Eigentümers."),
  x("record", "Device", "imageUrl", "Titelbild. Referenzbilder für die Erkennung stehen in DeviceReferenceImage."),
  x("record", "Device", "purchasePrice", "Inventarangabe."),
  x("record", "Device", "currency", "Währung zur Inventarangabe."),
  x("record", "Device", "createdAt", "Anlage-Zeitpunkt."),
  x("record", "Device", "material", "Beschreibendes Merkmal für den Keyholder."),
  x("record", "Device", "bauform", "Beschreibendes Merkmal für den Keyholder."),
  x("record", "Device", "healthFlags", "Beobachtungen zur Verträglichkeit (JSON-Liste), rein informativ."),
  x("record", "Device", "retentionNotes", "Freitext zum Sitz des Geräts, rein informativ."),
  x("runtime", "Device", "version", "Optimistic-Concurrency-Token der MCP-Edits."),

  // ── DeviceCategory ─────────────────────────────────────────────────────────────────────────
  s({
    model: "DeviceCategory", field: "trackingEnabled", domain: "geraete", scope: "standing",
    effect: "Aus = reine Inventar-Kategorie: keine Trage-Sessions, keine Statistik. Abwesenheit in den Auswertungen ist dann keine Nichtnutzung.",
    writers: ["sub", "admin"], affects: ["Sessions/Statistik", "Geräte", "Einträge"],
  }),
  s({
    model: "DeviceCategory", field: "requirePhoto", domain: "geraete", scope: "standing",
    effect: "Ein Trage-Beginn dieser Kategorie verlangt ein Bild.",
    writers: ["sub", "admin"], affects: ["Einträge", "Geräte"],
  }),
  s({
    model: "DeviceCategory", field: "allowVorgaben", domain: "geraete", scope: "standing",
    effect: "Aus = die Kategorie lässt sich in keinem Trainingsziel verwenden.",
    writers: ["sub", "admin"], affects: ["Trainingsziele"],
  }),
  s({
    model: "DeviceCategory", field: "name", domain: "geraete", scope: "standing",
    effect: "Anzeigename der Kategorie; frei änderbar, der `slug` bleibt.",
    writers: ["sub", "admin"], affects: ["Oberfläche"],
  }),
  s({
    model: "DeviceCategory", field: "sortOrder", domain: "geraete", scope: "standing",
    effect: "Reihenfolge in Listen und Auswahlfeldern.",
    writers: ["sub", "admin"], affects: ["Oberfläche"],
  }),
  s({
    model: "DeviceCategory", field: "color", domain: "geraete", scope: "standing",
    effect: "Farbmarke der Kategorie (CSS-Variablen-Suffix).",
    writers: ["sub", "admin"], affects: ["Oberfläche"],
  }),
  s({
    model: "DeviceCategory", field: "icon", domain: "geraete", scope: "standing",
    effect: "Symbol der Kategorie (lucide-Name).",
    writers: ["sub", "admin"], affects: ["Oberfläche"],
  }),
  x("identity", "DeviceCategory", "id", "Primärschlüssel."),
  x("identity", "DeviceCategory", "userId", "Eigentümer."),
  x("identity", "DeviceCategory", "slug", "Stabile Kennung; `kg` ist die eingebaute Kategorie."),
  x("record", "DeviceCategory", "isBuiltIn", "Nur für den KG gesetzt; verhindert das Löschen."),
  x("record", "DeviceCategory", "createdAt", "Anlage-Zeitpunkt."),

  // ── VerschlussAnforderung: Sperrzeit & Einschliess-Anforderung ─────────────────────────────
  s({
    model: "VerschlussAnforderung", field: "reinigungErlaubt", domain: "sperrzeit", scope: "directive",
    effect: "Erlaubt DIESE Sperrzeit eine Reinigungsöffnung (und damit einen Gerätewechsel)? Es müssen ALLE gleichzeitig aktiven Sperrzeiten erlauben, nicht nur die neueste.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit", "Reinigung", "Box", "Geräte"],
    anchor: "queries.ts:foldActiveSperrzeiten",
  }),
  s({
    model: "VerschlussAnforderung", field: "endetAt", domain: "sperrzeit", scope: "directive",
    effect: "Bei einer SPERRZEIT das Ende (leer = unbefristet), bei einer ANFORDERUNG die Frist zum Einschliessen.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit", "Box", "Strafbuch"],
    anchor: "queries.ts:foldActiveSperrzeiten",
  }),
  s({
    model: "VerschlussAnforderung", field: "dauerH", domain: "sperrzeit", scope: "directive",
    effect: "Mindest-Tragedauer einer Anforderung; die Uhr startet beim tatsächlichen Verschluss. Alternative zu `sperrEndetAt`.",
    writers: ["admin", "mcp"], affects: ["Sperrzeit"], anchor: "entryFulfilment.ts",
  }),
  s({
    model: "VerschlussAnforderung", field: "sperrEndetAt", domain: "sperrzeit", scope: "directive",
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
    model: "VerschlussAnforderung", field: "nachricht", domain: "sperrzeit", scope: "directive",
    effect: "Begleittext an den Sub; erscheint in der Meldung und im Posteingang.",
    writers: ["admin", "mcp"], affects: ["Nachrichten"],
  }),
  x("identity", "VerschlussAnforderung", "id", "Primärschlüssel."),
  x("identity", "VerschlussAnforderung", "userId", "Betroffener Sub."),
  x("record", "VerschlussAnforderung", "art",
    "`ANFORDERUNG` oder `SPERRZEIT` — die Bauart der Zeile, nicht einstellbar: sie ergibt sich daraus, welche Direktive gestellt wurde."),
  x("audit", "VerschlussAnforderung", "createdBy",
    "Wer die Direktive angeordnet hat; wird an die daraus entstehende Sperrzeit vererbt. `null` = System."),
  x("record", "VerschlussAnforderung", "createdAt", "Anlage-Zeitpunkt."),
  x("runtime", "VerschlussAnforderung", "fulfilledAt", "Gesetzt, wenn der Sub sich eingeschlossen hat."),
  x("runtime", "VerschlussAnforderung", "withdrawnAt", "Gesetzt beim Zurückziehen oder beim Bruch durch eine Öffnung."),
  x("audit", "VerschlussAnforderung", "endedReason",
    "WARUM zurückgezogen: `keyholder` (bewusst) oder `opening` (vom Sub gebrochen). Ohne das Feld sähe beides gleich aus."),
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
  x("identity", "KontrollAnforderung", "id", "Primärschlüssel."),
  x("identity", "KontrollAnforderung", "userId", "Betroffener Sub."),
  x("runtime", "KontrollAnforderung", "code",
    "Zufallscode fürs Foto — vom Server erzeugt. `null`, wenn das Gerät keinen verlangt (`Device.requireInspectionCode`)."),
  x("audit", "KontrollAnforderung", "createdBy", "Wer die Kontrolle gestellt hat; `null` = die Automatik."),
  x("record", "KontrollAnforderung", "createdAt", "Anlage-Zeitpunkt."),
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
  x("identity", "NotificationPreference", "id", "Primärschlüssel."),
  x("identity", "NotificationPreference", "userId", "Empfänger."),
  x("record", "NotificationPreference", "eventType",
    "Welches Ereignis die Zeile betrifft — die Zeile selbst ist der Schalter, nicht dieses Feld."),
];
