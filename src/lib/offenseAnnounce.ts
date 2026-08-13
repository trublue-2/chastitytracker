import { prisma } from "@/lib/prisma";
import { deployCutoff } from "@/lib/appMeta";
import { loadSubOffenses, type SubOffense } from "@/lib/subOffenses";
import { recordSystemMessage, type MessageRefType } from "@/lib/messageService";
import { offenseNameKey } from "@/lib/offenseLabels";
import type { OffenseCanonicalType } from "@/lib/offenseTypes";

/** Bezugs-Typ der Vergehens-Nachrichten: die `refId` des VERGEHENS, nicht die id des Urteils.
 *  Warum das zwei Namensräume sind, steht bei `MessageRefType` in `messageService.ts`. */
export const OFFENSE_REF_TYPE: MessageRefType = "detectedOffense";

/**
 * Die Brücke von der LIVE-Ableitung in den Posteingang: aus „diese Vergehen bestehen gerade" wird
 * „diese Vergehen wurden dem Träger mitgeteilt".
 *
 * WARUM ÜBERHAUPT MATERIALISIEREN. Die Vergehens-Liste ist eine Ableitung — sie kann auftauchen,
 * ihren Zustand wechseln und wieder verschwinden, ohne dass jemand etwas getan hat (Begründung im
 * Kopf von `subOffenses.ts`). Genau das ist der Grund, warum eine reine Anzeige darauf dem Träger
 * nie sagen kann, ob eine Zeile verworfen wurde oder die Ableitung sich geändert hat. Eine
 * geschriebene Nachricht kann nicht mehr still verschwinden — sie ist der Beleg, dass er es zu
 * einem bestimmten Zeitpunkt erfahren hat.
 *
 * ZWEI ZEITPUNKTE, und das ist Absicht: `Message.createdAt` ist, wann er es erfahren hat (und damit
 * die Position im Posteingang), der Tatzeitpunkt steht im Text. Ein heute abgeleitetes Vergehen von
 * vor drei Wochen steht deshalb oben und nicht unter längst gelesenen Zeilen. Dieselbe Trennung
 * fährt `delayedTrigger.ts` für terminierte Anforderungen (`wirksamAb` vs. `benachrichtigtAt`).
 *
 * WAS DAS FÜRS LÖSCHEN HEISST: Löscht der Träger eine Feststellungs-Meldung, schreibt der nächste
 * Lauf sie neu, solange das Vergehen abgeleitet wird — die gemeldete Menge IST die Menge der
 * Nachrichten. Das ist die Folge der Entscheidung unten und nicht ihr Versehen: eine Feststellung,
 * die man wegwischen kann, wäre kein Beleg. Erst wenn das Vergehen beurteilt ist, ruht die Zeile.
 *
 * KEIN EIGENER SPEICHER. Was angekündigt wurde, steht in den Nachrichten selbst
 * (`refEntityType: "detectedOffense"`). Eine zweite Tabelle daneben wäre eine zweite Wahrheit, die
 * auseinanderlaufen kann — und die Frage „wurde das schon gemeldet?" ist wörtlich die Frage
 * „gibt es dazu eine Nachricht?".
 */

/**
 * Ab wann werden Vergehen in den Posteingang gemeldet?
 *
 * Jeder bestehende Träger hat abgeleitete Vergehen, die nie angekündigt wurden. Ohne Stichtag kippte
 * der erste Lauf nach dem Deploy seine gesamte Historie auf einmal in den Posteingang — bei einem
 * langjährigen Nutzer Dutzende Zeilen, alle ungelesen, keine davon neu.
 *
 * Warum die Mechanik in `appMeta.ts` liegt und nicht hier: Begründung bei {@link deployCutoff}.
 */
export function offenseAnnounceFrom(now: Date): Promise<Date> {
  return deployCutoff(now, {
    key: "offenseAnnounceFrom",
    envVar: "OFFENSE_ANNOUNCE_FROM",
    logPrefix: "[offenses]",
    fallbackNote: "melde ab jetzt, keine Altlasten",
  });
}

/** Ein meldbares Vergehen: Art und Tatzeitpunkt stehen fest. Der Typ trägt, was
 *  {@link announceableOffenses} geprüft hat — sonst bräuchte jede Folgezeile eine `!`-Behauptung. */
export type AnnounceableOffense = SubOffense & { offenseType: OffenseCanonicalType; offenseAt: Date };

/**
 * Welche Vergehen sind meldbar? Nur unbeurteilte, mit Art UND Tatzeitpunkt, ab dem Stichtag.
 *
 * Ohne Tatzeitpunkt liesse sich weder gegen den Stichtag prüfen noch ein Satz bilden, der etwas
 * sagt („am — hast du"). Betroffen sind die verwaisten Urteile (Eintrag später gelöscht); die
 * tragen ohnehin schon eine Strafen-Nachricht aus dem Moment des Urteils.
 *
 * NUR `open`, und das ist keine Feinheit: zwischen dem Entstehen eines Vergehens und dem nächsten
 * Melde-Lauf liegen bis zu fünf Minuten, und die Keyholderin kann in dieser Zeit längst geurteilt
 * haben. Ohne diese Bedingung schriebe der Lauf danach „Ob und wie es beurteilt wird, entscheidet
 * der Keyholder" — über ein Vergehen, das bereits verworfen ist. Diese Zeile bekäme nie eine
 * Auflösung (die Verwerfung meldet nur, was vorher angekündigt war) und stünde dem Träger für
 * immer offen im Posteingang. Bei `punished` widerspräche sie sogar der Strafen-Nachricht, die
 * direkt darüber steht.
 *
 * Was dabei bewusst NICHT gemeldet wird: ein Vergehen, das innerhalb dieses Fensters entsteht und
 * beurteilt wird. Bestraft erfährt er es über die Strafen-Nachricht; verworfen hat er es nie
 * erfahren, und dann gibt es auch nichts aufzulösen.
 *
 * AUSNAHME VOM STICHTAG: ein VON HAND notiertes Vergehen. Der Stichtag misst am Tatzeitpunkt, und
 * für abgeleitete Vergehen ist das richtig. Eine Notiz schreibt die Keyholderin aber fast immer über
 * etwas Vergangenes („gestern die Abmachung gebrochen") — in den Wochen nach dem Rollout fiele damit
 * eine Notiz nach der anderen durch den Stichtag und erreichte den Träger nie. Eine Flut droht bei
 * dieser Art nicht: die Tabelle entsteht mit derselben Version wie der Stichtag, es gibt zu diesem
 * Zeitpunkt also nachweislich keinen Bestand, der hereinbrechen könnte.
 */
export function announceableOffenses(offenses: SubOffense[], since: Date): AnnounceableOffense[] {
  return offenses.filter((o): o is AnnounceableOffense =>
    o.state === "open" && o.offenseType !== null && o.offenseAt !== null &&
    (o.offenseType === "manual_offense" || o.offenseAt >= since));
}


/** Die Parameter der Meldung. Der Name der Vergehensart kommt als i18n-SCHLÜSSEL, nicht als fertiger
 *  Text: die Nachricht wird in der Sprache gelesen, die der Träger beim ÖFFNEN eingestellt hat, nicht
 *  in der, die beim Schreiben galt. Aufgelöst wird er in `messagePresenter.ts`. */
function detectedParams(o: AnnounceableOffense): Record<string, string> {
  return {
    offenseKey: offenseNameKey(o.offenseType),
    // Der Anlass, wo die Art einen trägt (notiertes Vergehen, Aufgabe) — sonst leer, und der Text
    // kommt mit der Art allein aus.
    title: o.title ?? "",
  };
}

/**
 * Welche dieser Vergehen wurden dem Träger schon gemeldet?
 *
 * Über `refEntityId: { in: … }` statt „alle Vergehens-Nachrichten dieses Trägers": so bedient die
 * Abfrage den Index (`subjectUserId, refEntityType, refEntityId`) über alle drei Spalten, statt die
 * ersten zwei zu nutzen und den Rest zu lesen. Die gemeldete Menge wächst mit den Jahren, die
 * gefragte nicht.
 *
 * `audience: "sub"` gehört zwingend dazu — die Frage lautet „wurde es dem TRÄGER gemeldet?", und
 * `subjectUserId` allein beantwortet sie nicht mehr: seit dem Keyholder-Kanal tragen auch die
 * Meldungen AN SEINE KEYHOLDER seine id als Betreff. Ohne die Spalte hielte eine Keyholder-Zeile mit
 * derselben Referenz das Vergehen für bereits gemeldet und unterdrückte die Meldung an den Träger —
 * dauerhaft und lautlos. (Der Index führt `audience` nicht; das kostet hier nichts, weil die drei
 * Index-Spalten die Menge schon auf wenige Zeilen eingrenzen.)
 */
async function announcedRefs(userId: string, refIds: string[]): Promise<Set<string>> {
  const rows = await prisma.message.findMany({
    where: {
      subjectUserId: userId,
      audience: "sub",
      refEntityType: OFFENSE_REF_TYPE,
      refEntityId: { in: refIds },
    },
    select: { refEntityId: true },
  });
  return new Set(rows.flatMap((m) => (m.refEntityId ? [m.refEntityId] : [])));
}

/** Ob ein Vergehen dem Träger schon gemeldet wurde — die Bedingung dafür, dass eine Auflösung
 *  („fallengelassen") überhaupt Sinn ergibt. Ohne vorangegangene Feststellung wäre sie das Ende
 *  einer Geschichte, die der Posteingang nie erzählt hat. */
export async function offenseWasAnnounced(userId: string, refId: string): Promise<boolean> {
  return (await announcedRefs(userId, [refId])).has(refId);
}

/**
 * Meldet jedes noch nicht gemeldete Vergehen des Trägers als Nachricht. Liefert die Anzahl neuer
 * Meldungen.
 *
 * EIN Abgleich, nicht N Einzelprüfungen: `recordSystemMessage({ once })` könnte die Dublette je
 * Vergehen selbst verhindern, kostet dann aber eine Abfrage PRO Vergehen und Lauf — bei einem
 * Träger mit fünfzig Vergehen also fünfzig Abfragen für gewöhnlich null neue Meldungen. Stattdessen
 * eine Abfrage für die ganze gemeldete Menge und ein Vergleich im Speicher. `once` bleibt trotzdem
 * gesetzt: zwei überlappende Läufe (Heartbeat zweier Geräte) sollen keine zweite Zeile hinterlassen.
 *
 * KEINE BÜNDELUNG. Legt die Keyholderin das Reinigungs-Kontingent rückwirkend tiefer, entstehen auf
 * einen Schlag viele Vergehen — und dann sind es eben viele Zeilen. Eine zusammengefasste
 * „7 weitere Vergehen"-Nachricht wäre nicht nur Anzeige: sie müsste die sieben trotzdem als gemeldet
 * markieren, sonst kämen sie im nächsten Lauf einzeln nach. Damit hinge die Dublettenfreiheit an
 * einem zweiten Mechanismus. Wenn die Menge stört, gehört das Zusammenfassen in die Anzeige des
 * Posteingangs — dort kostet es keine Wahrheit.
 */
export async function announceNewOffenses(userId: string, now: Date = new Date()): Promise<number> {
  const [since, offenses] = await Promise.all([
    offenseAnnounceFrom(now),
    loadSubOffenses(userId, now),
  ]);

  const candidates = announceableOffenses(offenses, since);
  if (candidates.length === 0) return 0;

  const announced = await announcedRefs(userId, candidates.map((o) => o.refId));
  const fresh = candidates.filter((o) => !announced.has(o.refId));
  // Der Reihe nach von alt nach neu: die Nachrichten entstehen im selben Lauf und unterscheiden sich
  // in `createdAt` nur um Millisekunden. Der Posteingang sortiert `createdAt DESC, id DESC` — so
  // steht wenigstens das jüngste Vergehen oben statt einer zufälligen Reihenfolge.
  fresh.sort((a, b) => a.offenseAt.getTime() - b.offenseAt.getTime());

  for (const o of fresh) {
    await recordSystemMessage({
      subjectUserId: userId,
      bodyKey: o.title ? "offenseDetectedMessageTitled" : "offenseDetectedMessage",
      params: detectedParams(o),
      ref: { type: OFFENSE_REF_TYPE, id: o.refId },
      // Der ABSENDER folgt dem Autor des Vergehens, nicht dem Melder. Hat ein Mensch es von Hand
      // notiert, ist er der Absender — „System" wäre dort schlicht falsch, auch wenn die Zeile
      // technisch aus diesem Lauf stammt. Ein ABGELEITETES Vergehen hat keinen Autor
      // (`recordedBy: null`) und bekommt ausdrücklich „system": dort gibt es wirklich niemanden
      // ausser der App selbst.
      actor: o.recordedBy,
      once: true,
    });
  }
  return fresh.length;
}

/** Frühestens so oft läuft der Abgleich je Träger. Zeit allein erzeugt Vergehen (abgelaufene
 *  Kontrollfrist, nicht wiederverschlossen, versäumte Aufgabe), es muss also getaktet nachgesehen
 *  werden — aber ein voller Strafbuch-Aufbau je Konto und Minute wäre verschwendet. Fünf Minuten
 *  sind nah genug, dass eine Meldung nicht auffällig hinterherhinkt. */
const ANNOUNCE_INTERVAL_MS = 5 * 60_000;

/** Wann der Abgleich zuletzt lief. In `globalThis` und nicht als Modul-Konstante: ein Modul kann in
 *  Next mehrfach instanziiert werden (Dev-HMR, getrennte Route-Bundles), und eine zweite Instanz
 *  hätte eine leere Uhr — die Drossel wäre still weg. Dasselbe Muster wie `__health` in
 *  `healthCheck.ts` und `__autoKontrolleCleanupDay` in `kontrollePoller.ts`. */
const g = globalThis as unknown as { __offenseAnnounceAt?: number };

/**
 * Vom Poller je Tick gerufen: meldet für ALLE Konten, gedrosselt auf {@link ANNOUNCE_INTERVAL_MS}.
 *
 * Am POLLER und nicht am Heartbeat, obwohl der Heartbeat der bequemere Aufhänger wäre. Drei Gründe,
 * jeder für sich ausreichend:
 *
 *  1. Der Beleg darf nicht am Hinsehen des Beschuldigten hängen. Der Heartbeat läuft nur, solange
 *     ein Tab offen ist. Das Verwerfen eines Vergehens schreibt seine Zeile dagegen unbedingt aus
 *     dem Keyholder-Request — die AUFLÖSUNG stünde also im Posteingang, bevor die FESTSTELLUNG je
 *     geschrieben wurde. Genau die Asymmetrie, gegen die dieses Feature gebaut ist.
 *  2. Der Heartbeat beschreibt sich selbst als „nur leichte Werte/IDs" und wird alle 30 Sekunden
 *     gepollt. Ein volles Strafbuch dort ist am falschen Ort — und weil Prisma hier auf EINER
 *     SQLite-Verbindung fährt (`connection_limit=1`), entkoppelt das fehlende `await` gar nichts:
 *     der Lauf stellt sich vor die Abfragen des Heartbeats, statt neben ihnen zu laufen.
 *  3. Der Poller IST die Uhr dieser Instanz. Eine eigene Drossel pro Request wäre ein zweiter
 *     Scheduler neben dem bestehenden.
 *
 * Wirft nie — der Poller darf an einer Meldung nicht brechen. Fehler je Träger einzeln aufgefangen,
 * wie in `ensureDailyAutoKontrollen`.
 */
export async function maybeAnnounceOffenses(now: Date = new Date()): Promise<void> {
  const nowMs = now.getTime();
  if (g.__offenseAnnounceAt && nowMs - g.__offenseAnnounceAt < ANNOUNCE_INTERVAL_MS) return;
  g.__offenseAnnounceAt = nowMs;

  // ALLE Konten, ohne Rollen-Filter. Ein Filter auf `role: "user"` wäre billiger, schlösse aber
  // genau die Konten aus, die Keyholder UND Träger sind — auf einer Ein-Personen-Instanz ist das der
  // Normalfall, und dort erschiene dann überhaupt keine Meldung. Ein Konto ohne Einträge kostet ein
  // leeres Strafbuch; das ist der günstigere Preis als eine Rolle, die stillschweigend abschaltet.
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) {
    try {
      await announceNewOffenses(u.id, now);
    } catch (e) {
      console.error(`[offenses] Meldung fehlgeschlagen (${u.id}):`, (e as Error).message);
    }
  }
}
