import { auth } from "@/lib/auth";
import BlockHeading from "@/app/components/BlockHeading";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getControlledSubs } from "@/lib/keyholder";
import Link from "next/link";

import KontrolleButton from "./KontrolleButton";
import VerschlussAnforderungButton from "./VerschlussAnforderungButton";
import EditLockRequestButton from "./EditLockRequestButton";
import EditLockPeriodButton from "./EditLockPeriodButton";
import ReleaseNowButton from "./ReleaseNowButton";
import QuickSettingChip from "./QuickSettingChip";
import WithdrawButton from "./WithdrawButton";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import { inspectionTargetLabel } from "@/lib/inspectionTarget";
import { KONTROLLE_TARGET_INCLUDE, latestKgTimesByUser } from "@/lib/queries";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import EmptyState from "@/app/components/EmptyState";
import UserAvatar from "@/app/components/UserAvatar";
import { Users, CalendarClock, ChevronRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { toDateLocale, formatDurationBetween, formatDateTimeDual, nowDatetimeLocal, APP_TZ } from "@/lib/utils";
import { getKeyholderLockPeriods, getKeyholderOrgasmusAnforderungen, keyholderVisibleKontrolleWhere, foldActiveLockPeriods, isScheduledDirective, LOCK_REQUEST_ORDER, openLockRequestWhere } from "@/lib/queries";
import { orgasmusAnforderungArtLabel, heimdallEnabled, weightTrackingEnabled } from "@/lib/constants";
import { QUICK_SETTING_SELECT, quickSettingOnCard, parseQuickSettings, quickSettingValue } from "@/lib/quickSettings";
import Section from "@/app/components/Section";
import Badge from "@/app/components/Badge";
import { strafbuchCached } from "@/lib/dashboardData";
import { selectSubOffenses, openOffensesOf } from "@/lib/subOffenses";
import { rowHoverCls } from "@/app/components/inputStyles";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";
import { boxBoltOpenDespiteLocked } from "@/lib/boxStatus";
import WarnLine from "@/app/components/WarnLine";
import { actionIcon } from "@/app/entries/actionSign";

/** Wie eine geplante Direktive in der Liste erscheint — Beschriftung, Rückzug-Endpunkt, Tönung.
 *  Eine Zeile je `kind`; eine neue terminierbare Direktive ergänzt hier einen Eintrag und ist damit
 *  vollständig angeschlossen, statt in drei Ternär-Ketten einzeln nachgetragen zu werden. */
const SCHEDULED_KINDS = {
  inspection: { labelKey: "scheduledInspection", apiPath: "/api/admin/kontrollen", colorToken: "inspect" },
  lock_request: { labelKey: "scheduledLockRequest", apiPath: "/api/admin/verschluss-anforderung", colorToken: "sperrzeit" },
  lock_period: { labelKey: "scheduledLockPeriod", apiPath: "/api/admin/verschluss-anforderung", colorToken: "sperrzeit" },
  orgasm: { labelKey: "scheduledOrgasm", apiPath: "/api/admin/orgasmus-anforderung", colorToken: "orgasm" },
} as const;

export default async function AdminPage() {
  const session = await auth();
  const currentUserId = session?.user?.id;
  const isGlobalAdmin = session?.user?.role === "admin";
  const t = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());
  // Betrachter-Zeitzone (Keyholder): Zeit-Widgets primär in dieser tz; weicht die Sub-tz ab, wird
  // die Sub-Lokalzeit als Zusatz gezeigt (siehe formatDateTimeDual / Banner-viewerTz-Props).
  const viewerTz = session?.user?.timezone ?? APP_TZ;
  const subLabel = t("subTimePrefix");

  // MULTI-SUB view: each row belongs to a different sub → carry each user's timezone so per-row
  // timestamps/banners render in THAT sub's zone (not the viewing keyholder's).
  // Die Werte der Schnellschalter reisen in DERSELBEN Abfrage mit — ein paar Spalten mehr auf einer
  // Zeile, die ohnehin geladen wird, statt einer zweiten Runde je Träger.
  const userSelect = {
    id: true, username: true, role: true, email: true, createdAt: true, timezone: true, hideOwnTracker: true,
    quickSettings: true, ...QUICK_SETTING_SELECT,
  };

  let users;
  if (isGlobalAdmin) {
    // Feature flag: when USE_ADMIN_RELATIONSHIPS=true, admins only see their assigned users.
    const useRelationships = process.env.USE_ADMIN_RELATIONSHIPS === "true";
    users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: userSelect });
    if (useRelationships && currentUserId) {
      const rels = await prisma.adminUserRelationship.findMany({ where: { adminId: currentUserId } });
      const assignedIds = new Set(rels.map(r => r.userId));
      users = users.filter(u => u.role === "admin" || assignedIds.has(u.id));
    }
  } else {
    // Keyholder: only render the subs they control.
    const subs = currentUserId ? await getControlledSubs(currentUserId) : [];
    if (subs.length === 0) redirect("/dashboard");
    users = await prisma.user.findMany({
      where: { id: { in: subs.map(s => s.id) } },
      orderBy: { createdAt: "asc" },
      select: userSelect,
    });
  }
  // „Eigene Karte ausblenden": der eingeloggte Admin/Keyholder entfernt seine eigene Karte aus der
  // Übersicht (relevant v.a. für globale Admins — Keyholder sehen ihre eigene ohnehin nicht).
  users = users.filter(u => !(u.id === currentUserId && u.hideOwnTracker));
  const userIds = users.map(u => u.id);
  const now = new Date();

  // Bulk-fetch all data in 7 queries instead of 7×N
  const [kgTimes, allKontrolle, allVerschlussAnf, allLockPeriods, allOrgasmusAnf, allBoxes, allPendingReviews] = await Promise.all([
    latestKgTimesByUser(userIds),
    prisma.kontrollAnforderung.findMany({
      where: { userId: { in: userIds }, entryId: null, withdrawnAt: null, ...keyholderVisibleKontrolleWhere(now) },
      orderBy: { createdAt: "desc" },
      // Ziel-Namen fürs Banner — seit v5.0.1 kann eine Kontrolle auch auf eine Trage-Kategorie zeigen.
      include: KONTROLLE_TARGET_INCLUDE,
    }),
    // Dringendste zuerst (LOCK_REQUEST_ORDER): bei mehreren offenen zeigt die Kachel unten die
    // erste nicht-terminierte — das muss die mit der frühsten Frist sein, nicht eine beliebige.
    prisma.verschlussAnforderung.findMany({
      where: openLockRequestWhere({ userIds }),
      orderBy: LOCK_REQUEST_ORDER,
    }),
    getKeyholderLockPeriods({ userIds }),
    getKeyholderOrgasmusAnforderungen(userIds),
    // Nur die drei Spalten, die über den Riegel entscheiden. Der Rest des Box-Zustands gehört auf
    // die Detailseite — hier geht es allein um die Frage, ob eine Box offen steht, die zu sein soll.
    //
    // Hinter dem Heimdall-Tor wie JEDE andere Box-Abfrage im Projekt. Nicht bloss gespart: ohne
    // Sync-Secret gibt es die Box-Oberfläche nicht, auch wenn noch alte `BoxStatus`-Zeilen liegen
    // (`heimdallEnabled`). Ungetort baute die Übersicht aus so einer Alt-Zeile einen Riegel-Alarm
    // und sortierte den Träger nach oben, während die Box-Karte daneben gar nicht erst rendert.
    heimdallEnabled()
      ? prisma.boxStatus.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, locked: true, reportedLocked: true, pendingCommand: true },
        })
      : [],
    // Wartende Aufgaben-Nachweise (#8): eingereicht (`submittedAt`), Aufgabe nicht zurückgezogen —
    // also sichtbar für `proofReviewBlockedReason` (= null) — UND noch nicht gesichtet
    // (`reviewedAt: null`). Das `reviewedAt: null` ist der Zusatz: eine Sichtung ist bewusst
    // wiederholbar, `proofReviewBlockedReason` bliebe auch für längst gesichtete Nachweise null.
    // Sie warten auf eine Entscheidung der Keyholderin und zählen deshalb in „braucht dich" mit,
    // statt still im Aufgaben-Reiter zu liegen.
    prisma.taskProof.findMany({
      where: { submittedAt: { not: null }, reviewedAt: null, task: { userId: { in: userIds }, withdrawnAt: null } },
      select: { task: { select: { userId: true } } },
    }),
  ]);

  // Build lookup maps from groupBy results
  const { lockedAt: verschlussMap, openedAt: oeffnenMap } = kgTimes;

  // Bucket directives by userId once (O(M)) instead of re-scanning each full array per user (O(N×M)).
  const groupByUser = <T extends { userId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.userId) ?? m.set(r.userId, []).get(r.userId)!).push(r);
    return m;
  };
  // Der Schlüssel-Zustand des LAUFENDEN Verschlusses. Ohne ihn läse die Übersicht den Reisefall
  // (Träger behielt den Schlüssel, Box bleibt zu Recht offen) als Versäumnis — siehe
  // `boxBoltOpenDespiteLocked`.
  //
  // DIESELBE Regel wie `getCurrentLockKeyInBox` und `latestKeyInBoxCached`: nur wer gerade
  // verschlossen ist, hat überhaupt etwas über den Schlüssel erklärt. Hier stand einmal die
  // jüngste VERSCHLUSS-Zeile ohne Rücksicht auf ein späteres OEFFNEN — für einen gerade geöffneten
  // Träger widersprach die Übersicht damit seiner eigenen Detailseite und dem MCP.
  //
  // Und ausdrücklich NICHT über `distinct: ["userId"]`: Prisma schiebt DISTINCT auf SQLite nicht
  // ins SQL. Die Abfrage las die GESAMTE Verschluss-Historie aller Träger (gemessen 153 ms bei
  // 60 000 Zeilen, linear wachsend), um am Ende je Träger eine Zeile zu behalten — auf einer
  // `force-dynamic`-Seite, bei jedem Aufruf. Der `groupBy` oben kennt die Zeitpunkte bereits,
  // damit wird daraus eine index-gestützte Punktabfrage über (userId, type, startTime).
  const laufendeVerschluesse = heimdallEnabled()
    ? [...verschlussMap].flatMap(([userId, startTime]) => {
        const lastO = oeffnenMap.get(userId);
        return startTime && (!lastO || startTime > lastO)
          ? [{ userId, type: "VERSCHLUSS", startTime }]
          : [];
      })
    : [];
  const allKeyInBox = laufendeVerschluesse.length > 0
    ? await prisma.entry.findMany({ where: { OR: laufendeVerschluesse }, select: { userId: true, keyInBox: true } })
    : [];
  // Ein Träger kann mehrere Boxen haben — eine einzige offene reicht für den Hinweis.
  const keyInBoxByUser = new Map(allKeyInBox.map((e) => [e.userId, e.keyInBox]));
  const boltOpenByUser = new Set(
    allBoxes.filter((b) => boxBoltOpenDespiteLocked(b, keyInBoxByUser.get(b.userId) ?? null)).map((b) => b.userId),
  );
  // Wer hat überhaupt eine Box gemeldet? Dieselbe Zeilen-Menge, aus der oben der Riegel-Hinweis
  // entsteht — für die Schnellschalter, die es nur mit Box gibt (Riegel-Pflicht, Boxfoto-Zwang).
  const boxUserIds = new Set(allBoxes.map((b) => b.userId));
  // Der Instanz-Schalter ist für alle Träger derselbe — einmal lesen, nicht je Karte und Chip.
  const weightFeature = weightTrackingEnabled();
  // Das Aufgaben-Zeichen aus der EINEN Registratur (`actionSign`) — nicht `ClipboardCheck` von Hand,
  // das trägt die Prüfung.
  const TaskIcon = actionIcon("TASK");
  const kontrolleByUser = groupByUser(allKontrolle);
  const anforderungByUser = groupByUser(allVerschlussAnf);
  const lockPeriodByUser = groupByUser(allLockPeriods);
  const orgasmusAnfByUser = groupByUser(allOrgasmusAnf);
  // Je Träger: wie viele eingereichte Nachweise auf ihre Sichtung warten (#8).
  const pendingReviewByUser = new Map<string, number>();
  for (const p of allPendingReviews) {
    pendingReviewByUser.set(p.task.userId, (pendingReviewByUser.get(p.task.userId) ?? 0) + 1);
  }

  // Unbeurteilte Vergehen je Sub: sie warten auf DEINE Entscheidung — bleiben sie liegen, meldet der
  // Melde-Lauf sie dem Träger nach jedem Wegwischen erneut. Deshalb hier sichtbar (Zahl an der Karte)
  // und Teil von `needsDecision`, statt nur auf der Strafbuch-Seite des einzelnen Subs zu stehen.
  // KOSTET ein volles Strafbuch JE gezeigtem Sub (`strafbuchCached` greift hier nicht — nichts sonst
  // auf DIESER Seite baut es). Für die ein bis drei Subs einer Keyholderin vertretbar. Der
  // globale-Admin-Pfad rendert ALLE Konten ohne `take` (siehe Kopf der Sub-Liste weiter unten) — die
  // Kosten wachsen dort mit der Kontenzahl; je Instanz sind das wenige, ein Deckel wäre erst nötig,
  // wenn diese Liste selbst beschnitten wird.
  const nowMs = now.getTime();
  const openOffenseCounts = await Promise.all(
    userIds.map((id) => strafbuchCached(id, nowMs).then((sb) => openOffensesOf(selectSubOffenses(sb)).length)),
  );
  const openOffenseByUser = new Map(userIds.map((id, i) => [id, openOffenseCounts[i]]));

  const isScheduled = (wirksamAb: Date | null) => isScheduledDirective(wirksamAb, now);


  function getUserStats(userId: string) {
    const lastV = verschlussMap.get(userId);
    const lastO = oeffnenMap.get(userId);
    const latestType = !lastV && !lastO ? null : (!lastO || (lastV && lastV > lastO)) ? "VERSCHLUSS" : "OEFFNEN";
    const latestTime = latestType === "VERSCHLUSS" ? lastV : lastO;

    // Keyholder-Sichten zeigen geplante (wirksamAb > now) Direktiven separat — sie sind kein aktiver
    // Alarm, aber sichtbar + stornierbar. Aktive Banner zeigen nur bereits ausgelöste Direktiven.
    const userKontrollen = kontrolleByUser.get(userId) ?? [];
    const userAnforderungen = anforderungByUser.get(userId) ?? [];
    const userLockPeriods = lockPeriodByUser.get(userId) ?? [];
    const userOrgasmusAnf = orgasmusAnfByUser.get(userId) ?? [];
    // Die neueste bereits AUSGELÖSTE — eine geplante steht wie ihre drei Geschwister unten in
    // `scheduled` und nicht als laufendes Banner. Als Banner wäre sie von einer zugestellten nicht
    // zu unterscheiden, samt mitlaufendem Countdown auf ein Fenster, das der Träger nicht kennt.
    const offeneOrgasmusAnforderung = userOrgasmusAnf.find(o => !isScheduled(o.wirksamAb)) ?? null;

    const offeneKontrolle = userKontrollen.find(k => !isScheduled(k.wirksamAb)) ?? null;
    // ALLE bereits ausgelösten Anforderungen (mehrere dürfen koexistieren), dringendste zuerst
    // (userAnforderungen ist per LOCK_REQUEST_ORDER sortiert). Terminierte stehen separat in `scheduled`.
    const offeneVerschlussAnforderungen = userAnforderungen.filter(v => !isScheduled(v.wirksamAb));
    // Mehrere aktive Sperrzeiten können koexistieren — die Liste zeigt dieselbe EFFEKTIVE, gegen die
    // der Sub verschlossen ist (spätestes Ende, Reinigung nur wenn alle sie erlauben). Die erste Zeile
    // zu nehmen hiesse: ein anderes Ende anzeigen, als die Box durchsetzt.
    const activeLockPeriod = foldActiveLockPeriods(userLockPeriods.filter(s => !isScheduled(s.wirksamAb)));

    const scheduled = [
      ...userKontrollen.filter(k => isScheduled(k.wirksamAb)).map(k => ({ id: k.id, kind: "inspection" as const, wirksamAb: k.wirksamAb!, message: k.kommentar })),
      ...userAnforderungen.filter(v => isScheduled(v.wirksamAb)).map(v => ({ id: v.id, kind: "lock_request" as const, wirksamAb: v.wirksamAb!, message: v.message })),
      ...userLockPeriods.filter(s => isScheduled(s.wirksamAb)).map(s => ({ id: s.id, kind: "lock_period" as const, wirksamAb: s.wirksamAb!, message: s.message, endsAt: s.endsAt })),
      ...userOrgasmusAnf.filter(o => isScheduled(o.wirksamAb)).map(o => ({ id: o.id, kind: "orgasm" as const, wirksamAb: o.wirksamAb!, message: o.message })),
    ].sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());

    return {
      currentStatus: latestType,
      since: latestTime ?? null,
      offeneKontrolle: offeneKontrolle
        ? {
            id: offeneKontrolle.id, deadline: offeneKontrolle.deadline,
            overdue: offeneKontrolle.deadline < now,
            target: inspectionTargetLabel(offeneKontrolle),
          }
        : null,
      hasOffeneAnforderung: offeneVerschlussAnforderungen.length > 0,
      hasActiveLockPeriod: !!activeLockPeriod,
      boltOpen: boltOpenByUser.has(userId),
      offeneAnforderungen: offeneVerschlussAnforderungen.map(a => ({
        id: a.id, endsAt: a.endsAt, overdue: !!a.endsAt && a.endsAt < now,
      })),
      activeLockPeriod: activeLockPeriod
        // Ohne `message`: der kompakte Banner hat keinen Textslot, das Feld wurde nur mitgeschleppt.
        ? { id: activeLockPeriod.id, endsAt: activeLockPeriod.endsAt, cleaningAllowed: activeLockPeriod.cleaningAllowed }
        : null,
      offeneOrgasmusAnforderung: offeneOrgasmusAnforderung
        ? { id: offeneOrgasmusAnforderung.id, art: offeneOrgasmusAnforderung.art as "ANWEISUNG" | "GELEGENHEIT", endsAt: offeneOrgasmusAnforderung.endsAt, expired: offeneOrgasmusAnforderung.endsAt < now }
        : null,
      pendingTaskReviews: pendingReviewByUser.get(userId) ?? 0,
      openOffenses: openOffenseByUser.get(userId) ?? 0,
      scheduled,
    };
  }

  const usersWithStats = users.map(u => ({ ...u, stats: getUserStats(u.id) }));

  const lockedCount = usersWithStats.filter(u => u.stats.currentStatus === "VERSCHLUSS").length;

  /**
   * **Wer braucht dich, und wer nicht.**
   *
   * Der Bildschirm zählte bisher auf, was es gibt: alle Subs gleich gross, gleich schwer, jeder in
   * seinem Kasten. Die Frage, mit der man ihn öffnet, lautet aber nicht „wen habe ich", sondern
   * „wo werde ich gebraucht" — und die musste man sich aus den Karten selbst zusammensuchen.
   *
   * „Braucht dich" heisst: etwas ist offen und wartet auf eine Entscheidung oder eine Handlung von
   * DIR. Eine laufende Sperrzeit gehört ausdrücklich NICHT dazu — sie läuft ja, wie angeordnet.
   * Eine geplante Direktive ebenso wenig; sie ist bereits entschieden und wartet nur auf ihren
   * Zeitpunkt.
   *
   * **Der offene Riegel zählt hier NICHT mit** — er sortiert nur. Er wartet auf den Träger: den
   * Knopf am Gerät drückt niemand sonst, und die Zeile in der Übersicht trägt deshalb bewusst keine
   * Aktion. Stünde er in dieser Zahl, läse die Keyholderin „1 · braucht deine Entscheidung", fände
   * in der Zeile nichts zu entscheiden — und der Screenreader sagte ihr dasselbe an. Die Zahl darf
   * nur zählen, wofür es auch einen Griff gibt.
   */
  const needsDecision = (st: ReturnType<typeof getUserStats>) =>
    !!st.offeneKontrolle || st.hasOffeneAnforderung || !!st.offeneOrgasmusAnforderung || st.pendingTaskReviews > 0 || st.openOffenses > 0;

  // Die Teilung ist eine REIHENFOLGE, keine zwei Darstellungen — v6 hatte daraus zwei Figuren
  // gemacht, und die leise Zeile für die ruhigen Subs kam ohne Schnellaktionen. Eine Keyholderin,
  // deren Subs gerade alle ruhig sind (der Normalfall), kam damit an „Kontrolle anfordern" nicht
  // mehr heran. Gemeldet aus dem Betrieb.
  //
  // Das Merkmal hängt am Nutzer, nicht am Abschnitt: so wertet `needsDecision` genau EINMAL
  // je Nutzer aus und Reihenfolge, Kopfzahl und Punkt lesen alle denselben Wert.
  //
  // ZWEI Merkmale, nicht eines: `hasAlarm` beschriftet und zählt („braucht deine Entscheidung"),
  // `sortFirst` ordnet. Der offene Riegel gehört nur ins zweite — er soll oben stehen, ohne eine
  // Entscheidung zu behaupten, die es nicht gibt.
  const usersWithFlags = usersWithStats.map(u => ({
    ...u,
    hasAlarm: needsDecision(u.stats),
    sortFirst: needsDecision(u.stats) || u.stats.boltOpen,
  }));
  // Die dringendste offene FRIST eines Trägers (#96/#7) — Kontrolle, Verschluss-Anforderung oder
  // Orgasmus-Fenster, das früheste zählt. Überfällig (Frist < jetzt) ergibt sich von selbst zuoberst,
  // weil sein Wert am kleinsten ist. Wer nur einen offenen Riegel oder wartende Nachweise hat (keine
  // Frist), bekommt `Infinity` und reiht sich hinter die Fristen ein — die Sortierung ist stabil,
  // also bleibt dort die ursprüngliche Reihenfolge.
  const mostUrgentDeadlineMs = (st: ReturnType<typeof getUserStats>): number => {
    const ds: number[] = [];
    if (st.offeneKontrolle) ds.push(st.offeneKontrolle.deadline.getTime());
    for (const a of st.offeneAnforderungen) if (a.endsAt) ds.push(a.endsAt.getTime());
    if (st.offeneOrgasmusAnforderung) ds.push(st.offeneOrgasmusAnforderung.endsAt.getTime());
    return ds.length ? Math.min(...ds) : Infinity;
  };
  // Die Teilung ist EIN Ausdruck: eine Zwischenvariable müsste eine Hälfte einer Partition benennen,
  // und jeder Name dafür („wartend") behauptet mehr, als die Sortierung meint. Die erste Hälfte
  // („braucht dich") ist zusätzlich nach Frist geordnet — der dringendste Fall zuoberst statt nach
  // Registrierdatum (#7). `filter` liefert eine neue Liste, das `sort` fasst `usersWithFlags` nicht an.
  const subsSorted = [
    ...usersWithFlags.filter(u => u.sortFirst)
      .sort((a, b) => mostUrgentDeadlineMs(a.stats) - mostUrgentDeadlineMs(b.stats)),
    ...usersWithFlags.filter(u => !u.sortFirst),
  ];
  const alarmCount = usersWithFlags.filter(u => u.hasAlarm).length;

  return (
    <main className="flex-1 py-6 flex flex-col gap-4">

      {/* ── Die Antwort, nicht die Aufzählung ──────────────────────────────────
          Vorher stand hier eine Überschrift, ein Erklärsatz, den niemand zweimal liest, und drei
          Zählwerte nebeneinander („2 Benutzer registriert · 1 Verschlossen · 1 Alarm"). Keiner
          davon beantwortete die Frage, mit der man diesen Bildschirm öffnet.

          Jetzt steht dort EINE Zahl: wie viele deiner Subs gerade eine Entscheidung von dir
          brauchen. Ist es keine, sagt der Bildschirm das ausdrücklich — „nichts offen" ist eine
          Auskunft, kein leerer Platz. */}
      <header className="pt-2 pb-8">
        {alarmCount > 0 ? (
          <>
            <p className="text-zahl font-semibold tabular-nums leading-none tracking-[-0.04em] text-warn">
              {alarmCount}
            </p>
            {/* Sichtbar statt `sr-only`, weil hier schon ein Titel STAND — er war nur ein `p`, und
                die Überschriftenliste dieser Seite begann damit auf Ebene 2. Beide Zweige tragen
                ihn, damit die Seite in JEDEM Zustand genau eine Ebene 1 hat. Die Klassen bleiben
                unverändert; die grosse Zahl darüber ist der Wert, nicht der Titel. */}
            <h1 className="text-zeile font-medium mt-3">{t("needsYouTitle", { count: alarmCount })}</h1>
          </>
        ) : (
          <>
            <h1 className="text-titel font-serif leading-tight">{t("allCalmTitle")}</h1>
            <p className="text-neben text-foreground-faint mt-2">{t("allCalmHint")}</p>
          </>
        )}
        {/* Die Zählwerte bleiben erreichbar, treten aber zurück: sie beantworten eine Frage, die
            man selten stellt. */}
        <p className="text-neben text-foreground-faint mt-4">
          {t("usersRegistered", { count: users.length })} · {lockedCount} {t("locked")}
        </p>
      </header>

        {/* ── Deine Subs, wer etwas braucht zuerst ───────────────────────────────
            Eine Figur für jeden, und die Reihenfolge trägt die Aussage: wer etwas braucht, steht
            oben und trägt den Punkt. NICHT „wer nichts braucht, zeigt kein Banner" — auch ein
            ruhiger Sub zeigt seine laufende Sperrzeit und was geplant ist, und das soll er.
            Die Schnellaktionen hat jeder — sie sind der Grund, warum die Keyholderin hier ist.

            `divide-y` am Behälter statt `border-t` je Zeile: die Rubrik des Abschnitts zieht schon
            eine Linie, und die Oberkante der ersten Zeile stünde als zweite darunter.

            Die Zeile ist bewusst für ein bis drei Subs gebaut — so viele betreut eine Keyholderin.
            Der Pfad des globalen Admins rendert dagegen ALLE Nutzer ohne `take`; jenseits von
            etwa zwanzig Konten gehört die Liste dort beschnitten, nicht die Zeile abgemagert. */}
        {users.length === 0 ? (
          <EmptyState
            icon={<Users size={36} />}
            title={t("noUsers")}
            description={t("noUsersDesc")}
            action={isGlobalAdmin ? { label: t("title"), href: "/admin/users" } : undefined}
          />
        ) : (
          <Section title={t("yourSubsTitle")}>
            <div className="divide-y divide-border-subtle">
              {subsSorted.map((u) => {
                const rowTz = u.timezone; // this row's sub governs its own timestamps
                // Einmal je Zeile: die datetime-local-Untergrenze für alle Bearbeiten-Chips der Zeile
                // (Kontrolle, Sperrzeit) — sonst liefen fünf Aufrufe mit leicht verschiedenen „jetzt".
                const rowMinNow = nowDatetimeLocal(rowTz);
                // Grün verschlossen, Rosa offen. Für „offen" stand hier Grau, und das war unter der
                // alten Regel richtig („die Abwesenheit eines Zustands ist kein Signal") — seit die
                // Farbwelt den Zustand SAGT, sind es zwei Zustände statt einer und seines Fehlens.
                //
                // DREI Ausgänge, nicht zwei: `currentStatus === null` heisst „von diesem Träger liegt
                // noch nichts vor". Der Text sagte das schon immer („noch kein Eintrag"), die Farbe
                // sagte seit dem Wechsel „offen" — ein frisch angelegtes Konto leuchtete rosa, als
                // hätte jemand gerade aufgeschlossen. `undefined` an `UserAvatar` ist genau dafür da.
                const hasState = u.stats.currentStatus !== null;
                const isLocked = u.stats.currentStatus === "VERSCHLUSS";
                const stateCls = !hasState ? "text-foreground-faint" : isLocked ? "text-lock" : "text-unlock";
                const sinceDisplay = u.stats.since
                  ? formatDurationBetween(u.stats.since, now, dl)
                  : null;


                return (
                  // `min-w-0` ist hier Pflicht, nicht Kosmetik: ein Grid-Item hat `min-width: auto`, die
                  // Spalte kann also nicht unter die Min-Content-Breite ihres Inhalts schrumpfen. Auf 390 px
                  // wuchs die einspaltige Spur dadurch auf 748 px und schob die GANZE Seite nach rechts —
                  // Kopfzeile und Karten links angeschnitten, weisser Streifen rechts. Die Karten-Innereien
                  // brechen und kürzen längst korrekt (v4.52.3); es fehlte allein die Erlaubnis zu schrumpfen.
                  //
                  // Kein Kasten mehr: eine Zeile trennt sich von der nächsten durch die Haarlinie
                  // des `divide-y` und durch Raum. Tönung, Ausbruch und Radius kommen aus
                  // `rowHoverCls` — dieselbe Figur trägt `listRowButtonCls` für Zeilen, die ihr
                  // Klickziel selbst sind.
                  //
                  // Die Tönung sitzt am BEHÄLTER, nicht an einem Geschwister des gestreckten
                  // Links: als dessen Vorfahr reagiert er auf `hover` überall in der Zeile, und
                  // die `group`-Indirektion samt zweitem Knoten entfällt. Ohne diese Tönung gab die
                  // Zeile auf keine Weise zu erkennen, dass sie ein Klickziel ist (Rückmeldung
                  // 15.08.2026) — der Link darüber ist unsichtbar.
                  <div key={u.id} className={`relative min-w-0 py-5 ${rowHoverCls}`}>
                    {/* Stretched link — covers whole card for navigation */}
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="absolute inset-0 z-10"
                      aria-label={u.username}
                    />

                    <div className="flex flex-col gap-3">
                        {/* Header: avatar + name + status icon */}
                        <div className="flex items-start gap-3">
                          <UserAvatar username={u.username} size="lg" locked={hasState ? isLocked : undefined} />
                          <div className="flex-1 min-w-0">
                            {/* Punkt + Textäquivalent, Bauform wie in `MessageRow`: der Punkt steht
                                IMMER und ist bei einem ruhigen Sub nur durchsichtig, damit der Name
                                nicht springt; die Ansage hängt am Text, nicht in der 8-px-Grafik.
                                Seit die zwei Darstellungen weg sind, ist der Punkt — neben der
                                Reihenfolge — das Einzige, was „braucht dich" von „ruhig" trennt. */}
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${u.hasAlarm ? "bg-warn" : "bg-transparent"}`}
                                aria-hidden="true"
                              />
                              <p className="font-bold text-foreground truncate">
                                {u.hasAlarm && <span className="sr-only">{t("needsYouRow")} — </span>}
                                {u.username}
                              </p>
                            </div>
                            <p className={`text-xs mt-0.5 font-medium ${stateCls}`}>
                              {isLocked
                                ? `${t("locked")}${sinceDisplay ? ` · ${sinceDisplay}` : ""}`
                                : u.stats.currentStatus
                                  ? `${t("opened")}${sinceDisplay ? ` · ${t("since")} ${sinceDisplay}` : ""}`
                                  : t("noEntry")}
                            </p>
                            {/* Unbeurteilte Vergehen: die kleine Zahl „auf einen Blick", damit sie
                                nicht liegenbleiben. Der Punkt oben (aus `hasAlarm`) schlägt dafür
                                bereits an — die Zahl sagt, WIE VIELE es sind und WAS wartet. */}
                            {u.stats.openOffenses > 0 && (
                              <div className="mt-1">
                                <Badge variant="warn" size="sm" label={t("openOffensesBadge", { count: u.stats.openOffenses })} />
                              </div>
                            )}
                          </div>
                          <div className={`flex-shrink-0 mt-1 flex items-center gap-1 ${stateCls}`}>
                            {isLocked
                              ? <LockClosedIcon size={18} strokeWidth={1.75} />
                              : <LockOpenIcon size={18} strokeWidth={1.75} />
                            }
                            {/* Das BLEIBENDE Zeichen, dass die Karte irgendwohin führt — der Hover-Zustand
                                allein hilft auf dem Handy nicht, wo es kein Hover gibt. `aria-hidden`, weil
                                der Link darüber bereits einen Namen trägt: vorgelesen wäre das Zeichen eine
                                zweite, inhaltsleere Ansage. */}
                            <ChevronRight size={16} className="text-foreground-faint" aria-hidden />
                          </div>
                        </div>

                        {/* Alarm banners */}
                        {/* Ohne Aktion, weil es hier nichts zu drücken gibt: den Knopf am Gerät
                            kann nur der Träger drücken. */}
                        {u.stats.boltOpen && <WarnLine>{t("boltOpenOverview")}</WarnLine>}
                        {u.stats.offeneKontrolle && (
                          <KontrolleBanner
                            deadline={u.stats.offeneKontrolle.deadline}
                            target={u.stats.offeneKontrolle.target}
                            overdue={u.stats.offeneKontrolle.overdue}
                            variant="compact"
                            withdrawAction={<WithdrawButton id={u.stats.offeneKontrolle.id} apiPath="/api/admin/kontrollen" title={t("withdrawKontrolleTitle")} colorToken="inspect" />}
                          />
                        )}
                        {u.stats.offeneAnforderungen.map((a) => (
                          <LockRequestBanner
                            key={a.id}
                            variant="compact"
                            colorScheme="request"
                            label={a.overdue ? t("lockOverdue") : t("lockRequested")}
                            overdue={a.overdue}
                            endsAt={a.endsAt}
                            locale={dl}
                            tz={rowTz}
                            viewerTz={viewerTz}
                            subTimePrefix={subLabel}
                            withdrawAction={
                              <span className="flex items-center gap-1">
                                <EditLockRequestButton id={a.id} userId={u.id} tz={rowTz} minNow={rowMinNow} />
                                <WithdrawButton id={a.id} apiPath="/api/admin/verschluss-anforderung" title={t("withdrawLockTitle")} colorToken="sperrzeit" />
                              </span>
                            }
                          />
                        ))}
                        {u.stats.activeLockPeriod && (
                          <LockRequestBanner
                            variant="compact"
                            colorScheme="sperrzeit"
                            label={u.stats.activeLockPeriod.endsAt ? t("lockedUntil") : t("lockedIndefinite")}
                            locale={dl}
                            tz={rowTz}
                            viewerTz={viewerTz}
                            subTimePrefix={subLabel}
                            endsAt={u.stats.activeLockPeriod.endsAt}
                            showRemaining={!!u.stats.activeLockPeriod.endsAt}
                            // Keyholder-Sicht: IMMER die Eigenschaft der Sperre, unabhängig von den
                            // Benutzer-Einstellungen des Subs — sie hat das Flag gesetzt und prüft es hier.
                            cleaningNote={t(u.stats.activeLockPeriod.cleaningAllowed ? "sperrzeitWithCleaning" : "sperrzeitWithoutCleaning")}
                            withdrawAction={
                              <span className="flex items-center gap-1">
                                <EditLockPeriodButton id={u.stats.activeLockPeriod.id} endsAt={u.stats.activeLockPeriod.endsAt} tz={rowTz} minNow={rowMinNow} />
                                <WithdrawButton id={u.stats.activeLockPeriod.id} apiPath="/api/admin/verschluss-anforderung" title={t("withdrawLockTitle")} colorToken="sperrzeit" />
                              </span>
                            }
                          />
                        )}
                        {u.stats.offeneOrgasmusAnforderung && (
                          <LockRequestBanner
                            variant="compact"
                            colorScheme="orgasm"
                            label={
                              orgasmusAnforderungArtLabel(u.stats.offeneOrgasmusAnforderung.art, t)
                              + (u.stats.offeneOrgasmusAnforderung.expired ? ` · ${t("orgasmAnforderungExpired")}` : "")
                            }
                            overdue={u.stats.offeneOrgasmusAnforderung.expired}
                            endsAt={u.stats.offeneOrgasmusAnforderung.endsAt}
                            locale={dl}
                            tz={rowTz}
                            viewerTz={viewerTz}
                            subTimePrefix={subLabel}
                            withdrawAction={<WithdrawButton id={u.stats.offeneOrgasmusAnforderung.id} apiPath="/api/admin/orgasmus-anforderung" title={t("withdrawOrgasmTitle")} colorToken="orgasm" />}
                          />
                        )}
                        {/* Wartende Aufgaben-Nachweise (#8): eigener klickbarer Hinweis, weil es dafür
                            kein Direktiven-Banner gibt und die Sichtung sonst nur im Aufgaben-Reiter
                            liegt. Box-lose Zeile mit `rowHoverCls` wie die klickbaren Kontroll-Zeilen
                            (`DashboardAlerts`) — kein eigener Kasten neben den kastenlosen Bannern
                            darüber. `relative z-20` sitzt über dem gestreckten Karten-Link und führt
                            direkt in den Reiter, wo sie den Nachweis beurteilt. */}
                        {u.stats.pendingTaskReviews > 0 && (
                          <Link
                            href={`/admin/users/${u.id}/aufgaben`}
                            className={`relative z-20 flex items-center justify-between gap-2 py-1.5 text-xs font-medium text-warn ${rowHoverCls}`}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <TaskIcon size={14} strokeWidth={2} className="flex-shrink-0" aria-hidden />
                              <span className="truncate">{t("taskReviewsPending", { count: u.stats.pendingTaskReviews })}</span>
                            </span>
                            <ChevronRight size={14} aria-hidden className="flex-shrink-0" />
                          </Link>
                        )}

                        {/* Geplante (noch nicht ausgelöste) Direktiven — sichtbar + stornierbar, kein Alarm */}
                        {u.stats.scheduled.length > 0 && (
                          <div className="relative z-20 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 flex flex-col gap-1.5">
                            <BlockHeading as="span" className="flex items-center gap-1.5">
                              <CalendarClock size={12} /> {t("scheduledTitle")}
                            </BlockHeading>
                            {u.stats.scheduled.map((s) => {
                              // Beschriftung, Rückzug-Route und Tönung hängen an derselben Fallunterscheidung
                              // — deshalb EINE Tabelle statt drei Ternär-Ketten, die je Direktiv-Art einzeln
                              // nachgezogen werden müssten.
                              const { labelKey, apiPath, colorToken } = SCHEDULED_KINDS[s.kind];
                              const kindLabel = t(labelKey);
                              return (
                                // items-start + min-w-0-Textspalte: auf Mobile brechen Label/Datum um und die
                                // Nachricht kürzt sich (truncate wirkt nur mit min-w-0), statt die Zeile — und
                                // damit die ganze Seite — horizontal über den Viewport zu schieben.
                                <div key={s.id} className="flex items-start gap-2 text-xs text-foreground-muted">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                      <span className="font-semibold text-foreground">{kindLabel}</span>
                                      <span className="text-foreground-faint">{t("scheduledForPrefix")} {formatDateTimeDual(s.wirksamAb, dl, viewerTz, rowTz, subLabel)}</span>
                                    </div>
                                    {s.message && <p className="truncate opacity-80 mt-0.5">{s.message}</p>}
                                  </div>
                                  <span className="flex-shrink-0 flex items-center gap-1">
                                    {s.kind === "lock_request" && (
                                      <EditLockRequestButton id={s.id} userId={u.id} tz={rowTz} minNow={rowMinNow} />
                                    )}
                                    {s.kind === "lock_period" && (
                                      <EditLockPeriodButton id={s.id} endsAt={s.endsAt} tz={rowTz} minNow={rowMinNow} />
                                    )}
                                    <WithdrawButton id={s.id} apiPath={apiPath} title={t("scheduledWithdrawTitle")} colorToken={colorToken} />
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Die Schnellaktionen — der Grund, warum die Keyholderin diesen Bildschirm
                            öffnet. `z-20`, damit sie über dem gestreckten Link liegen.

                            `[&:empty]:hidden` für den EINEN Fall, in dem beide Bauteile schweigen:
                            verschlossen, laufende Sperrzeit, keine Adresse — die Sperrzeit nimmt den
                            einen Knopf, die fehlende Adresse den anderen (`KontrolleButton` verschickt
                            einen Code). Ohne die Regel kostete die leere Zeile das `gap-3` der
                            Elternspalte. Dass der Sub-Knopf wegen einer KONTO-Eigenschaft lautlos
                            verschwindet, statt zu deren Behebung zu führen, bleibt offen — die
                            Aktionen-Seite des Subs macht es dort schon richtig. */}
                        <div className="relative z-20 flex flex-wrap items-center gap-2 [&:empty]:hidden">
                          {/* Die Schnellschalter der Keyholderin — welche, sagt ihre Auswahl je
                              Träger (`quickSettings.ts`). Sie stehen VOR den Aktionen: ein Chip
                              sagt, wie es steht, und wer danach handelt, hat den Zustand gelesen.
                              Ohne Auswahl ist die Liste leer und die Zeile sieht aus wie bisher. */}
                          {parseQuickSettings(u.quickSettings)
                            .filter((qs) => quickSettingOnCard(qs, u, { hasBox: boxUserIds.has(u.id), weightFeature }))
                            .map((qs) => (
                              <QuickSettingChip
                                key={qs.key}
                                userId={u.id}
                                labelKey={qs.labelKey}
                                field={qs.field}
                                value={quickSettingValue(u, qs)}
                              />
                            ))}
                          {isLocked && (
                            <KontrolleButton userId={u.id} hasEmail={!!u.email} />
                          )}
                          <VerschlussAnforderungButton
                            userId={u.id}
                            isLocked={isLocked}
                            hasActiveLockPeriod={u.stats.hasActiveLockPeriod}
                            tz={rowTz}
                            minNow={rowMinNow}
                          />
                          {/* Das Gegenstück zur Sperrzeit steht NEBEN ihr, nicht in einem Menü —
                              das war die Rückmeldung, aus der es entstand. Die Sichtbarkeit
                              entscheidet der Aufrufer, wie beim `KontrolleButton` darüber. */}
                          {isLocked && (
                            <ReleaseNowButton userId={u.id} hasActiveLockPeriod={u.stats.hasActiveLockPeriod} />
                          )}
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
    </main>
  );
}
