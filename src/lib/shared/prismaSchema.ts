/**
 * Zeilen-Parser für `prisma/schema.prisma` — geteilt vom Funktionsmodell (`funktionsmodellDoc.ts`) und
 * vom Trigger-Generator für `check_updates` (`mcp/stateAreas.ts`).
 */

/** Ein Skalarfeld aus `schema.prisma`, so wie es dort steht. */
export interface SchemaField {
  model: string;
  name: string;
  /** Typ ohne `?`/`[]`, z.B. `Boolean`, `Int`, `String`, `DateTime`. */
  type: string;
  optional: boolean;
  /** Roher `@default(...)`-Inhalt, oder null. */
  defaultValue: string | null;
  /** Spaltenname in der Datenbank: der `@map("…")`-Wert, sonst der Feldname. Roh-SQL (Trigger in
   *  `mcp/stateAreas.ts`) muss diesen Namen verwenden, nicht den Prisma-Namen. */
  dbName: string;
}

/** Modell → Felder, in Schema-Reihenfolge. Relationen und Attribut-Zeilen fallen weg. */
export type SchemaFields = Map<string, SchemaField[]>;

/** Feldzeilen, die keine Felder sind: Blockattribute (`@@index`) und Kommentare. */
const NON_FIELD_LINE = /^\s*(@@|\/\/|$)/;
/** `name  Type[?]  @rest…` — Prisma-Feldzeile. */
const FIELD_LINE = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/;
/** `@default(…)` bis zur ersten schliessenden Klammer. Ein verschachtelter Ausdruck
 *  (`dbgenerated("…()")`) wird dabei abgeschnitten — folgenlos, weil das Funktionsmodell jeden
 *  Funktions-Default ohnehin als „—" ausgibt: ein erzeugter Wert sagt über eine Stellschraube nichts. */
const DEFAULT_ATTR = /@default\(([^)]*)\)/;
/** `@map("spalte")` eines Feldes. */
const MAP_ATTR = /@map\("([^"]+)"\)/;

/**
 * Zerlegt `schema.prisma` in Skalarfelder je Modell.
 *
 * Bewusst ein Zeilen-Parser und kein Prisma-DMMF-Aufruf: der bräuchte einen generierten Client und
 * damit eine funktionierende Datenbank-Umgebung. Das Funktionsmodell soll aus einem frischen Klon
 * ohne `prisma generate` prüfbar sein — sonst läuft der Test genau dort nicht, wo er gebraucht wird
 * (Worktree, CI-Gate, Cloud-Session).
 *
 * Als Skalar zählt, was einen bekannten Prisma-Typ trägt. Relationsfelder (`user User`, `entries
 * Entry[]`) fallen damit heraus — sie sind keine Stellschrauben, sondern Kanten.
 */
export function parsePrismaSchema(source: string): SchemaFields {
  const out: SchemaFields = new Map();
  const scalarTypes = new Set(["String", "Int", "Float", "Boolean", "DateTime", "Json", "Bytes", "BigInt", "Decimal"]);
  let current: string | null = null;

  for (const line of source.split("\n")) {
    const open = /^model\s+(\w+)\s*\{/.exec(line);
    if (open) { current = open[1]; out.set(current, []); continue; }
    if (current && /^\}/.test(line)) { current = null; continue; }
    if (!current || NON_FIELD_LINE.test(line)) continue;

    const m = FIELD_LINE.exec(line);
    if (!m) continue;
    const [, name, type, list, optional, rest] = m;
    if (list || !scalarTypes.has(type)) continue;

    out.get(current)!.push({
      model: current,
      name,
      type,
      optional: Boolean(optional),
      defaultValue: DEFAULT_ATTR.exec(rest)?.[1] ?? null,
      dbName: MAP_ATTR.exec(rest)?.[1] ?? name,
    });
  }
  return out;
}
