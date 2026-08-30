import { prisma } from "@/lib/prisma";
import { createOeffnenEntryTx } from "@/lib/oeffnenService";
import { getBoxFormContext, getIsLocked } from "@/lib/queries";
import { setBoxCommandForUser } from "@/lib/boxCommand";
import { notifyHeimdallForUserId } from "@/lib/heimdallNotify";
import { notifyUser } from "@/lib/notify";
import { notifyControllersAboutEntry } from "@/lib/entryNotify";
import { boxCommandForEntry } from "@/lib/boxCommand";
import { createOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import { LOCK_ENDED_REASON, RELEASE_ORGASM_WINDOW_H } from "@/lib/constants";
import { serviceErrors, mapServiceError, type ServiceResult } from "@/lib/serviceResult";
import type { MessageActor } from "@/lib/messageService";

/**
 * „Sofort aufschliessen" — das Gegenstück zur Sperrzeit, in einem Griff.
 *
 * **Warum es das gibt.** Die Sperrzeit sagt „auf keinen Fall öffnen". Das Gegenteil davon gab es nur
 * als drei getrennte Handgriffe in drei verschiedenen Ecken: Sperrzeit zurückziehen, Box öffnen,
 * Öffnung erfassen. Gemeldet von einer Keyholderin, die genau das nicht wollte — „nicht so tief ins
 * Menü", wenn es jetzt gilt. Neu ist also keine Fähigkeit, sondern dass die drei zusammen und
 * unteilbar passieren.
 *
 * **Die Reihenfolge ist der ganze Trick.** Die Sperrzeit endet ZUERST, und zwar mit demselben
 * Zeitstempel, den die Öffnung trägt. Das Strafbuch sucht die Sperrzeit, die zur Öffnungszeit aktiv
 * war (`findActiveLockPeriod`), und zählt eine als aktiv, solange `withdrawnAt > openTime`. Bei
 * Gleichstand ist sie es nicht mehr — die Öffnung ist damit sauber, ohne dass die Ableitung einen
 * Sonderfall für diesen Knopf bräuchte. In der UMGEKEHRTEN Reihenfolge (erst erfassen, dann
 * zurückziehen) stünde sie als „unerlaubte Öffnung" im Strafbuch, obwohl die Keyholderin sie selbst
 * ausgelöst hat.
 *
 * Denselben sauberen Ausgang erreicht auch, wer es von Hand tut — Sperrzeit über den Rückzug-Knopf
 * beenden, danach die Öffnung erfassen. Der Dienst gewinnt also Unteilbarkeit und einen Tipp, nicht
 * Korrektheit. Was er zusätzlich sichert, ist die REIHENFOLGE: von Hand kann man sie vertauschen.
 *
 * Der Vertrag hängt an einem einzigen `>` in `strafbuch.ts`, und nichts dort kennzeichnet ihn als
 * Vertrag. Deshalb nageln ihn zwei Tests fest (`strafbuch.test.ts`, „die Sperrzeit, die im Moment
 * der Öffnung endet") — samt Gegenprobe eine Millisekunde daneben.
 *
 * Aus demselben Grund ein EIGENER Endgrund (`released`): `opening` heisst „vom Sub aufgebrochen"
 * und speist `getInterruptedLockPeriod`, also die Anzeige „gebrochene Sperrzeit". Eine Freigabe ist
 * kein Bruch.
 *
 * **Was der Knopf NICHT ist:** die Not-Öffnung. Die bleibt in Heimdall und soll im Box-Protokoll
 * unterscheidbar bleiben.
 */

const errors = serviceErrors({
  /** Nichts aufzuschliessen — der Träger ist gar nicht verschlossen. Wirft `createOeffnenEntryTx`. */
  NOT_LOCKED: { status: 400, error: "USER_NOT_LOCKED" },
  /**
   * Der Verschluss liegt später als die Öffnung — auch das wirft `createOeffnenEntryTx`.
   *
   * Der Code MUSS hier stehen, so selten der Fall auch ist: ohne Tabellen-Eintrag gäbe
   * `mapServiceError` `null` zurück, der Fehler flöge durch, und die Route antwortete mit 500 auf
   * eine ganz gewöhnliche Ablehnung.
   */
  TIME_BEFORE: { status: 400, error: "TIME_BEFORE" },
} as const);

/**
 * Welche Sperrzeiten der Knopf beendet — EINE Where-Klausel für Vorschau UND Vollzug.
 *
 * Sie stand kurz zweimal da, und die beiden waren schon verschieden: die Vorschau zählte ohne
 * `endsAt`-Filter also auch längst ABGELAUFENE, nie zurückgezogene Sperrzeiten mit. Die
 * Trockenübung versprach damit „beendet 3 Sperrzeiten", der Vollzug beendete eine — genau die
 * Abweichung, gegen die es die Trennung von Vorschau und Vollzug überhaupt gibt.
 *
 * Die Auswahl ist DIESELBE wie beim Rückzug von Hand (`withdrawVerschlussAnforderung`): alles, was
 * noch nicht abgelaufen ist — auch TERMINIERTE, noch nicht ausgelöste. Ohne die wäre eine in fünf
 * Minuten anspringende Sperre übriggeblieben und hätte gleich wieder verriegelt.
 */
const endableLockPeriods = (userId: string, now: Date) => ({
  userId,
  art: "SPERRZEIT",
  withdrawnAt: null,
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

export interface ReleaseNowPreview {
  /** Grund, warum gerade nicht aufgeschlossen werden kann — `null` = es geht. */
  blockedReason: "NOT_LOCKED" | null;
  /** Wie viele aktive Sperrzeiten der Knopf beenden würde. */
  endingLockPeriods: number;
  /** Gibt es überhaupt eine Box, die ein Kommando bekommen könnte? */
  opensBox: boolean;
}

/**
 * Was der Knopf täte — schreibfrei, für die MCP-Trockenübung.
 *
 * Getrennt vom Vollzug, damit die Vorschau dieselbe Prüfung benutzt wie er. Eine zweite
 * Nachrechnung liefe irgendwann auseinander und verspräche einen Erfolg, der mit 400 endet —
 * derselbe Schnitt wie bei `checkTask`/`writeTask`.
 */
export async function previewReleaseNow(userId: string): Promise<ReleaseNowPreview> {
  const [locked, endingLockPeriods, box] = await Promise.all([
    getIsLocked(userId),
    prisma.verschlussAnforderung.count({ where: endableLockPeriods(userId, new Date()) }),
    // Über den geteilten Kontext statt über ein eigenes `count`: der trägt das
    // `heimdallEnabled()`-Tor. Ohne das verspräche die Vorschau auf einer Installation ohne
    // Heimdall eine Box, die es dort gar nicht gibt.
    getBoxFormContext(userId),
  ]);
  return {
    blockedReason: locked ? null : "NOT_LOCKED",
    endingLockPeriods,
    opensBox: box.boxConfirm,
  };
}

export interface ReleaseNowParams {
  userId: string;
  actor: MessageActor;
  /** Zusätzlich ein Orgasmus-Fenster öffnen (Häkchen am Knopf). */
  allowOrgasm?: boolean;
  /** Freitext am Eintrag. */
  note?: string;
  /** Konto der Auslösenden — sie fällt aus der Empfängerliste der Eintrags-Meldung. Fehlt es (MCP),
   *  wird niemand gestrichen. */
  actorUserId?: string;
}

export interface ReleaseNowResult {
  entryId: string;
  /** Wie viele Sperrzeiten beendet wurden. */
  endedLockPeriods: number;
  /** Hat die Box wirklich ein Kommando bekommen? */
  boxCommanded: boolean;
  /** Id des geöffneten Orgasmus-Fensters — `null`, wenn keines gewollt war oder es scheiterte. */
  orgasmWindowId: string | null;
}

export async function releaseNow(params: ReleaseNowParams): Promise<ServiceResult<ReleaseNowResult>> {
  const { userId, actor, allowOrgasm = false, note, actorUserId } = params;

  try {
    const committed = await prisma.$transaction(async (tx) => {
      // EINE Uhr für alles. Der Gleichstand von `withdrawnAt` und `startTime` ist keine
      // Nachlässigkeit, sondern die Bedingung dafür, dass die Öffnung nicht als Bruch zählt —
      // Begründung im Kopf dieser Datei.
      const now = new Date();

      // 1. Die Sperre fällt — zuerst, und als Freigabe, nicht als Bruch.
      //
      //    Der Zustands-Wächter steht bewusst NICHT hier: `createOeffnenEntryTx` prüft ihn unten in
      //    derselben Transaktion und wirft die Codes, die oben in der Tabelle stehen. Ein eigener
      //    Vorabcheck wäre eine zweite Abfrage derselben Zeile — und die zweite Stelle, die beim
      //    nächsten Mal jemand vergisst nachzuziehen. Schlägt er an, rollt Schritt 1 mit zurück.
      const { count: endedLockPeriods } = await tx.verschlussAnforderung.updateMany({
        where: endableLockPeriods(userId, now),
        data: { withdrawnAt: now, endedReason: LOCK_ENDED_REASON.released },
      });

      // 2. Die Öffnung wird erfasst — über den geteilten Dienst, nicht mit einem eigenen `create`.
      //    Seine eigene Sperrzeit-Freigabe findet nichts mehr; das ist gewollt, Schritt 1 hat sie
      //    bereits mit dem richtigen Grund beendet.
      const { entryId } = await createOeffnenEntryTx(tx, {
        userId,
        startTime: now,
        oeffnenGrund: "KEYHOLDER",
        note: note ?? "",
        source: "user",
      });

      // 3. Die Box bekommt ihr Kommando — und der Zähler DIESES Schreibvorgangs sagt, ob eines
      //    ansteht. Vorher kam die Auskunft aus einem `updateMany` daneben; ohne Heimdall steigt
      //    `setBoxCommandForUser` still aus, die Antwort hätte trotzdem „beauftragt" gemeldet.
      //    Dieselbe Entscheidung, nicht dieselbe Bedingung noch einmal.
      //
      //    Die EIGENE Frist der Box (`BoxStatus.lockUntil`) wird hier bewusst NICHT angefasst: die
      //    Spalte ist die Selbstauskunft der Box, die `/api/integration/box/status` bei jedem Sync
      //    überschreibt — hineinzuschreiben hiesse, in den Spiegel zu schreiben. Gestellt wird die
      //    Frist über `/api/integration/box/config`, und das leitet sie aus `getActiveLockPeriod`
      //    ab; nach Schritt 1 also aus nichts.
      //    Das Kommando kommt aus `boxCommandForEntry`, nicht als Literal: dort steht die EINE
      //    Regel, welchem Eintrag die Box folgt (und die zwei Fälle, in denen sie es nicht tut).
      //    Ein hartes „open" hier wäre die Stelle, die eine dort ergänzte dritte Regel verpasst.
      const cmd = boxCommandForEntry({ type: "OEFFNEN", brokeLockPeriod: false });
      const boxCommanded = cmd ? await setBoxCommandForUser(tx, userId, cmd) : false;

      return { entryId, entryAt: now, endedLockPeriods, boxCommanded };
    });

    // Ab hier nach dem Commit: ein langsamer HTTP-Aufruf hat in einem SQLite-Schreib-Lock nichts
    // verloren, und der Orgasmus-Dienst bringt seine eigene Transaktion mit (Prisma kann sie nicht
    // verschachteln).
    if (committed.boxCommanded) void notifyHeimdallForUserId(userId, "open");

    // Das Fenster über den DIENST, nicht mit einem rohen `create`: der benachrichtigt den Träger
    // (sonst hätte er ein Fenster, von dem er nichts weiss) und zieht eine noch offene Anweisung
    // zurück, hält also die „eine zur Zeit"-Regel ein.
    let orgasmWindowId: string | null = null;
    if (allowOrgasm) {
      const jetzt = new Date();
      const fenster = await createOrgasmusAnforderung({
        userId,
        // GELEGENHEIT, nicht ANWEISUNG: eine Pflicht erzeugte bei Nichterfüllung ein Vergehen
        // (`missed_orgasm`), und ein Vergehen dafür, dass jemand keinen Sex hatte, ist nicht gemeint.
        art: "GELEGENHEIT",
        beginntAt: jetzt.toISOString(),
        endsAt: new Date(jetzt.getTime() + RELEASE_ORGASM_WINDOW_H * 3_600_000).toISOString(),
        oeffnenErlaubt: true,
      }, actor);
      // Scheitert das Fenster, bleibt das Aufschliessen trotzdem stehen — es zurückzudrehen wäre
      // schlimmer als das fehlende Fenster. Die Id bleibt `null` und sagt es dem Aufrufer.
      if (fenster.ok) orgasmWindowId = fenster.data.id;
    }

    // Die Kontrolleure des Subs erfahren von der Öffnung wie bei jedem anderen Eintrag. Auf dem
    // Keyholder-Eintragspfad hat genau diese Meldung einmal gefehlt (Vorfall 03.08.2026) — eine
    // zweite Keyholderin sah nichts. Die Auslösende ist nicht Empfängerin: sie hat gerade gedrückt.
    const wearer = await prisma.user.findUnique({ where: { id: userId } });
    if (wearer) {
      void notifyControllersAboutEntry({
        userId,
        actorUserId,
        username: wearer.username,
        type: "OEFFNEN",
        startTime: committed.entryAt,
        oeffnenGrund: "KEYHOLDER",
        note: note ?? null,
        reasonConfig: wearer,
      });
    }

    await notifyUser(userId, {
      subjectKey: "releasedNowSubject",
      messageKey: "releasedNowMessage",
      // Immer zustellen: das ist keine Meldung ÜBER etwas, sondern die Mitteilung, dass er gerade
      // aufgeschlossen wurde. Wer das erst beim nächsten App-Start erfährt, sitzt derweil
      // verschlossen da und weiss es nicht.
      alwaysNotify: true,
      inbox: { actor },
    });

    const { entryAt: _intern, ...data } = committed;
    return { ok: true, data: { ...data, orgasmWindowId } };
  } catch (e) {
    const mapped = mapServiceError(e, errors.table);
    if (mapped) return mapped;
    throw e;
  }
}
