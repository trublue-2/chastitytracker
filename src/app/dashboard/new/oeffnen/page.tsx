import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import OeffnenForm from "../../OeffnenForm";
import type { LockPeriodState } from "@/app/entries/types";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getIsLocked, getActiveLockPeriod, cleaningBlockReason } from "@/lib/queries";
import { nowDatetimeLocal, APP_TZ } from "@/lib/utils";
import { effectiveOeffnenGruende, resolveReasonList } from "@/lib/reasonsService";
import { cleaningUsedToday, nextCleaningWindow, CLEANING_USER_SELECT } from "@/lib/cleaningService";
import { boxHoldOutlook } from "@/lib/boxOpenOutlook";
import { getTasksBlocking } from "@/lib/taskIntervals";

export default async function NewOeffnenPage() {
  const session = await auth();
  const userId = session!.user.id;
  const tz = session!.user.timezone ?? APP_TZ;

  if (!(await getIsLocked(userId))) redirect("/dashboard");

  const now = new Date();
  // Tages-Zählung über `cleaningUsedToday` — dieselbe Kalendertag-Regel wie die
  // Strafbuch-Ableitung (buildStrafbuch), statt sie hier ein zweites Mal auszuformulieren.
  const [activeLockPeriod, user, cleaningToday, box] = await Promise.all([
    getActiveLockPeriod(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { ...CLEANING_USER_SELECT, oeffnenGruendeConfig: true } }),
    cleaningUsedToday(userId, now, tz),
    // Die Selbstauskunft der Box: ihre eigene Frist.
    prisma.boxStatus.findFirst({ where: { userId }, orderBy: { name: "asc" }, select: { lockUntil: true } }),
  ]);

  // Das Urteil fällt hier, nicht im Client: der Server kennt die Sub-Zeitzone und hat EINE Uhr.
  // Rechnete der Client mit `new Date()` nach, flackerte die Karte an der Fristgrenze zwischen
  // Server-Render und Hydration. `box.lockUntil` ist die Selbstauskunft der Box — nicht das
  // Sperrzeit-Ende, das sie erst beim nächsten Sync einfaltet.
  // EINE Quelle für beide Verbraucher: dieselben zwei Felder standen hier zweimal wörtlich, einmal
  // für die Box-Vorschau und einmal fürs Formular. Nullbar ist nur die Übergabe, nicht der Wert.
  const lockPeriodState: LockPeriodState = {
    endsAt: activeLockPeriod?.endsAt?.toISOString() ?? null,
    indefinite: !!activeLockPeriod && activeLockPeriod.endsAt === null,
  };

  const boxHold = boxHoldOutlook({
    lockPeriod: activeLockPeriod ? lockPeriodState : null,
    box: box ? { lockUntil: box.lockUntil?.toISOString() ?? null } : null,
    now,
  });
  const tf = await getTranslations("openForm");
  // Öffnen bricht jede Aufgabe ab, die den KG verschlossen verlangt — vorher warnen und rückfragen.
  const taskWarnings = await getTasksBlocking(userId, now, { kg: true });
  const grundOptions = resolveReasonList(effectiveOeffnenGruende(user?.oeffnenGruendeConfig), "opening", tf);

  return (
    <EntryActionFormShell {...actionSign("OEFFNEN")} title={tf("title")}>
      <OeffnenForm
        grundOptions={grundOptions}
        taskWarnings={taskWarnings}
        tz={tz}
        nowDefault={nowDatetimeLocal(tz)}
        lockPeriod={lockPeriodState}
        cleaning={{
          maxMinutes: user?.cleaningMaxMinutes ?? 15,
          maxPerDay: user?.cleaningMaxPerDay ?? 0,
          usedToday: cleaningToday,
          // Das Urteil fällt der Server, aus derselben Regel wie die Durchsetzung. Der Client
          // bekommt den Grund, damit er ihn nennen kann — nicht die Zutaten, um ihn nachzurechnen.
          //
          // Ohne aktive Sperrzeit gibt es nichts zu brechen: Fenster und Sperr-Flag sind dann
          // bedeutungslos, und ein „ausserhalb des Reinigungsfensters" wäre eine Mahnung ohne
          // Gegenstand. Nur `userNotAllowed` gilt immer — dem Sub fehlt die Erlaubnis so oder so.
          cleaningBlock: activeLockPeriod
            ? cleaningBlockReason(
                { cleaningAllowed: user?.cleaningAllowed ?? false, cleaningWindows: user?.cleaningWindows, timezone: tz },
                [activeLockPeriod],
                now,
              )
            : (user?.cleaningAllowed ? null : "userNotAllowed"),
          nextWindow: nextCleaningWindow(user?.cleaningWindows, now, tz),
        }}
        boxHold={boxHold}
        hasBox={!!box}
      />
    </EntryActionFormShell>
  );
}
