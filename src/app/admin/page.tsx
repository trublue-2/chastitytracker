import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getControlledSubs } from "@/lib/keyholder";
import Link from "next/link";

import KontrolleButton from "./KontrolleButton";
import VerschlussAnforderungButton from "./VerschlussAnforderungButton";
import WithdrawButton from "./WithdrawButton";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import { inspectionTargetLabel } from "@/lib/inspectionTarget";
import { KONTROLLE_TARGET_INCLUDE } from "@/lib/queries";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import EmptyState from "@/app/components/EmptyState";
import UserAvatar from "@/app/components/UserAvatar";
import { Lock, LockOpen, Users, ShieldAlert, CalendarClock, ChevronRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { toDateLocale, formatDurationBetween, formatDateTimeDual, nowDatetimeLocal, APP_TZ } from "@/lib/utils";
import { getKeyholderSperrzeiten, getKeyholderOrgasmusAnforderungen, keyholderVisibleKontrolleWhere, foldActiveSperrzeiten, isScheduledDirective, LOCK_REQUEST_ORDER, openLockRequestWhere } from "@/lib/queries";
import { orgasmusAnforderungArtLabel } from "@/lib/constants";

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
  const userSelect = { id: true, username: true, role: true, email: true, createdAt: true, timezone: true, hideOwnTracker: true };

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

  // Bulk-fetch all data in 5 queries instead of 5×N
  const [latestVerschluss, latestOeffnen, allKontrolle, allVerschlussAnf, allSperrzeiten, allOrgasmusAnf] = await Promise.all([
    prisma.entry.groupBy({ by: ["userId"], where: { type: "VERSCHLUSS", userId: { in: userIds } }, _max: { startTime: true } }),
    prisma.entry.groupBy({ by: ["userId"], where: { type: "OEFFNEN", userId: { in: userIds } }, _max: { startTime: true } }),
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
    getKeyholderSperrzeiten({ userIds }),
    getKeyholderOrgasmusAnforderungen(userIds),
  ]);

  // Build lookup maps from groupBy results
  const verschlussMap = new Map(latestVerschluss.map(v => [v.userId, v._max.startTime]));
  const oeffnenMap = new Map(latestOeffnen.map(o => [o.userId, o._max.startTime]));

  // Bucket directives by userId once (O(M)) instead of re-scanning each full array per user (O(N×M)).
  const groupByUser = <T extends { userId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.userId) ?? m.set(r.userId, []).get(r.userId)!).push(r);
    return m;
  };
  const kontrolleByUser = groupByUser(allKontrolle);
  const anforderungByUser = groupByUser(allVerschlussAnf);
  const sperrzeitByUser = groupByUser(allSperrzeiten);
  const orgasmusAnfByUser = groupByUser(allOrgasmusAnf);

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
    const userSperrzeiten = sperrzeitByUser.get(userId) ?? [];
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
    const activeSperrzeit = foldActiveSperrzeiten(userSperrzeiten.filter(s => !isScheduled(s.wirksamAb)));

    const scheduled = [
      ...userKontrollen.filter(k => isScheduled(k.wirksamAb)).map(k => ({ id: k.id, kind: "inspection" as const, wirksamAb: k.wirksamAb!, message: k.kommentar })),
      ...userAnforderungen.filter(v => isScheduled(v.wirksamAb)).map(v => ({ id: v.id, kind: "lock_request" as const, wirksamAb: v.wirksamAb!, message: v.nachricht })),
      ...userSperrzeiten.filter(s => isScheduled(s.wirksamAb)).map(s => ({ id: s.id, kind: "lock_period" as const, wirksamAb: s.wirksamAb!, message: s.nachricht })),
      ...userOrgasmusAnf.filter(o => isScheduled(o.wirksamAb)).map(o => ({ id: o.id, kind: "orgasm" as const, wirksamAb: o.wirksamAb!, message: o.nachricht })),
    ].sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());

    return {
      currentStatus: latestType,
      since: latestTime ?? null,
      offeneKontrolle: offeneKontrolle
        ? {
            id: offeneKontrolle.id, deadline: offeneKontrolle.deadline, code: offeneKontrolle.code,
            kommentar: offeneKontrolle.kommentar, overdue: offeneKontrolle.deadline < now,
            target: inspectionTargetLabel(offeneKontrolle),
          }
        : null,
      hasOffeneAnforderung: offeneVerschlussAnforderungen.length > 0,
      hasActiveSperrzeit: !!activeSperrzeit,
      offeneAnforderungen: offeneVerschlussAnforderungen.map(a => ({
        id: a.id, endetAt: a.endetAt, overdue: !!a.endetAt && a.endetAt < now,
      })),
      activeSperrzeit: activeSperrzeit
        ? { id: activeSperrzeit.id, nachricht: activeSperrzeit.nachricht, endetAt: activeSperrzeit.endetAt, reinigungErlaubt: activeSperrzeit.reinigungErlaubt }
        : null,
      offeneOrgasmusAnforderung: offeneOrgasmusAnforderung
        ? { id: offeneOrgasmusAnforderung.id, art: offeneOrgasmusAnforderung.art as "ANWEISUNG" | "GELEGENHEIT", endetAt: offeneOrgasmusAnforderung.endetAt, expired: offeneOrgasmusAnforderung.endetAt < now }
        : null,
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
   */
  const brauchtEntscheidung = (st: ReturnType<typeof getUserStats>) =>
    !!st.offeneKontrolle || st.hasOffeneAnforderung || !!st.offeneOrgasmusAnforderung;

  const wartend = usersWithStats.filter(u => brauchtEntscheidung(u.stats));
  const ruhig = usersWithStats.filter(u => !brauchtEntscheidung(u.stats));
  const alarmCount = wartend.length;

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">

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
            <p className="text-zeile font-medium mt-3">{t("needsYouTitle", { count: alarmCount })}</p>
          </>
        ) : (
          <>
            <p className="text-titel font-serif leading-tight">{t("allCalmTitle")}</p>
            <p className="text-neben text-foreground-faint mt-2">{t("allCalmHint")}</p>
          </>
        )}
        {/* Die Zählwerte bleiben erreichbar, treten aber zurück: sie beantworten eine Frage, die
            man selten stellt. */}
        <p className="text-neben text-foreground-faint mt-4">
          {t("usersRegistered", { count: users.length })} · {lockedCount} {t("locked")}
        </p>
      </header>

{/* ── Wer etwas braucht, und wer nicht ─────────────────────────────────────
          Vorher lagen alle Subs gleichwertig in einem Raster aus Karten — der eine mit einer
          überfälligen Kontrolle sah aus wie der andere ohne alles. Jetzt trägt die Reihenfolge
          eine Aussage: oben steht, was wartet, ausgeklappt und mit der Handlung daneben; darunter
          als leise Zeile, wer gerade nichts braucht. Erreichbar bleibt beides. */}
        <div className="flex flex-col">
          {wartend.map((u) => {
            const rowTz = u.timezone; // this row's sub governs its own timestamps
            const isLocked = u.stats.currentStatus === "VERSCHLUSS";
            const sinceDisplay = u.stats.since
              ? formatDurationBetween(u.stats.since, now, dl)
              : null;

            const hasAlarm = !!u.stats.offeneKontrolle || u.stats.hasOffeneAnforderung;

            return (
              // `min-w-0` ist hier Pflicht, nicht Kosmetik: ein Grid-Item hat `min-width: auto`, die
              // Spalte kann also nicht unter die Min-Content-Breite ihres Inhalts schrumpfen. Auf 390 px
              // wuchs die einspaltige Spur dadurch auf 748 px und schob die GANZE Seite nach rechts —
              // Kopfzeile und Karten links angeschnitten, weisser Streifen rechts. Die Karten-Innereien
              // brechen und kürzen längst korrekt (v4.52.3); es fehlte allein die Erlaubnis zu schrumpfen.
              // `group` trägt den Hover-Zustand: der Link darüber ist unsichtbar und deckt die ganze
              // Karte, kann sie also nicht selbst einfärben. Ohne das gab die Karte auf keine Weise zu
              // erkennen, dass sie ein Klickziel ist (Rückmeldung 15.08.2026).
              <div key={u.id} className="group relative min-w-0">
                {/* Stretched link — covers whole card for navigation */}
                <Link
                  href={`/admin/users/${u.id}`}
                  className="absolute inset-0 z-10"
                  aria-label={u.username}
                />

                {/* Kein Kasten mehr. Ein Abschnitt trennt sich durch eine Haarlinie und Raum —
                    dieselbe Sprache wie die ruhige Liste darunter, damit der Bildschirm EINE
                    Ordnung hat statt zweier. */}
                <div className="border-t border-border-subtle py-5 transition-colors group-hover:bg-surface-raised">
                  <div className="flex flex-col gap-3">
                    {/* Header: avatar + name + status icon */}
                    <div className="flex items-start gap-3">
                      <UserAvatar username={u.username} size="lg" locked={isLocked} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground truncate">{u.username}</p>
                          {hasAlarm && (
                            <span className="w-2 h-2 rounded-full bg-warn flex-shrink-0" />
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 font-medium ${isLocked ? "text-lock" : "text-foreground-faint"}`}>
                          {isLocked
                            ? `${t("locked")}${sinceDisplay ? ` · ${sinceDisplay}` : ""}`
                            : u.stats.currentStatus
                              ? `${t("opened")}${sinceDisplay ? ` · ${t("since")} ${sinceDisplay}` : ""}`
                              : t("noEntry")}
                        </p>
                      </div>
                      <div className={`flex-shrink-0 mt-1 flex items-center gap-1 ${isLocked ? "text-lock" : "text-foreground-faint"}`}>
                        {isLocked
                          ? <Lock size={18} strokeWidth={1.75} />
                          : <LockOpen size={18} strokeWidth={1.75} />
                        }
                        {/* Das BLEIBENDE Zeichen, dass die Karte irgendwohin führt — der Hover-Zustand
                            allein hilft auf dem Handy nicht, wo es kein Hover gibt. `aria-hidden`, weil
                            der Link darüber bereits einen Namen trägt: vorgelesen wäre das Zeichen eine
                            zweite, inhaltsleere Ansage. */}
                        <ChevronRight size={16} className="text-foreground-faint" aria-hidden />
                      </div>
                    </div>

                    {/* Alarm banners */}
                    {u.stats.offeneKontrolle && (
                      <KontrolleBanner
                        deadline={u.stats.offeneKontrolle.deadline}
                        code={u.stats.offeneKontrolle.code}
                        kommentar={u.stats.offeneKontrolle.kommentar}
                        target={u.stats.offeneKontrolle.target}
                        overdue={u.stats.offeneKontrolle.overdue}
                        variant="compact"
                        tz={rowTz}
                        viewerTz={viewerTz}
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
                        endetAt={a.endetAt}
                        locale={dl}
                        tz={rowTz}
                        viewerTz={viewerTz}
                        subTimePrefix={subLabel}
                        withdrawAction={<WithdrawButton id={a.id} apiPath="/api/admin/verschluss-anforderung" title={t("withdrawLockTitle")} colorToken="sperrzeit" />}
                      />
                    ))}
                    {u.stats.activeSperrzeit && (
                      <LockRequestBanner
                        variant="compact"
                        colorScheme="sperrzeit"
                        label={u.stats.activeSperrzeit.endetAt ? t("lockedUntil") : t("lockedIndefinite")}
                        locale={dl}
                        tz={rowTz}
                        viewerTz={viewerTz}
                        subTimePrefix={subLabel}
                        endetAt={u.stats.activeSperrzeit.endetAt}
                        showRemaining={!!u.stats.activeSperrzeit.endetAt}
                        // Keyholder-Sicht: IMMER die Eigenschaft der Sperre, unabhängig von den
                        // Benutzer-Einstellungen des Subs — sie hat das Flag gesetzt und prüft es hier.
                        cleaningNote={t(u.stats.activeSperrzeit.reinigungErlaubt ? "sperrzeitWithCleaning" : "sperrzeitWithoutCleaning")}
                        withdrawAction={<WithdrawButton id={u.stats.activeSperrzeit.id} apiPath="/api/admin/verschluss-anforderung" title={t("withdrawLockTitle")} colorToken="sperrzeit" />}
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
                        endetAt={u.stats.offeneOrgasmusAnforderung.endetAt}
                        locale={dl}
                        tz={rowTz}
                        viewerTz={viewerTz}
                        subTimePrefix={subLabel}
                        withdrawAction={<WithdrawButton id={u.stats.offeneOrgasmusAnforderung.id} apiPath="/api/admin/orgasmus-anforderung" title={t("withdrawOrgasmTitle")} colorToken="orgasm" />}
                      />
                    )}

                    {/* Geplante (noch nicht ausgelöste) Direktiven — sichtbar + stornierbar, kein Alarm */}
                    {u.stats.scheduled.length > 0 && (
                      <div className="relative z-20 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 flex flex-col gap-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground-faint flex items-center gap-1.5">
                          <CalendarClock size={12} /> {t("scheduledTitle")}
                        </p>
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
                              <span className="flex-shrink-0">
                                <WithdrawButton id={s.id} apiPath={apiPath} title={t("scheduledWithdrawTitle")} colorToken={colorToken} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Quick actions — z-20 so they're above the stretched link */}
                    <div className="relative z-20 flex gap-2 flex-wrap">
                      {isLocked && (
                        <KontrolleButton userId={u.id} hasEmail={!!u.email} />
                      )}
                      <VerschlussAnforderungButton
                        userId={u.id}
                        hasEmail={!!u.email}
                        isLocked={isLocked}
                        hasActiveSperrzeit={u.stats.hasActiveSperrzeit}
                        tz={rowTz}
                        minNow={nowDatetimeLocal(rowTz)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Die Ruhigen: eine Zeile je Sub statt einer Karte. Sie sind nicht weniger wichtig — sie
            wollen gerade nur nichts. Eine Karte für „alles in Ordnung" kostet denselben Platz wie
            eine für „überfällig", und genau diese Gleichbehandlung machte den Bildschirm zu einer
            Aufzählung. Der Weg in den Sub bleibt derselbe. */}
        {ruhig.length > 0 && (
          <section className={wartend.length > 0 ? "mt-10" : ""}>
            <p className="text-rubrik font-semibold uppercase tracking-[0.16em] text-foreground-faint pb-1">
              {wartend.length > 0 ? t("calmSectionTitle") : t("yourSubsTitle")}
            </p>
            {ruhig.map((u) => {
              const isLocked = u.stats.currentStatus === "VERSCHLUSS";
              const seit = u.stats.since ? formatDurationBetween(u.stats.since, now, dl) : null;
              return (
                <Link
                  key={u.id}
                  href={`/admin/users/${u.id}`}
                  className="flex items-center gap-3 py-3 border-t border-border-subtle transition-colors hover:bg-surface-raised"
                >
                  <UserAvatar username={u.username} size="sm" locked={isLocked} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-zeile font-medium truncate">{u.username}</span>
                    <span className={`block text-neben ${isLocked ? "text-lock" : "text-foreground-faint"}`}>
                      {isLocked
                        ? `${t("locked")}${seit ? ` · ${seit}` : ""}`
                        : u.stats.currentStatus
                          ? `${t("opened")}${seit ? ` · ${t("since")} ${seit}` : ""}`
                          : t("noEntry")}
                    </span>
                  </span>
                  {/* Geplantes ist entschieden und wartet nur — es gehört nicht zu „braucht dich",
                      darf aber nicht unsichtbar werden. Deshalb ein Vermerk, keine Karte. */}
                  {u.stats.scheduled.length > 0 && (
                    <span className="text-neben text-foreground-faint shrink-0 inline-flex items-center gap-1">
                      <CalendarClock size={12} />{u.stats.scheduled.length}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-foreground-faint shrink-0" aria-hidden />
                </Link>
              );
            })}
          </section>
        )}

        {users.length === 0 && (
          <EmptyState
            icon={<Users size={36} />}
            title={t("noUsers")}
            description={t("noUsersDesc")}
            action={isGlobalAdmin ? { label: t("title"), href: "/admin/users" } : undefined}
          />
        )}
    </main>
  );
}
