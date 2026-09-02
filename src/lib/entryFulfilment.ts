import { parseOrgasmusArtBase } from "@/lib/constants";
import type { Prisma } from "@prisma/client";
import type { InspectionVerification } from "@/lib/kontrolleService";

type PrismaKontrollWhere = Prisma.KontrollAnforderungWhereInput;
import { prisma } from "@/lib/prisma";
import { recordSystemMessage } from "@/lib/messageService";
import { getOffenseRules } from "@/lib/offenseRulesService";
import {
  aktiveKontrolleWhere,
  openLockRequestWhere,
  LOCK_REQUEST_ORDER,
  type PrismaTx,
} from "@/lib/queries";
import { lockPeriodEndFromRequest } from "@/lib/verschlussAnforderungService";
import { triggeredWhere } from "@/lib/delayedTrigger";
import { scheduleCleaningRelockInspection, triggerPostLockInspection } from "@/lib/autoKontrolleService";
import { notifyControllersAboutEntry, type EntryNotifyParams } from "@/lib/entryNotify";
import { markLastAction } from "@/lib/appMeta";
import { isHealthHoldActive } from "@/lib/healthHold";

/** Der Eintrag, wie ihn die Erfüllung braucht — bewusst die schmale Form statt des Prisma-Modells,
 *  damit beide Routen ihn ohne Umweg übergeben können. */
export interface FulfillingEntry {
  id: string;
  userId: string;
  type: string;
  /** Die im Eintrag stehende Zeit (`startTime`) — governiert das Zeitfenster der Orgasmus-Anforderung. */
  startTime: Date;
  orgasmusArt: string | null;
}

/**
 * Hakt ab, was dieser Eintrag beantwortet: Kontroll-Anforderung, Verschluss-Anforderungen (samt der
 * daraus folgenden Sperrzeiten) und Orgasmus-Anforderung. Läuft IN der Transaktion, die den Eintrag
 * anlegt — die Guards davor haben in derselben Transaktion gelesen (TOCTOU).
 *
 * `at` ist der Dreh- und Angelpunkt und bedeutet zweierlei zugleich: der **Stichtag der Auswahl**
 * (welche Anforderungen waren zu diesem Zeitpunkt bereits ausgelöst?) und der **Erfüllungs-
 * Zeitstempel**, gegen den später die Frist geprüft wird (`isPastDeadlineUnfulfilled`).
 *
 * Die beiden Aufrufer setzen ihn verschieden, und das ist der einzige Unterschied zwischen ihnen:
 *
 * - **Sub-Pfad** (`POST /api/entries`): `at = new Date()` — die Server-Uhr im Moment der Einreichung.
 *   Die Eintrags-Zeit darf hier NIEMALS verwendet werden: sie ist frei wählbar, und mit ihr könnte
 *   sich jeder Sub rückwirkend aus jeder Frist herausdatieren. Genau deshalb ist `fulfilledAt`
 *   server-gesetzt und unveränderlich (siehe `mapAnforderungStatus`).
 * - **Keyholder-Pfad** (`POST /api/admin/entries`): `at = entry.startTime` — dort darf rückdatiert
 *   werden, und dann ist der Moment des Erfassens der falsche Bezug: trägt die Keyholderin einen
 *   pünktlichen Verschluss von gestern heute nach, gälte er sonst als „zu spät". Der Sub erreicht
 *   diese Route nicht (`requireKeyholderOrAdminActor` → `isKeyholderOf` weist actor === target
 *   ab) — rückdatieren kann nur, wer auch das Urteil fällt. Für einen Sub MIT Admin-Rolle trägt
 *   dieser Schutz nicht, deshalb klemmt die Route `at` in diesem Fall selbst auf die Server-Uhr.
 *
 * Diese Asymmetrie ist Absicht, kein Versehen: nicht „vereinheitlichen", indem man beiden Pfaden
 * denselben Wert gibt.
 *
 * Rückgabe: die Geräte, die eine erfüllte Verschluss-Anforderung VERLANGT hat (leer = keine
 * Vorgabe). Damit ahndet der Aufrufer ein falsches Gerät — nach dem Commit, siehe
 * {@link punishWrongDevice}.
 */
export async function applyEntryFulfilment(
  tx: PrismaTx,
  entry: FulfillingEntry,
  inspection: { verification: InspectionVerification | null; targetWhere: PrismaKontrollWhere | null },
  at: Date,
): Promise<string[]> {
  const { verification, targetWhere } = inspection;
  const { id: entryId, userId, type } = entry;
  let requiredAnforderungDeviceIds: string[] = [];

  // KontrollAnforderung verknüpfen + fulfilledAt setzen (für den Sub unveränderlich).
  // Nur bereits AUSGELÖSTE Anforderungen (wirksamAb erreicht) — sonst könnte ein zufällig
  // kollidierender Selbstkontroll-Code eine noch unsichtbare, geplante Auto-Kontrolle erfüllen.
  //
  // ZWEI Zuordnungswege, und der Unterschied ist der Kern des Geräte-Toggles:
  //
  // 1. Mit Code-Pflicht ist der Code der SCHLÜSSEL — er sagt, WELCHE Anforderung dieses Foto
  //    beantwortet. Ohne passenden Code wird nichts erfüllt; eine freiwillige Selbstkontrolle
  //    lässt eine offene Anforderung also unberührt.
  // 2. Ohne Code-Pflicht gibt es keinen Schlüssel. Dann beantwortet das Foto die EINE offene
  //    Anforderung — es gibt nie mehr als eine (requestKontrolle lehnt eine zweite mit
  //    INSPECTION_ALREADY_ACTIVE ab, der Poller zieht überschneidende Auto-Kontrollen zurück).
  //    Damit erfüllt hier auch eine freiwillig erfasste Kontrolle die offene Anforderung — das
  //    ist gewollt: ohne Code ist eine „freiwillige" von einer „beantworteten" nicht mehr zu
  //    unterscheiden, und die Einreichung ist da.
  //
  // `orderBy deadline asc` + `take 1` statt updateMany: sollte der Überschneidungs-Schutz doch
  // einmal zwei Zeilen durchlassen (er ist ein Best-Effort-Read-then-Write, siehe
  // requestKontrolle), erfüllt ein Foto genau EINE — die dringendste — statt beide auf einmal.
  if (type === "PRUEFUNG" && verification && targetWhere) {
    const openWhere = {
      userId, entryId: null, withdrawnAt: null,
      // Nur Anforderungen auf DIESES Ziel: ein Plug-Foto darf keine KG-Kontrolle abhaken und
      // umgekehrt. Kommt aus `deriveEntryVerification`, damit Ableitung und Erfüllung dieselbe
      // Schranke benutzen.
      ...targetWhere,
      // `createdAt <= at` ist die eigentliche Rückdatierungs-Schranke. `aktiveKontrolleWhere`
      // filtert nur `wirksamAb`, und das ist bei einer manuell gestellten Anforderung `null` —
      // ohne diese Zeile beantwortete ein auf 09:00 zurückdatierter Eintrag eine Kontrolle, die
      // erst um 14:00 gestellt wurde. Auf dem Sub-Pfad (`at = jetzt`) ist die Bedingung immer
      // wahr und damit wirkungslos.
      createdAt: { lte: at },
      ...aktiveKontrolleWhere(at),
    };
    // Der Rundum-Weg trifft NUR Anforderungen, die selbst ohne Code entstanden sind (`code: null`).
    // Ohne diese Schranke wäre der Toggle ein Umweg um eine bestehende Kontrolle: eine Anforderung
    // MIT Code, gestellt während ein Code-Gerät getragen wurde, liesse sich erfüllen, indem der Sub
    // aufschliesst, ein Gerät ohne Code-Pflicht anlegt und ein blankes Foto einreicht — der Code
    // wäre nie getippt und nie geprüft worden. Ob ein Code verlangt wird, entscheidet das
    // Gerät zur EINREICHUNG; welchen Nachweis eine Anforderung verlangt, steht in IHR.
    const target =
      verification.kind === "code"
        ? await tx.kontrollAnforderung.findFirst({ where: { ...openWhere, code: verification.code }, select: { id: true } })
        : verification.kind === "none" && verification.codeRequired
          // Freiwillige Selbstkontrolle an einem Gerät MIT Code-Pflicht: erfüllt nichts.
          ? null
          : await tx.kontrollAnforderung.findFirst({
              where: { ...openWhere, code: null },
              orderBy: { deadline: "asc" },
              select: { id: true },
            });
    if (target) {
      await tx.kontrollAnforderung.update({
        where: { id: target.id },
        data: { entryId, fulfilledAt: at },
      });
    }
  }

  // VerschlussAnforderung (ANFORDERUNG) als erfüllt markieren + ggf. SPERRZEIT erstellen
  if (type === "VERSCHLUSS") {
    // ALLE offenen, bereits ausgelösten Anforderungen — mehrere dürfen koexistieren, und dieser
    // eine Verschluss erfüllt sie alle: jede verlangte „sei verschlossen", und das ist er jetzt.
    // Liesse man die übrigen offen, würden sie bei Fristablauf zu „zu spät verschlossen"-
    // Vergehen im Strafbuch, obwohl der Sub genau das Verlangte getan hat.
    // Geplante, noch nicht versendete bleiben aussen vor — sie dürfen nicht vorzeitig als
    // erfüllt gelten (dringendste zuerst, siehe getOpenLockRequests).
    const offeneAnforderungen = await tx.verschlussAnforderung.findMany({
      // `createdAt <= at`: ein Nachtrag erfüllt nur, was es zu seinem Zeitpunkt schon GAB. Ohne
      // diese Schranke hätte ein auf gestern zurückdatierter Verschluss eine heute gestellte
      // Anordnung abgehakt — und die Sperrzeit daraus wäre im Moment ihrer Entstehung abgelaufen.
      // Auf dem Sub-Pfad (`at = jetzt`) immer wahr, also wirkungslos.
      where: { ...openLockRequestWhere(userId), createdAt: { lte: at }, ...triggeredWhere(at) },
      orderBy: LOCK_REQUEST_ORDER,
    });
    if (offeneAnforderungen.length > 0) {
      await tx.verschlussAnforderung.updateMany({
        where: { id: { in: offeneAnforderungen.map((a) => a.id) } },
        data: { fulfilledAt: at },
      });
      // Die GEFORDERTEN Geräte aller erfüllten Anforderungen einsammeln (Anforderungen OHNE
      // Gerätevorgabe stellen keine und fallen weg). Mehrere können verschiedene Geräte verlangen;
      // der Sub kann aber nur EINES tragen. Er gilt als korrekt, sobald sein Gerät irgendeine der
      // GEFORDERTEN Vorgaben trifft — sonst würde er für einen Konflikt bestraft, den er gar nicht
      // auflösen konnte (zwei Anforderungen, zwei verschiedene Pflicht-Geräte). Trifft er KEINE der
      // geforderten, greift die Falsch-Gerät-Ahndung beim Aufrufer; eine geforderte Vorgabe wird
      // also nicht dadurch entwertet, dass daneben eine geräte-freie Anforderung offen ist.
      requiredAnforderungDeviceIds = offeneAnforderungen.map((a) => a.deviceId).filter((d): d is string => d !== null);
    }
    // SPERRZEIT-Ende je Anforderung: absolutes lockEndsAt (Wanduhr) gewinnt und bleibt fix, egal
    // wann tatsächlich verschlossen wurde; sonst minDurationHours relativ zur Verschlusszeit (Bestandsverhalten).
    //
    // Anders als `createVerschlussAnforderung` (Keyholder-Pfad) zieht das hier KEINE bestehenden
    // Sperrzeiten zurück — bewusst. Dort ERSETZT die Keyholderin ihre eigene Direktive; hier
    // handelt der Sub, und dass er sich zwischendurch selbst einschliesst, darf eine geplante
    // Anweisung der Keyholderin nicht stillschweigend löschen — er kennt sie ja nicht einmal,
    // es fiele also niemandem auf. Dasselbe gilt für mehrere hier erzeugte Sperrzeiten: wie sie
    // zur EFFEKTIVEN aufgelöst werden, steht bei `foldActiveLockPeriods` (queries.ts).
    const newLockPeriods = offeneAnforderungen.flatMap((a) => {
      const endsAt = lockPeriodEndFromRequest(a, at); // Anker: der Verschluss selbst
      return endsAt
        ? [{
            userId,
            art: "SPERRZEIT",
            message: a.message,
            endsAt,
            cleaningAllowed: a.cleaningAllowed,
            // Der Anordnende wandert mit (wie in `carryOverLockPeriodOnAlreadyLocked`): die Sperrzeit
            // ist seine Anweisung, auch wenn erst der Verschluss des Subs sie auslöst.
            createdBy: a.createdBy,
          }]
        : [];
    });
    // Ein Insert statt einer je Anforderung — der POST-Pfad des Subs ist heiss genug, dass sich
    // N Round-Trips innerhalb der Transaktion nicht lohnen.
    if (newLockPeriods.length > 0) {
      await tx.verschlussAnforderung.createMany({ data: newLockPeriods });
    }
  }

  // OrgasmusAnforderung als erfüllt markieren, wenn ein passender Orgasmus im Fenster erfasst wird.
  // Matching auf vorgegebene Art (Basis), wenn gesetzt; sonst zählt jeder Orgasmus.
  // Das FENSTER prüft immer die Eintrags-Zeit (wann fand der Orgasmus statt?), unabhängig von `at`
  // — das war schon vor der Extraktion so und ist bei Rückdatierung erst recht richtig.
  if (type === "ORGASMUS") {
    const offeneAnforderung = await tx.orgasmusAnforderung.findFirst({
      where: {
        userId,
        fulfilledAt: null,
        withdrawnAt: null,
        beginsAt: { lte: entry.startTime },
        endsAt: { gte: entry.startTime },
        // Eine terminierte Anweisung, die noch nicht ausgelöst hat, ist für den Sub nicht da — sie
        // darf sich auch nicht erfüllen. Sonst hakte ein zufällig passender Orgasmus eine Anweisung
        // ab, von der er nichts wusste, und sie käme nie bei ihm an.
        //
        // Gegen die EINTRAGS-Zeit gemessen, wie das Fenster darüber, und bewusst nicht gegen `at`:
        // gefragt ist „wusste er es, als es passierte?", nicht „als er es erfasste". Ein
        // rückdatierter Orgasmus aus der verborgenen Phase erfüllt damit nichts.
        ...triggeredWhere(entry.startTime),
      },
      orderBy: { createdAt: "desc" },
    });
    if (
      offeneAnforderung &&
      (!offeneAnforderung.requiredType ||
        offeneAnforderung.requiredType === parseOrgasmusArtBase(entry.orgasmusArt))
    ) {
      await tx.orgasmusAnforderung.update({
        where: { id: offeneAnforderung.id },
        data: { fulfilledAt: at, entryId },
      });
    }
  }

  return requiredAnforderungDeviceIds;
}

/**
 * Ahndet ein anderes als das geforderte Gerät — die unmittelbare Folge einer erfüllten
 * Verschluss-Anforderung MIT Gerätevorgabe, deshalb hier und nicht in der Route. Läuft NACH dem
 * Commit: die Ahndung darf den Eintrag nicht kippen.
 *
 * Automatische Ahndung ohne Urteilsschritt → sofort erledigt (`judgedBy: "system"`), damit sie
 * nicht als offene Strafe im Urteilsloop hängt. Genau deshalb MELDET sie zusätzlich: sofort erledigt
 * heisst, dass weder der Dashboard-Block (nur offene Strafen) noch der Melder (nur Unbeurteiltes)
 * sie je zeigt — ohne die Nachricht bekäme der Träger einen Eintrag, den er nicht sehen kann. Leere `requiredDeviceIds` heisst „keine Vorgabe"
 * und niemals „falsches Gerät".
 */
export async function punishWrongDevice(
  entry: { id: string; userId: string; type: string; deviceId: string | null },
  requiredDeviceIds: string[],
): Promise<void> {
  if (entry.type !== "VERSCHLUSS") return;
  // Das Gerät kommt aus der GEAHNDETEN Zeile, nicht aus dem Request: als Parameter liesse sich ein
  // anderes übergeben als das, was im Eintrag steht.
  if (requiredDeviceIds.length === 0 || requiredDeviceIds.includes(entry.deviceId || "")) return;
  // Die Regel MUSS hier gelesen werden und nicht erst im Strafbuch. `applyOffenseRules` lässt
  // beurteilte Zeilen stehen, und diese wird sofort mit `judgedBy: "system"` geschrieben — der
  // nachgelagerte Filter griffe für diese Art also nie, die Regel wäre wirkungslos. Seit die Ahndung
  // dem Träger auch gemeldet wird, wäre das nicht mehr nur eine stille Lücke, sondern ein
  // Widerspruch in seinem Posteingang: eine Meldung über eine ausdrücklich abgeschaltete Art.
  const rules = await getOffenseRules(entry.userId);
  if (rules.wrong_device === "off") return;
  // Gesundheits-Halt, und aus GENAU demselben Grund wie die Regel eine Zeile darüber: die Ahndung
  // wird sofort als erledigt geschrieben, der nachgelagerte Pausen-Filter des Strafbuchs
  // (`applyHealthHoldPause`) griffe für sie also nie. Wer während einer Pause ein anderes Gerät
  // trägt, tut es meistens deswegen — ein Gips passt zu keiner Anforderung.
  if (await isHealthHoldActive(entry.userId)) return;
  try {
    const now = new Date();
    await prisma.strafeRecord.create({
      data: {
        userId: entry.userId,
        offenseType: "FALSCHES_GERAET",
        refId: entry.id,
        bestraftDatum: now,
        notiz: null,
        judgedBy: "system",
        erledigtAt: now,
      },
    });
    // Er MUSS davon erfahren. Anders als jedes andere Vergehen durchläuft dieses keinen
    // Urteilsschritt: es wird sofort als erledigt geschrieben (siehe oben) und fällt damit durch
    // beide Sub-Sichten — der Dashboard-Block zeigt nur offene Strafen, der Melder nur Unbeurteiltes.
    // Ohne diese Zeile bekäme er einen Strafbuch-Eintrag, den er weder sehen noch bestreiten kann.
    //
    // Hier und nicht über den Melder, weil der Anlass JETZT ist: er hat gerade mit dem falschen Gerät
    // verschlossen, und genau in diesem Moment ist die Meldung nützlich statt fünf Minuten später.
    await recordSystemMessage({
      subjectUserId: entry.userId,
      bodyKey: "wrongDeviceMessage",
      ref: { type: "detectedOffense", id: entry.id },
      once: true,
    });
  } catch { /* ignore if duplicate — e.g. offline replay */ }
}

/**
 * **Was NACH dem Commit eines wirksamen Eintrags passiert** — die vier Schritte in der Reihenfolge,
 * in der sie zusammengehören: automatische Ahndung, Aktivitäts-Stempel, die Kontrolle nach einer
 * Reinigungspause, die Meldung an die Keyholder.
 *
 * Sie standen zweimal im Baum, seit ein Verschluss auch VERZÖGERT wirksam werden kann
 * (`lockCommit.ts`): einmal im Anlege-Pfad, einmal im Vollzug — in derselben Reihenfolge, mit
 * demselben Fire-and-forget-Zuschnitt. Ein fünfter Schritt müsste sonst an beiden Stellen
 * nachgetragen werden, und würde er im Vollzug vergessen, liefe er für Riegel-Träger stillschweigend
 * nie. Genau diese Klasse von Auslassung soll die Regel verhindern, nicht erzeugen.
 *
 * Wirft nie: jeder Schritt ist eine Nacharbeit zu einer bereits geschriebenen Zeile.
 */
export async function applyEntryAftermath(
  entry: { id: string; userId: string; type: string; deviceId: string | null },
  opts: {
    /** Die von erfüllten Anforderungen GEFORDERTEN Geräte (aus `applyEntryFulfilment`). */
    requiredDeviceIds: string[];
    /** Schliesst dieser Eintrag eine Reinigungspause ab? Dann folgt eine Kontrolle. */
    endsCleaningPause: boolean;
    /** Der Verschluss ist erfasst, aber noch nicht in Kraft — er wartet auf den Riegel. Dann
     *  behauptet hier nichts eine vollzogene Tat, auch nicht die Verschluss-Kontrolle: sie käme für
     *  einen Einschluss, den es noch nicht gibt. Beim Vollzug läuft dieselbe Nacharbeit erneut
     *  (`lockCommit.ts`) und holt sie nach. Ungesetzt = in Kraft. */
    awaitsBolt?: boolean;
    /** Die Meldung an die Keyholder — `null` heisst „jetzt noch nicht" (der schwebende Aufruf; sie
     *  geht beim Vollzug raus). */
    notify: EntryNotifyParams | null;
  },
): Promise<void> {
  await punishWrongDevice(entry, opts.requiredDeviceIds);
  markLastAction();
  if (entry.type === "VERSCHLUSS" && !opts.awaitsBolt) triggerPostLockInspection(entry.userId);
  // Bleibt daneben stehen, statt in den Zweig darüber zu wandern: die beiden schliessen sich zwar
  // aus, aber die Vorfahrt entscheidet `scheduleCleaningRelockInspection` selbst (es kennt die
  // Einstellung, dieser Aufrufer nicht). Hier zu wählen hiesse, die Regel ein zweites Mal zu führen.
  if (opts.endsCleaningPause) {
    void scheduleCleaningRelockInspection(entry.userId).catch((e) =>
      console.error("[autoKontrolle:cleaningRelock]", (e as Error).message));
  }
  if (opts.notify) void notifyControllersAboutEntry(opts.notify);
}
