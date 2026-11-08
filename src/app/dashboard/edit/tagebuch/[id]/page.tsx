import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth/auth";
import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import { JOURNAL_HREF, asVisibility } from "@/lib/journal/journal";
import { ownJournalEntry } from "@/lib/journal/journalService";
import { APP_TZ, nowDatetimeLocal, toDatetimeLocal } from "@/lib/shared/time";
import JournalForm from "../../../JournalForm";

export const dynamic = "force-dynamic";

/** Einen eigenen Tagebuch-Eintrag bearbeiten. Ein fremder Eintrag ist hier dasselbe wie ein
 *  unbekannter: 404 — auch für die Keyholderin und den Admin. */
export default async function EditJournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const tz = session.user.timezone ?? APP_TZ;
  const { id } = await params;

  const [t, entry] = await Promise.all([getTranslations("journal"), ownJournalEntry(userId, id)]);
  if (!entry) notFound();

  return (
    <EntryActionFormShell {...actionSign("JOURNAL")} title={t("editEntry")} backHref={JOURNAL_HREF} backLabel={t("title")}>
      <JournalForm
        mode="edit"
        id={entry.id}
        tz={tz}
        nowDefault={nowDatetimeLocal(tz)}
        initialEntryAt={toDatetimeLocal(entry.entryAt, tz)}
        initialText={entry.text}
        initialMood={entry.mood}
        initialVisibility={asVisibility(entry.visibility)}
        fixedPrompt={entry.prompt}
      />
    </EntryActionFormShell>
  );
}
