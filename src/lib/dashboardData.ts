import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { AUTO_KONTROLLE_SETTINGS_SELECT } from "@/lib/autoKontrolleService";
import { CLEANING_USER_SELECT } from "@/lib/reinigungService";
import { CLEANING_RULE_CHANGE_SELECT, cleaningRulesFrom, reinigungRulesAt } from "@/lib/cleaningRules";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { loadTelemetryKeyProof } from "@/lib/boxKeyProof";
import {
  buildKontrolleItems, buildPairs, calculateWearingHoursByRange, getOpenPair, KG_PAIR,
} from "@/lib/utils";
import { buildWearSessions } from "@/lib/sessionModel";
import { buildSessionEvents } from "@/lib/sessionHelpers";
import { effectiveOrgasmusArten, resolveOrgasmusArtDisplay } from "@/lib/reasonsService";
import { getEvaluatedTaskHistory, loadTaskProofViews } from "@/lib/taskIntervals";
import {
  aktiveKontrolleWhere, KONTROLLE_TARGET_INCLUDE,
  getActiveVorgabe, getActiveSperrzeit, getActiveWearSessions,
  getNonKgTrackingCategories, getActiveOrgasmusAnforderung, getOpenLockRequest,
} from "@/lib/queries";

/**
 * **Die Quellen der Block-Stapel — einmal je Seitenaufbau, geteilt von allen Blöcken, die sie
 * brauchen.**
 *
 * Wozu: bis hierher lud jede der vier Seiten alles in einem `Promise.all`, BEVOR der erste Block
 * entstand. Ein ausgeblendeter Block sparte damit die Übertragung, aber nicht die Abfrage —
 * konfigurierbar war die Anzeige, nicht die Arbeit. Seit Etappe B deklariert jeder Block seine
 * Daten selbst (`load(ctx)`), und die Seite ruft nur die Loader der SICHTBAREN Blöcke.
 *
 * Damit dabei nicht dreimal dieselbe Arbeit läuft, steht hier eine Schicht dazwischen: jede Quelle
 * ist mit React `cache()` pro Request memoisiert. Vorbild ist `getControllableSubsCached` in
 * `keyholder.ts`, und daher stammt auch die wichtigste Regel dieses Moduls:
 *
 * > **Argumente bleiben primitiv.** `cache()` schlägt über die IDENTITÄT der Argumente nach. Ein
 * > frisch gebautes `Date`, Array oder Objekt trifft nie denselben Eintrag — die Memoisierung
 * > liefe leer, ohne dass es jemand merkt. Deshalb reisen Zeitpunkte als `nowMs` durch.
 *
 * **Nicht nur Abfragen gehören hierher, auch Ableitungen.** Die teuren Stellen dieser Seiten sind
 * zur Hälfte gar keine Datenbank-Runden, sondern Paarungen und Summen über die ganze
 * Eintrags-Historie. Wird eine davon von zwei Blöcken gebraucht, gehört sie hierher — sonst rechnet
 * sie je Block einmal, und die Seite hat den Vorteil wieder verloren, den sie gerade gewonnen hat.
 *
 * Und die dritte Regel: **`now` wird hier nie selbst gebildet.** Es kommt aus dem Seiten-Kontext.
 * Bildete jede Quelle ihr eigenes `now`, liefen die Werte EINER Seite um Millisekunden auseinander —
 * eine Frist wäre in einem Block abgelaufen und im nächsten nicht.
 *
 * Wo zwei Sichten dieselbe Frage verschieden beantworten (der Träger sieht geplante Direktiven
 * nicht, die Keyholderin schon), bekommt EINE Umsetzung ein `audience`-Argument — eine
 * Zeichenkette und damit ein tauglicher `cache()`-Schlüssel — und darüber liegen benannte Hüllen,
 * wo der Aufrufort von der Deutlichkeit profitiert. Zwei ausgeschriebene Fassungen derselben
 * Herleitung laufen früher oder später auseinander.
 */

/**
 * Die Benutzer-Spalten, aus denen die Blöcke aller vier Oberflächen schöpfen — die Vereinigung
 * dessen, was die Seiten bisher je einzeln selektierten.
 *
 * EIN Select statt drei: die Zeile wird ohnehin von fast jeder Oberfläche gebraucht, und drei
 * Spaltenlisten für dieselbe Zeile driften auseinander, sobald eine Einstellung dazukommt.
 * `dashboardLayout` steht mit drin, damit die Konfiguration des Betrachters (`viewerLayout`) keine
 * zweite Abfrage derselben Zeile braucht.
 */
const BLOCK_USER_SELECT = {
  ...AUTO_KONTROLLE_SETTINGS_SELECT,
  ...CLEANING_USER_SELECT,
  dashboardLayout: true,
  orgasmusArtenConfig: true,
  oeffnenGruendeConfig: true,
  inspectionAutoMarkEnabled: true,
  inspectionAutoMarkDelayMinutes: true,
  inspectionReminderDelayMinutes: true,
} as const;

/** Die Benutzerzeile eines Trägers, wie die Blöcke sie sehen. */
export const userRowCached = cache(async (userId: string) =>
  prisma.user.findUnique({ where: { id: userId }, select: BLOCK_USER_SELECT }),
);

/** Die Anzeige-Namen der Orgasmus-Arten dieses Trägers — geparst, nicht je Block neu. */
export const orgasmConfigCached = cache(async (userId: string) =>
  effectiveOrgasmusArten((await userRowCached(userId))?.orgasmusArtenConfig),
);

/**
 * Alle Einträge des Trägers, **neueste zuerst** — auf diese Reihenfolge verlassen sich die
 * Ableitungen unten, statt sie noch einmal zu sortieren.
 *
 * Der Include ist die Vereinigung der bisherigen: `device.id` treibt die geräteweise Paarung,
 * `categoryId` die Kategorie-Zuordnung, `name` die Gerätenamen in den Karten. Eine Spalte mehr auf
 * einer bereits geladenen Zeile ist billiger als eine zweite Abfrage derselben Zeilen.
 */
export const entriesCached = cache(async (userId: string) =>
  prisma.entry.findMany({
    where: { userId },
    orderBy: { startTime: "desc" },
    include: { device: { select: { id: true, categoryId: true, name: true } } },
  }),
);

/** Die Orgasmus-Einträge, neueste zuerst — Session-Karte und Session-Liste stellen dieselbe Frage. */
export const orgasmEntriesCached = cache(async (userId: string) =>
  (await entriesCached(userId)).filter((e) => e.type === "ORGASMUS"),
);

/** Der jüngste KG-Eintrag — daraus liest die Seite „verschlossen seit" bzw. „geöffnet seit". */
export const latestKgEntryCached = cache(async (userId: string) =>
  (await entriesCached(userId)).find((e) => e.type === KG_PAIR.close || e.type === KG_PAIR.open) ?? null,
);

/**
 * Die Reinigungs-Regeln des Trägers: `at(zeitpunkt)` gibt die damals geltende Fassung, `rules` die
 * Form, die `buildPairs` und die Box-Karte erwarten. Begründung der Historisierung am Modell
 * `CleaningRuleChange`.
 */
export const cleaningRulesCached = cache(async (userId: string) => {
  const [changes, user] = await Promise.all([
    prisma.cleaningRuleChange.findMany({ where: { userId }, select: CLEANING_RULE_CHANGE_SELECT }),
    userRowCached(userId),
  ]);
  const at = cleaningRulesFrom(changes, user);
  return { at, rules: reinigungRulesAt(at) };
});

/** Die Kontroll-Anforderungen, die der TRÄGER sieht — zeitversetzt geplante bleiben ihm verborgen. */
export const subInspectionsCached = cache(async (userId: string, nowMs: number) =>
  prisma.kontrollAnforderung.findMany({
    where: { userId, ...aktiveKontrolleWhere(new Date(nowMs)) },
    orderBy: { createdAt: "desc" },
    // Ziel-Namen fürs Banner: die Sicht muss wissen, WAS zu zeigen ist.
    include: { entry: true, ...KONTROLLE_TARGET_INCLUDE },
  }),
);

/**
 * Die Sessions des Trägers samt der Kontroll-Punkte darin, aus SEINER Sicht.
 *
 * Die Paarung sortiert ihre Einträge selbst (`filterAndSortPairEntries`), die Eingabe-Reihenfolge
 * spielt also keine Rolle.
 */
export const subPairsCached = cache(async (userId: string, nowMs: number) => {
  const [entries, anforderungen, cleaning] = await Promise.all([
    entriesCached(userId), subInspectionsCached(userId, nowMs), cleaningRulesCached(userId),
  ]);
  const items = buildKontrolleItems(anforderungen, entries.filter((e) => e.type === "PRUEFUNG"), new Date(nowMs));
  return buildPairs(entries, items, cleaning.rules);
});

/** Der Schlüssel-Nachweis aus der Box-Telemetrie zu den Sessions der Träger-Sicht. */
export const subKeyProofCached = cache(async (userId: string, nowMs: number) =>
  loadTelemetryKeyProof(userId, await subPairsCached(userId, nowMs)),
);

/**
 * Die laufende Session samt ihrer Ereignisse — oder `null`, wenn keine läuft.
 *
 * Zwei Blöcke stellen dieselbe Frage: die grüne Karte zeigt sie, und das KG-Ziel weicht ihr aus.
 * Die Beschriftungen der Orgasmus-Arten holt die Funktion sich selbst — ein Übersetzer als Argument
 * wäre bei jedem Aufruf ein neues Objekt und träfe nie denselben `cache()`-Eintrag. Die Sprache
 * steckt dafür in `dl` und damit im Schlüssel.
 */
export const subRunningSessionCached = cache(async (userId: string, nowMs: number, dl: string) => {
  const [pairs, orgasmusEntries, telemetryKeyProof, orgasmCfg, tOrgasm] = await Promise.all([
    subPairsCached(userId, nowMs), orgasmEntriesCached(userId), subKeyProofCached(userId, nowMs),
    orgasmConfigCached(userId), getTranslations("orgasmForm"),
  ]);
  const activePair = getOpenPair(pairs);
  if (!activePair) return null;
  const events = buildSessionEvents(
    activePair, orgasmusEntries, dl, (art) => resolveOrgasmusArtDisplay(art, orgasmCfg, tOrgasm), telemetryKeyProof,
  );
  return events.length > 0 ? { activePair, events } : null;
});

/**
 * Die ausgewerteten Aufgaben eines Trägers. `kgLabel` ist die Beschriftung der KG-Bedingung — eine
 * Zeichenkette und damit als `cache()`-Argument tauglich.
 *
 * `evaluateTasks` lädt ohne Aufgaben gar nichts nach: wer keine hat, zahlt hier keinen Preis.
 */
export const evaluatedTasksCached = cache(async (userId: string, nowMs: number, kgLabel: string) => {
  const [entries, { rules }] = await Promise.all([entriesCached(userId), cleaningRulesCached(userId)]);
  return getEvaluatedTaskHistory(userId, new Date(nowMs), {
    audience: "sub", kgLabel, kgEntries: entries, wearEntries: entries, reinigung: rules,
  });
});

/**
 * Die Anzeige-Felder der Nachweise zu diesen Aufgaben — GETRENNT von der Auswertung, weil sie eine
 * eigene Abfrage kostet und nicht jeder Blick auf die Aufgaben sie braucht (die Trage-Karten fragen
 * nur, ob eine Aufgabe eine Session festhält).
 */
export const taskProofViewsCached = cache(async (userId: string, nowMs: number, kgLabel: string) =>
  loadTaskProofViews((await evaluatedTasksCached(userId, nowMs, kgLabel)).map((e) => e.task.id)),
);

/** Die aktive Trainingsvorgabe (KG) zum Zeitpunkt der Seite. */
export const activeVorgabeCached = cache((userId: string, nowMs: number) =>
  getActiveVorgabe(userId, new Date(nowMs)),
);

/** Die für den Träger wirksame Sperrzeit. */
export const subSperrzeitCached = cache((userId: string) => getActiveSperrzeit(userId));

/** Die offene Verschluss-Anforderung des Trägers (bei mehreren die dringendste). */
export const lockRequestCached = cache((userId: string, nowMs: number) =>
  getOpenLockRequest(userId, new Date(nowMs)),
);

/** Die offene Orgasmus-Anforderung des Trägers. */
export const subOrgasmRequestCached = cache((userId: string, nowMs: number) =>
  getActiveOrgasmusAnforderung(userId, new Date(nowMs)),
);

/**
 * Die laufenden Trage-Sessions der Geräte-Kategorien.
 *
 * Der Feature-Schalter steckt hier, damit die Abfrage bei abgeschalteter Kategorie-Funktion gar
 * nicht erst läuft. **Er ersetzt die Prüfung am Aufrufort nicht:** eine leere Liste heisst „keine
 * Kategorien", und das ist etwas anderes als „die Funktion gibt es nicht" — ein Block, der aus dem
 * Unterschied etwas ableitet (die Werbe-Karte tut es), muss weiter selbst fragen.
 */
export const activeWearSessionsCached = cache(async (userId: string) =>
  deviceCategoriesEnabled() ? getActiveWearSessions(userId) : [],
);

/** Die Kategorien, in denen gerade etwas getragen wird — zwei Blöcke stellen diese Frage. */
export const activeWearCategoryIdsCached = cache(async (userId: string) =>
  new Set((await activeWearSessionsCached(userId)).map((s) => s.categoryId)),
);

/** Die Nicht-KG-Kategorien mit Tracking, samt Gerätezahl. Feature-Schalter wie oben. */
export const trackingCategoriesCached = cache(async (userId: string) =>
  deviceCategoriesEnabled() ? getNonKgTrackingCategories(userId) : [],
);

/** Alle Trage-Sessions aus den Einträgen (je Gerät gepaart) — Zeilen-Liste und Stunden je Kategorie. */
export const wearSessionsCached = cache(async (userId: string, nowMs: number) =>
  buildWearSessions(await entriesCached(userId), new Date(nowMs)),
);

/**
 * Die KG-Wanduhrstunden in Tag/Woche/Monat/Jahr.
 *
 * Gecacht, weil es keine Abfrage ist und trotzdem teuer: die Rechnung paart die GANZE Historie und
 * summiert sie viermal. Drei Blöcke fragen danach.
 */
export const wearingHoursCached = cache(async (userId: string, nowMs: number, tz: string) =>
  calculateWearingHoursByRange(await entriesCached(userId), new Date(nowMs), tz),
);

/** Hat der Träger überhaupt Geräte? Entscheidet, ob Karten das getragene Gerät benennen. */
export const deviceCountCached = cache((userId: string) =>
  prisma.device.count({ where: { userId, archivedAt: null } }),
);
