import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { assertJournalReader } from "@/lib/auth/authGuards";
import { prisma } from "@/lib/prisma";
import { getUserTimezone } from "@/lib/entries/queries";
import JournalBrowser from "@/app/components/JournalBrowser";
import { titleCls } from "@/app/components/inputStyles";
import { loadJournalView } from "@/lib/journal/journalService";

export const dynamic = "force-dynamic";

/**
 * Was der Sub mit seiner Keyholderin teilt (Issue #114) — nur Lesen, nur Freigegebenes.
 *
 * Bewusst NICHT „Tagebuch" genannt: wer zugleich Sub ist, hat ein eigenes, und das Anvertraute eines
 * anderen soll nie wie das eigene aussehen. Der Zugang ist strenger als bei jedem anderen Reiter: das
 * Layout lässt Admin UND Keyholderin herein, diese Seite nur die ZUGEORDNETE Keyholderin
 * (`assertJournalReader`) — für alle anderen gibt es sie nicht.
 */
export default async function SharedJournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const [, tz, sub, raw, t] = await Promise.all([
    assertJournalReader(id),
    getUserTimezone(id),
    prisma.user.findUnique({ where: { id }, select: { username: true } }),
    searchParams,
    getTranslations("journal"),
  ]);
  if (!sub) notFound();
  const view = await loadJournalView(id, raw, tz, "keyholder");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className={titleCls}>{t("sharedTitle")}</h2>
        <p className="text-xs text-foreground-faint">{t("sharedIntro", { name: sub.username })}</p>
      </div>
      <JournalBrowser mode="keyholder" basePath={`/admin/users/${id}/tagebuch`} tz={tz} view={view} />
    </div>
  );
}
