/**
 * Der GENERIERTE Teil des Funktionsmodells: Schema-Parser + Markdown-Renderer für
 * `docs/funktionsmodell/stellschrauben.md`.
 *
 * Arbeitsteilung — der Grund, warum es diese Datei überhaupt gibt:
 * - `schema.prisma` ist die Wahrheit über FORM: welche Felder existieren, welcher Typ, welcher
 *   Default, optional oder nicht. Nichts davon wird hier von Hand gepflegt; von Hand gepflegte
 *   Defaults sind die erste Zahl, die veraltet.
 * - `funktionsmodellRegistry.ts` ist die Wahrheit über BEDEUTUNG: wer darf schreiben, wo steht der
 *   Schalter, worauf wirkt er, was hebt ihn auf. Das weiss das Schema nicht und kann es nicht wissen.
 * - Diese Datei führt beides zusammen und rendert eine Tabelle daraus.
 *
 * Alles hier ist rein (Text rein, Text raus). Das Lesen und Schreiben von Dateien macht
 * `scripts/gen-funktionsmodell.ts`, das Prüfen `funktionsmodellDoc.test.ts` — beide auf denselben
 * Funktionen, damit „generiert“ und „geprüft“ nicht auseinanderlaufen können.
 */

import {
  FM_REGISTRY, FM_SCANNED_MODELS, FM_DOMAINS, FM_WIRED_EDGES, FM_TARGET_DOC,
  type FmEntry, type FmSetting, type FmDomain, type FmWriter, type FmScope, type FmNonSetting,
  type FmTarget,
} from "./funktionsmodellRegistry";

/** Ein Skalarfeld aus `schema.prisma`, so wie es dort steht. */
export interface SchemaField {
  model: string;
  name: string;
  /** Typ ohne `?`/`[]`, z.B. `Boolean`, `Int`, `String`, `DateTime`. */
  type: string;
  optional: boolean;
  /** Roher `@default(...)`-Inhalt, oder null. */
  defaultValue: string | null;
}

/** Modell → Felder, in Schema-Reihenfolge. Relationen und Attribut-Zeilen fallen weg. */
export type SchemaFields = Map<string, SchemaField[]>;

/** Feldzeilen, die keine Felder sind: Blockattribute (`@@index`) und Kommentare. */
const NON_FIELD_LINE = /^\s*(@@|\/\/|$)/;
/** `name  Type[?]  @rest…` — Prisma-Feldzeile. */
const FIELD_LINE = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/;
/** `@default(…)` bis zur ersten schliessenden Klammer. Ein verschachtelter Ausdruck
 *  (`dbgenerated("…()")`) wird dabei abgeschnitten — folgenlos, weil {@link formatDefault} jeden
 *  Funktions-Default ohnehin als „—" ausgibt: ein erzeugter Wert sagt über eine Stellschraube nichts. */
const DEFAULT_ATTR = /@default\(([^)]*)\)/;

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
    });
  }
  return out;
}

/** Ein Registry-Eintrag samt der Schema-Form, auf die er sich beruft. */
export interface ResolvedEntry {
  entry: FmSetting;
  field: SchemaField;
}

/** Was am Register nicht stimmt — die Befunde, die der Test zu Fehlern macht. */
export interface FmProblems {
  /** Feld steht im Schema, aber in keinem Registry-Eintrag. */
  undocumented: string[];
  /** Registry-Eintrag zeigt auf ein Feld, das es nicht (mehr) gibt. */
  orphaned: string[];
  /** Zwei Einträge auf dasselbe Feld. */
  duplicated: string[];
  /** Eintrag nennt eine Domäne, die es in `FM_DOMAINS` nicht gibt. */
  unknownDomain: string[];
}

const key = (model: string, field: string) => `${model}.${field}`;

/**
 * Registry als Nachschlagetabelle. Einmal gebaut statt an drei Stellen linear gesucht — und
 * nebenbei die einzige Stelle, an der `Model.field` zum Schlüssel wird.
 */
const byField: Map<string, FmEntry> = new Map(FM_REGISTRY.map((e) => [key(e.model, e.field), e]));

/**
 * Gleicht Registry und Schema ab — über die Modelle in {@link FM_SCANNED_MODELS} VOLLSTÄNDIG.
 *
 * Vollständig heisst: jedes Skalarfeld dieser Modelle braucht einen Eintrag, auch ein
 * ausgeschlossenes (`kind: "record"` o.ä.). Ein Register, das nur die interessanten Felder kennt,
 * beantwortet die Frage „was kann eingestellt werden?“ nämlich nicht — es beantwortet nur „woran hat
 * jemand gedacht". Genau die Felder, an die niemand gedacht hat, sind die, die später als
 * unerklärliches Verhalten auffallen.
 *
 * Felder aus Modellen ausserhalb der Liste dürfen einzeln registriert werden; für sie gilt nur die
 * Existenzprüfung. Ein Modell in die Vollprüfung zu heben ist eine Zeile in `FM_SCANNED_MODELS` —
 * der Test nennt danach jedes fehlende Feld beim Namen.
 */
export function checkRegistry(schema: SchemaFields): FmProblems {
  const problems: FmProblems = { undocumented: [], orphaned: [], duplicated: [], unknownDomain: [] };
  const seen = new Set<string>();

  for (const entry of FM_REGISTRY) {
    const id = key(entry.model, entry.field);
    if (seen.has(id)) problems.duplicated.push(id);
    seen.add(id);

    const field = schema.get(entry.model)?.find((f) => f.name === entry.field);
    if (!field) problems.orphaned.push(id);
    if (entry.kind === "setting" && !FM_DOMAINS.some((d) => d.id === entry.domain)) {
      problems.unknownDomain.push(`${id} → ${entry.domain}`);
    }
  }

  for (const model of FM_SCANNED_MODELS) {
    for (const field of schema.get(model) ?? []) {
      if (!seen.has(key(model, field.name))) problems.undocumented.push(key(model, field.name));
    }
  }
  return problems;
}

/** Alle Stellschrauben einer Domäne, in Schema-Reihenfolge — nicht in Registry-Reihenfolge: wer die
 *  Tabelle neben dem Schema liest, findet die Felder so an derselben Stelle wieder. */
function settingsOf(domain: FmDomain, schema: SchemaFields): ResolvedEntry[] {
  const out: ResolvedEntry[] = [];
  for (const [model, fields] of schema) {
    for (const field of fields) {
      const entry = byField.get(key(model, field.name));
      if (entry?.kind === "setting" && entry.domain === domain.id) out.push({ entry, field });
    }
  }
  return out;
}

/** Der Default in Lesefassung: erzeugte Werte (`cuid()`, `now()`) sagen über eine Stellschraube nichts. */
function formatDefault(field: SchemaField): string {
  if (field.defaultValue === null) return field.optional ? "—" : "(keiner)";
  const raw = field.defaultValue.trim();
  if (/^(cuid|uuid|now|autoincrement|dbgenerated)\(/.test(raw)) return "—";
  return `\`${raw}\``;
}

/** Pipe-Zeichen und Zeilenumbrüche würden die Tabelle sprengen. */
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

const row = (cells: string[]) => `| ${cells.map(cell).join(" | ")} |`;

/** Kurzlabels der Schreibwege und der Nicht-Stellschrauben-Arten — Darstellung, deshalb hier und
 *  nicht in der Registry. */
const WRITER_LABEL: Record<FmWriter, string> = {
  sub: "Sub", admin: "Keyholder (UI)", mcp: "Keyholder (MCP)", portal: "Portal", system: "System",
};
const KIND_LABEL: Record<FmNonSetting["kind"], string> = {
  identity: "Identität", record: "Datensatz", runtime: "Laufzeitzustand", audit: "Nachweis",
};
const SCOPE_LABEL: Record<FmScope, string> = {
  standing: "dauerhaft", directive: "je Direktive", entry: "je Eintrag",
};

/**
 * Rendert `docs/funktionsmodell/stellschrauben.md`.
 *
 * Ohne Zeitstempel im Kopf: der änderte sich bei jedem Lauf und machte aus jeder Regenerierung ein
 * Diff, das nichts bedeutet — und aus dem Test ein Rauschen, das man wegklickt.
 */
export function renderStellschrauben(schema: SchemaFields): string {
  const lines: string[] = [];
  const settings = FM_REGISTRY.filter((e) => e.kind === "setting");

  lines.push("# Stellschrauben-Register");
  lines.push("");
  lines.push("<!-- GENERIERT — nicht von Hand ändern. Quelle: prisma/schema.prisma +");
  lines.push("     src/lib/funktionsmodellRegistry.ts · neu erzeugen: `npm run funktionsmodell` -->");
  lines.push("");
  lines.push(`Jedes Feld, das Verhalten steuert: ${settings.length} Stellschrauben über ${FM_SCANNED_MODELS.length} Modelle.`);
  lines.push("Typ und Default stammen aus dem Schema, die Bedeutung aus der Registry — beides wird bei jedem");
  lines.push("Testlauf gegeneinander geprüft, ein neues Feld ohne Eintrag lässt `npm test` fehlschlagen.");
  lines.push("");
  lines.push("**Gilt** unterscheidet den Dauerschalter am Konto von dem Wert, der nur für EINE Direktive gilt.");
  lines.push("Die beiden `reinigungErlaubt` sind der Fall, an dem das regelmässig schiefgeht: beide müssen zutreffen.");
  lines.push("");

  for (const domain of FM_DOMAINS) {
    const rows = settingsOf(domain, schema);
    lines.push(`## ${domain.title}`);
    lines.push("");
    if (domain.doc) lines.push(`Steckbrief: [${domain.doc}](${domain.doc})`, "");
    // Eine Domäne OHNE Stellschraube ist eine Aussage, keine Leerstelle: die Box etwa lässt sich im
    // Tracker an keiner Stelle einstellen, sie folgt den Einträgen. Wer die Überschrift wegliesse,
    // gäbe dem Leser die Antwort 'steht nirgends' statt 'gibt es nicht'.
    if (rows.length === 0) {
      lines.push("Kein einziges einstellbares Feld — was hier passiert, ergibt sich aus anderen Mechaniken.", "");
      continue;
    }
    lines.push(row(["Feld", "Typ", "Default", "Gilt", "Wirkung", "Schreibt", "Wirkt auf", "Anker"]));
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const { entry, field } of rows) {
      lines.push(row([
        `\`${field.model}.${field.name}\``,
        field.type + (field.optional ? "?" : ""),
        formatDefault(field),
        SCOPE_LABEL[entry.scope],
        entry.effect,
        entry.writers.map((w) => WRITER_LABEL[w]).join(", "),
        entry.affects.join(", ") || "—",
        entry.anchor ? `\`${entry.anchor}\`` : "—",
      ]));
    }
    lines.push("");
  }

  lines.push("## Bewusst keine Stellschrauben");
  lines.push("");
  lines.push("Der Rest der geprüften Modelle, mit dem Grund, warum er nichts steuert. Diese Liste ist der");
  lines.push("eigentliche Vollständigkeitsbeweis: ein Feld, das weder oben noch hier steht, gibt es nicht.");
  lines.push("");
  lines.push(row(["Feld", "Art", "Warum keine Stellschraube"]));
  lines.push("|---|---|---|");
  for (const model of FM_SCANNED_MODELS) {
    for (const field of schema.get(model) ?? []) {
      const entry = byField.get(key(model, field.name));
      if (!entry || entry.kind === "setting") continue;
      lines.push(row([`\`${model}.${field.name}\``, KIND_LABEL[entry.kind], entry.note]));
    }
  }
  lines.push("");
  return lines.join("\n");
}


// ── Abhängigkeits-Ansicht ────────────────────────────────────────────────────────────────────────
//
// Das Register beantwortet „worauf wirkt dieses Feld?". Die Frage im Betrieb lautet andersherum:
// „was greift in DIESE Mechanik hinein?". Beides ist dieselbe Kantenmenge, einmal vorwärts und
// einmal rückwärts gelesen — deshalb wird die Gegenrichtung hier ABGELEITET und nicht ein zweites
// Mal von Hand gepflegt. Eine handgeführte Rückrichtung wäre binnen weniger Änderungen unvollständig,
// und zwar unsichtbar: eine fehlende Kante sieht aus wie keine Kante.

/** Eine Kante der Karte, gleich ob über ein Feld oder fest verdrahtet. */
interface DepEdge {
  from: FmTarget;
  to: FmTarget;
  /** Das Feld, über das die Kante läuft — leer bei einer fest verdrahteten Regel. */
  via: string | null;
  what: string;
  anchor?: string;
}

/** Die Mechanik, der eine Domäne entspricht (nicht jede hat eine — `betrieb` etwa steht quer dazu). */
const mechanicOfDomain = (id: string): FmTarget | null =>
  FM_DOMAINS.find((d) => d.id === id)?.mechanic ?? null;

/**
 * Alle Kanten: die feldvermittelten aus `affects` plus die fest verdrahteten.
 *
 * Selbstkanten fallen weg. Dass `Device.requireInspectionCode` auf Geräte wirkt, ist keine
 * Abhängigkeit, sondern die Domäne selbst — in einer Karte wäre es eine Schlinge, die nur Platz kostet.
 */
function allEdges(): DepEdge[] {
  const out: DepEdge[] = [];
  for (const e of FM_REGISTRY) {
    if (e.kind !== "setting") continue;
    const from = mechanicOfDomain(e.domain);
    if (!from) continue;
    for (const to of e.affects) {
      if (to === from) continue;
      out.push({ from, to, via: `${e.model}.${e.field}`, what: e.effect, anchor: e.anchor });
    }
  }
  for (const w of FM_WIRED_EDGES) out.push({ from: w.from, to: w.to, via: null, what: w.rule, anchor: w.anchor });
  return out;
}

/** Jede Mechanik, die in irgendeiner Kante vorkommt — in der Reihenfolge der Domänen, Rest hinten an. */
function mechanicsInPlay(edges: DepEdge[]): FmTarget[] {
  const ordered = FM_DOMAINS.map((d) => d.mechanic).filter((m): m is FmTarget => Boolean(m));
  const rest = [...new Set(edges.flatMap((e) => [e.from, e.to]))].filter((m) => !ordered.includes(m));
  return [...ordered, ...rest.sort()];
}

/** Mermaid verträgt keine Umlaute und keine Schrägstriche in Knoten-Namen. */
const nodeId = (t: FmTarget) => "n" + t.replace(/[^A-Za-z]/g, "");

/** Die Nachbarschaft EINER Mechanik als kleines Diagramm — nicht die ganze Karte, die wäre ein Knäuel. */
function localGraph(m: FmTarget, incoming: DepEdge[], outgoing: DepEdge[]): string[] {
  const inc = [...new Set(incoming.map((e) => e.from))];
  const out = [...new Set(outgoing.map((e) => e.to))];
  if (inc.length === 0 && out.length === 0) return [];
  const lines = ["```mermaid", "flowchart LR"];
  lines.push(`  ${nodeId(m)}["${m}"]`);
  for (const f of inc) lines.push(`  ${nodeId(f)}["${f}"] --> ${nodeId(m)}`);
  for (const t of out) lines.push(`  ${nodeId(m)} --> ${nodeId(t)}["${t}"]`);
  lines.push("```");
  return lines;
}

/** Eine Kanten-Tabelle; `peer` benennt die jeweils andere Seite. */
function edgeTable(edges: DepEdge[], peerLabel: string, peerOf: (e: DepEdge) => FmTarget): string[] {
  const lines = [row([peerLabel, "Wodurch", "Was passiert", "Anker"]), "|---|---|---|---|"];
  for (const e of edges) {
    lines.push(row([
      peerOf(e),
      e.via ? `\`${e.via}\`` : "*feste Regel*",
      e.what,
      e.anchor ? `\`${e.anchor}\`` : "—",
    ]));
  }
  return lines;
}

/**
 * Rendert `docs/funktionsmodell/05-abhaengigkeiten.md` — je Mechanik, wer hineinwirkt und wohin sie
 * selbst wirkt.
 */
export function renderAbhaengigkeiten(): string {
  const edges = allEdges();
  const lines: string[] = [];

  lines.push("# Abhängigkeiten je Funktion");
  lines.push("");
  lines.push("<!-- GENERIERT — nicht von Hand ändern. Quelle: src/lib/funktionsmodellRegistry.ts");
  lines.push("     (`affects` je Stellschraube + FM_WIRED_EDGES) · neu erzeugen: `npm run funktionsmodell` -->");
  lines.push("");
  lines.push("Für jede Mechanik: **was in sie hineinwirkt** und **worauf sie selbst wirkt**. Die Steckbriefe");
  lines.push("beantworten die zweite Richtung in Prosa; diese Seite beantwortet vor allem die erste — die,");
  lines.push("die man stellt, wenn sich etwas unerklärlich verhält.");
  lines.push("");
  lines.push("Zwei Arten von Kanten, und der Unterschied ist wichtig:");
  lines.push("");
  lines.push("- **Über ein Feld** — es gibt einen Schalter, den jemand gesetzt hat. Nachzuschlagen im");
  lines.push("  [Stellschrauben-Register](stellschrauben.md).");
  lines.push("- ***feste Regel*** — dahinter steht **kein** Schalter. Diese Kanten sind die, die im Betrieb");
  lines.push("  überraschen: man sucht die Einstellung, die das verursacht hat, und es gibt keine.");
  lines.push("");
  const mechanics = mechanicsInPlay(edges);
  lines.push(`Insgesamt ${edges.length} Kanten über ${mechanics.length} Mechaniken, davon ${FM_WIRED_EDGES.length} fest verdrahtet.`);
  lines.push("");

  for (const m of mechanics) {
    const incoming = edges.filter((e) => e.to === m);
    const outgoing = edges.filter((e) => e.from === m);
    if (incoming.length === 0 && outgoing.length === 0) continue;

    lines.push(`## ${m}`);
    lines.push("");
    const doc = FM_DOMAINS.find((d) => d.mechanic === m)?.doc ?? FM_TARGET_DOC[m];
    if (doc) lines.push(`Steckbrief: [${doc}](${doc})`, "");
    lines.push(...localGraph(m, incoming, outgoing));
    lines.push("");

    lines.push("### Hängt ab von");
    lines.push("");
    if (incoming.length === 0) {
      // Auch das ist eine Aussage: eine Mechanik, in die nichts hineinwirkt, kann man isoliert ändern.
      lines.push("Nichts wirkt hier hinein — diese Mechanik lässt sich für sich allein betrachten.", "");
    } else {
      lines.push(...edgeTable(incoming, "Woher", (e) => e.from), "");
    }

    lines.push("### Wirkt auf");
    lines.push("");
    if (outgoing.length === 0) {
      lines.push("Nichts hängt daran — was hier passiert, bleibt hier.", "");
    } else {
      lines.push(...edgeTable(outgoing, "Wohin", (e) => e.to), "");
    }
  }
  return lines.join("\n");
}
