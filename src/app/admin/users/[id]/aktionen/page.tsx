import { redirect } from "next/navigation";
import { Lock, LockOpen, ClipboardCheck, ClipboardList, Droplets, Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getIsLocked, getActiveSperrzeit, getActiveWearSessions } from "@/lib/queries";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { categoryStyle, wearActionHref } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { getTranslations } from "next-intl/server";
import ActionRow, { ActionRowGroup } from "./ActionRow";

/** Icon-Kachel-Ton aus den Semantik-Tokens — `tone("lock")` = Schloss-Farbe auf Schloss-Hintergrund. */
const tone = (name: string) => ({ backgroundColor: `var(--color-${name}-bg)`, color: `var(--color-${name})` });

export default async function AktionenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const [t, tw, tt] = await Promise.all([
    getTranslations("admin"),
    getTranslations("wearForm"),
    getTranslations("tasks"),
  ]);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const flagOn = deviceCategoriesEnabled();
  const [isLocked, activeSperrzeit, categories, activeWear] = await Promise.all([
    getIsLocked(id),
    getActiveSperrzeit(id),
    flagOn
      ? prisma.deviceCategory.findMany({
          where: { userId: id, isBuiltIn: false },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, color: true, icon: true },
        })
      : Promise.resolve([]),
    flagOn ? getActiveWearSessions(id) : Promise.resolve([]),
  ]);
  const activeByCategory = new Map(activeWear.map((s) => [s.categoryId, s]));

  const hasEmail = !!user.email;
  const base = `/admin/users/${id}/aktionen`;

  return (
    <>
      <ActionRowGroup title={t("aktionenAnforderungen")}>
        <ActionRow
          href={hasEmail && isLocked ? `${base}/kontrolle` : undefined}
          icon={<Bell size={20} strokeWidth={2} />}
          iconStyle={tone("inspect")}
          title={t("requestInspection")}
          hint={hasEmail && isLocked ? t("requestInspectionHint") : !hasEmail ? t("noEmail") : t("entryOnlyIfLocked")}
        />

        {/* Verschluss anfordern — mehrere offene Anforderungen sind erlaubt, kein Gate darauf */}
        <ActionRow
          href={!isLocked && hasEmail ? `${base}/verschluss-anforderung` : undefined}
          icon={<Lock size={20} strokeWidth={2} />}
          iconStyle={tone("request")}
          title={t("requestLock")}
          hint={!isLocked && hasEmail ? t("requestLockHint") : isLocked ? t("alreadyLocked") : t("noEmail")}
        />

        {/* Sperrdauer: bestehende bearbeiten, sonst neu setzen — beides nur im verschlossenen Zustand */}
        {isLocked && activeSperrzeit ? (
          <ActionRow
            href={`${base}/sperrdauer-edit`}
            icon={<Lock size={20} strokeWidth={2} />}
            iconStyle={tone("sperrzeit")}
            title={t("editLockDuration")}
            hint={t("editLockDurationHint")}
          />
        ) : (
          <ActionRow
            href={isLocked ? `${base}/verschluss-anforderung` : undefined}
            icon={<Lock size={20} strokeWidth={2} />}
            iconStyle={tone("sperrzeit")}
            title={t("setLockDuration")}
            hint={isLocked ? t("setLockDurationHint") : t("entryOnlyIfLocked")}
          />
        )}

        <ActionRow
          href={`${base}/orgasmus-anforderung`}
          icon={<Droplets size={20} strokeWidth={2} />}
          iconStyle={tone("orgasm")}
          title={t("requestOrgasm")}
          hint={t("requestOrgasmHint")}
        />

        {/* Aufgabe stellen — ohne Kategorien gäbe es nur Freitext-Aufgaben ohne prüfbare Bedingung,
            und der Bedingungs-Wähler wäre bis auf die KG-Zeile leer. */}
        <ActionRow
          href={flagOn ? `${base}/aufgabe` : undefined}
          icon={<ClipboardList size={20} strokeWidth={2} />}
          iconStyle={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-foreground-muted)" }}
          title={tt("actionTitle")}
          hint={flagOn ? tt("actionHint") : tt("categoriesDisabledHint")}
        />
      </ActionRowGroup>

      <ActionRowGroup title={t("aktionenItems")}>
        <ActionRow
          href={isLocked ? undefined : `${base}/verschluss`}
          icon={<Lock size={20} strokeWidth={2} />}
          iconStyle={tone("lock")}
          title={t("entryVerschluss")}
          hint={isLocked ? t("entryOnlyIfOpen") : t("entryVerschlussDesc")}
        />

        <ActionRow
          href={isLocked ? `${base}/oeffnen` : undefined}
          icon={<LockOpen size={20} strokeWidth={2} />}
          iconStyle={tone("unlock")}
          title={t("entryOeffnen")}
          hint={isLocked ? t("entryOeffnenDesc") : t("entryOnlyIfLocked")}
        />

        <ActionRow
          href={`${base}/pruefung`}
          icon={<ClipboardCheck size={20} strokeWidth={2} />}
          iconStyle={tone("inspect")}
          title={t("entryPruefung")}
          hint={t("entryPruefungDesc")}
        />

        <ActionRow
          href={`${base}/orgasmus`}
          icon={<Droplets size={20} strokeWidth={2} />}
          iconStyle={tone("orgasm")}
          title={t("entryOrgasmus")}
          hint={t("entryOrgasmusDesc")}
        />

        {categories.map((c) => {
          const active = activeByCategory.get(c.id);
          const style = categoryStyle(c.color);
          return (
            <ActionRow
              key={c.id}
              href={wearActionHref({ categoryId: c.id, active: !!active, adminUserId: id })}
              icon={<CategoryIconRender name={c.icon} className="size-5" />}
              iconStyle={{ backgroundColor: style.backgroundColor, color: style.color }}
              title={c.name}
              hint={active ? `${tw("endShort")} · ${active.deviceName}` : tw("titleBegin")}
            />
          );
        })}
      </ActionRowGroup>
    </>
  );
}
