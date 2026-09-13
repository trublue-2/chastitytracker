import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parsePrismaSchema } from "@/lib/prismaSchema";
import {
  STATE_TABLES, STATE_IGNORED_TABLES, STATE_TRIGGER_MARKER, buildStateTriggerSql,
} from "./stateAreas";

// `node:sqlite` (Node 24) über `require`: die eingesetzten `@types/node` kennen das Modul noch nicht,
// und `next build` prüft auch die Test-Dateien. Nur die Methoden, die hier gebraucht werden.
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): { get(...params: unknown[]): unknown };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDb };

const root = process.cwd();
const schema = parsePrismaSchema(fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8"));
const migrationsDir = path.join(root, "prisma/migrations");
const migrations = fs.readdirSync(migrationsDir)
  .filter((d) => fs.existsSync(path.join(migrationsDir, d, "migration.sql")))
  .sort()
  .map((d) => fs.readFileSync(path.join(migrationsDir, d, "migration.sql"), "utf8"));

describe("Register: jede Tabelle eines Subs ist zugeordnet", () => {
  it("jedes Modell mit userId steht in STATE_TABLES oder STATE_IGNORED_TABLES", () => {
    // Fehlt ein Modell, zählt seine Änderung nirgends — `check_updates` meldete „nichts geändert",
    // obwohl sich etwas geändert hat. Genau der Fehler, den es verhindern soll.
    const tracked = new Set(STATE_TABLES.map((t) => t.table));
    const unclassified = [...schema.entries()]
      .filter(([, fields]) => fields.some((f) => f.name === "userId"))
      .map(([model]) => model)
      .filter((m) => !tracked.has(m) && !(m in STATE_IGNORED_TABLES));
    expect(unclassified, "in stateAreas.ts einem Bereich zuordnen oder mit Grund ignorieren").toEqual([]);
  });

  it("nennt nur Modelle und Spalten, die es gibt", () => {
    for (const t of STATE_TABLES) {
      const fields = schema.get(t.table);
      expect(fields, t.table).toBeDefined();
      for (const c of t.ignoreColumns ?? []) {
        expect(fields!.some((f) => f.name === c), `${t.table}.${c}`).toBe(true);
      }
    }
  });
});

describe("die Trigger-Migration passt zum Register", () => {
  it("die jüngste Trigger-Migration enthält exakt das erzeugte SQL", () => {
    // Ändert sich das Register oder bekommt `User`/`BoxStatus` eine Spalte, erzeugt der Generator
    // anderes SQL als eingespielt ist. Dann: neue Migration anlegen, `npm run state-triggers`
    // hineinkopieren (der Block löscht und erstellt alle Trigger neu).
    const latest = [...migrations].reverse().find((sql) => sql.includes(STATE_TRIGGER_MARKER));
    expect(latest, "keine Migration mit Trigger-Block gefunden").toBeDefined();
    const block = latest!.slice(latest!.indexOf(STATE_TRIGGER_MARKER));
    expect(block.trim()).toBe(buildStateTriggerSql(schema).trim());
  });
});

/**
 * Das Verhalten gegen eine ECHTE SQLite-Datenbank mit allen Migrationen — die Trigger sind Roh-SQL,
 * ein Prisma-Mock sähe von ihnen nichts.
 */
describe("Trigger in einer echten Datenbank", () => {
  let db: SqliteDb;
  const version = (area: string) =>
    (db.prepare(`SELECT version FROM StateVersion WHERE userId = 'u1' AND area = ?`).get(area) as { version: number } | undefined)?.version ?? 0;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    for (const sql of migrations) db.exec(sql);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`INSERT INTO User (id, username, passwordHash) VALUES ('u1', 'sub', 'x')`);
  });

  it("Insert, Update und Delete zählen je einmal", () => {
    db.exec(`INSERT INTO Entry (id, userId, type, startTime) VALUES ('e1', 'u1', 'VERSCHLUSS', 0)`);
    db.exec(`UPDATE Entry SET note = 'x' WHERE id = 'e1'`);
    db.exec(`DELETE FROM Entry WHERE id = 'e1'`);
    expect(version("entries")).toBe(3);
    const row = db.prepare(`SELECT changedAt FROM StateVersion WHERE area = 'entries'`).get() as { changedAt: number };
    expect(Math.abs(row.changedAt - Date.now())).toBeLessThan(60_000);
  });

  it("zählt auch, wenn die auslösende Anweisung eine eigene Konflikt-Strategie trägt", () => {
    // Konflikt-Klauseln im Trigger-Rumpf werden von der der AUSLÖSENDEN Anweisung überschrieben.
    // Der UPSERT ist davon nicht betroffen — hier festgehalten, weil App und Portal Roh-SQL schreiben.
    db.exec(`INSERT OR REPLACE INTO Entry (id, userId, type, startTime) VALUES ('e1', 'u1', 'VERSCHLUSS', 0)`);
    db.exec(`INSERT OR IGNORE INTO Entry (id, userId, type, startTime) VALUES ('e2', 'u1', 'VERSCHLUSS', 0)`);
    db.exec(`UPDATE OR REPLACE Entry SET note = 'x' WHERE id = 'e1'`);
    expect(version("entries")).toBe(3);
  });

  it("das Anlegen des Users ist keine Änderung", () => {
    expect(db.prepare(`SELECT count(*) AS n FROM StateVersion`).get()).toEqual({ n: 0 });
  });

  it("User: flüchtige Spalten zählen nicht, eine echte Einstellung schon — auch im selben Update", () => {
    db.exec(`UPDATE User SET locale = 'en', noticeSeenVersion = '1' WHERE id = 'u1'`);
    expect(version("settings")).toBe(0);
    // @map-Spalte: `cleaningAllowed` heisst in der DB `reinigungErlaubt`.
    db.exec(`UPDATE User SET locale = 'de', reinigungErlaubt = 1 WHERE id = 'u1'`);
    expect(version("settings")).toBe(1);
    db.exec(`UPDATE User SET reinigungErlaubt = 1 WHERE id = 'u1'`);
    expect(version("settings")).toBe(1);
  });

  it("Box: ein Sync zählt nicht, ein Zustandswechsel schon", () => {
    db.exec(`INSERT INTO BoxStatus (id, userId, boxId, name, updatedAt) VALUES ('b1', 'u1', 'box', 'Box', 0)`);
    db.exec(`UPDATE BoxStatus SET battery = 50, lastSyncAt = 1, updatedAt = 2 WHERE id = 'b1'`);
    expect(version("box")).toBe(1);
    db.exec(`UPDATE BoxStatus SET locked = 1 WHERE id = 'b1'`);
    expect(version("box")).toBe(2);
  });

  it("Kind-Tabellen zählen über die Eltern-Zeile", () => {
    db.exec(`INSERT INTO Task (id, userId, title, createdBy, holdUntil) VALUES ('t1', 'u1', 'T', 'ai', 0)`);
    db.exec(`INSERT INTO TaskProof (id, taskId, description) VALUES ('p1', 't1', 'd')`);
    db.exec(`UPDATE TaskProof SET proofText = 'x' WHERE id = 'p1'`);
    expect(version("tasks")).toBe(3);
  });

  it("das Löschen eines Users räumt seine Zähler ab und scheitert nicht an den Kaskaden", () => {
    db.exec(`INSERT INTO Entry (id, userId, type, startTime) VALUES ('e1', 'u1', 'VERSCHLUSS', 0)`);
    db.exec(`INSERT INTO Task (id, userId, title, createdBy, holdUntil) VALUES ('t1', 'u1', 'T', 'ai', 0)`);
    db.exec(`INSERT INTO TaskProof (id, taskId, description) VALUES ('p1', 't1', 'd')`);
    db.exec(`DELETE FROM User WHERE id = 'u1'`);
    expect(db.prepare(`SELECT count(*) AS n FROM StateVersion`).get()).toEqual({ n: 0 });
  });

  it("ein anderer User bleibt unberührt", () => {
    db.exec(`INSERT INTO User (id, username, passwordHash) VALUES ('u2', 'other', 'x')`);
    db.exec(`INSERT INTO Entry (id, userId, type, startTime) VALUES ('e2', 'u2', 'VERSCHLUSS', 0)`);
    expect(version("entries")).toBe(0);
  });
});
