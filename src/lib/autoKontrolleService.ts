import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { APP_TZ, midnightInTZ, dateAtLocalMinutes, clamp } from "@/lib/utils";
import { NO_FIELDS_TO_UPDATE, INVALID_TIME } from "@/lib/constants";
import { generateKontrollCode } from "@/lib/kontrolleService";
import { GENUINELY_WITHDRAWN_WHERE } from "@/lib/queries";

/**
 * Automatische Kontrollen: pro Tag und Sub eine ZUFÄLLIGE Anzahl `x ∈ [perDayMin, perDayMax]` zufällig
 * verteilter Kontrollen (so weiß der Sub nicht, ob am Tagesende noch eine kommt). Die FRIST darf nicht ins
 * Schlaf-Fenster (RuheVon–RuheBis, CH-Lokalzeit) fallen; die Erfüllungsdauer ist je Kontrolle zufällig
 * in [FristVon, FristBis] Minuten. Die Zeilen werden vorab als KontrollAnforderung mit Zukunfts-
 * `wirksamAb` angelegt; der bestehende Minuten-Poller verschickt sie bei Fälligkeit.
 */

export interface AutoKontrolleSettings {
  aktiv: boolean;
  perDayMin: number; // Min-Anzahl Kontrollen/Tag
  perDayMax: number; // Max-Anzahl Kontrollen/Tag (< Min → als Min behandelt)
  ruheVon: string; // "HH:MM" Schlaf-Fenster Start
  ruheBis: string; // "HH:MM" Schlaf-Fenster Ende
  fristVon: number; // min Erfüllungsdauer (Min)
  fristBis: number; // max Erfüllungsdauer (Min)
}

export type SetAutoKontrolleParams = Partial<AutoKontrolleSettings>;

/** Ein geplanter Slot auf der Tages-Achse (Instants, wie sie in der DB stehen). */
export interface AutoKontrolleSlot {
  wirksamAb: Date;
  deadline: Date;
}

/** Ein bereits in der DB liegender Slot. `sent` = dem Sub schon zugestellt ⇒ unantastbar. */
export interface PlannedAutoKontrolle extends AutoKontrolleSlot {
  id: string;
  sent: boolean;
}

const PER_DAY_RANGE = { min: 0, max: 12, fallback: 0 } as const;
const FRIST_RANGE = { min: 5, max: 240, fallback: 15 } as const;

/** Ganzzahl aus [lo, hi] (beide inklusive). */
function randomInt(rand: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** Geklemmter Min-/Max-Anzahl-Bereich pro Tag (`max` nie unter `min`). */
function perDayRange(s: AutoKontrolleSettings): { min: number; max: number } {
  const min = clamp(s.perDayMin, PER_DAY_RANGE);
  return { min, max: Math.max(min, clamp(s.perDayMax, PER_DAY_RANGE)) };
}

/** Geklemmter Erfüllungsdauer-Bereich in Minuten (`bis` nie unter `von`). */
function fristRange(s: AutoKontrolleSettings): { von: number; bis: number } {
  const von = clamp(s.fristVon, FRIST_RANGE);
  return { von, bis: Math.max(von, clamp(s.fristBis, FRIST_RANGE)) };
}

/** Wach-Fenster (Komplement des Schlaf-Fensters) als zusammenhängender Block in Wanduhr-Minuten seit
 *  Mitternacht. `end` liegt über 1440, wenn das Wach-Fenster über Mitternacht reicht. Standard
 *  22–06 ⇒ [360, 1320] = 06:00–22:00. */
function awakeWindow(s: AutoKontrolleSettings): { start: number; end: number } {
  const start = hhmmToMinutes(s.ruheBis);
  let end = hhmmToMinutes(s.ruheVon);
  if (end <= start) end += 1440;
  return { start, end };
}

/**
 * Übersetzt zwischen Plan-Minuten und Instants — die Achse, auf der geplant wird.
 *
 * Basis ist der WACH-BEGINN als lokale Wanduhr, nicht die Mitternacht des Tages. Von Mitternacht aus
 * flach Minuten zu addieren verschöbe an den Umstellungstagen das ganze Wach-Fenster um eine Stunde
 * (die Wende liegt zwischen Mitternacht und Wach-Beginn). Ab `awakeStart` bleibt die Minuten-Arithmetik
 * flach — das hält die Slots streng monoton und überlappungsfrei, auch wenn ein exotisches Wach-Fenster
 * die DST-Lücke selbst enthält. Minuten über 1439 liegen im Nach-Mitternacht-Zipfel eines über
 * Mitternacht reichenden Wach-Fensters.
 *
 * `minuteOf` ist die exakte Umkehrung von `at` — beide MÜSSEN denselben Anker teilen, sonst bilden
 * `generateAutoKontrollen` und `repairAutoKontrollen` dieselbe Minute auf Instants ab, die an einem
 * Umstellungstag eine Stunde auseinanderliegen (überlappende Slots, Frist im Schlaf-Fenster).
 */
function minuteAxis(now: Date, awakeStart: number, tz: string): { at: (m: number) => Date; minuteOf: (d: Date) => number } {
  const awakeStartMs = dateAtLocalMinutes(now, awakeStart, tz).getTime();
  return {
    at: (m) => new Date(awakeStartMs + (m - awakeStart) * 60_000),
    minuteOf: (d) => awakeStart + Math.round((d.getTime() - awakeStartMs) / 60_000),
  };
}

/** Hebt einen „Bis"-Wert auf „Von" an, falls er darunter liegt (Von-/Bis-Paar-Konsistenz). */
function raiseMaxToMin(min: number | undefined, max: number): number {
  return min !== undefined && max < min ? min : max;
}

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** "HH:MM" → Minuten seit Mitternacht (0–1439). */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Liegt die Uhrzeit (Minuten seit Mitternacht, evtl. >1440 = Folgetag) im Schlaf-Fenster? Wrap-aware:
 *  RuheVon > RuheBis (z.B. 22:00–06:00) überspannt Mitternacht. */
export function isInQuietMinutes(vonMin: number, bisMin: number, min: number): boolean {
  const m = ((min % 1440) + 1440) % 1440;
  if (vonMin === bisMin) return false; // leeres Fenster
  return vonMin < bisMin ? m >= vonMin && m < bisMin : m >= vonMin || m < bisMin;
}

/**
 * Würfelt zuerst eine Tages-Anzahl `x ∈ [perDayMin, perDayMax]` und erzeugt bis zu `x` Slots
 * `{ wirksamAb, deadline }` für den heutigen CH-Tag. Das Wach-Fenster (Komplement des Schlaf-Fensters)
 * wird in `x` gleiche Segmente geteilt; je Segment liegen Trigger UND Frist innerhalb des Segments →
 * keine Überlappung, und die Frist liegt garantiert außerhalb des Schlaf-Fensters. Nur Slots mit
 * `wirksamAb > now` werden zurückgegeben (Teiltag bei Mittags-Start). Reine Funktion (Zufall injizierbar).
 */
export function generateAutoKontrollen(
  settings: AutoKontrolleSettings,
  now: Date,
  rand: () => number = Math.random,
  tz: string = APP_TZ,
): AutoKontrolleSlot[] {
  const { min, max } = perDayRange(settings);
  if (max <= 0) return [];
  // Anzahl zufällig aus [min, max] (min == max → fixe Anzahl, wie bisher).
  const x = randomInt(rand, min, max);
  if (x <= 0) return [];
  const { von: fristVon, bis: fristBis } = fristRange(settings);

  const { start: awakeStart, end: awakeEnd } = awakeWindow(settings);
  const span = awakeEnd - awakeStart;
  if (span <= 0) return [];

  const segSize = span / x;
  const out: AutoKontrolleSlot[] = [];

  const { at: atMinute } = minuteAxis(now, awakeStart, tz);

  // In GANZZAHL-Minuten rechnen (keine Float-/Rundungs-Kanten). Trigger UND Frist bleiben im Segment
  // → keine Überlappung; die Frist wird strikt VOR awakeEnd (= Schlaf-Start) gekappt → nie im Schlaf.
  for (let i = 0; i < x; i++) {
    const segStart = awakeStart + i * segSize;
    const segEnd = awakeStart + (i + 1) * segSize;
    const dur = Math.min(randomInt(rand, fristVon, fristBis), Math.max(1, Math.floor(segSize)));
    const triggerMin = Math.ceil(segStart);
    const triggerMax = Math.min(Math.floor(segEnd - dur), awakeEnd - 1 - dur); // Frist ≤ awakeEnd−1
    if (triggerMax < triggerMin) continue; // Segment zu klein → überspringen
    const trig = randomInt(rand, triggerMin, triggerMax);
    const wirksamAb = atMinute(trig);
    const deadline = atMinute(trig + dur);
    if (wirksamAb.getTime() > now.getTime()) out.push({ wirksamAb, deadline });
  }
  return out;
}

/** Länge eines Intervalls `[start, end]`. */
const gapLen = ([start, end]: [number, number]) => end - start;

/** Freie Intervalle in `[lower, upper]` nach Abzug der belegten Slots, aufsteigend. */
function freeGaps(lower: number, upper: number, occupied: { start: number; end: number }[]): [number, number][] {
  const gaps: [number, number][] = [];
  let cursor = lower;
  for (const o of [...occupied].sort((a, b) => a.start - b.start)) {
    if (o.end <= cursor) continue;
    if (o.start > cursor) gaps.push([cursor, Math.min(o.start, upper)]);
    cursor = o.end;
    if (cursor >= upper) break;
  }
  if (cursor < upper) gaps.push([cursor, upper]);
  return gaps.filter(([a, b]) => b > a);
}

/**
 * Gleicht den BESTEHENDEN Tagesplan an geänderte Settings an, statt ihn neu zu würfeln: Slots, die die
 * neuen Settings noch erfüllen, bleiben stehen — nur die Verletzer werden ersetzt und die Tages-Anzahl
 * wieder auf `[perDayMin, perDayMax]` eingeregelt. Ohne relevante Änderung ist das Ergebnis leer, der
 * Aufrufer schreibt dann gar nichts.
 *
 * Ein Slot verletzt die Settings, wenn Trigger oder Frist im Schlaf-Fenster liegen oder die
 * Erfüllungsdauer ausserhalb von `[fristVon, fristBis]` liegt. Bereits versendete Kontrollen sind für
 * den Sub sichtbar und bleiben immer stehen; sie belegen ihren Zeitraum und zählen aufs Tages-Kontingent.
 *
 * Nachgezogen wird nur, wenn die Anzahl UNTER `perDayMin` fällt (dann bis `perDayMin`), gestrichen nur
 * über `perDayMax` (dann die spätesten noch nicht versendeten). Ein blosses Anheben von `perDayMax`
 * plant also nichts nach — die Tages-Anzahl wurde bereits gewürfelt und bleibt gültig. Neue Slots landen
 * ausschliesslich in den freien Lücken des Rest-Wachfensters, damit sie sich nicht überlappen.
 *
 * Reine Funktion (Zufall injizierbar); der Aufrufer führt `deleteIds` und `create` gegen die DB aus.
 */
export function repairAutoKontrollen(
  settings: AutoKontrolleSettings,
  existing: PlannedAutoKontrolle[],
  now: Date,
  rand: () => number = Math.random,
  tz: string = APP_TZ,
): { deleteIds: string[]; create: AutoKontrolleSlot[] } {
  const { min, max } = perDayRange(settings);
  const { start: awakeStart, end: awakeEnd } = awakeWindow(settings);
  // Abgeschaltet (oder kein Wach-Fenster) ⇒ nur die noch nicht versendeten Zeilen wegräumen.
  if (!settings.aktiv || max <= 0 || awakeEnd <= awakeStart) {
    return { deleteIds: existing.filter((e) => !e.sent).map((e) => e.id), create: [] };
  }

  const { von: fristVon, bis: fristBis } = fristRange(settings);
  // Dieselbe Achse wie `generateAutoKontrollen` — sonst liegen ersetzte und behaltene Slots an einem
  // Umstellungstag eine Stunde auseinander.
  const { at, minuteOf } = minuteAxis(now, awakeStart, tz);
  const slots = existing.map((e) => ({
    id: e.id, sent: e.sent,
    start: minuteOf(e.wirksamAb),
    end: minuteOf(e.deadline),
  }));
  const violates = (s: { start: number; end: number }) =>
    s.start < awakeStart || s.end > awakeEnd || s.end - s.start < fristVon || s.end - s.start > fristBis;

  const deleteIds = slots.filter((s) => !s.sent && violates(s)).map((s) => s.id);
  let keep = slots.filter((s) => s.sent || !violates(s));

  // Zu viele ⇒ die spätesten noch nicht versendeten streichen (die am wenigsten „feststehen").
  if (keep.length > max) {
    const dropped = new Set(
      keep.filter((s) => !s.sent).sort((a, b) => b.start - a.start).slice(0, keep.length - max).map((s) => s.id),
    );
    deleteIds.push(...dropped);
    keep = keep.filter((s) => !dropped.has(s.id));
  }

  // Zu wenige ⇒ in der grössten freien Lücke des Rest-Wachfensters nachziehen, bis keine mehr passt.
  const create: AutoKontrolleSlot[] = [];
  let gaps = freeGaps(Math.max(awakeStart, minuteOf(now) + 1), awakeEnd, keep);
  for (let i = keep.length; i < min; i++) {
    if (gaps.length === 0) break;
    const best = gaps.reduce((bi, g, gi) => (gapLen(g) > gapLen(gaps[bi]) ? gi : bi), 0);
    if (gapLen(gaps[best]) < fristVon) break; // kein Platz mehr
    const [gapStart, gapEnd] = gaps[best];
    const dur = Math.min(randomInt(rand, fristVon, fristBis), gapEnd - gapStart);
    const trig = randomInt(rand, gapStart, gapEnd - dur);
    create.push({ wirksamAb: at(trig), deadline: at(trig + dur) });
    gaps.splice(best, 1, [gapStart, trig], [trig + dur, gapEnd]);
    gaps = gaps.filter(([a, b]) => b > a);
  }
  return { deleteIds, create };
}

/** Liest die Auto-Kontroll-Settings aus einer User-Zeile. */
export function autoKontrolleSettingsFromUser(u: {
  autoKontrolleAktiv: boolean; autoKontrollePerDayMin: number; autoKontrollePerDayMax: number;
  autoKontrolleRuheVon: string; autoKontrolleRuheBis: string;
  autoKontrolleFristVon: number; autoKontrolleFristBis: number;
}): AutoKontrolleSettings {
  return {
    aktiv: u.autoKontrolleAktiv,
    perDayMin: u.autoKontrollePerDayMin,
    perDayMax: u.autoKontrollePerDayMax,
    ruheVon: u.autoKontrolleRuheVon,
    ruheBis: u.autoKontrolleRuheBis,
    fristVon: u.autoKontrolleFristVon,
    fristBis: u.autoKontrolleFristBis,
  };
}

const AUTO_USER_SELECT = {
  id: true, timezone: true, autoKontrolleAktiv: true, autoKontrollePerDayMin: true, autoKontrollePerDayMax: true,
  autoKontrolleRuheVon: true, autoKontrolleRuheBis: true,
  autoKontrolleFristVon: true, autoKontrolleFristBis: true,
} as const;

/** Legt Auto-Kontroll-Zeilen für die gegebenen Slots an (frischer Code je Zeile, benachrichtigtAt=null). */
async function createAutoKontrollen(userId: string, slots: { wirksamAb: Date; deadline: Date }[]): Promise<number> {
  if (slots.length === 0) return 0;
  await prisma.kontrollAnforderung.createMany({
    data: slots.map((s) => ({
      userId, code: generateKontrollCode(), deadline: s.deadline, wirksamAb: s.wirksamAb,
      benachrichtigtAt: null, auto: true,
    })),
  });
  return slots.length;
}

/** Würfelt den Tagesplan frisch aus und legt ihn an — für einen Tag, für den noch kein Plan existiert.
 *  Abgeschaltet (oder 0 Kontrollen/Tag) ⇒ nichts. */
function rollFreshDay(userId: string, settings: AutoKontrolleSettings, now: Date, tz: string): Promise<number> {
  if (!settings.aktiv || perDayRange(settings).max <= 0) return Promise.resolve(0);
  return createAutoKontrollen(userId, generateAutoKontrollen(settings, now, Math.random, tz));
}

/** Legt die heutigen Auto-Kontrollen für EINEN User an — idempotent: existieren schon heute (CH-Tag)
 *  angelegte Auto-Zeilen, passiert nichts. (Vom Poller, einmal pro Tag.) */
export async function ensureDailyAutoKontrollenForUser(
  userId: string, settings: AutoKontrolleSettings, now: Date, tz: string = APP_TZ,
): Promise<number> {
  if (!settings.aktiv || perDayRange(settings).max <= 0) return 0;
  const already = await prisma.kontrollAnforderung.count({
    where: { userId, auto: true, createdAt: { gte: midnightInTZ(now, tz) } },
  });
  if (already > 0) return 0;
  return rollFreshDay(userId, settings, now, tz);
}

/** Zieht den Tagesplan des LAUFENDEN Tages auf geänderte Settings nach (Settings-Änderungen wirken sofort).
 *  Existiert für heute noch gar kein Plan, wird er frisch gewürfelt; sonst gleicht `repairAutoKontrollen`
 *  den bestehenden Plan minimal an — bestehende Zeiten bleiben stehen, solange sie die neuen Settings
 *  erfüllen. Ohne relevante Änderung fällt kein einziger Schreibzugriff an. Gibt die Zahl der neu
 *  angelegten Kontrollen zurück. */
export async function replanTodayAutoKontrollenForUser(
  userId: string, settings: AutoKontrolleSettings, now: Date, tz: string = APP_TZ,
): Promise<number> {
  const rows = await prisma.kontrollAnforderung.findMany({
    where: { userId, auto: true, withdrawnAt: null, createdAt: { gte: midnightInTZ(now, tz) } },
    select: { id: true, wirksamAb: true, deadline: true, benachrichtigtAt: true },
  });
  // `createAutoKontrollen` setzt immer ein `wirksamAb`; eine Auto-Zeile ohne ist nicht planbar → ignorieren.
  const planned: PlannedAutoKontrolle[] = rows.flatMap((r) =>
    r.wirksamAb ? [{ id: r.id, wirksamAb: r.wirksamAb, deadline: r.deadline, sent: r.benachrichtigtAt !== null }] : []);

  // Für heute existiert noch gar keine Auto-Zeile (Poller lief noch nicht, oder gerade erst aktiviert)
  // → frisch würfeln. Auf `rows` prüfen, nicht auf `planned`: eine Zeile ohne `wirksamAb` ist zwar nicht
  // planbar, aber vorhanden — ein frischer Tagesplan käme obendrauf.
  if (rows.length === 0) return rollFreshDay(userId, settings, now, tz);

  const { deleteIds, create } = repairAutoKontrollen(settings, planned, now, Math.random, tz);
  if (deleteIds.length > 0) {
    await prisma.kontrollAnforderung.deleteMany({
      // `benachrichtigtAt`/`withdrawnAt` NOCHMALS im DELETE prüfen: zwischen dem `findMany` oben und
      // hier kann der Minuten-Poller eine Zeile verschickt haben. Ohne diesen Filter löschten wir eine
      // Kontrolle, deren Code dem Sub bereits per Mail/Push zugestellt wurde — unerfüllbar für ihn.
      where: { id: { in: deleteIds }, benachrichtigtAt: null, withdrawnAt: null },
    });
  }
  return createAutoKontrollen(userId, create);
}

/** Legt die heutigen Auto-Kontrollen für ALLE aktiven User an (vom Poller, einmal pro CH-Tag). */
export async function ensureDailyAutoKontrollen(now: Date): Promise<void> {
  const users = await prisma.user.findMany({ where: { autoKontrolleAktiv: true }, select: AUTO_USER_SELECT });
  for (const u of users) {
    try {
      await ensureDailyAutoKontrollenForUser(u.id, autoKontrolleSettingsFromUser(u), now, u.timezone ?? APP_TZ);
    } catch (e) {
      console.error(`[autoKontrolle] Tagesplanung fehlgeschlagen (${u.id}):`, (e as Error).message);
    }
  }
}

/** Löscht am Tageswechsel die von der Automatik zurückgezogenen Auto-Kontrollen vergangener Tage
 *  (auto + wirklich zurückgezogen, createdAt vor der heutigen Sub-Mitternacht) — reines
 *  Listen-Rauschen ohne History-Wert. Erfüllte Auto-Kontrollen (withdrawnAt null) bleiben unberührt.
 *  createdAt < heute-Mitternacht schützt die heutigen Zeilen, die der Keyholder tagsüber noch sehen darf.
 *
 *  VERSÄUMTE Kontrollen bleiben ebenfalls unberührt: die Eskalation setzt zwar auch `withdrawnAt`,
 *  aber `GENUINELY_WITHDRAWN_WHERE` klammert sie über `autoMarkedRemovedAt` aus. Ohne das löschte
 *  dieser Lauf jede versäumte Auto-Kontrolle über Nacht — mitsamt dem Vergehen, das im Strafbuch
 *  genau an dieser Zeile hängt. */
export async function deleteWithdrawnAutoKontrollen(now: Date): Promise<number> {
  // Per-User-Tag-Grenze: die "heutige Mitternacht" hängt an der Sub-Zeitzone, deshalb kann nicht ein
  // globales midnightInTZ(now) alle Zeilen filtern — sonst würde für Nicht-CH-Subs zu früh/spät gelöscht.
  const candidates = await prisma.kontrollAnforderung.findMany({
    where: { auto: true, ...GENUINELY_WITHDRAWN_WHERE },
    select: { id: true, createdAt: true, user: { select: { timezone: true } } },
  });
  const toDelete = candidates
    .filter((c) => c.createdAt < midnightInTZ(now, c.user.timezone ?? APP_TZ))
    .map((c) => c.id);
  if (toDelete.length === 0) return 0;
  const res = await prisma.kontrollAnforderung.deleteMany({ where: { id: { in: toDelete } } });
  return res.count;
}

/** Speichert die Auto-Kontroll-Settings eines Users (nur übergebene Felder; Zahlen geklemmt, HH:MM
 *  validiert, FristBis ≥ FristVon). Geteilt von PATCH /api/admin/users/[id]. */
export async function setAutoKontrolleSettings(userId: string, params: SetAutoKontrolleParams): Promise<ServiceResult<null>> {
  const data: {
    autoKontrolleAktiv?: boolean; autoKontrollePerDayMin?: number; autoKontrollePerDayMax?: number;
    autoKontrolleRuheVon?: string; autoKontrolleRuheBis?: string;
    autoKontrolleFristVon?: number; autoKontrolleFristBis?: number;
  } = {};

  if (params.aktiv !== undefined) data.autoKontrolleAktiv = Boolean(params.aktiv);
  if (params.perDayMin !== undefined) data.autoKontrollePerDayMin = clamp(params.perDayMin, PER_DAY_RANGE);
  if (params.perDayMax !== undefined) data.autoKontrollePerDayMax = clamp(params.perDayMax, PER_DAY_RANGE);
  // Ungültige Uhrzeit ist ein eigener Fehler — früher still verworfen, was sie mit dem
  // „keine Felder"-Fall vermischte und (über die Route) als Erfolg gemeldet wurde.
  if (params.ruheVon !== undefined) {
    if (!HHMM.test(params.ruheVon)) return serviceFail(400, INVALID_TIME);
    data.autoKontrolleRuheVon = params.ruheVon;
  }
  if (params.ruheBis !== undefined) {
    if (!HHMM.test(params.ruheBis)) return serviceFail(400, INVALID_TIME);
    data.autoKontrolleRuheBis = params.ruheBis;
  }
  if (params.fristVon !== undefined) data.autoKontrolleFristVon = clamp(params.fristVon, FRIST_RANGE);
  if (params.fristBis !== undefined) data.autoKontrolleFristBis = clamp(params.fristBis, FRIST_RANGE);
  // „Bis" nie unter „Von" — nur wenn beide in diesem Patch bekannt (Von-/Bis-Paare: PerDay & Frist).
  // Nur die vorhandenen Bis-Keys anfassen, sonst würde undefined den „keine Felder"-Guard aushebeln.
  if (data.autoKontrollePerDayMax !== undefined) data.autoKontrollePerDayMax = raiseMaxToMin(data.autoKontrollePerDayMin, data.autoKontrollePerDayMax);
  if (data.autoKontrolleFristBis !== undefined) data.autoKontrolleFristBis = raiseMaxToMin(data.autoKontrolleFristVon, data.autoKontrolleFristBis);

  // Leeres `data` heisst jetzt eindeutig: gar kein Feld übergeben (ungültige Uhrzeiten sind oben
  // schon als INVALID_TIME rausgeflogen).
  if (Object.keys(data).length === 0) return serviceFail(400, NO_FIELDS_TO_UPDATE);
  const user = await prisma.user.update({ where: { id: userId }, data, select: AUTO_USER_SELECT });

  // Änderung sofort auf den laufenden Tag anwenden. Der Replan ist idempotent: ändert der Patch nichts
  // an der Slot-Verteilung (z.B. reines Aktiv-Toggle bei schon geplantem Tag), bleiben die Zeiten stehen.
  await replanTodayAutoKontrollenForUser(userId, autoKontrolleSettingsFromUser(user), new Date(), user.timezone ?? APP_TZ)
    .catch((e) => console.error(`[autoKontrolle] Replan nach Settings-Änderung fehlgeschlagen (${userId}):`, (e as Error).message));
  return { ok: true, data: null };
}
