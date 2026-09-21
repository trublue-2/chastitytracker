import type { SchemaFields } from "@/lib/prismaSchema";

/**
 * Register für `check_updates`: welche Tabelle zu welchem BEREICH des Sub-Zustands gehört.
 *
 * **Wozu.** Ein MCP-Client (Claude.ai) entscheidet selbst, wann er Daten neu liest — und arbeitet
 * dazwischen mit Tool-Ergebnissen weiter, die Stunden alt sein können. `check_updates` beantwortet
 * die Frage „hat sich seit meinem letzten Blick etwas geändert, und wo?" für ein paar Bytes.
 *
 * **Warum Trigger statt Zeitstempel.** Fast keine Tabelle hat ein `updatedAt`. Ein Vergleich über
 * `max(createdAt)` + Anzahl sähe eine erledigte Kontrolle, eine angenommene Einschliess-Anforderung
 * oder einen korrigierten Eintrag nicht — und meldete `changed: false`, obwohl sich etwas geändert
 * hat. Das ist schlimmer als gar keine Angabe. SQLite-Trigger zählen stattdessen JEDEN Insert,
 * jedes Update und jedes Delete in `StateVersion` hoch, egal ob die Änderung aus der App, dem MCP,
 * dem Poller oder dem Roh-SQL des Portals kommt.
 *
 * **Die Trigger werden aus diesem Register erzeugt** ({@link buildStateTriggerSql}) und stehen als
 * statisches SQL in einer Migration. `stateAreas.test.ts` hält beides gegeneinander: ändert sich
 * das Register oder eine gefilterte Tabelle bekommt eine neue Spalte, schlägt der Test fehl, bis
 * eine neue Migration mit dem frisch erzeugten SQL existiert (`npm run state-triggers`).
 *
 * Pflegen:
 * - Neues Modell mit `userId` → in {@link STATE_TABLES} oder {@link STATE_IGNORED_TABLES}
 *   eintragen; der Test bricht sonst.
 * - Neue Spalte in `User` oder `BoxStatus` → Test bricht; ist sie flüchtig, in `ignoreColumns`
 *   eintragen, sonst nur die Trigger-Migration neu erzeugen.
 * - Neuer Bereich → HINTEN an {@link STATE_AREAS} anhängen, nie umsortieren: die Position ist Teil
 *   des Tokens, das eine laufende Sitzung in der Hand hält.
 */

/** Die Bereiche, in fester Reihenfolge — Position = Stelle im Token. Nur hinten anhängen. */
export const STATE_AREAS = [
  "entries", "lockRequests", "inspections", "orgasm", "tasks", "offenses",
  "goals", "weight", "devices", "box", "context", "settings",
] as const;

export type StateArea = (typeof STATE_AREAS)[number];

/** Wem eine Zeile gehört: eigene Spalte, über die Eltern-Tabelle (Kind-Tabellen ohne `userId`),
 *  oder die Zeile IST der User (`self`). */
type StateOwner =
  | { column: string }
  | { parent: string; foreignKey: string }
  | { self: true };

export interface StateTable {
  table: string;
  area: StateArea;
  owner: StateOwner;
  /** Flüchtige Spalten, deren Änderung NICHT als Zustandsänderung zählt. Gesetzt → der Update-Trigger
   *  feuert nur, wenn sich eine der ÜBRIGEN Spalten wirklich ändert (`IS NOT`). Nicht gesetzt → jedes
   *  Update zählt. Nur dort verwenden, wo Hintergrund-Schreiber sonst dauernd Fehlalarm auslösten. */
  ignoreColumns?: readonly string[];
}

const BY_USER = { column: "userId" } as const;

export const STATE_TABLES: readonly StateTable[] = [
  { table: "Entry", area: "entries", owner: BY_USER },

  { table: "VerschlussAnforderung", area: "lockRequests", owner: BY_USER },
  { table: "KontrollAnforderung", area: "inspections", owner: BY_USER },
  { table: "OrgasmusAnforderung", area: "orgasm", owner: BY_USER },

  { table: "Task", area: "tasks", owner: BY_USER },
  { table: "TaskSeries", area: "tasks", owner: BY_USER },
  { table: "TaskProof", area: "tasks", owner: { parent: "Task", foreignKey: "taskId" } },
  { table: "TaskRequirement", area: "tasks", owner: { parent: "Task", foreignKey: "taskId" } },
  { table: "TaskSeriesProof", area: "tasks", owner: { parent: "TaskSeries", foreignKey: "seriesId" } },
  { table: "TaskSeriesRequirement", area: "tasks", owner: { parent: "TaskSeries", foreignKey: "seriesId" } },

  { table: "StrafeRecord", area: "offenses", owner: BY_USER },
  { table: "ManualOffense", area: "offenses", owner: BY_USER },
  { table: "OffenseStatement", area: "offenses", owner: BY_USER },
  { table: "OffenseRuleChange", area: "offenses", owner: BY_USER },

  { table: "TrainingVorgabe", area: "goals", owner: BY_USER },

  { table: "WeightEntry", area: "weight", owner: BY_USER },
  { table: "WeightRelease", area: "weight", owner: BY_USER },
  { table: "HeightChange", area: "weight", owner: BY_USER },

  { table: "Device", area: "devices", owner: BY_USER },
  { table: "DeviceCategory", area: "devices", owner: BY_USER },
  { table: "DeviceReferenceImage", area: "devices", owner: { parent: "Device", foreignKey: "deviceId" } },

  {
    table: "BoxStatus", area: "box", owner: BY_USER,
    // Jeder Sync der Box schreibt Akku, Ladezustand, Riegelstellung und den Sync-Zeitpunkt. Zählte
    // das, stünde `box` alle paar Minuten auf „geändert" und das Signal wäre wertlos.
    ignoreColumns: ["battery", "charging", "boltPos", "fwVersion", "lastSyncAt", "pendingCommand", "pendingCommandAt", "updatedAt"],
  },
  { table: "BoxEvent", area: "box", owner: BY_USER },

  { table: "KeyholderNote", area: "context", owner: BY_USER },
  { table: "NoteRef", area: "context", owner: { parent: "KeyholderNote", foreignKey: "noteId" } },
  { table: "RecurringContext", area: "context", owner: BY_USER },
  { table: "Appointment", area: "context", owner: BY_USER },
  { table: "HealthHold", area: "context", owner: BY_USER },

  {
    table: "User", area: "settings", owner: { self: true },
    // Konto, Anzeige und Benachrichtigungs-Wege des Menschen — keine Regeln, die für den Sub gelten.
    // Dazu zwei Buchhaltungs-Spalten des Pollers (`autoInspectionPlannedFor`, `weightReminderMark`),
    // die er ohne Zutun eines Menschen umschreibt.
    ignoreColumns: [
      "passwordHash", "email", "role", "createdAt", "startPage", "notifyMail", "notifyPush",
      "notifyTelegram", "hideOwnTracker", "locale", "telegramChatId", "dashboardLayout",
      "quickSettings", "noticeSeenVersion", "photoAnalysisNoticeSeen", "autoInspectionPlannedFor", "weightReminderMark",
    ],
  },
  { table: "CleaningRuleChange", area: "settings", owner: BY_USER },
  { table: "TimezoneChange", area: "settings", owner: BY_USER },
];

/** Modelle mit `userId`, die bewusst NICHT zählen — mit Grund. */
export const STATE_IGNORED_TABLES: Readonly<Record<string, string>> = {
  StateVersion: "die Zähler selbst",
  KeyholderActionLog: "Audit der eigenen MCP-Schreibzugriffe — die Änderung selbst zählt schon in ihrem Bereich",
  MessageRead: "Lesebestätigungen",
  AdminUserRelationship: "Keyholder-Zuordnung, kein Zustand des Subs",
  Passkey: "Konto",
  PasswordResetToken: "Konto",
  TelegramLinkToken: "Konto",
  NativePushToken: "Geräte-Registrierung",
  PushSubscription: "Geräte-Registrierung",
  NotificationPreference: "Benachrichtigungs-Wege des Menschen",
  OAuthCode: "Konto",
  OAuthToken: "Konto",
  OAuthRefreshToken: "Konto",
};

/** Markiert in einer Migration den Abschnitt, den {@link buildStateTriggerSql} erzeugt hat. */
export const STATE_TRIGGER_MARKER = "-- state-version-triggers (generated by src/lib/mcp/stateAreas.ts)";

/** Jetzt als Unix-Millisekunden — so, wie Prisma ein `DateTime` in SQLite ablegt. */
const NOW_MS = "CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)";

/** Besitzer der Zeile `row` (NEW/OLD): als Ausdruck, bei Kind-Tabellen samt Eltern-Lookup. */
function ownerSelect(t: StateTable, row: "NEW" | "OLD"): { expr: string; from: string } {
  if ("self" in t.owner) return { expr: `${row}."id"`, from: "" };
  if ("column" in t.owner) return { expr: `${row}."${t.owner.column}"`, from: "" };
  return { expr: `p."userId"`, from: ` FROM "${t.owner.parent}" p WHERE p."id" = ${row}."${t.owner.foreignKey}"` };
}

/** Zählt den Bereich des Besitzers hoch — EINE Anweisung. Der UPSERT greift auch, wenn die
 *  auslösende Anweisung eine eigene Konflikt-Strategie trägt (`INSERT OR REPLACE`, `OR IGNORE`);
 *  `stateAreas.test.ts` prüft das. Ohne Besitzer (NULL, fehlende Eltern-Zeile) entsteht keine Zeile —
 *  ein NOT-NULL-Fehler hier liesse sonst die auslösende Änderung selbst scheitern. Die WHERE-Klausel
 *  ist ausserdem Pflicht: ohne sie läse SQLite `ON CONFLICT` als Teil des SELECT. */
function bumpSql(t: StateTable, row: "NEW" | "OLD"): string {
  const { expr, from } = ownerSelect(t, row);
  return `  INSERT INTO "StateVersion" ("userId", "area", "version", "changedAt")
    SELECT ${expr}, '${t.area}', 1, ${NOW_MS}${from || ` WHERE ${expr} IS NOT NULL`}
    ON CONFLICT ("userId", "area") DO UPDATE SET "version" = "version" + 1, "changedAt" = excluded."changedAt";`;
}

/** Spalten, deren Änderung zählt — alle Skalarspalten ausser den ignorierten, als DB-Namen. */
function relevantColumns(t: StateTable, schema: SchemaFields): string[] {
  const fields = schema.get(t.table);
  if (!fields) throw new Error(`stateAreas: Modell ${t.table} fehlt im Schema`);
  const ignored = new Set(t.ignoreColumns ?? []);
  return fields.filter((f) => !ignored.has(f.name)).map((f) => f.dbName);
}

/**
 * Das komplette Trigger-SQL: für jede Tabelle ein Insert-, Update- und Delete-Trigger, jeweils
 * vorher gelöscht — damit eine spätere Migration denselben Block unverändert neu einspielen kann.
 */
export function buildStateTriggerSql(schema: SchemaFields): string {
  const out: string[] = [STATE_TRIGGER_MARKER];
  for (const t of STATE_TABLES) {
    const whenUpdate = t.ignoreColumns
      ? ` WHEN ${relevantColumns(t, schema).map((c) => `NEW."${c}" IS NOT OLD."${c}"`).join(" OR ")}`
      : "";
    // Die User-Zeile selbst: ihr Anlegen ist keine Änderung am Zustand eines Subs, und ihr Löschen
    // räumt die Zähler ab, statt einen für den gelöschten User anzulegen.
    const self = "self" in t.owner;
    const variants = [
      ...(self ? [] : [{ op: "ins", event: "INSERT", when: "", body: bumpSql(t, "NEW") }]),
      { op: "upd", event: "UPDATE", when: whenUpdate, body: bumpSql(t, "NEW") },
      { op: "del", event: "DELETE", when: "", body: self ? `  DELETE FROM "StateVersion" WHERE "userId" = OLD."id";` : bumpSql(t, "OLD") },
    ];
    for (const v of variants) {
      const name = `"state_${t.table}_${v.op}"`;
      out.push(
        `DROP TRIGGER IF EXISTS ${name};`,
        `CREATE TRIGGER ${name} AFTER ${v.event} ON "${t.table}"${v.when}\nBEGIN\n${v.body}\nEND;`,
      );
    }
  }
  return out.join("\n") + "\n";
}
