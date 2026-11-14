import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getLatestKgEntry, latestKgTimesByUser } from "@/lib/queries";
import { requestNowMs, strafbuchCached, subLockPeriodCached } from "@/lib/dashboardData";
import { selectSubOffenses, attentionOffensesOf } from "@/lib/subOffenses";
import { pendingProofReviewWhere } from "@/lib/taskProofService";
import { canReadJournal, getControlledSubs } from "@/lib/keyholder";
import UserContextBar from "./UserContextBar";
import UserSubNav from "./UserSubNav";
import { blockStackCls, wideColCls } from "@/app/components/inputStyles";

/** Die Reiterleiste MIT dem, was auf die Entscheidung der Keyholderin wartet: dieselben Zählungen
 *  wie an der Karte der Übersicht (`attentionOffensesOf`, `pendingProofReviewWhere`). Das Strafbuch
 *  kommt aus `strafbuchCached` und wird auf der Strafbuch-Seite nicht noch einmal abgeleitet. */
async function SubNavWithCounts({ userId, showJournal }: { userId: string; showJournal: boolean }) {
  const [strafbuch, tasks] = await Promise.all([
    strafbuchCached(userId, requestNowMs()).then((sb) => attentionOffensesOf(selectSubOffenses(sb)).length),
    prisma.taskProof.count({ where: pendingProofReviewWhere(userId) }),
  ]);
  return <UserSubNav userId={userId} showJournal={showJournal} counts={{ strafbuch, tasks }} />;
}

export default async function AdminUserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Single guard for every per-user tab: global admin OR keyholder-of-id.
  const { userId: actorId, isGlobalAdmin } = await assertKeyholderOrAdmin(id);

  // Switch list: global admin sees all users; a keyholder sees only their controlled subs.
  const usersForSwitcher = isGlobalAdmin
    ? prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true } })
    : getControlledSubs(actorId);

  // Parallelize all queries — select only needed fields for user-switcher
  const [user, allUsers, latestLockEntry, activeLockPeriod, journalReader] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, username: true } }),
    usersForSwitcher,
    getLatestKgEntry(id),
    // Für die Restzeit-Anzeige in der Kontextleiste (#10): die EFFEKTIVE laufende Sperrzeit.
    // `subLockPeriodCached`, damit die drei Aktions-Unterseiten, die dieselbe Sperrzeit lesen,
    // die Abfrage per React-`cache()` mit dem Layout teilen statt sie doppelt zu fahren.
    subLockPeriodCached(id),
    // Der Tagebuch-Reiter erscheint nur der ZUGEORDNETEN Keyholderin — dieselbe Regel wie seine Seite.
    canReadJournal(actorId, id),
  ]);

  const userIds = allUsers.map(u => u.id);
  const { lockedAt: vMap, openedAt: oMap } = await latestKgTimesByUser(userIds);

  if (!user) return <>{children}</>;

  // `isLocked: undefined` heisst „von diesem Träger liegt noch nichts vor" und ist NICHT dasselbe
  // wie `false`. Seit die Farbe beide Zustände trägt (grün verschlossen, rosa offen), leuchtete ein
  // frisch angelegtes Konto sonst rosa, als hätte jemand gerade aufgeschlossen.
  const userLockStatuses = allUsers.map((u) => {
    const vTime = vMap.get(u.id);
    const oTime = oMap.get(u.id);
    return {
      id: u.id,
      username: u.username,
      isLocked: !vTime && !oTime ? undefined : !!vTime && (!oTime || vTime > oTime),
    };
  });

  const currentStatus = latestLockEntry?.type === "VERSCHLUSS"
    ? "VERSCHLUSS" as const
    : latestLockEntry?.type === "OEFFNEN"
      ? "OEFFNEN" as const
      : null;

  return (
    <>
      <UserContextBar
        userId={id}
        username={user.username}
        currentStatus={currentStatus}
        since={latestLockEntry?.type === "VERSCHLUSS" ? latestLockEntry.startTime.toISOString() : null}
        // Restzeit statt „seit": nur bei verschlossen UND befristeter aktiver Sperrzeit. Unbefristet
        // (endsAt null) bleibt es bei der Zeit seit dem Verschluss — es gibt keine Restzeit.
        lockEndsAt={currentStatus === "VERSCHLUSS" && activeLockPeriod?.endsAt ? activeLockPeriod.endsAt.toISOString() : null}
        users={userLockStatuses}
        isGlobalAdmin={isGlobalAdmin}
      />
      {/* Die Zähler an den Reitern kosten ein volles Strafbuch: sie dürfen die Seite nicht aufhalten.
          Bis sie da sind, steht die Leiste ohne Zahlen da. */}
      <Suspense fallback={<UserSubNav userId={id} showJournal={journalReader} />}>
        <SubNavWithCounts userId={id} showJournal={journalReader} />
      </Suspense>
      {/* Kopfzeile und Reiter oben spannen die ganze HÜLLE (`adminShellColCls`, 1024) — sie rahmen
          die Seite und tragen die neun Reiter in einer Zeile. Der INHALT hier wird dagegen auf das
          Lesemass (`wideColCls`, 768) zurückgekappt: eine Detailzeile mit Name links und Chevron
          rechts zöge sich sonst auf Armlänge (der Grund, aus dem die Spalte einmal von 1024 auf 768
          zurückging). Die Blöcke füllen die gekappte Spalte, statt ihre eigene mitzubringen —
          Begründung in `DashboardBlock`. */}
      <main className={`flex-1 py-6 ${wideColCls} ${blockStackCls} [--block-col:100%] [--block-gutter:0px]`}>
        {children}
      </main>
    </>
  );
}
