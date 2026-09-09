import type { getTranslations } from "next-intl/server";
import Section from "./Section";
import { formatDurationMs, formatDateTime } from "@/lib/utils";

/**
 * **Die orgasmusfreie Zeit als Block** — die Dauer seit dem letzten Orgasmus, darunter leise das
 * Datum. Geteilt von der Statistik-Seite (`statsBlocks.tsx`) und dem Sub-Dashboard
 * (`dashboardBlocks.tsx`), damit dieselbe Angabe überall gleich aussieht: erst die Antwort (die
 * Dauer), dann der Beleg (das Datum) — dieselbe Ordnung wie beim Zustands-Helden der Übersicht.
 *
 * Die Angabe gehört zur STATISTIK: ihre drei Beschriftungen leben im `stats`-Namensraum, und die
 * Komponente löst sie selbst auf. Der Aufrufer reicht nur den `stats`-Übersetzer herein — dasselbe
 * Muster nutzt die Keyholder-Sub-Sicht bereits (`keyholderSubBlocks.tsx`, `ts`), damit derselbe
 * Wert nicht in einem zweiten Namensraum gedoppelt wird.
 */
export default function OrgasmFreeSection({
  lastOrgasm, now, dl, tz, t,
}: {
  /** Der jüngste Orgasmus-Eintrag, oder `null`, wenn es keinen gibt. */
  lastOrgasm: { startTime: Date } | null;
  now: Date;
  dl: string;
  tz: string;
  /** Übersetzer des `stats`-Namensraums (`orgasmFreeTime`, `lastOrgasm`, `noEntry`). */
  t: Awaited<ReturnType<typeof getTranslations<"stats">>>;
}) {
  return (
    <Section title={t("orgasmFreeTime")}>
      {lastOrgasm ? (
        <>
          <p className="text-kennzahl font-semibold text-foreground whitespace-nowrap tabular-nums">
            {formatDurationMs(now.getTime() - lastOrgasm.startTime.getTime(), dl)}
          </p>
          <p className="text-neben text-foreground-faint">
            {t("lastOrgasm")}: {formatDateTime(lastOrgasm.startTime, dl, tz)}
          </p>
        </>
      ) : (
        <p className="text-fliess text-foreground-faint">{t("noEntry")}</p>
      )}
    </Section>
  );
}
