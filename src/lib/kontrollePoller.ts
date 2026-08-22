import { prisma } from "@/lib/prisma";
import { pruneExpiredMessages } from "@/lib/messageService";
import { pruneWeightPhotos } from "@/lib/weightService";
import { LOCK_ENDED_REASON } from "@/lib/constants";
import { sendKontrolleNotification, deriveSealCode, hasActiveKontrolle, inspectionCodeRequired } from "@/lib/kontrolleService";
import { getIsLocked, getActiveSperrzeit } from "@/lib/queries";
import { resolveInspectionTarget, inspectionTargetLabel, isKgTarget } from "@/lib/inspectionTarget";
import { sendVerschlussAnforderungNotifications, checkLockEnd, carryOverSperrzeitOnAlreadyLocked } from "@/lib/verschlussAnforderungService";
import { sendOrgasmusAnforderungNotifications, checkOrgasmWindowEnd } from "@/lib/orgasmusAnforderungService";
import { ensureDailyAutoKontrollen, deleteWithdrawnAutoKontrollen, isSleepingAt, autoKontrolleSettingsFromUser, AUTO_KONTROLLE_SETTINGS_SELECT } from "@/lib/autoKontrolleService";
import { APP_TZ } from "@/lib/utils";
import { sendInspectionReminder, autoMarkInspectionRemoved, notifyInspectionAutoMarked, predictAutoMarkAt } from "@/lib/inspectionEscalationService";
import { maybeRunHealthChecks } from "@/lib/healthCheck";
import { maybeAnnounceOffenses } from "@/lib/offenseAnnounce";
import { deadlineFromDispatch, dueForDispatchWhere } from "@/lib/delayedTrigger";
import { dispatchDueTasks, processDueTasks } from "@/lib/taskService";

// Verschickt fällige, zeitversetzte Kontroll-Anforderungen (wirksamAb erreicht, noch nicht
// benachrichtigt). Ein Container pro Instanz → ein Poller je Prozess genügt; der Zustand liegt
// in der DB und übersteht Neustart/Deploy. Fehler dürfen den Poller nie abbrechen.
const POLL_INTERVAL_MS = 60 * 1000;
let running = false;

async function processDue(): Promise<void> {
  if (running) return; // kein überlappender Lauf, falls ein Tick länger dauert
  running = true;
  try {
    const now = new Date();

    // Auto-Kontrollen aller aktiven User für „heute" einplanen — JEDEN Tick aufrufen, nicht nur zur
    // CH-Mitternacht: die per-User-Funktion ist idempotent je SUB-Zeitzone-Tag (DB-Check), sodass jeder
    // Sub seine Kontrollen zu SEINEM lokalen Tagesbeginn bekommt (ein globaler CH-Tages-Gate würde
    // Nicht-CH-Subs erst zur CH-Mitternacht einplanen → verschobene/fehlende Fenster). Für CH-Subs ist
    // das Ergebnis identisch (heute schon geplant → 0). Schlägt es fehl, läuft das Versenden weiter.
    await ensureDailyAutoKontrollen(now).catch((e) => console.error("[autoKontrolle]", e));
    // Cleanup (Listen-Rauschen, kein History-Wert) nur bei UTC-Tageswechsel — Timing unkritisch, spart
    // den findMany je Tick. deleteWithdrawnAutoKontrollen filtert intern per Sub-Zeitzone.
    const utcDayKey = Math.floor(now.getTime() / 86_400_000);
    const g = globalThis as unknown as { __autoKontrolleCleanupDay?: number };
    if (g.__autoKontrolleCleanupDay !== utcDayKey) {
      g.__autoKontrolleCleanupDay = utcDayKey;
      await deleteWithdrawnAutoKontrollen(now).catch((e) => console.error("[autoKontrolle:cleanup]", e));
      // Posteingang beschneiden — dasselbe Tages-Gate und aus demselben Grund: Timing unkritisch,
      // und je Lauf ist die Menge begrenzt (das Beschneiden holt über die Tage auf).
      // Waagen-Fotos im selben Tages-Gate und aus demselben Grund: Timing unkritisch, die Menge je
      // Lauf ist begrenzt, und der Rückstand holt über die Tage auf.
      await pruneWeightPhotos(now)
        .then((n) => { if (n > 0) console.log(`[weight:prune] ${n} Waagen-Fotos gelöscht`); })
        .catch((e) => console.error("[weight:prune]", e));
      await pruneExpiredMessages(now)
        .then((n) => { if (n > 0) console.log(`[messages:prune] ${n} Meldungen gelöscht`); })
        .catch((e) => console.error("[messages:prune]", e));
    }

    const due = await prisma.kontrollAnforderung.findMany({
      where: { ...dueForDispatchWhere(now), entryId: null },
      include: { user: { select: { id: true, email: true, username: true, locale: true, autoKontrolleNurBeiSperre: true } } },
      // Chronologisch: werden mehrere Kontrollen desselben Users im selben Tick fällig, überlebt die
      // früheste (wird zuerst zugestellt), die späteren verwirft der Überschneidungs-Schutz unten.
      orderBy: { wirksamAb: "asc" },
      take: 50,
    });

    // Eine fällige Zeile lautlos zurückziehen (kein Nachholen) — die Auslösung ist sinnlos geworden.
    const withdrawKa = (id: string) =>
      prisma.kontrollAnforderung.update({ where: { id }, data: { withdrawnAt: new Date() } });

    for (const ka of due) {
      try {
        // Der Zustand des ZIELS bei Zustellung — beim KG der Lock-Eintrag (Siegel + Gerät), bei
        // einer Trage-Kontrolle die laufende Session. Auto-Kontrollen zielen immer auf den KG
        // (`categoryId: null`), die Zweige darunter bleiben damit unverändert.
        const resolved = await resolveInspectionTarget(ka.userId, ka);
        const target = resolved.ok ? resolved.target : null;
        const latest = target?.lockEntry ?? null;
        // Eine Auto-Kontrolle auf ein Ziel, das gerade nicht läuft, ist sinnlos → bei Fälligkeit
        // zurückziehen statt senden. Über `target.active` statt über den Lock-Eintrag: heute zielt
        // jede Auto-Kontrolle auf den KG, aber „aktiv" heisst je Ziel etwas anderes.
        if (ka.auto && !target?.active) {
          await withdrawKa(ka.id);
          continue;
        }
        // Opt-in „nur bei Sperrzeit": eine bei Fälligkeit ohne aktive Sperrzeit angetroffene
        // Auto-Kontrolle zurückziehen (kein Nachholen — dieselbe Behandlung wie offener KG). Die
        // Sperrzeit-Abfrage läuft nur, wenn der Sub schon verschlossen ist (obiger Check bestanden)
        // und der Schalter gesetzt ist.
        // `!ka.cleaningRelock`: für die Kontrolle nach einer Reinigungspause gilt der Schalter nicht —
        // ihr Anlass ist die Reinigung selbst, nicht der Tagesplan, und ohne laufende Sperrzeit ist
        // sie genauso berechtigt.
        if (ka.auto && !ka.cleaningRelock && ka.user.autoKontrolleNurBeiSperre && !(await getActiveSperrzeit(ka.userId))) {
          await withdrawKa(ka.id);
          continue;
        }
        // Überschneidungs-Schutz: eine andere Kontrolle ist schon aktiv (Keyholder, KI, oder eine
        // andere Auto-Kontrolle) → diese hier verwerfen statt ausliefern (User-Entscheidung: kein
        // Nachholen, gilt für ALLE Quellen, nicht nur Auto).
        if (await hasActiveKontrolle(ka.userId, now, { categoryId: ka.categoryId, excludeId: ka.id })) {
          await withdrawKa(ka.id);
          continue;
        }
        // Aktive Siegel-Nummer mitgeben: ≠ Code → Mail verlangt das Siegel zusätzlich auf dem
        // Foto; = Code (Legacy-Zeile) → altes „Siegel-Nummer"-Label. Beides entscheidet die
        // Notification selbst.
        const sealCode = deriveSealCode(latest);

        // Verlangt das JETZT getragene Gerät einen Code? Diese Frage gehört an die Zustellung, nicht
        // an die Planung: Auto-Kontrollen werden zu Tagesbeginn für den ganzen Tag gewürfelt, und
        // welches Gerät um 15:40 verschlossen ist, weiss um Mitternacht niemand. Verlangt es keinen,
        // wird der geplante Code hier verworfen — die Mail nennt dann keinen, und die Erfüllung läuft
        // über „die eine offene Anforderung" (siehe entries-Route).
        const code = (await inspectionCodeRequired(target?.activeDeviceId ?? null)) ? ka.code : null;

        // Die Frist zählt ab dem Moment, in dem der Sub sie ERFÄHRT, nicht ab dem geplanten
        // Auslöse-Zeitpunkt (siehe deadlineFromDispatch). Im Normalfall sind das Sekunden Versatz.
        // Damit kann eine stark verspätete Frist in Randfällen ins Schlaf-Fenster ragen, das die
        // Planung meidet — bewusst in Kauf genommen: eine unerfüllbare Frist erzeugt ein
        // Falsch-Vergehen, eine um Minuten verschobene nicht.
        const sentAt = new Date();
        const deadline = deadlineFromDispatch(ka, sentAt);

        await sendKontrolleNotification({
          user: ka.user, code, sealCode, kommentar: ka.kommentar, deadline, controlId: ka.id,
          target: { categoryId: ka.categoryId, label: inspectionTargetLabel(target) },
          // Der Handelnde ist der, der die Kontrolle GESTELLT hat — der Poller ist nur der Bote.
          // Bei Auto-Kontrollen (und Altzeilen) ist die Spalte null: dann meldet, wie bisher, das
          // System. Genau richtig — hinter einer Auto-Kontrolle steht kein Mensch.
          actor: ka.createdBy,
        });
        // Frist UND Code mitschreiben: Mail, Strafbuch-Beurteilung, Eskalation und die Erfüllung
        // müssen dieselben Werte lesen. Ein verworfener Code darf nicht in der Zeile stehenbleiben —
        // sonst suchte die Erfüllung weiter nach einem Code, den der Sub nie bekommen hat.
        await prisma.kontrollAnforderung.update({ where: { id: ka.id }, data: { benachrichtigtAt: sentAt, deadline, code } });
      } catch (e) {
        // benachrichtigtAt bleibt null → nächster Lauf versucht es erneut.
        console.error(`[kontrollePoller] Auslösung fehlgeschlagen (${ka.id}):`, (e as Error).message);
      }
    }

    // Kontroll-Eskalation (Mahnung, dann ggf. automatisch als abgelegt markieren) im selben Tick.
    await processInspectionEscalation(now);

    // Zeitversetzte VerschlussAnforderungen (ANFORDERUNG/SPERRZEIT) im selben Tick — kein zweiter Timer.
    await processDueVerschlussAnforderungen(now);

    // Zeitversetzte Orgasmus-Anweisungen, gleiche Zusage, gleicher Tick.
    await processDueOrgasmusAnforderungen(now);

    // Zeitversetzte AUFGABEN im selben Tick, direkt neben ihren beiden Geschwistern und mit
    // derselben Zusage: erst zustellen, dann stempeln, und im `await`-Zweig — der `running`-Riegel
    // oben ist Teil der Einmal-Zusage, nicht bloss Bequemlichkeit.
    //
    // VOR `processDueTasks`: eine soeben zugestellte Aufgabe bekommt dabei ihr verschobenes
    // `holdUntil`; würde erst gemeldet und dann zugestellt, sähe die Ergebnis-Meldung im selben Tick
    // noch die alte, womöglich schon abgelaufene Frist.
    await dispatchDueTasks(now).catch((e) => console.error("[dispatchDueTasks]", e));

    // Selfhosted-KI-Erreichbarkeit prüfen (intern alle HEALTHCHECK_INTERVAL_MIN gedrosselt; No-op ohne
    // konfigurierte selfhosted-KI). FIRE-AND-FORGET: die Probes können bis zum Timeout hängen — das darf
    // den zeitkritischen Poller-Tick (fällige Kontroll-/Sperrzeit-Mails) NICHT verzögern. Der State liegt
    // in globalThis, nicht am Tick gekoppelt; ohne `now`-Argument nutzt der Check die echte Ausführungszeit.
    void maybeRunHealthChecks().catch((e) => console.error("[health]", e));

    // Festgestellte Vergehen in den Posteingang melden (intern auf fünf Minuten gedrosselt).
    // FIRE-AND-FORGET aus demselben Grund wie der Health-Check: der Lauf baut je Träger ein volles
    // Strafbuch und darf die zeitkritischen Fristen-Mails dieses Ticks nicht hinter sich anstellen.
    void maybeAnnounceOffenses(now).catch((e) => console.error("[offenses]", e));

    // Ergebnis fälliger Aufgaben melden. Eigener Block auf der eigenen Tabelle — der frühere
    // Leak-Befund betraf die GETEILTE Anforderungs-Tabelle, hier gibt es keine Überschneidung.
    //
    // Bewusst `await`, anders als der Health-Check eine Zeile darüber: der Block hält seine
    // Zustellung nicht in `globalThis` fest, sondern stempelt sie in der DB (`resultNotifiedAt`) —
    // und zwar erst NACH der Schleife. Liefe er zweimal überlappend, meldeten beide Läufe dieselben
    // Aufgaben, bevor der erste stempelt. Der `running`-Riegel des Tickers ist damit Teil der
    // Einmal-Zusage, nicht bloss Bequemlichkeit. Der Health-Check darf laufen lassen, weil er nichts
    // verschickt, was doppelt ankommen könnte.
    //
    // Steht bewusst am ENDE des Tickes: die zeitkritischen Blöcke (Kontroll-/Sperrzeit-Mails) sind
    // dann längst durch, verzögert wird höchstens der NÄCHSTE Tick.
    await processDueTasks(now).catch((e) => console.error("[processDueTasks]", e));
  } finally {
    running = false;
  }
}

/**
 * Zweistufige Kontroll-Eskalation, beide Stufen opt-in pro User (default aus):
 * Stufe 1 (Mahnung) stempelt IMMER `benachrichtigtReminderAt`, sobald die konfigurierte
 * Verzögerung nach der Deadline abgelaufen ist — unabhängig von `inspectionReminderEnabled`
 * (nur der eigentliche Versand ist gegated, siehe sendInspectionReminder). Das entkoppelt den
 * Uhr-Anker von der sichtbaren Benachrichtigung, damit Stufe 2 auch ohne aktivierte Stufe 1
 * funktioniert (getrennte Schalter). Stufe 2 (Auto-Mark) ist zusätzlich per
 * `inspectionAutoMarkEnabled` gegated und zählt ab `benachrichtigtReminderAt`, nicht ab der
 * ursprünglichen Deadline. Grobfilter (Deadline/Flags) läuft in SQL, der genaue Minuten-Delay pro
 * Zeile in JS — dieselbe Zwei-Stufen-Filterung wie beim Auto-Kontrolle-Zeitfenster.
 */
async function processInspectionEscalation(now: Date): Promise<void> {
  const reminderDue = await prisma.kontrollAnforderung.findMany({
    where: {
      deadline: { lt: now },
      benachrichtigtAt: { not: null },
      benachrichtigtReminderAt: null,
      withdrawnAt: null,
      entryId: null,
    },
    include: {
      user: {
        select: {
          id: true,
          inspectionReminderEnabled: true,
          inspectionReminderDelayMinutes: true,
          inspectionAutoMarkEnabled: true,
          inspectionAutoMarkDelayMinutes: true,
        },
      },
    },
    take: 50,
  });
  for (const ka of reminderDue) {
    const dueAt = ka.deadline.getTime() + ka.user.inspectionReminderDelayMinutes * 60_000;
    if (dueAt > now.getTime()) continue;
    try {
      await sendInspectionReminder({ id: ka.id, code: ka.code, user: ka.user });
    } catch (e) {
      console.error(`[kontrollePoller] Kontroll-Mahnung fehlgeschlagen (${ka.id}):`, (e as Error).message);
    }
  }

  const autoMarkDue = await prisma.kontrollAnforderung.findMany({
    where: {
      benachrichtigtReminderAt: { not: null },
      autoMarkedRemovedAt: null,
      withdrawnAt: null,
      entryId: null,
      user: { inspectionAutoMarkEnabled: true },
    },
    include: { user: { select: { ...AUTO_KONTROLLE_SETTINGS_SELECT, username: true, inspectionAutoMarkEnabled: true, inspectionAutoMarkDelayMinutes: true, inspectionReminderDelayMinutes: true } } },
    take: 50,
  });
  for (const ka of autoMarkDue) {
    // DIESELBE Rechnung, die das Dashboard dem Sub ankündigt (`predictAutoMarkAt`). Sie enthält
    // beides: den Mahn-Stempel als Anker und den Schlaf-Fenster-Sonderfall — für eine Kontrolle, die
    // nach einer Reinigungspause IM SCHLAF-FENSTER zugestellt wurde, bleibt es bei der Mahnung
    // (Stufe 1 oben läuft normal), verschlafene Minuten dürfen die Session nicht abbrechen. Wer hier
    // rechnet und dort ankündigt, hat zwei Wahrheiten — und die Ankündigung ist die, die der Sub
    // liest.
    const dueAt = predictAutoMarkAt(ka, ka.user);
    if (!dueAt || dueAt.getTime() > now.getTime()) continue;
    try {
      const result = await autoMarkInspectionRemoved({ id: ka.id, userId: ka.userId });
      if (!result.skipped) {
        // Notifications are not transactional — send only after the state change committed.
        await notifyInspectionAutoMarked({
          userId: ka.userId, username: ka.user.username, code: ka.code, controlId: ka.id,
          wear: !isKgTarget(ka),
        });
      }
    } catch (e) {
      console.error(`[kontrollePoller] Kontroll-Auto-Mark fehlgeschlagen (${ka.id}):`, (e as Error).message);
    }
  }
}

/**
 * Verschickt fällige, zeitversetzte VerschlussAnforderungen (wirksamAb erreicht, noch nicht
 * benachrichtigt). Sanity-Check analog Auto-Kontrolle: passt der aktuelle Lock-Zustand nicht
 * mehr zur Art (ANFORDERUNG bei bereits verschlossenem User, SPERRZEIT bei offenem User) ODER ist
 * das Sperr-Ende schon vorbei, wird statt gesendet zurückgezogen. Fehler → benachrichtigtAt bleibt
 * null (Retry nächster Tick).
 */
async function processDueVerschlussAnforderungen(now: Date): Promise<void> {
  const due = await prisma.verschlussAnforderung.findMany({
    where: { ...dueForDispatchWhere(now), fulfilledAt: null },
    include: { user: { select: { id: true, email: true, username: true, locale: true } } },
    take: 50,
  });

  for (const va of due) {
    try {
      const isLocked = await getIsLocked(va.userId);
      const art = va.art as "ANFORDERUNG" | "SPERRZEIT";

      // Auslösung sinnlos geworden → zurückziehen statt senden. Ein bereits abgelaufenes Sperr-Ende
      // (dieselbe Regel wie im Service, siehe checkLockEnd) gehört in dieselbe Klasse: die Sperre
      // wäre im Moment ihrer Auslösung schon vorbei, und die Mail meldete dem Sub „Gesperrt bis
      // <Vergangenheit>". Defense in depth — der Service lässt solche Zeilen seit v4.50.30 weder
      // anlegen noch ändern, ältere können aber noch in der DB liegen.
      const obsolete = art === "ANFORDERUNG"
        ? isLocked
        : !isLocked || checkLockEnd(va.endetAt, va.wirksamAb, now) !== null;
      if (obsolete) {
        // Gegenstandslos heisst nicht wertlos: eine ANFORDERUNG an einen bereits verschlossenen Sub
        // ist ERFÜLLT, und die Sperrzeit, die sie mitbringt, bleibt gewollt. Warum und mit welchem
        // Anker steht bei `carryOverSperrzeitOnAlreadyLocked`; `null` = nichts zu übernehmen.
        const uebernommen = art === "ANFORDERUNG" ? await carryOverSperrzeitOnAlreadyLocked(va, now) : null;
        if (!uebernommen) {
          await prisma.verschlussAnforderung.update({
            where: { id: va.id },
            data: { withdrawnAt: new Date(), endedReason: LOCK_ENDED_REASON.obsolete },
          });
          continue;
        }
        // Nach dem Commit (Notifications sind nicht transaktional). Der Sub hat von der terminierten
        // Anforderung nie erfahren — ohne diese Meldung liefe er in eine Sperre, von der er nichts
        // weiss, und die nächste Öffnung wäre ein unverschuldetes Vergehen.
        await sendVerschlussAnforderungNotifications({
          userId: va.userId,
          user: va.user,
          art: "SPERRZEIT",
          nachricht: uebernommen.nachricht,
          endetAtDate: uebernommen.endetAt,
          requestId: uebernommen.sperrzeitId,
          // Aus der ÜBERNOMMENEN Zeile, wie ihr Text daneben: die Meldung gehört zur Sperrzeit und
          // nennt deshalb, was in IHR steht. Dass die Anordnende dieselbe ist wie an der Anforderung,
          // ist die Vererbung in `carryOverSperrzeitOnAlreadyLocked` — und die steht dort, nicht hier.
          actor: uebernommen.createdBy,
        });
        continue;
      }

      await sendVerschlussAnforderungNotifications({
        userId: va.userId,
        user: va.user,
        art,
        nachricht: va.nachricht,
        endetAtDate: va.endetAt,
        dauerH: va.dauerH,
        sperrEndetAtDate: va.sperrEndetAt,
        requestId: va.id,
        // Wie bei der Kontrolle: genannt wird, wer die Direktive angeordnet hat, nicht der Bote.
        actor: va.createdBy,
      });
      await prisma.verschlussAnforderung.update({ where: { id: va.id }, data: { benachrichtigtAt: new Date() } });
    } catch (e) {
      // benachrichtigtAt bleibt null → nächster Lauf versucht es erneut.
      console.error(`[kontrollePoller] Verschluss-Auslösung fehlgeschlagen (${va.id}):`, (e as Error).message);
    }
  }
}

/**
 * Verschickt fällige, zeitversetzte Orgasmus-Anweisungen (wirksamAb erreicht, noch nicht
 * benachrichtigt).
 *
 * Sanity-Check wie bei der Sperrzeit, aus demselben Grund: ist das FENSTER bei Zustellung schon
 * vorbei, wird zurückgezogen statt gesendet — eine `ANWEISUNG` würde sonst im Moment ihrer Mail zum
 * Vergehen für eine Frist, die der Sub nie hatte (B-01). Der Dienst lässt solche Zeilen seit dem
 * `checkOrgasmWindowEnd` gegen `wirksamAb` gar nicht erst anlegen; hier fängt es den Fall ab, dass
 * der Poller lange stand (Container-Neustart) und das Fenster inzwischen verstrichen ist.
 *
 * Fehler → `benachrichtigtAt` bleibt null (Retry nächster Tick).
 */
async function processDueOrgasmusAnforderungen(now: Date): Promise<void> {
  const due = await prisma.orgasmusAnforderung.findMany({
    where: { ...dueForDispatchWhere(now), fulfilledAt: null },
    include: { user: { select: { email: true, username: true, orgasmusArtenConfig: true, locale: true } } },
    take: 50,
  });

  for (const oa of due) {
    try {
      if (checkOrgasmWindowEnd(oa.endetAt, now)) {
        await prisma.orgasmusAnforderung.update({ where: { id: oa.id }, data: { withdrawnAt: new Date() } });
        continue;
      }
      // Das FENSTER wandert um die Verspätung mit — wie die ganze Geometrie einer Aufgabe
      // (`deadlineFromDispatch`, Abschnitt über `Task`). Der Poller läuft im Minutenraster, ein
      // Container-Neustart hält ihn ganz an: ohne diese Verschiebung bekäme der Sub ein Fenster, das
      // zum Zeitpunkt der Mail schon fast durch ist — und mit `art: "ANWEISUNG"` Minuten später ein
      // Vergehen. Er bekommt stattdessen die Spanne, die für ihn vorgesehen war, ab dem Moment, in
      // dem er davon erfährt. Pünktlich (Regelfall: Sekunden) verschiebt sich praktisch nichts.
      const sentAt = new Date();
      const lateMs = Math.max(0, sentAt.getTime() - (oa.wirksamAb?.getTime() ?? sentAt.getTime()));
      const beginnt = new Date(oa.beginntAt.getTime() + lateMs);
      const endet = new Date(oa.endetAt.getTime() + lateMs);
      await sendOrgasmusAnforderungNotifications({
        userId: oa.userId,
        user: oa.user,
        art: oa.art as "ANWEISUNG" | "GELEGENHEIT",
        nachricht: oa.nachricht,
        beginnt,
        endet,
        vorgegebeneArt: oa.vorgegebeneArt,
        oeffnenErlaubt: oa.oeffnenErlaubt,
        directiveId: oa.id,
        // Wie bei Kontrolle und Verschluss: genannt wird, wer die Anweisung angeordnet hat, nicht der Bote.
        actor: oa.createdBy,
      });
      // Verschobenes Fenster UND Stempel in EINEM Schreibvorgang: die Mail nennt bereits die neuen
      // Zeiten, eine Zeile mit alten Werten wäre ab hier eine Lüge gegenüber dem Träger.
      await prisma.orgasmusAnforderung.update({
        where: { id: oa.id },
        data: { beginntAt: beginnt, endetAt: endet, benachrichtigtAt: sentAt },
      });
    } catch (e) {
      console.error(`[kontrollePoller] Orgasmus-Auslösung fehlgeschlagen (${oa.id}):`, (e as Error).message);
    }
  }
}

/** Startet den Minuten-Poller (idempotent — Doppelstart bei Modul-Reuse wird ignoriert). */
export function startKontrollePoller(): void {
  const g = globalThis as unknown as { __kontrollePollerStarted?: boolean };
  if (g.__kontrollePollerStarted) return;
  g.__kontrollePollerStarted = true;
  setInterval(() => {
    processDue().catch((e) => console.error("[kontrollePoller]", e));
  }, POLL_INTERVAL_MS);
}
