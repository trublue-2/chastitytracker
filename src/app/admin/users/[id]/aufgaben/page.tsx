import Link from "next/link";
import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { ClipboardList } from "lucide-react";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import SettingsSection from "@/app/components/SettingsSection";
import AdminTaskListClient from "@/app/admin/tasks/AdminTaskListClient";
import { evaluateTasks, TASK_INCLUDE } from "@/lib/taskIntervals";
import { toTaskCard } from "@/lib/taskView";
import { loadTaskProofViews } from "@/lib/taskIntervals";
import { APP_TZ } from "@/lib/utils";
import { isTaskOpenForKeyholder } from "@/lib/tasks";
import { taskFormHref } from "@/lib/entryFormRoute";

/** Die Aufgaben-Historie eines Subs — ohne sie sähe der Keyholder im Web nie, ob eine gestellte
 *  Aufgabe erfüllt wurde. Zurückgezogene bleiben sichtbar: es sind seine eigenen Rückzüge, gleiche
 *  Regel wie in der Kontroll-Historie. */
export default async function AdminUserTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  await assertKeyholderOrAdmin(id);
  const [t, ta] = await Promise.all([getTranslations("tasks"), getTranslations("admin")]);

  const user = await prisma.user.findUnique({ where: { id }, select: { timezone: true } });
  if (!user) return <div className="p-8 text-foreground-faint">{ta("userNotFound")}</div>;

  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: { userId: id },
    orderBy: { holdUntil: "desc" },
    take: 100,
    include: TASK_INCLUDE,
  });
  const evaluated = await evaluateTasks(id, tasks, now, { kgLabel: t("requirementKgLocked") });
  // Auch der Keyholder sieht die Nachweise — ohne Deep-Links (es sind nicht seine Formulare), aber
  // mit Beschreibung, Zustand und seiner eigenen Sichtungs-Anmerkung.
  const proofViews = await loadTaskProofViews(evaluated.map((e) => e.task.id));

  /**
   * Offen oben, erledigt darunter — die Trennung, die „müllt sich zu" tatsächlich behebt.
   *
   * „Offen" ist hier WEITER gefasst als `isTaskOpen`: eine Aufgabe, die auf die Sichtung der
   * Keyholderin wartet, ist für sie eine offene Pflicht, auch wenn sie für den Träger vorbei ist.
   * Genau dafür gibt es `needsKeyholderReview` — sie in den unteren Abschnitt zu schieben hiesse,
   * ihr die einzige Ansicht wegzunehmen, in der sie noch etwas tun kann.
   *
   * Zurückgezogene stehen bei den erledigten: sie sind entschieden, nur eben von ihr statt vom
   * Verlauf. Löschen lassen sie sich genau dort (`DeleteTaskButton` an der Karte).
   */
  const cards = evaluated.map((e) => toTaskCard(e, false, proofViews.get(e.task.id) ?? []));
  const sections = [
    { key: "sectionOpen" as const, tasks: cards.filter((c) => isTaskOpenForKeyholder(c.state)) },
    { key: "sectionClosed" as const, tasks: cards.filter((c) => !isTaskOpenForKeyholder(c.state)) },
  ];

  // Bewusst OHNE Kategorien-Gate: eine Aufgabe ist Text plus 0..n Bedingungen. „KG verschlossen"
  // kommt nicht aus den Kategorien, und eine reine Freitext-Aufgabe braucht überhaupt keine —
  // beides funktioniert mit leerer Kategorienliste. Ein Gate hätte hier nur weggesperrt, was geht.
  const newHref = taskFormHref(id);

  return (
    <>
      {/* Kein eigener Seitentitel und kein eigener Breiten-Wrapper: den Namen trägt der aktive Reiter,
          die Spaltenbreite und der Abstand kommen aus `admin/users/[id]/layout.tsx`. */}
      {/* Im Leer-Zustand trägt der Ruf-zur-Tat im EmptyState — zwei gleiche Knöpfe auf einem
          Bildschirm wären einer zu viel. */}
      {evaluated.length > 0 && (
        <div className="flex justify-end">
          <Link href={newHref}>
            <Button variant="primary" icon={<ClipboardList size={16} />}>{t("actionTitle")}</Button>
          </Link>
        </div>
      )}

      {evaluated.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title={t("empty")}
          description={t("emptyHint")}
          action={{ label: t("actionTitle"), href: newHref }}
        />
      ) : (
        <>
          {/* Zwei Abschnitte statt einer Liste, und je einer mit eigener Blätter-Zeile — dieselbe
              Form wie die Kontroll-Historie im Reiter nebenan. Was noch etwas von der Keyholderin
              will, steht oben und bleibt oben; das Erledigte sammelt sich darunter, statt es nach
              unten zu drücken. */}
          {/* OHNE Zahl in der Kopfzeile: die Abfrage oben ist bei 100 gekappt, eine Zahl daneben
              behauptete eine Vollständigkeit, die sie nicht hat. Der offene Abschnitt der
              Kontroll-Historie macht es aus demselben Grund genauso. */}
          {sections.map(({ key, tasks: section }) => section.length > 0 && (
            <SettingsSection key={key} title={t(key)} bodyPadded>
              <AdminTaskListClient
                tasks={section}
                viewerTz={session?.user?.timezone ?? APP_TZ}
                subTz={user.timezone ?? APP_TZ}
              />
            </SettingsSection>
          ))}
        </>
      )}
    </>
  );
}
