import { redirect } from "next/navigation";
import { entryGapEnabled, type EntryGapKind } from "@/lib/entries/entryGapService";
import { prisma } from "@/lib/shared/prisma";
import { getTranslations } from "next-intl/server";
import { assertKeyholderOrAdmin } from "@/lib/auth/authGuards";
import { getUserTimezone } from "@/lib/entries/queries";
import { nowDatetimeLocal } from "@/lib/shared/utils";
import { effectiveOeffnenGruende, resolveReasonList } from "@/lib/entries/reasonsService";
import EntryGapForm from "./EntryGapForm";

/** Server-Seite für beide Nachträge (Pause, Tragezeit). Anders als `oeffnen`/`verschluss` ohne Gate
 *  auf den aktuellen Zustand: das Paar liegt in der VERGANGENHEIT, der Träger darf heute so oder so
 *  stehen. Frei ist die Seite nur mit `ALLOW_ENTRY_GAP`. */
export default async function EntryGapPage({ id, kind }: { id: string; kind: EntryGapKind }) {
  if (!entryGapEnabled()) redirect(`/admin/users/${id}/aktionen`);
  await assertKeyholderOrAdmin(id);
  const [tz, user, tOpen] = await Promise.all([
    getUserTimezone(id),
    prisma.user.findUnique({ where: { id }, select: { oeffnenGruendeConfig: true } }),
    getTranslations("openForm"),
  ]);
  const grundOptions = resolveReasonList(effectiveOeffnenGruende(user?.oeffnenGruendeConfig), "opening", tOpen);
  return <EntryGapForm kind={kind} userId={id} grundOptions={grundOptions} tz={tz} nowDefault={nowDatetimeLocal(tz)} />;
}
