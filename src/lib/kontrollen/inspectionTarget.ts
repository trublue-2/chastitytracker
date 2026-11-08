import { prisma } from "@/lib/prisma";
import { getLatestKgEntry, getActiveWearSessionForCategory, getActiveWearSessions, getIsLocked, type PrismaTx } from "@/lib/queries";
import { deviceCategoriesEnabled } from "@/lib/constants";

/**
 * Das ZIEL einer Kontrolle — der KG oder eine Trage-Kategorie (v5.0.1).
 *
 * Bis v5.0.0 gab es nur ein Ziel: den KG am aktiven VERSCHLUSS. Seit Kontrollen auch auf
 * Trage-Kategorien zeigen können („zeig mir den Plug"), braucht jede Stelle, die eine Kontrolle
 * anlegt, ausliefert, erfüllt oder eskaliert, dieselbe Antwort auf zwei Fragen: *welches Gerät ist
 * für dieses Ziel gerade zuständig* und *ist das Ziel überhaupt aktiv*. Genau das steht hier — EIN
 * Resolver für alle, statt „verschlossen?" an der einen und „getragen?" an der nächsten Stelle.
 *
 * Die Darstellung in der Zeile (`KontrollAnforderung.categoryId`/`deviceId`) ist bewusst schmal:
 * - `categoryId === null` heisst KG. Auch dann, wenn der Keyholder die (umbenennbare, aber per
 *   `isBuiltIn` erkennbare) KG-Kategorie ausdrücklich angibt — sie wird hier auf null normalisiert,
 *   damit es nur EINE Darstellung des KG-Ziels gibt und Altzeilen dazu passen.
 * - `deviceId` verengt das Ziel auf genau ein Gerät („DIESER Knebel", „der Stahl-KG") und hat
 *   Vorrang; ohne es erfüllt jedes Gerät des Ziels. Dieselbe Kategorie/Gerät-Staffelung wie bei
 *   TaskRequirement.
 */

export interface InspectionTargetInput {
  /** Kategorie-Ziel. Fehlt/null = KG. Die eingebaute KG-Kategorie wird auf null normalisiert. */
  categoryId?: string | null;
  /** Verengung auf genau ein Gerät. Leitet die Kategorie selbst ab — `categoryId` ist dann optional. */
  deviceId?: string | null;
}

export interface ResolvedInspectionTarget {
  /** null = KG. Sonst die Trage-Kategorie, auf die die Kontrolle zielt. */
  categoryId: string | null;
  /** Ans Ziel gepinntes Gerät, oder null = jedes Gerät des Ziels erfüllt. */
  deviceId: string | null;
  /** Anzeigename der Kategorie (null beim KG — dort benennen die Aufrufer das Ziel selbst). */
  categoryName: string | null;
  /** Anzeigename des gepinnten Geräts, sonst null. */
  deviceName: string | null;
  /** Läuft das Ziel gerade? KG: aktiver VERSCHLUSS. Kategorie: laufende WEAR-Session. */
  active: boolean;
  /** Das Gerät, das gerade verschlossen bzw. getragen wird — die Quelle der Code-Pflicht
   *  ({@link inspectionCodeRequired}). null, wenn das Ziel nicht aktiv ist oder der Eintrag kein
   *  Gerät trägt (Alt-Verschluss). */
  activeDeviceId: string | null;
  /** Nur beim KG: der letzte KG-Eintrag, aus dem die Siegel-Nummer stammt (`deriveSealCode`).
   *  Bei Kategorie-Zielen null — die Siegel-Nummer beweist, dass die Schlüsselbox unberührt ist,
   *  und das ist reine KG-Semantik. */
  lockEntry: Awaited<ReturnType<typeof getLatestKgEntry>>;
}

export type ResolveInspectionTargetResult =
  | { ok: true; target: ResolvedInspectionTarget }
  | { ok: false; code: "INSPECTION_TARGET_INVALID" };

/** True, wenn dieses Ziel der KG ist — die eine Stelle, an der die Bedeutung von `categoryId: null`
 *  festgeschrieben ist. Nimmt sowohl ein aufgelöstes Ziel als auch eine rohe Zeile. */
export function isKgTarget(target: { categoryId: string | null }): boolean {
  return target.categoryId === null;
}

/**
 * Löst ein Ziel auf: prüft Zugehörigkeit, normalisiert den KG-Fall und ermittelt den aktuellen
 * Zustand des Ziels. Dieselbe Funktion für BEIDE Richtungen — beim Anlegen einer Kontrolle (aus
 * den Wünschen des Keyholders) und beim Lesen einer bestehenden Zeile (aus ihren Spalten): dass
 * eine gespeicherte Zeile anders interpretiert wird als beim Anlegen, kann so nicht passieren.
 *
 * In einer Transaktion IMMER `client` durchreichen — sonst liest der Zustands-Teil ausserhalb
 * (TOCTOU: die Session könnte zwischen Prüfung und Anlegen enden).
 *
 * `INSPECTION_TARGET_INVALID` heisst: die Kategorie bzw. das Gerät gehört diesem Sub nicht, ist
 * archiviert oder existiert nicht mehr. NICHT gemeint ist „Ziel gerade nicht aktiv" — das steht in
 * `active` und ist die Entscheidung des Aufrufers (das Anlegen lehnt es ab, das Lesen nicht).
 */
export async function resolveInspectionTarget(
  userId: string,
  input: InspectionTargetInput,
  client: PrismaTx | typeof prisma = prisma,
): Promise<ResolveInspectionTargetResult> {
  const pinnedDeviceId = input.deviceId ?? null;
  let categoryId = input.categoryId ?? null;
  let categoryName: string | null = null;
  let deviceName: string | null = null;

  if (pinnedDeviceId) {
    const device = await client.device.findUnique({
      where: { id: pinnedDeviceId },
      select: {
        userId: true, name: true, archivedAt: true,
        category: { select: { id: true, name: true, isBuiltIn: true } },
      },
    });
    if (!device || device.userId !== userId || device.archivedAt) {
      return { ok: false, code: "INSPECTION_TARGET_INVALID" };
    }
    // Das Gerät bestimmt die Kategorie — ein mitgeschicktes `categoryId` kann ihr nicht
    // widersprechen, weil es hier gar nicht erst gelesen wird.
    const builtIn = device.category?.isBuiltIn ?? false;
    categoryId = builtIn ? null : device.category?.id ?? null;
    categoryName = builtIn ? null : device.category?.name ?? null;
    deviceName = device.name;
  } else if (categoryId) {
    const category = await client.deviceCategory.findUnique({
      where: { id: categoryId },
      select: { userId: true, name: true, isBuiltIn: true },
    });
    if (!category || category.userId !== userId) {
      return { ok: false, code: "INSPECTION_TARGET_INVALID" };
    }
    categoryId = category.isBuiltIn ? null : categoryId;
    categoryName = category.isBuiltIn ? null : category.name;
  }

  if (categoryId === null) {
    const lockEntry = await getLatestKgEntry(userId, client);
    const locked = lockEntry?.type === "VERSCHLUSS";
    return {
      ok: true,
      target: {
        categoryId: null, deviceId: pinnedDeviceId, categoryName: null, deviceName,
        active: locked, activeDeviceId: locked ? lockEntry.deviceId : null, lockEntry,
      },
    };
  }

  const session = await getActiveWearSessionForCategory(userId, categoryId, client);
  return {
    ok: true,
    target: {
      categoryId,
      deviceId: pinnedDeviceId,
      categoryName: categoryName ?? session?.categoryName ?? null,
      deviceName,
      active: session !== null,
      activeDeviceId: session?.deviceId ?? null,
      lockEntry: null,
    },
  };
}

/**
 * Welche Anforderungen kann eine Einreichung auf diesem Ziel erfüllen? Als Where-Fragment, weil die
 * Zuordnung in der entries-Route genau eine Zeile SUCHT — eine pure Vergleichsfunktion daneben wäre
 * eine zweite Formulierung derselben Regel, und die live laufende wäre die ungetestete.
 *
 * Die Regel verhindert, dass ein Plug-Foto eine KG-Kontrolle abhakt (und umgekehrt): die Kategorie
 * muss übereinstimmen (`null` = KG), und ein ans Gerät gepinntes Ziel erfüllt nur genau dieses
 * Gerät. Als `AND` genestet, damit ein `OR` des Aufrufers (z.B. `aktiveKontrolleWhere`) daneben
 * bestehen bleibt.
 */
export function inspectionTargetWhere(
  target: { categoryId: string | null },
  submissionDeviceId: string | null,
): { categoryId: string | null; AND: { OR: { deviceId: string | null }[] }[] } {
  return {
    categoryId: target.categoryId,
    AND: [{ OR: [{ deviceId: null }, { deviceId: submissionDeviceId }] }],
  };
}

/**
 * Der Anzeigename eines Ziels: gepinntes Gerät vor Kategorie, KG = `kgLabel` (Vorgabe `null`, weil
 * die meisten Sichten beim KG bewusst gar kein Label zeigen — „die Kontrolle" ohne Zusatz).
 *
 * Nimmt sowohl eine geladene Zeile (`category`/`device`-Relationen) als auch ein aufgelöstes Ziel
 * (`categoryName`/`deviceName`) — es ist dieselbe Rangfolge, und getrennte Helfer für die zwei
 * Formen wären genau die Drift, die sie vermeiden soll.
 */
export function inspectionTargetLabel(
  t: {
    category?: { name: string } | null; device?: { name: string } | null;
    categoryName?: string | null; deviceName?: string | null;
  } | null,
  kgLabel: string | null = null,
): string | null {
  if (!t) return kgLabel;
  return t.device?.name ?? t.deviceName ?? t.category?.name ?? t.categoryName ?? kgLabel;
}

/** Ein Ziel, auf das JETZT eine Kontrolle gestellt werden kann. `categoryId: null` = KG. */
export interface InspectionTargetOption {
  categoryId: string | null;
  /** Kategorie-Name; beim KG null (die UI setzt dort ihren eigenen Text ein). */
  categoryName: string | null;
  /** Das gerade verschlossene/getragene Gerät — Grundlage für „genau dieses Gerät verlangen". */
  deviceId: string | null;
  deviceName: string | null;
}

/**
 * Die Ziele, die JETZT erfüllbar wären: der KG, wenn der Sub verschlossen ist, plus jede laufende
 * Trage-Session. EINE Quelle für die Auswahl im Formular (`/api/admin/inspection-targets`) und für
 * die Frage „lohnt sich der Einstieg überhaupt?" der Keyholder-Seiten (`.length > 0`) — vorher
 * stand dieselbe Menge viermal da, und das Kategorien-Feature-Flag nur in einer davon.
 *
 * Kein Zustand, nur Vorschläge: verbindlich prüft `requestKontrolle` beim Anlegen (das Ziel muss
 * dann laufen). Zwischen Anzeige und Absenden kann sich das ändern.
 */
export async function listInspectionTargets(userId: string): Promise<InspectionTargetOption[]> {
  const [isLocked, wearSessions] = await Promise.all([
    getIsLocked(userId),
    deviceCategoriesEnabled() ? getActiveWearSessions(userId) : Promise.resolve([]),
  ]);
  return [
    ...(isLocked ? [{ categoryId: null, categoryName: null, deviceId: null, deviceName: null }] : []),
    ...wearSessions.map((s) => ({
      categoryId: s.categoryId, categoryName: s.categoryName,
      deviceId: s.deviceId, deviceName: s.deviceName,
    })),
  ];
}

/**
 * Die Vorbedingungen einer Kontroll-Anforderung als EINE Entscheidung: der Fehlercode, an dem sie
 * scheitern würde, oder `undefined`. Geteilt vom echten Anlegen (`requestKontrolle`) und der
 * MCP-dryRun-Vorschau — eine nachgebaute Kaskade dort meldete sonst „ok" für einen Aufruf, der
 * scheitert, also genau den Fehler, gegen den es den dryRun gibt.
 */
export function inspectionPreconditionProblem(
  target: ResolvedInspectionTarget | null,
  hasActive: boolean,
): "INSPECTION_TARGET_INVALID" | "USER_NOT_LOCKED" | "USER_NOT_WEARING" | "INSPECTION_DEVICE_NOT_ACTIVE" | "INSPECTION_ALREADY_ACTIVE" | undefined {
  if (!target) return "INSPECTION_TARGET_INVALID";
  // Das Ziel muss LAUFEN — sonst gäbe es nichts zu zeigen. Beim KG heisst das verschlossen, bei
  // einer Kategorie: die Trage-Session läuft gerade.
  if (!target.active) return isKgTarget(target) ? "USER_NOT_LOCKED" : "USER_NOT_WEARING";
  // „Zeig mir DIESES Gerät" verlangt, dass es auch das getragene ist — sonst liesse sich die
  // Kontrolle mit einem anderen Gerät derselben Kategorie beantworten.
  if (target.deviceId && target.deviceId !== target.activeDeviceId) return "INSPECTION_DEVICE_NOT_ACTIVE";
  return hasActive ? "INSPECTION_ALREADY_ACTIVE" : undefined;
}
