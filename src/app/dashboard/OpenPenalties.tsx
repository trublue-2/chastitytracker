import Link from "next/link";
import { getTranslations } from "next-intl/server";
import DashboardBlock from "@/app/components/DashboardBlock";
import OffenseList from "@/app/components/OffenseList";
import { prisma } from "@/lib/prisma";
import { messageFilterToParams } from "@/lib/messageCategories";
import { loadSubOffenses, openPenaltiesOf } from "@/lib/subOffenses";
import { SUB_VISIBLE_WHERE } from "@/lib/taskIntervals";

/** Wie viele Strafen im Dashboard ausliegen, bevor auf den Posteingang verwiesen wird. Kein
 *  Aufklapper wie beim Aufgaben-Stapel: der ganze Verlauf steht ohnehin als Nachrichten bereit. */
const DASHBOARD_LIMIT = 3;

/**
 * Der Strafen-Block des Sub-Dashboards — UNTER dem Aufgaben-Block.
 *
 * Zeigt NUR die offenen Strafen, nicht das ganze Strafbuch: die Übersicht beantwortet „was steht
 * an?", nicht „was ist alles vorgefallen?". Erkannte, noch unbeurteilte Vergehen werden als
 * Nachricht gemeldet — als Mängelliste auf dem Dashboard wären sie eine Dauerbeschallung.
 *
 * Begründung der Platzierung: eine Aufgabe mit Frist tickt, eine offene Strafe ist ein Zustand. Sie
 * gehört deshalb weder über die Fristen-Banner noch zwischen sie.
 *
 * Wie `OpenTasks` rendert der Block `null`, wenn nichts offen ist — ein leerer Rahmen „Keine
 * Strafen" wäre eine Zeile, die nie etwas mitteilt.
 */
export default async function OpenPenalties({
  userId,
  tz,
  now,
  dashboardTaskIds,
}: {
  userId: string;
  tz: string;
  /** Die Uhr der Seite — alle Ableitungen des Dashboards teilen sie sich. */
  now: Date;
  /** Die Aufgaben, die auf DIESEM Dashboard gerade stehen. Siehe unten. */
  dashboardTaskIds: Set<string>;
}) {
  // Die Frage „hat dieser Sub überhaupt eine offene Strafe?" beantwortet EINE indizierte Zeile
  // (`StrafeRecord` hat `@@index([userId])`). Erst danach lohnt das Strafbuch, das ~20 Abfragen und
  // eine vollständige Aufgaben-Auswertung kostet. Ohne dieses Tor zahlte jeder Dashboard-Aufruf
  // diesen Preis — auch für die Mehrheit, die nie eine Strafe hat und für die der Block `null` ist.
  // `OR` statt `NOT: { taskId: { in: … } }`: SQL-`NOT IN` liefert für `taskId IS NULL` „unknown"
  // und verlöre damit ausgerechnet die Freitext-Strafen.
  const openCount = await prisma.strafeRecord.count({
    where: {
      userId, status: "PUNISHED", erledigtAt: null,
      OR: [{ taskId: null }, { taskId: { notIn: [...dashboardTaskIds] } }],
    },
  });
  if (openCount === 0) return null;

  const open = openPenaltiesOf(await loadSubOffenses(userId, now));

  // Eine Strafe, deren Aufgabe der Träger noch nicht kennt, gibt es für ihn nicht: ihr Urteilstext
  // IST der Aufgaben-Titel (`punishWithTask` schreibt `reason: task.title`), und hier stünde er,
  // bevor die Aufgabe ihn erreichen soll — mitsamt einem Verweis auf eine Aufgabenliste, in der
  // nichts steht. Genau das soll die Terminierung verhindern.
  //
  // Auf die Aufgaben-Ids der offenen Strafen eingegrenzt und deshalb NACH dem Strafbuch: gefragt
  // wird der Wert nur für diese paar Zeilen, und meistens ist keine davon eine Aufgabe — dann
  // entfällt die Abfrage ganz, statt bei jedem Aufruf alle Aufgaben des Nutzers durchzugehen.
  //
  // `NOT: SUB_VISIBLE_WHERE` und NICHT `pendingDispatchWhere`: das trägt zusätzlich
  // `withdrawnAt: null`, weil es die Auswahl des Pollers ist. Hier geht es um genau die Zeile, die
  // dort herausfällt — eine terminierte Strafaufgabe, die VOR dem Auslösen zurückgezogen wurde.
  // Sie erreicht den Träger nie, ihr Titel stand hier aber trotzdem (er IST der Straftext).
  const penaltyTaskIds = [...new Set(open.flatMap((p) => p.taskId ?? []))];
  const hiddenTaskIds = new Set(
    penaltyTaskIds.length
      ? (await prisma.task.findMany({
          where: { id: { in: penaltyTaskIds }, userId, NOT: SUB_VISIBLE_WHERE },
          select: { id: true },
        })).map((t) => t.id)
      : [],
  );

  // DOPPELUNG MIT DEM AUFGABEN-BLOCK: Ist die Strafe eine AUFGABE, die gerade darüber steht, dann
  // steht dort bereits alles — Titel (= der Straftext, siehe `punishWithTask`), Frist, Bedingungen,
  // Nachweise, dazu das Strafen-Badge der `TaskCard`. Eine Karte hier wäre dieselbe Sache ein paar
  // Pixel tiefer.
  //
  // Die Bedingung ist deshalb die tatsächliche Sichtbarkeit, nicht „ist eine Aufgabe": eine
  // versäumte oder abgebrochene Strafaufgabe verlässt den Aufgaben-Block (`belongsOnDashboard`),
  // während ihre Strafe offen bleibt — genau dann muss sie hier erscheinen, sonst fällt sie stumm
  // aus der Sicht des Trägers.
  const rows = open
    .filter((p) => !(p.taskId && (dashboardTaskIds.has(p.taskId) || hiddenTaskIds.has(p.taskId))))
    .slice(0, DASHBOARD_LIMIT);
  if (rows.length === 0) return null;

  const t = await getTranslations("penalties");

  return (
    <DashboardBlock>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("openTitle")}</p>
        {/* Ins POSTFACH, nicht mehr auf eine eigene Strafbuch-Seite: dort werden festgestellte
            Vergehen und ihr Ausgang seit v5.1 als Nachrichten gemeldet — anders als eine Anzeige auf
            der Live-Ableitung können die nicht mehr still verschwinden. (Vergehen von VOR dem
            Melde-Stichtag der Instanz sind dort nicht nachgetragen.) Dieser Block bleibt daneben
            stehen, weil er eine andere Frage beantwortet: nicht „was ist vorgefallen", sondern „was
            fordert mich gerade".

            MIT Kategorie-Filter, sonst landete „Alle ansehen" der offenen Strafen in der
            Mischliste — der Nutzer müsste die Auswahl, die er mit dem Klick schon getroffen hat,
            dort ein zweites Mal treffen. `offense` UND `penalty` sind zwei Kategorien
            (`messageCategories.ts`: die Feststellung ist noch kein Urteil); dieser Block zeigt
            offene STRAFEN, also führt er auf `penalty`.

            Die Query kommt aus `messageFilterToParams`, nicht von Hand: das ist die Schreib-Seite
            derselben Abbildung, die die Seite mit `parseMessageFilter` wieder einliest. Beide
            scheitern STILL — ein von Hand getippter Parametername fiele einfach weg und führte
            zurück in genau die Mischliste, aus der dieser Link herausführen soll. */}
        <Link
          href={`/dashboard/messages?${messageFilterToParams({ category: "penalty" })}`}
          className="text-xs text-foreground-faint hover:text-foreground-muted transition-colors shrink-0"
        >
          {t("viewAll")} →
        </Link>
      </div>

      <OffenseList offenses={rows} tz={tz} />
    </DashboardBlock>
  );
}
