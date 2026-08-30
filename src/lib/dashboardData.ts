import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { AUTO_KONTROLLE_SETTINGS_SELECT } from "@/lib/autoKontrolleService";
import { CLEANING_USER_SELECT } from "@/lib/reinigungService";
import { weightTrackingEnabled } from "@/lib/constants";
import { CLEANING_RULE_CHANGE_SELECT, cleaningRulesFrom, reinigungRulesAt } from "@/lib/cleaningRules";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { loadTelemetryKeyProof } from "@/lib/boxKeyProof";
import {
  buildKontrolleItems, buildKgWearPairs, buildPairs, calculateWearingHoursByRange,
  completedPairsFrom, getOpenPair, KG_PAIR, pairDurationMs, tzDayKey,
} from "@/lib/utils";
import { buildWearSessions, wearHourPairsByCategory } from "@/lib/sessionModel";
import { buildDailyData } from "@/lib/statsBuilders";
import { buildStrafbuch } from "@/lib/strafbuch";
import { buildSessionEvents } from "@/lib/sessionHelpers";
import { effectiveOrgasmusArten, resolveOrgasmusArtDisplay } from "@/lib/reasonsService";
import { belongsOnDashboard, getEvaluatedTaskHistory, loadTaskProofViews } from "@/lib/taskIntervals";
import { toTaskCard } from "@/lib/taskView";
import { buildWearSessionRows } from "@/lib/wearSessionRows";
import { isKgVorgabe } from "@/lib/vorgaben";
import {
  CATEGORY_LIST_ORDER, aktiveKontrolleWhere, keyholderVisibleKontrolleWhere, KONTROLLE_TARGET_INCLUDE,
  getActiveVorgabe, getActiveLockPeriod, getKeyholderLockPeriod, getActiveWearSessions,
  getNonKgTrackingCategories, getActiveOrgasmusAnforderung, getKeyholderOrgasmusAnforderung,
  getOpenLockRequest,
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
  username: true,
  orgasmusArtenConfig: true,
  oeffnenGruendeConfig: true,
  inspectionAutoMarkEnabled: true,
  inspectionAutoMarkDelayMinutes: true,
  inspectionReminderDelayMinutes: true,
  // Für den Umstellungs-Hinweis (`ChangeoverNoticeGate`). Steht MIT drin aus demselben Grund wie
  // `dashboardLayout`: die Zeile wird ohnehin geladen, eine zweite Abfrage dafür kostete
  // gemessene ~215 µs auf dem kritischen Pfad, die Spalte kostet nichts.
  noticeSeenVersion: true,
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

/**
 * Gibt es überhaupt eine Gewichts-Messung?
 *
 * Nur für den Leer-Zustand der Statistik-Seite: „keine Einträge" hiess bis zum Gewichtstracking
 * auch „nichts zu zeigen". Wer nur sein Gewicht führt und nie etwas verschlossen hat, hat sehr wohl
 * eine Statistik — ohne diese Frage verschwände seine Karte hinter einem leeren Zustand.
 *
 * Ein `count` statt der Reihe: die Frage lautet „gibt es etwas", nicht „was". Sie läuft ohnehin nur
 * in dem seltenen Fall, in dem gar keine Einträge existieren.
 */
export const hasWeightDataCached = cache(async (userId: string) =>
  // Führt die Instanz das Feature gar nicht, gibt es auch nichts zu zählen.
  weightTrackingEnabled() && (await prisma.weightEntry.count({ where: { userId } })) > 0,
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

/**
 * Wessen Sicht auf dieselbe Sache. Reist als Zeichenkette und ist damit ein tauglicher
 * `cache()`-Schlüssel — deshalb steht unter jeder dieser Fragen EINE Umsetzung und nicht zwei
 * ausgeschriebene Fassungen, die beim nächsten Eingriff auseinanderlaufen.
 */
export type BlockAudience = "sub" | "keyholder";

const inspectionsOf = cache(async (userId: string, nowMs: number, audience: BlockAudience) =>
  prisma.kontrollAnforderung.findMany({
    where: {
      userId,
      ...(audience === "sub" ? aktiveKontrolleWhere(new Date(nowMs)) : keyholderVisibleKontrolleWhere(new Date(nowMs))),
    },
    orderBy: { createdAt: "desc" },
    // Ziel-Namen fürs Banner: die Sicht muss wissen, WAS zu zeigen ist.
    include: { entry: true, ...KONTROLLE_TARGET_INCLUDE },
  }),
);

/**
 * Die dem TRÄGER sichtbaren Anforderungen, OHNE dass der Aufrufer einen Zeitpunkt nennen muss.
 *
 * `inspectionsOf` ist auf `nowMs` memoisiert — zwei Aufrufer mit zwei `Date.now()` treffen also
 * nie denselben Eintrag und lösen zwei identische Abfragen aus. Genau das passierte, als der
 * (+)-Knopf im Layout die offene Anforderung brauchte: dieselbe `findMany` mit denselben Includes
 * lief pro Dashboard-Aufruf zweimal.
 *
 * `cache()` um die Zeit herum löst es: der erste Aufrufer je Anfrage legt den Zeitpunkt fest, alle
 * weiteren erben ihn. Wer einen BESTIMMTEN Zeitpunkt braucht (Tests, Rückdatierung), ruft weiter
 * `subVisibleInspectionsCached` direkt — die Wahl bleibt, sie ist nur nicht mehr die Vorgabe.
 */
const requestNowMs = cache(() => Date.now());
export const subVisibleInspectionsNow = (userId: string) =>
  subVisibleInspectionsCached(userId, requestNowMs());

/**
 * Die Kontroll-Anforderungen, die dem TRÄGER sichtbar sind — zeitversetzt geplante bleiben verborgen.
 *
 * „Sub-sichtbar" beschreibt den INHALT, nicht den Betrachter: die Statistik zeigt diese Auswahl
 * auch der Keyholderin, weil sie dort dieselbe Geschichte erzählt.
 */
export const subVisibleInspectionsCached = (userId: string, nowMs: number) =>
  inspectionsOf(userId, nowMs, "sub");

/** Dieselbe Liste in KEYHOLDER-Sicht — sie sieht auch, was sie für später geplant hat. */
export const keyholderInspectionsCached = (userId: string, nowMs: number) =>
  inspectionsOf(userId, nowMs, "keyholder");

/**
 * Die Sessions samt der Kontroll-Punkte darin — `items` ist der Zeitstrahl, `pairs` die Paarung.
 *
 * Der Unterschied zwischen den beiden Sichten sind allein die Kontrollen: der Träger sieht die
 * geplanten nicht. Die Paarung sortiert ihre Einträge selbst (`filterAndSortPairEntries`), die
 * Eingabe-Reihenfolge spielt also keine Rolle.
 */
const pairsOf = cache(async (userId: string, nowMs: number, audience: BlockAudience) => {
  const [entries, anforderungen, cleaning] = await Promise.all([
    entriesCached(userId), inspectionsOf(userId, nowMs, audience), cleaningRulesCached(userId),
  ]);
  const items = buildKontrolleItems(anforderungen, entries.filter((e) => e.type === "PRUEFUNG"), new Date(nowMs));
  return { items, pairs: buildPairs(entries, items, cleaning.rules) };
});

/** Die Sessions aus Sicht des Trägers. */
export const subPairsCached = (userId: string, nowMs: number) => pairsOf(userId, nowMs, "sub");

/** Dieselben aus Sicht der Keyholderin — mit den Kontrollen, die nur sie sieht. */
export const keyholderPairsCached = (userId: string, nowMs: number) => pairsOf(userId, nowMs, "keyholder");

const keyProofOf = cache(async (userId: string, nowMs: number, audience: BlockAudience) =>
  loadTelemetryKeyProof(userId, (await pairsOf(userId, nowMs, audience)).pairs),
);

/** Der Schlüssel-Nachweis aus der Box-Telemetrie zu den Sessions der Träger-Sicht. */
export const subKeyProofCached = (userId: string, nowMs: number) => keyProofOf(userId, nowMs, "sub");

/** Derselbe Nachweis zur Keyholder-Sicht — sie soll dieselben Pillen sehen wie er. */
export const keyholderKeyProofCached = (userId: string, nowMs: number) => keyProofOf(userId, nowMs, "keyholder");

/**
 * Die laufende Session samt ihrer Ereignisse — oder `null`, wenn keine läuft.
 *
 * Zwei Blöcke stellen dieselbe Frage: die grüne Karte zeigt sie, und das KG-Ziel weicht ihr aus.
 * Die Beschriftungen der Orgasmus-Arten holt die Funktion sich selbst — ein Übersetzer als Argument
 * wäre bei jedem Aufruf ein neues Objekt und träfe nie denselben `cache()`-Eintrag. Die Sprache
 * steckt dafür in `dl` und damit im Schlüssel.
 *
 * `null` heisst „keine laufende Session". Ob eine EREIGNISLOSE Session noch eine Karte verdient,
 * entscheidet der Block: der Träger zeigt dann nichts, die Keyholderin ihren Status-Balken.
 */
const runningSessionOf = cache(async (userId: string, nowMs: number, dl: string, audience: BlockAudience) => {
  const [{ pairs }, orgasmusEntries, telemetryKeyProof, orgasmCfg, tOrgasm] = await Promise.all([
    pairsOf(userId, nowMs, audience), orgasmEntriesCached(userId), keyProofOf(userId, nowMs, audience),
    orgasmConfigCached(userId), getTranslations("orgasmForm"),
  ]);
  const activePair = getOpenPair(pairs);
  if (!activePair) return null;
  return {
    activePair,
    events: buildSessionEvents(
      activePair, orgasmusEntries, dl, (art) => resolveOrgasmusArtDisplay(art, orgasmCfg, tOrgasm), telemetryKeyProof,
    ),
  };
});

/** Die laufende Session in Träger-Sicht. */
export const subRunningSessionCached = (userId: string, nowMs: number, dl: string) =>
  runningSessionOf(userId, nowMs, dl, "sub");

/** Dieselbe in Keyholder-Sicht — mit den Kontroll-Punkten, die nur sie sieht. */
export const keyholderRunningSessionCached = (userId: string, nowMs: number, dl: string) =>
  runningSessionOf(userId, nowMs, dl, "keyholder");

/**
 * Die ausgewerteten Aufgaben eines Trägers. `kgLabel` ist die Beschriftung der KG-Bedingung — eine
 * Zeichenkette und damit als `cache()`-Argument tauglich.
 *
 * `audience` hat bewusst KEINEN Vorgabewert: `cache()` schlägt über die tatsächlich ÜBERGEBENEN
 * Argumente nach, nicht über die aufgefüllten. Ein Aufruf mit drei und einer mit vier Argumenten
 * landen auf verschiedenen Einträgen — auch wenn der vierte genau der Vorgabewert ist. Die
 * Auswertung liefe dann zweimal, und niemandem fiele es auf.
 *
 * `evaluateTasks` lädt ohne Aufgaben gar nichts nach: wer keine hat, zahlt hier keinen Preis.
 */
export const evaluatedTasksCached = cache(async (userId: string, nowMs: number, kgLabel: string, audience: BlockAudience) => {
  const [entries, { rules }] = await Promise.all([entriesCached(userId), cleaningRulesCached(userId)]);
  return getEvaluatedTaskHistory(userId, new Date(nowMs), {
    audience, kgLabel, kgEntries: entries, wearEntries: entries, reinigung: rules,
  });
});

/**
 * Die Anzeige-Felder der Nachweise zu diesen Aufgaben — GETRENNT von der Auswertung, weil sie eine
 * eigene Abfrage kostet und nicht jeder Blick auf die Aufgaben sie braucht (die Trage-Karten fragen
 * nur, ob eine Aufgabe eine Session festhält).
 */
export const taskProofViewsCached = cache(async (userId: string, nowMs: number, kgLabel: string, audience: BlockAudience) =>
  loadTaskProofViews((await evaluatedTasksCached(userId, nowMs, kgLabel, audience)).map((e) => e.task.id)),
);

/**
 * Die Aufgaben-Karten einer Seite: oben, was JETZT ansteht, unten der ganze Bestand.
 *
 * Beide Oberflächen teilen sich diese Herleitung, weil sie dieselbe ist — bis auf zwei Dinge, und
 * beide hängen an `audience`: die Keyholderin sieht auch, was sie für später geplant hat, und sie
 * bekommt KEINE Deep-Links, denn es sind nicht ihre Formulare (was sie tun kann, hängt
 * `KeyholderTaskCard` an).
 */
export const taskCardsCached = cache(async (userId: string, nowMs: number, kgLabel: string, audience: BlockAudience) => {
  const [evaluated, proofViews] = await Promise.all([
    evaluatedTasksCached(userId, nowMs, kgLabel, audience),
    taskProofViewsCached(userId, nowMs, kgLabel, audience),
  ]);
  const card = (e: (typeof evaluated)[number], withLinks: boolean) =>
    toTaskCard(e, withLinks, proofViews.get(e.task.id) ?? []);
  return {
    // Nächste Frist zuerst (die Liste kommt absteigend, also umdrehen) — was am dringendsten ist,
    // steht zuoberst.
    open: evaluated.filter((e) => belongsOnDashboard(e, new Date(nowMs))).reverse().map((e) => card(e, audience === "sub")),
    // Die Liste ist die ARCHIV-Sicht: keine Deep-Links, denn die Formulare stehen an den Karten oben.
    all: evaluated.map((e) => card(e, false)),
  };
});

/** Die Zeilen der Trage-Sessions — beide Oberflächen zeigen dieselbe Liste, ohne jeden Unterschied. */
export const wearSessionRowsCached = cache(async (userId: string, nowMs: number, dl: string) => {
  const [categories, sessionList, entries] = await Promise.all([
    trackingCategoriesCached(userId), wearSessionsCached(userId, nowMs), entriesCached(userId),
  ]);
  return buildWearSessionRows(categories, sessionList, dl, entries);
});

/** Was die Session-Liste braucht — dieselben fünf Quellen, nur je Sicht die passende Paarung. */
export const sessionListDataCached = cache(async (userId: string, nowMs: number, audience: BlockAudience) => {
  const [{ pairs }, orgasmusEntries, telemetryKeyProof, user, deviceCount] = await Promise.all([
    pairsOf(userId, nowMs, audience), orgasmEntriesCached(userId), keyProofOf(userId, nowMs, audience),
    userRowCached(userId), deviceCountCached(userId),
  ]);
  return { pairs, orgasmusEntries, telemetryKeyProof, user, deviceCount };
});

/** Die aktive Trainingsvorgabe (KG) zum Zeitpunkt der Seite. */
export const activeVorgabeCached = cache((userId: string, nowMs: number) =>
  getActiveVorgabe(userId, new Date(nowMs)),
);

/** Die für den Träger wirksame Sperrzeit. */
export const subLockPeriodCached = cache((userId: string) => getActiveLockPeriod(userId));

/** Die Sperrzeit in Keyholder-Sicht — auch eine erst GEPLANTE, damit sie sie zurückziehen kann. */
export const keyholderLockPeriodCached = cache((userId: string) => getKeyholderLockPeriod(userId));

/** Die offene Verschluss-Anforderung des Trägers (bei mehreren die dringendste). */
export const lockRequestCached = cache((userId: string, nowMs: number) =>
  getOpenLockRequest(userId, new Date(nowMs)),
);

/** Die offene Orgasmus-Anforderung des Trägers. */
export const subOrgasmRequestCached = cache((userId: string, nowMs: number) =>
  getActiveOrgasmusAnforderung(userId, new Date(nowMs)),
);

/** Dieselbe in Keyholder-Sicht — auch eine geplante oder abgelaufene bleibt ihr sichtbar. */
export const keyholderOrgasmRequestCached = cache((userId: string) =>
  getKeyholderOrgasmusAnforderung(userId),
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

// ── Quellen der Statistik-Oberflächen ────────────────────────────────────────────────────────
//
// Die Statistik ist fast reine Ableitung: dieselbe Paarung, dieselben Tages-Karten und dieselbe
// Stundenrechnung tragen je drei bis fünf Blöcke. Ohne diese Schicht rechnete jeder Block sie
// selbst — und die Seite hätte den Vorteil wieder verloren, den Etappe B ihr verschafft.

/**
 * Dieselben Einträge aufsteigend — die Reihenfolge, in der die Statistik sie erwartet
 * (`activeEntry` nimmt dort den LETZTEN Verschluss der Liste).
 *
 * Sortiert statt umgedreht: `reverse()` auf einer absteigenden Liste kehrt auch die Reihenfolge
 * gleichzeitiger Einträge um, und genau daran hängt diese Auswahl.
 */
export const entriesAscCached = cache(async (userId: string) =>
  [...(await entriesCached(userId))].sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
);

/**
 * Die Sessions OHNE Kontroll-Punkte — die Paarung, auf der die Statistik rechnet.
 *
 * Sie rechnet mit Dauern, nicht mit Zeitstrahlen; die Kontrollen führt sie als eigene Liste. Eine
 * Paarung mit Punkten wäre dort dieselbe Zahl bei mehr Arbeit.
 *
 * Alle Paare, nicht nur die abgeschlossenen: die Geräte-Nutzung braucht auch die laufende Session
 * und reicht das Ergebnis als `prePairs` an `buildSessions` weiter, statt dieselbe Paarung ein
 * zweites Mal zu bauen.
 */
export const kgPairsCached = cache(async (userId: string) => {
  const [entries, cleaning] = await Promise.all([entriesCached(userId), cleaningRulesCached(userId)]);
  return buildPairs(entries, [], cleaning.rules);
});

/**
 * **Die Zählweise der Tragezeiten** — eine Stelle für beide Karten, die sie nennen.
 *
 * `sessions` zählt ALLE Paare, die laufende mit: gefragt ist, wie oft er getragen hat, und das
 * hört nicht auf, weil es gerade noch andauert. `totalMs` summiert nur, was abgeschlossen ist
 * (eine laufende Session hat noch keine Dauer), und zwar OHNE die Untergrenze aus
 * `completedPairsFrom` — eine Session, die rechnerisch bei null landet, ist trotzdem passiert.
 *
 * Bis v5.3.1 zählten die Keyholder-Übersicht und die Statistik-Seite verschieden und nannten für
 * denselben Träger zwei Zahlen. Die Übersicht hatte recht; ihre Zählweise steht jetzt hier.
 * Die REKORDE bleiben davon unberührt — dort wäre eine Session ohne Dauer als „kürzeste" Unsinn.
 */
export const wearCountsCached = cache(async (userId: string) => {
  const pairs = await kgPairsCached(userId);
  const closed = pairs.filter((p) => p.oeffnen);
  const totalMs = closed.reduce(
    (sum, p) => sum + pairDurationMs({ verschluss: p.verschluss, oeffnen: p.oeffnen!, interruptions: p.interruptions }),
    0,
  );
  return {
    sessions: pairs.length,
    closed: closed.length,
    totalMs,
    avgMs: closed.length ? Math.round(totalMs / closed.length) : 0,
  };
});

/** Nur die abgeschlossenen davon — Rekorde und Monatsübersicht rechnen darauf. */
export const completedPairsCached = cache(async (userId: string) =>
  completedPairsFrom(await kgPairsCached(userId)),
);

/** Alle Trainingsvorgaben des Trägers (soft-gelöschte bleiben draussen), neueste zuerst. */
export const vorgabenCached = cache((userId: string) =>
  prisma.trainingVorgabe.findMany({
    where: { userId, deletedAt: null },
    orderBy: { gueltigAb: "desc" },
    include: { category: { select: { id: true, name: true, color: true, icon: true, isBuiltIn: true } } },
  }),
);

/**
 * Die KG-Vorgaben — Kalender und Monatsübersicht zeichnen beide auf ihnen.
 *
 * BEWUSST alle, nicht nur die aktiven: die Monats- und Kalenderansicht zeigt Vergangenes, und ein
 * ausgelaufenes Ziel gehört zu dem Monat, in dem es galt.
 */
export const kgVorgabenCached = cache(async (userId: string) =>
  (await vorgabenCached(userId)).filter(isKgVorgabe),
);

/**
 * Alle Geräte des Trägers, auch archivierte.
 *
 * `lookalikeClusterId` treibt die Bild-Versöhnung in `buildSessions` (optisch gleiche Geräte dürfen
 * einander nicht als „Konflikt" überstimmen) — ohne sie rechnete die Geräte-Nutzung anders als
 * `device_stats` im MCP.
 */
export const devicesCached = cache((userId: string) =>
  prisma.device.findMany({
    where: { userId },
    select: { id: true, name: true, purchasePrice: true, currency: true, archivedAt: true, lookalikeClusterId: true },
  }),
);

/** Die Nicht-KG-Kategorien — hier ALLE, auch die ohne Tracking: die Statistik zeigt Vergangenes. */
export const statsCategoriesCached = cache((userId: string) =>
  prisma.deviceCategory.findMany({
    where: { userId, isBuiltIn: false },
    // Dieselbe Reihenfolge wie überall sonst; `isBuiltIn` ist hier ohne Wirkung (alle false).
    orderBy: [...CATEGORY_LIST_ORDER],
    select: { id: true, name: true, color: true, icon: true },
  }),
);

/**
 * Das Strafbuch — die teuerste Quelle dieser Seite (rund zwanzig Abfragen) und die Quelle EINES
 * einzigen Blocks.
 *
 * Der Handel war früher eindeutig, aber teuer: die Karte „Unerlaubte Öffnungen" zeigt, was das
 * Strafbuch als solche führt, statt die Bedingung selbst zu formulieren — vorher zählte sie jede
 * ERLAUBTE Reinigungsöffnung während einer Sperrzeit mit. Seit Etappe B ist der Preis freiwillig:
 * wer den Block ausblendet, zahlt ihn nicht mehr.
 */
export const strafbuchCached = cache((userId: string, nowMs: number) =>
  buildStrafbuch(userId, new Date(nowMs)),
);

/** Die KG-Tragepaare — Kalender, Heatmap, Monatsübersicht und Ziele rechnen alle darauf. */
export const kgWearPairsCached = cache(async (userId: string, nowMs: number) =>
  buildKgWearPairs(await entriesCached(userId), new Date(nowMs)),
);

/** Die Trage-Stunden je Kategorie — Ziele, Kalender und Geräte-Nutzung teilen sie sich. */
export const wearPairsByCategoryCached = cache(async (userId: string, nowMs: number) =>
  wearHourPairsByCategory(await wearSessionsCached(userId, nowMs), new Date(nowMs)),
);

/** Die Tage mit Orgasmus, als Tagesschlüssel in der Zone des Trägers. */
export const orgasmDaysCached = cache(async (userId: string, tz: string) =>
  new Set((await orgasmEntriesCached(userId)).map((e) => tzDayKey(e.startTime, tz))),
);

/** Die Tages-Karte der KG-Tragezeit — Kalender und Jahres-Heatmap brauchen dieselbe. */
export const kgDailyDataCached = cache(async (userId: string, nowMs: number, tz: string) => {
  const [wearPairs, orgasmDays] = await Promise.all([
    kgWearPairsCached(userId, nowMs), orgasmDaysCached(userId, tz),
  ]);
  return wearPairs.length > 0 ? buildDailyData(wearPairs, orgasmDays, tz) : undefined;
});
