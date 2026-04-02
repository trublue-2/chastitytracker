import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import VerschlussForm from "../../VerschlussForm";
import OeffnenForm from "../../OeffnenForm";
import PruefungForm from "../../PruefungForm";
import OrgasmusForm from "../../OrgasmusForm";
import { getTranslations } from "next-intl/server";

export default async function EditEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }, session, t, tStats] = await Promise.all([
    params,
    searchParams,
    auth(),
    getTranslations("nav"),
    getTranslations("stats"),
  ]);
  const userId = session?.user?.id;
  const [entry, dbUser] = await Promise.all([
    prisma.entry.findUnique({ where: { id } }),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { mobileDesktopUpload: true } }) : null,
  ]);
  const mobileDesktopMode = dbUser?.mobileDesktopUpload ?? false;
  if (!entry || entry.userId !== userId) notFound();

  const LABELS: Record<string, string> = {
    VERSCHLUSS: tStats("lock"),
    OEFFNEN: tStats("opening"),
    PRUEFUNG: tStats("inspection"),
    ORGASMUS: tStats("orgasm"),
  };

  const redirectTo = from === "eintraege" ? "/dashboard/eintraege" : "/dashboard";
  const backHref = redirectTo;
  const backLabel = from === "eintraege" ? "Einträge" : t("overview");

  return (
    <div className="w-full max-w-5xl px-6 py-8">
      <Link href={backHref} className="text-sm text-foreground-faint hover:text-foreground-muted transition">← {backLabel}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-8">
        {LABELS[entry.type] ?? entry.type} bearbeiten
      </h1>
      <div className="max-w-lg">
      {entry.type === "OEFFNEN" && (
        <OeffnenForm initial={{ id: entry.id, startTime: entry.startTime.toISOString(), note: entry.note, oeffnenGrund: entry.oeffnenGrund }} redirectTo={redirectTo} />
      )}
      {entry.type === "VERSCHLUSS" && (
        <VerschlussForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          imageUrl: entry.imageUrl, imageExifTime: entry.imageExifTime?.toISOString() ?? null,
          note: entry.note, kontrollCode: entry.kontrollCode,
        }} mobileDesktopMode={mobileDesktopMode} redirectTo={redirectTo} />
      )}
      {entry.type === "PRUEFUNG" && (
        <PruefungForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          imageUrl: entry.imageUrl, imageExifTime: entry.imageExifTime?.toISOString() ?? null, note: entry.note,
          kontrollCode: entry.kontrollCode,
        }} mobileDesktopMode={mobileDesktopMode} redirectTo={redirectTo} />
      )}
      {entry.type === "ORGASMUS" && (
        <OrgasmusForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          note: entry.note, orgasmusArt: entry.orgasmusArt,
        }} redirectTo={redirectTo} />
      )}
      </div>
    </div>
  );
}
