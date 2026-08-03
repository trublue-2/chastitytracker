import { parseOrgasmusArtBase } from "@/lib/constants";
import type { Prisma } from "@prisma/client";
import type { InspectionVerification } from "@/lib/kontrolleService";

type PrismaKontrollWhere = Prisma.KontrollAnforderungWhereInput;
import { prisma } from "@/lib/prisma";
import {
  activeVerschlussAnforderungWhere,
  aktiveKontrolleWhere,
  openLockRequestWhere,
  LOCK_REQUEST_ORDER,
  type PrismaTx,
} from "@/lib/queries";
import { sperrzeitEndeFromRequest } from "@/lib/verschlussAnforderungService";

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
      where: { ...openLockRequestWhere(userId), createdAt: { lte: at }, ...activeVerschlussAnforderungWhere(at) },
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
    // SPERRZEIT-Ende je Anforderung: absolutes sperrEndetAt (Wanduhr) gewinnt und bleibt fix, egal
    // wann tatsächlich verschlossen wurde; sonst dauerH relativ zur Verschlusszeit (Bestandsverhalten).
    //
    // Anders als `createVerschlussAnforderung` (Keyholder-Pfad) zieht das hier KEINE bestehenden
    // Sperrzeiten zurück — bewusst. Dort ERSETZT die Keyholderin ihre eigene Direktive; hier
    // handelt der Sub, und dass er sich zwischendurch selbst einschliesst, darf eine geplante
    // Anweisung der Keyholderin nicht stillschweigend löschen — er kennt sie ja nicht einmal,
    // es fiele also niemandem auf. Dasselbe gilt für mehrere hier erzeugte Sperrzeiten: wie sie
    // zur EFFEKTIVEN aufgelöst werden, steht bei `foldActiveSperrzeiten` (queries.ts).
    const neueSperrzeiten = offeneAnforderungen.flatMap((a) => {
      const sperrEnde = sperrzeitEndeFromRequest(a, at); // Anker: der Verschluss selbst
      return sperrEnde
        ? [{
            userId,
            art: "SPERRZEIT",
            nachricht: a.nachricht,
            endetAt: sperrEnde,
            reinigungErlaubt: a.reinigungErlaubt,
          }]
        : [];
    });
    // Ein Insert statt einer je Anforderung — der POST-Pfad des Subs ist heiss genug, dass sich
    // N Round-Trips innerhalb der Transaktion nicht lohnen.
    if (neueSperrzeiten.length > 0) {
      await tx.verschlussAnforderung.createMany({ data: neueSperrzeiten });
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
        beginntAt: { lte: entry.startTime },
        endetAt: { gte: entry.startTime },
      },
      orderBy: { createdAt: "desc" },
    });
    if (
      offeneAnforderung &&
      (!offeneAnforderung.vorgegebeneArt ||
        offeneAnforderung.vorgegebeneArt === parseOrgasmusArtBase(entry.orgasmusArt))
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
 * nicht als offene Strafe im Urteilsloop hängt. Leere `requiredDeviceIds` heisst „keine Vorgabe"
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
  } catch { /* ignore if duplicate — e.g. offline replay */ }
}
