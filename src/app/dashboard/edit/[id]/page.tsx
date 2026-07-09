import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import VerschlussForm from "../../VerschlussForm";
import OeffnenForm from "../../OeffnenForm";
import PruefungForm from "../../PruefungForm";
import OrgasmusForm from "../../OrgasmusForm";
import WearForm from "../../WearForm";
import { getTranslations } from "next-intl/server";
import { toDatetimeLocal, nowDatetimeLocal } from "@/lib/utils";
import { getUserDeviceOptions, getUserTimezone, getLatestKgEntry } from "@/lib/queries";
import { sealRequiredForCode } from "@/lib/kontrolleService";
import { TYPE_STATS_KEYS } from "@/lib/constants";
import { effectiveOrgasmusArten, effectiveOeffnenGruende, resolveReasonList, resolveOrgasmusOptions } from "@/lib/reasonsService";

export default async function EditEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; userId?: string }>;
}) {
  const [{ id }, sp, session, t, tStats, tCommon, tOrgasm, tOpen] = await Promise.all([
    params,
    searchParams,
    auth(),
    getTranslations("nav"),
    getTranslations("stats"),
    getTranslations("common"),
    getTranslations("orgasmForm"),
    getTranslations("openForm"),
  ]);
  const { from, userId: adminUserId } = sp;
  const isAdmin = session?.user?.role === "admin";
  const currentUserId = session?.user?.id;
  const [entry, dbUser] = await Promise.all([
    prisma.entry.findUnique({
      where: { id },
      include: {
        device: { select: { categoryId: true, category: { select: { id: true, name: true, color: true, icon: true, requirePhoto: true } } } },
      },
    }),
    currentUserId ? prisma.user.findUnique({ where: { id: currentUserId }, select: { mobileDesktopUpload: true } }) : null,
  ]);
  const mobileDesktopMode = dbUser?.mobileDesktopUpload ?? false;
  if (!entry) notFound();
  // Allow access if own entry OR admin
  if (entry.userId !== currentUserId && !isAdmin) notFound();

  // All three depend only on entry.userId → run in parallel (one round-trip instead of three serial).
  // devices: only VERSCHLUSS uses them. wearDevices: only WEAR_BEGIN. tz: the data owner (entry.userId)
  // governs — an admin may edit a sub's entry, and the sub's tz must format the datetime-local value +
  // anti-cheat min/max, never the admin viewer's.
  const [devices, wearDevices, tz, ownerReasons, latestKgEntry] = await Promise.all([
    entry.type === "VERSCHLUSS" ? getUserDeviceOptions(entry.userId) : Promise.resolve([]),
    entry.type === "WEAR_BEGIN" && entry.device?.categoryId
      ? prisma.device.findMany({
          where: { userId: entry.userId, categoryId: entry.device.categoryId, archivedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    getUserTimezone(entry.userId),
    // Reason-Configs des Eintrag-Owners (Sub) — nur für ORGASMUS/OEFFNEN benötigt.
    entry.type === "ORGASMUS" || entry.type === "OEFFNEN"
      ? prisma.user.findUnique({ where: { id: entry.userId }, select: { orgasmusArtenConfig: true, oeffnenGruendeConfig: true } })
      : Promise.resolve(null),
    // Siegel-Hinweis nur für PRUEFUNG relevant — aktives Siegel des Eintrag-Owners (nicht des Admins).
    entry.type === "PRUEFUNG" ? getLatestKgEntry(entry.userId) : Promise.resolve(null),
  ]);
  const nowDefault = nowDatetimeLocal(tz);
  // Bei aktivem Siegel muss die Prüfung zusätzlich die Siegel-Nummer zeigen (Server-Live-Check prüft sie);
  // spiegelt die Logik der Neuanlage-Seite, damit der Hinweis auch beim Bearbeiten erscheint.
  const pruefungSealRequired = sealRequiredForCode(entry.kontrollCode, latestKgEntry);
  const artOptions = resolveOrgasmusOptions(effectiveOrgasmusArten(ownerReasons?.orgasmusArtenConfig), tOrgasm);
  const grundOptions = resolveReasonList(effectiveOeffnenGruende(ownerReasons?.oeffnenGruendeConfig), "opening", tOpen);

  // Anti-cheat: non-admins may only shift times in the allowed direction.
  // WEAR_BEGIN behaves like VERSCHLUSS (forward only), WEAR_END like OEFFNEN (backward only).
  const originalTime = toDatetimeLocal(entry.startTime, tz);
  const minTime = !isAdmin && (entry.type === "VERSCHLUSS" || entry.type === "PRUEFUNG" || entry.type === "WEAR_BEGIN") ? originalTime : undefined;
  const maxTime = !isAdmin && (entry.type === "OEFFNEN" || entry.type === "ORGASMUS" || entry.type === "WEAR_END") ? originalTime : undefined;

  const redirectTo = from === "admin" && adminUserId
    ? `/admin/users/${adminUserId}/eintraege`
    : from === "eintraege" ? "/dashboard/eintraege" : "/dashboard";
  const backLabel = from === "admin" ? tCommon("back") : from === "eintraege" ? t("entries") : t("overview");

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href={redirectTo} className="text-sm text-foreground-faint hover:text-foreground-muted transition">← {backLabel}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">
        {tStats(TYPE_STATS_KEYS[entry.type] ?? "lock")} {tCommon("edit").toLowerCase()}
      </h1>
      <div>
      {entry.type === "OEFFNEN" && (
        <OeffnenForm initial={{ id: entry.id, startTime: entry.startTime.toISOString(), note: entry.note, oeffnenGrund: entry.oeffnenGrund }} grundOptions={grundOptions} maxTime={maxTime} tz={tz} nowDefault={nowDefault} redirectTo={redirectTo} />
      )}
      {entry.type === "VERSCHLUSS" && (
        <VerschlussForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          imageUrl: entry.imageUrl, imageExifTime: entry.imageExifTime?.toISOString() ?? null,
          note: entry.note, kontrollCode: entry.kontrollCode, deviceId: entry.deviceId,
        }} minTime={minTime} tz={tz} nowDefault={nowDefault} mobileDesktopMode={mobileDesktopMode} redirectTo={redirectTo}
          devices={devices}
        />
      )}
      {entry.type === "PRUEFUNG" && (
        <PruefungForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          imageUrl: entry.imageUrl, imageExifTime: entry.imageExifTime?.toISOString() ?? null, note: entry.note,
          kontrollCode: entry.kontrollCode,
        }} minTime={minTime} tz={tz} nowDefault={nowDefault} mobileDesktopMode={mobileDesktopMode} sealRequired={pruefungSealRequired} redirectTo={redirectTo} />
      )}
      {entry.type === "ORGASMUS" && (
        <OrgasmusForm initial={{
          id: entry.id, startTime: entry.startTime.toISOString(),
          note: entry.note, orgasmusArt: entry.orgasmusArt,
        }} artOptions={artOptions} maxTime={maxTime} tz={tz} nowDefault={nowDefault} redirectTo={redirectTo} />
      )}
      {(entry.type === "WEAR_BEGIN" || entry.type === "WEAR_END") && entry.device?.category && (
        <WearForm
          kind={entry.type === "WEAR_BEGIN" ? "begin" : "end"}
          category={entry.device.category}
          devices={entry.type === "WEAR_BEGIN" ? wearDevices : undefined}
          initial={{
            id: entry.id,
            startTime: entry.startTime.toISOString(),
            note: entry.note,
            deviceId: entry.deviceId,
            imageUrl: entry.imageUrl,
            imageExifTime: entry.imageExifTime?.toISOString() ?? null,
          }}
          minTime={minTime}
          maxTime={maxTime}
          tz={tz}
          nowDefault={nowDefault}
          redirectTo={redirectTo}
        />
      )}
      </div>
    </div>
  );
}
