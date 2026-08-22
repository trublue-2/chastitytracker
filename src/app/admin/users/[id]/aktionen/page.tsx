import { redirect } from "next/navigation";
import { Lock, LockOpen, ClipboardCheck, ClipboardList, Droplets, Bell, Gavel, Scale } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getIsLocked, getActiveSperrzeit } from "@/lib/queries";
import { buildNewEntryCategoryRows } from "@/lib/categoryRows";
import { weightTrackingEnabled } from "@/lib/constants";
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

  const [isLocked, activeSperrzeit, categories] = await Promise.all([
    getIsLocked(id),
    getActiveSperrzeit(id),
    buildNewEntryCategoryRows(id),
  ]);

  const hasEmail = !!user.email;
  // Gibt es überhaupt ein Ziel für eine Kontrolle? Der KG zählt nur verschlossen, jede laufende
  // Trage-Session ebenfalls (dieselbe Menge, die /api/admin/inspection-targets liefert).
  const hasInspectionTarget = isLocked || categories.some((c) => c.activeDeviceName !== null);
  const base = `/admin/users/${id}/aktionen`;

  return (
    <>
      <ActionRowGroup title={t("aktionenAnforderungen")}>
        {/* Kontrollen brauchen ein LAUFENDES Ziel — verschlossen ODER etwas getragen (v5.0.1).
            Ohne beides gäbe es nichts zu zeigen, und `requestKontrolle` würde ablehnen. */}
        <ActionRow
          href={hasEmail && hasInspectionTarget ? `${base}/kontrolle` : undefined}
          icon={<Bell size={20} strokeWidth={2} />}
          iconStyle={tone("inspect")}
          title={t("requestInspection")}
          hint={hasEmail && hasInspectionTarget ? t("requestInspectionHint") : !hasEmail ? t("noEmail") : t("entryOnlyIfLockedOrWorn")}
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

        {/* Kein Kategorien-Gate: „KG verschlossen" und reine Freitext-Aufgaben gehen auch ohne
            Gerätekategorien — siehe `aufgaben/page.tsx`. */}
        <ActionRow
          href={`${base}/aufgabe`}
          icon={<ClipboardList size={20} strokeWidth={2} />}
          iconStyle={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-foreground-muted)" }}
          title={tt("actionTitle")}
          hint={tt("actionHint")}
        />

        {/* Steht bei den Anforderungen und nicht bei den Einträgen: die Zeilen dort legen einen
            `Entry` an, ein notiertes Vergehen ist gerade die Art, die NICHT aus Einträgen
            abgeleitet wird (`offenseTypes.ts`). Kein Gate — es hat keine Vorbedingung. */}
        <ActionRow
          href={`${base}/vergehen`}
          icon={<Gavel size={20} strokeWidth={2} />}
          iconStyle={tone("warn")}
          title={t("recordOffense")}
          hint={t("recordOffenseHint")}
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

        {/* Gewicht — nur mit Freischaltung. Ohne sie führte die Zeile auf eine Seite, die umleitet. */}
        {weightTrackingEnabled() && user.weightTrackingEnabled && (
          <ActionRow
            href={`${base}/gewicht`}
            icon={<Scale size={20} strokeWidth={2} />}
            iconStyle={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-foreground-muted)" }}
            title={t("entryWeight")}
            hint={t("entryWeightDesc")}
          />
        )}

        {categories.map((c) => {
          const active = c.activeDeviceName;
          const style = categoryStyle(c.color);
          return (
            <ActionRow
              key={c.id}
              href={wearActionHref({ categoryId: c.id, active: !!active, adminUserId: id })}
              icon={<CategoryIconRender name={c.icon} className="size-5" />}
              iconStyle={{ backgroundColor: style.backgroundColor, color: style.color }}
              title={c.name}
              hint={active ? `${tw("endShort")} · ${active}` : tw("titleBegin")}
            />
          );
        })}
      </ActionRowGroup>
    </>
  );
}
