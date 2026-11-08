import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import DashboardBlock from "@/app/components/DashboardBlock";
import InfoDot from "@/app/components/InfoDot";
import Button from "@/app/components/Button";
import JournalBrowser from "@/app/components/JournalBrowser";
import { titleCls } from "@/app/components/inputStyles";
import { JOURNAL_HREF, JOURNAL_NEW_HREF } from "@/lib/journal/journal";
import { loadJournalView } from "@/lib/journal/journalService";
import { APP_TZ } from "@/lib/utils";

// Wie das übrige Dashboard: user-spezifisch, nie geteilt gecacht.
export const dynamic = "force-dynamic";

/**
 * Das eigene Tagebuch (Issue #114). Erreichbar über das Zeichen in der Kopfzeile; ohne eigenen
 * Tracker gibt es die Seite nicht (der Proxy leitet `/dashboard/*` dann ohnehin um).
 */
export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const tz = session.user.timezone ?? APP_TZ;

  const [t, view] = await Promise.all([
    getTranslations("journal"),
    searchParams.then((raw) => loadJournalView(userId, raw, tz, "own")),
  ]);

  return (
    <DashboardBlock as="main">
      <div className="pt-6 flex flex-col gap-1.5 mb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className={titleCls}>{t("title")}</h1>
          <InfoDot label={t("operatorNoteLabel")} align="right">{t("operatorNote")}</InfoDot>
        </div>
        <p className="text-xs text-foreground-faint">{t("intro")}</p>
      </div>
      <Link href={JOURNAL_NEW_HREF} className="block mb-5">
        <Button variant="secondary" fullWidth icon={<Plus size={16} />}>{t("newEntry")}</Button>
      </Link>
      <JournalBrowser mode="own" basePath={JOURNAL_HREF} tz={tz} view={view} />
    </DashboardBlock>
  );
}
