"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import DashboardBlock from "@/app/components/DashboardBlock";
import TaskCard from "@/app/components/TaskCard";
import TaskCardStack from "@/app/components/TaskCardStack";
import Button from "@/app/components/Button";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { nextTaskStep, type TaskCardData } from "@/lib/taskView";

/**
 * Der Aufgaben-Block des Sub-Dashboards — Rang 3, direkt über der Session-Karte.
 *
 * Begründung der Platzierung: eine Aufgabe mit Frist ist das Einzige auf der Seite, das in den
 * nächsten Stunden zu einem Vergehen werden kann.
 */
export default function OpenTasks({ tasks, tz, defaultCollapsed }: { tasks: TaskCardData[]; tz: string; defaultCollapsed?: boolean }) {
  if (tasks.length === 0) return null;

  return (
    <DashboardBlock>
      <TaskCardStack defaultCollapsed={defaultCollapsed}>
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} subTz={tz} subLabel="">
            {/* Der Knopf steht GENAU dann, wenn die Karte darüber die Selbstmeldung als nächsten
                Schritt nennt — eine Regel, eine Quelle. Getrennt beantwortet, sagte die Karte
                „Bedingung erfüllen" und der Knopf darunter „Als erledigt melden": zwei
                Aufforderungen für einen Schritt.

                Dass er beim Ablauf der Haltefrist von selbst erscheint, besorgt der `Heartbeat`:
                seine Signatur trägt `holdRunning` mit, ein eigener Timer wäre ein zweiter Kanal für
                dieselbe Frage. Preis: bis zu einem Poll-Takt Verzögerung — bei einer Haltefrist von
                Stunden nicht der Rede wert. */}
            {nextTaskStep(task)?.kind === "confirm" && <MarkDoneButton taskId={task.id} />}
          </TaskCard>
        ))}
      </TaskCardStack>
    </DashboardBlock>
  );
}

/** „Als erledigt melden" — sitzt auf dem Dashboard, nicht in einem Formular; Fehler gehen deshalb an
 *  den Toast und nicht an einen `FormError`-Slot. */
function MarkDoneButton({ taskId }: { taskId: string }) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const toast = useToast();
  const router = useRouter();
  const apiError = useApiError();
  const { offlineFetch } = useOfflineQueue();
  const [saving, setSaving] = useState(false);

  /**
   * Rückfrage vor der Selbstmeldung.
   *
   * Die Regel, aus der sie folgt: **eine Rückfrage gehört dorthin, wo eine Handlung für einen
   * ANDEREN Folgen hat — nicht nur dorthin, wo Daten verschwinden.** Die App hat sie lange umgekehrt
   * angewandt: vor dem Löschen einer Nachricht wurde gefragt, vor dieser Meldung nicht, obwohl sie
   * eine Auskunft über sich selbst ist, an der die Keyholderin ihr Urteil festmacht.
   *
   * Warum sie hier schwerer wiegt als anderswo: **es gibt keinen Weg zurück.** `completeTask` kennt
   * nur das Setzen von `completedAt` (eine erneute Meldung rückt den Zeitstempel höchstens vor);
   * eine Aktion, die ihn wieder auf `null` setzt, existiert weder für den Träger noch für die
   * Keyholderin. Und der Knopf sitzt auf dem Dashboard, wo auf 390 px ein Fehltipper genügt.
   */
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handle() {
    setSaving(true);
    try {
      const res = await offlineFetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      // `null` = offline in die Warteschlange gelegt. Das ehrlich sagen, statt „erledigt" zu melden,
      // was der Server noch gar nicht gesehen hat.
      if (res === null) {
        toast.info(t("markDoneQueued"));
      } else if (res.ok) {
        toast.success(t("markDoneDone"));
        router.refresh();
      } else {
        toast.error(apiError(await parseApiErrorCode(res)));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Primär, nicht sekundär: das ist die letzte Handlung der Aufgabe, nicht eine Nebenoption. */}
      <Button type="button" variant="primary" fullWidth loading={saving} onClick={() => setConfirmOpen(true)} icon={<Check size={16} />}>
        {t("markDone")}
      </Button>
      {/* Wofür der Knopf da ist. Ohne diesen Satz war unklar, was er über die abgehakten Bedingungen
          hinaus noch behauptet — nämlich das, was die App gar nicht messen kann. */}
      <p className="text-xs text-foreground-faint">{t("markDoneHint")}</p>

      {/* KEIN `danger`: die Meldung ist der vorgesehene Abschluss der Aufgabe, kein Zerstören. Rot
          wäre hier eine Warnung vor der richtigen Antwort.

          Die Rückfrage schliesst VOR dem Abruf, nicht danach: die Rückmeldung dieses Knopfes ist der
          Toast, und der stünde mit dem Modal auf derselben Ebene (beide `z-[9999]`) — Erfolg wie
          Fehler könnten hinter dem Dialog liegen. Sichtbar bleibt der Fortschritt trotzdem: der
          Spinner sitzt am Knopf der Karte, nicht im Dialog. */}
      <ConfirmDialog
        open={confirmOpen}
        title={t("markDoneConfirmTitle")}
        message={t("markDoneConfirmText")}
        confirmLabel={t("markDone")}
        icon={<Check size={20} style={{ color: "var(--color-warn)" }} />}
        onConfirm={() => { setConfirmOpen(false); void handle(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
