import { type AssertCoversAllOffenses, type OffenseCanonicalType } from "@/lib/offenseTypes";

/**
 * Welche Vergehensarten bei einem Sub überhaupt gelten — und seit wann.
 *
 * Das Strafbuch ist eine LIVE-Ableitung: es rechnet bei jeder Anzeige aus dem Bestand neu aus, was
 * ein Vergehen ist. Ein blosser Schalter am User würde deshalb rückwirkend die ganze Vergangenheit
 * umschreiben — einschalten liesse Vergehen für Handlungen erscheinen, die zu ihrer Zeit erlaubt
 * waren; ausschalten liesse bereits geahndete Vorfälle spurlos verschwinden. Darum wird nicht der
 * ZUSTAND gespeichert, sondern die ÄNDERUNG (`OffenseRuleChange`), und jede Handlung nach der
 * Fassung beurteilt, die zu IHREM Zeitpunkt galt.
 *
 * Dieselbe Lehre wie bei `cleaningWindowEnforcedFrom` in `strafbuch.ts` — dort für einen Deploy,
 * hier für eine Einstellung.
 */

/** Der Modus einer Regel. Binäre Arten kennen nur `off`/`on`; `unauthorized_orgasm` zusätzlich die
 *  beiden Reichweiten. */
export type OffenseMode = "off" | "on" | "lockedOnly" | "always";

/**
 * Zulässige Modi je Art — zugleich die Liste der SCHALTBAREN Arten.
 *
 * `manual_offense` fehlt bewusst und ist der einzige Ausreisser: ein von Hand notiertes Vergehen ist
 * ein ausdrücklicher Akt des Keyholders. Es abschaltbar zu machen hiesse, seine eigene Notiz gegen
 * ihn zu verwerfen — dafür gibt es das Urteil (`dismiss`), nicht die Regel.
 */
export const OFFENSE_RULE_MODES = {
  unauthorized_opening: ["off", "on"],
  late_control: ["off", "on"],
  rejected_control: ["off", "on"],
  auto_removed_control: ["off", "on"],
  cleaning_limit: ["off", "on"],
  wrong_device: ["off", "on"],
  missed_orgasm: ["off", "on"],
  late_lock: ["off", "on"],
  cleaning_not_relocked: ["off", "on"],
  unfulfilled_task: ["off", "on"],
  admin_password_change: ["off", "on"],
  // Dreistufig: `lockedOnly` ahndet nur, was während einer laufenden Sperrzeit passiert ist,
  // `always` jeden Orgasmus ohne offenes Fenster.
  unauthorized_orgasm: ["off", "lockedOnly", "always"],
} as const satisfies Partial<Record<OffenseCanonicalType, readonly OffenseMode[]>>;

/** Eine Art, deren Geltung eingestellt werden kann. */
export type SwitchableOffenseType = keyof typeof OFFENSE_RULE_MODES;

/** Fehlt hier eine Art, nennt der Compiler sie beim Namen — dieselbe Zusage, die die Anzeigen geben.
 *  `manual_offense` ist die einzige, die per Hand ergänzt wird, und der Grund steht oben. */
const _everyOffenseHasModes: AssertCoversAllOffenses<SwitchableOffenseType | "manual_offense"> = true;
void _everyOffenseHasModes;

/**
 * Die Fassung, die ohne jede Zeile gilt — also für jeden Bestandsnutzer und jeden Zeitpunkt vor der
 * ersten Änderung. Alles auf dem bisherigen Verhalten: die elf bisherigen Arten zählen, der neue
 * Orgasmus-Schalter ist AUS. Ein Update darf niemandem über Nacht ein Vergehen anhängen.
 */
export const OFFENSE_RULE_DEFAULT: Record<SwitchableOffenseType, OffenseMode> = {
  unauthorized_opening: "on",
  late_control: "on",
  rejected_control: "on",
  auto_removed_control: "on",
  cleaning_limit: "on",
  wrong_device: "on",
  missed_orgasm: "on",
  late_lock: "on",
  cleaning_not_relocked: "on",
  unfulfilled_task: "on",
  admin_password_change: "on",
  unauthorized_orgasm: "off",
};

export function isSwitchableOffenseType(type: string): type is SwitchableOffenseType {
  return Object.hasOwn(OFFENSE_RULE_MODES, type);
}

/** True, wenn `mode` für diese Art zulässig ist — die Prüfung für API und MCP. */
export function isValidOffenseMode(type: SwitchableOffenseType, mode: string): mode is OffenseMode {
  return (OFFENSE_RULE_MODES[type] as readonly string[]).includes(mode);
}

/** Eine Zeile aus `OffenseRuleChange` — nur die Felder, die der Resolver liest. */
export interface OffenseRuleChangeRow {
  offenseType: string;
  mode: string;
  effectiveFrom: Date;
}

/** Fragt die geltende Fassung ab: `(art, zeitpunkt) => modus`. */
export type OffenseRuleResolver = (type: SwitchableOffenseType, at: Date) => OffenseMode;

/**
 * Baut den Resolver aus den Änderungs-Zeilen eines Subs.
 *
 * Die geltende Fassung für `at` ist die jüngste Änderung mit `effectiveFrom <= at`, sonst der
 * Default. Einmal gruppieren statt je Zeile über die ganze Liste zu laufen — das Strafbuch fragt für
 * jedes einzelne Vergehen.
 *
 * Ein Modus, den diese Art nicht kennt (Handeintrag in der DB, Rückbau einer Art), zählt als
 * „keine Aussage" und fällt auf die vorherige Fassung zurück, statt still zu einem falschen Ja/Nein
 * zu werden.
 */
/**
 * Die Zeilen, die überhaupt etwas aussagen — unbekannte Art oder ein Modus, den diese Art nicht
 * kennt, zählen als „keine Aussage" statt still zu einem falschen Ja/Nein zu werden.
 *
 * Exportiert, weil der Resolver nicht der einzige Leser ist: `buildStrafbuch` entscheidet aus
 * denselben Zeilen, ob es die Orgasmus-Historie überhaupt laden muss. Beurteilte die eine Stelle
 * eine Zeile als gültig und die andere nicht, lüde sie Daten für eine Regel, die gar nicht greift.
 */
export function validOffenseRuleChanges(changes: OffenseRuleChangeRow[]): OffenseRuleChangeRow[] {
  return changes.filter((c) => {
    const ok = isSwitchableOffenseType(c.offenseType) && isValidOffenseMode(c.offenseType, c.mode);
    if (!ok) console.error(`[offenseRules] unbekannte Regel-Zeile verworfen: ${c.offenseType}=${c.mode}`);
    return ok;
  });
}

export function offenseRuleResolver(changes: OffenseRuleChangeRow[]): OffenseRuleResolver {
  const byType = new Map<string, OffenseRuleChangeRow[]>();
  for (const c of validOffenseRuleChanges(changes)) {
    const list = byType.get(c.offenseType);
    if (list) list.push(c);
    else byType.set(c.offenseType, [c]);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  }

  return (type, at) => {
    const list = byType.get(type);
    if (!list) return OFFENSE_RULE_DEFAULT[type];
    let mode: OffenseMode = OFFENSE_RULE_DEFAULT[type];
    for (const c of list) {
      if (c.effectiveFrom > at) break;
      mode = c.mode as OffenseMode;
    }
    return mode;
  };
}

/** Die aktuell geltende Fassung aller Arten — für Einstellungs-Oberfläche und MCP-Lesesicht. */
export function currentOffenseRules(changes: OffenseRuleChangeRow[], now: Date): Record<SwitchableOffenseType, OffenseMode> {
  const resolve = offenseRuleResolver(changes);
  const out = {} as Record<SwitchableOffenseType, OffenseMode>;
  for (const type of Object.keys(OFFENSE_RULE_MODES) as SwitchableOffenseType[]) {
    out[type] = resolve(type, now);
  }
  return out;
}
