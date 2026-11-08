import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth/auth";
import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import { JOURNAL_HREF } from "@/lib/journal/journal";
import { journalSettingsOf } from "@/lib/journal/journalService";
import { APP_TZ, nowDatetimeLocal } from "@/lib/shared/time";
import JournalForm from "../../JournalForm";

export const dynamic = "force-dynamic";

/** Einen Tagebuch-Eintrag schreiben. Die Leitfrage würfelt der Server, damit Server- und
 *  Client-Rendering dieselbe zeigen. */
export default async function NewJournalEntryPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const tz = session.user.timezone ?? APP_TZ;

  const [t, settings] = await Promise.all([getTranslations("journal"), journalSettingsOf(userId)]);
  const prompts = settings.promptsEnabled ? (t.raw("prompts") as string[]) : [];
  const now = nowDatetimeLocal(tz);

  return (
    <EntryActionFormShell {...actionSign("JOURNAL")} title={t("newEntry")} backHref={JOURNAL_HREF} backLabel={t("title")}>
      <JournalForm
        mode="create"
        tz={tz}
        nowDefault={now}
        initialEntryAt={now}
        initialVisibility={settings.defaultVisibility}
        prompts={prompts}
        initialPromptIndex={prompts.length ? Math.floor(Math.random() * prompts.length) : 0}
      />
    </EntryActionFormShell>
  );
}
