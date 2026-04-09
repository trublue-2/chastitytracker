import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import VerschlussForm from "../../VerschlussForm";
import OeffnenForm from "../../OeffnenForm";
import PruefungForm from "../../PruefungForm";
import OrgasmusForm from "../../OrgasmusForm";
import { getTranslations } from "next-intl/server";
import { toDatetimeLocal } from "@/lib/utils";

export default async function EditEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; userId?: string }>;
}) {
  const [{ id }, sp, session, t, tStats, tCommon] = await Promise.all([
    params,
    searchParams,
    auth(),
    getTranslations("nav"),
    getTranslations("stats"),
    getTranslations("common"),
  ]);
  const { from, userId: adminUserId } = sp;
  const isAdmin = session?.user?.role === "admin";
  const currentUserId = session?.user?.id;
  const [entry, dbUser] = await Promise.all([
    prisma.entry.findUnique({ where: { id } }),
    currentUserId ? prisma.user.findUnique({ where: { id: currentUserId }, select: { mobileDesktopUpload: true } }) : null,
  ]);
  const mobileDesktopMode = dbUser?.mobileDesktopUpload ?? false;
  if (!entry) notFound();
  // Allow access if own entry OR admin
  if (entry.userId !== currentUserId && !isAdmin) notFound();

  const LABELS: Record<string, string> = {
    VERSCHLUSS: tStats("lock"),
    OEFFNEN: tStats("opening"),
    PRUEFUNG: tStats("inspection"),
    ORGASMUS: tStats("orgasm"),
  };

  // Anti-cheat: non-admins may only shift times in the allowed direction
  const originalTime = toDatetimeLocal(entry.startTime);
  const minTime = !isAdmin && (entry.type === "VERSCHLUSS" || entry.type === "PRUEFUNG") ? originalTime : undefined;
  const maxTime = !isAdmin && (entry.type === "OEFFNEN" || entry.type === "ORGASMUS") ? originalTime : undefined;

  const redirectTo = from === "admin" && adminUserId
    ? `/admin/users/${adminUserId}/eintraege`
    : from === "eintraege" ? "/dashboard/eintraege" : "/dashboard";
  const backLabel = from === "admin" ? tCommon("back") : from === "eintraege" ? t("entries") : t("overview");

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href={redirectTo} className="text-sm text-foreground-faint hover:text-foreground-muted transition">← {backLabel}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">
        {LABELS[entry.type] ?? entry.type} {tCommon("edit").toLowerCase()}
      </h1>
      <div>
      {entry.type === "OEFFNEN" && (
        <OeffnenForm initial={{ id: entry.id, startTime: entry.startTime.toISOString(), note: entry.note, oeffnenGrund: entry.oeffnenGrund }} maxTime={maxTime} redirectTo={redirectTo} />
      )}
      {entry.type === "VERSCHLUSS" && (
        <VerschlussForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          imageUrl: entry.imageUrl, imageExifTime: entry.imageExifTime?.toISOString() ?? null,
          note: entry.note, kontrollCode: entry.kontrollCode,
        }} minTime={minTime} mobileDesktopMode={mobileDesktopMode} redirectTo={redirectTo} />
      )}
      {entry.type === "PRUEFUNG" && (
        <PruefungForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          imageUrl: entry.imageUrl, imageExifTime: entry.imageExifTime?.toISOString() ?? null, note: entry.note,
          kontrollCode: entry.kontrollCode,
        }} minTime={minTime} mobileDesktopMode={mobileDesktopMode} redirectTo={redirectTo} />
      )}
      {entry.type === "ORGASMUS" && (
        <OrgasmusForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          note: entry.note, orgasmusArt: entry.orgasmusArt,
        }} maxTime={maxTime} redirectTo={redirectTo} />
      )}
      </div>
    </div>
  );
}
