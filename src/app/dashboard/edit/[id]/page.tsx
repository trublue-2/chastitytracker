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
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session, t, tStats] = await Promise.all([
    params,
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
  if (!entry) notFound();

  const LABELS: Record<string, string> = {
    VERSCHLUSS: tStats("lock"),
    OEFFNEN: tStats("opening"),
    PRUEFUNG: tStats("inspection"),
    ORGASMUS: tStats("orgasm"),
  };

  return (
    <div className="w-full max-w-5xl px-6 py-8">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">← {t("overview")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-8">
        {LABELS[entry.type] ?? entry.type} bearbeiten
      </h1>
      <div className="max-w-lg">
      {entry.type === "OEFFNEN" && (
        <OeffnenForm initial={{ id: entry.id, startTime: entry.startTime.toISOString(), note: entry.note, oeffnenGrund: entry.oeffnenGrund }} />
      )}
      {entry.type === "VERSCHLUSS" && (
        <VerschlussForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          imageUrl: entry.imageUrl, imageExifTime: entry.imageExifTime?.toISOString() ?? null, note: entry.note,
        }} mobileDesktopMode={mobileDesktopMode} />
      )}
      {entry.type === "PRUEFUNG" && (
        <PruefungForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          imageUrl: entry.imageUrl, imageExifTime: entry.imageExifTime?.toISOString() ?? null, note: entry.note,
          kontrollCode: entry.kontrollCode,
        }} mobileDesktopMode={mobileDesktopMode} />
      )}
      {entry.type === "ORGASMUS" && (
        <OrgasmusForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          note: entry.note, orgasmusArt: entry.orgasmusArt,
        }} />
      )}
      </div>
    </div>
  );
}
