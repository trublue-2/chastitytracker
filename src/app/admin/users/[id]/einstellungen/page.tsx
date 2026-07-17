import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import RoleSelect from "@/app/admin/RoleSelect";
import ReinigungToggle from "@/app/admin/ReinigungToggle";
import AutoKontrolleToggle from "@/app/admin/AutoKontrolleToggle";
import InspectionEscalationToggle from "@/app/admin/InspectionEscalationToggle";
import { parseReinigungsFenster } from "@/lib/reinigungService";
import { parseReasonConfig, resolveOrgasmusOptions, ART_SEP } from "@/lib/reasonsService";
import ReasonsEditor from "@/app/admin/ReasonsEditor";
import { ORGASMUS_ARTEN, OEFFNEN_GRUENDE, ORGASMUS_ART_I18N_KEYS, GRUND_I18N_KEYS } from "@/lib/constants";
import AccountSection from "./AccountSection";
import UserLocaleSelect from "@/app/admin/UserLocaleSelect";
import MobileUploadToggle from "@/app/admin/MobileUploadToggle";
import KeyholderInstructionsForm from "@/app/admin/KeyholderInstructionsForm";
import KeyholderManager from "@/app/admin/KeyholderManager";
import { getKeyholdersOfUser } from "@/lib/keyholder";
import NotificationToggles from "./NotificationToggles";
import DeleteUserButton from "@/app/admin/DeleteUserButton";
import SettingsSection from "@/app/components/SettingsSection";
import VorgabeForm from "../VorgabeForm";
import VorgabeRow from "../VorgabeRow";
import { getLocale, getTranslations } from "next-intl/server";
import { toDateLocale, formatDate } from "@/lib/utils";

function isActive(v: { gueltigAb: Date; gueltigBis: Date | null }): boolean {
  const now = new Date();
  return v.gueltigAb <= now && (v.gueltigBis === null || v.gueltigBis >= now);
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function EinstellungenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { userId: actorId, isGlobalAdmin } = await assertKeyholderOrAdmin(id);

  const [user, vorgaben, categories, keyholders, t, tc, dl, tOrgasm, tOpen] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.trainingVorgabe.findMany({ where: { userId: id, deletedAt: null }, orderBy: { gueltigAb: "desc" } }), // B-04: soft-gelöschte Ziele ausblenden
    // Vorgaben can only be set on KG-built-in or user-categories with allowVorgaben=true.
    prisma.deviceCategory.findMany({
      where: { userId: id, OR: [{ isBuiltIn: true }, { allowVorgaben: true }] },
      orderBy: [{ isBuiltIn: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    getKeyholdersOfUser(id),
    getTranslations("admin"),
    getTranslations("common"),
    getLocale().then(toDateLocale),
    getTranslations("orgasmForm"),
    getTranslations("openForm"),
  ]);

  if (!user) redirect("/admin");
  const tz = user.timezone;
  // Built-in-Codes → i18n-Label (Placeholder im Editor, wenn kein Override gesetzt ist). Deckt auch
  // die Default-Kombi-Codes (`Orgasmus – Masturbation` …) ab, damit deren Editor-Zeilen nicht leer
  // erscheinen (leere Zeilen verleiten dazu, versehentlich eine Unterart zu einer Hauptart zu machen).
  const orgasmBuiltinLabels: Record<string, string> = {
    ...Object.fromEntries(ORGASMUS_ARTEN.map((c) => [c, tOrgasm(ORGASMUS_ART_I18N_KEYS[c])])),
    ...Object.fromEntries(
      resolveOrgasmusOptions(parseReasonConfig(null, "orgasm"), tOrgasm)
        .filter((o) => o.subLabel)
        .map((o) => [o.code, `${o.mainLabel}${ART_SEP}${o.subLabel}`]),
    ),
  };
  const openingBuiltinLabels = Object.fromEntries(OEFFNEN_GRUENDE.map((c) => [c, tOpen(GRUND_I18N_KEYS[c])]));

  return (
    <div className="flex flex-col gap-6">
      {/* Konto */}
      <AccountSection
        userId={user.id}
        username={user.username}
        email={user.email}
        role={user.role}
        isSelf={actorId === user.id}
      />

      {/* Rolle */}
      {isGlobalAdmin && (
        <SettingsSection title={t("roleLabel")} description={t("roleDesc")} bodyPadded>
          <RoleSelect id={user.id} currentRole={user.role} />
        </SettingsSection>
      )}

      {/* Keyholder dieses Subs */}
      {isGlobalAdmin && (
        <SettingsSection title={t("sectionKeyholders")} description={t("keyholdersDesc")} bodyPadded>
          <KeyholderManager subId={user.id} initial={keyholders.map((k) => ({ id: k.id, username: k.username }))} />
        </SettingsSection>
      )}

      {/* Sprache des Subs — App, E-Mails, Push (Keyholder darf setzen, wie E-Mail/Reinigung) */}
      <SettingsSection title={t("sectionLanguage")} description={t("sectionLanguageDesc")} bodyPadded>
        <UserLocaleSelect userId={user.id} initialLocale={user.locale} />
      </SettingsSection>

      {/* Reinigung */}
      <SettingsSection title={t("sectionReinigung")} description={t("sectionReinigungDesc")} bodyPadded>
        <ReinigungToggle
          userId={user.id}
          initialErlaubt={user.reinigungErlaubt}
          initialMaxMinuten={user.reinigungMaxMinuten}
          initialMaxProTag={user.reinigungMaxProTag}
          initialFenster={parseReinigungsFenster(user.reinigungsFenster)}
        />
      </SettingsSection>

      {/* Anpassbare Auswahllisten: Orgasmus-Arten + Öffnungsgründe */}
      <SettingsSection title={t("sectionReasons")} description={t("sectionReasonsDesc")}>
        <div className="px-5 py-4 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-foreground-muted">{t("reasonOrgasmTitle")}</p>
            <p className="text-xs text-foreground-faint">{t("reasonOrgasmNote")}</p>
            <ReasonsEditor
              userId={user.id}
              configKey="orgasmusArtenConfig"
              initial={parseReasonConfig(user.orgasmusArtenConfig, "orgasm")}
              builtinLabels={orgasmBuiltinLabels}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-foreground-muted">{t("reasonOpeningTitle")}</p>
            <p className="text-xs text-foreground-faint">{t("reasonReinigungNote")}</p>
            <ReasonsEditor
              userId={user.id}
              configKey="oeffnenGruendeConfig"
              initial={parseReasonConfig(user.oeffnenGruendeConfig, "opening")}
              builtinLabels={openingBuiltinLabels}
              protectedCode="REINIGUNG"
            />
          </div>
        </div>
      </SettingsSection>

      {/* Automatische Kontrollen */}
      <SettingsSection title={t("sectionAutoKontrolle")} description={t("sectionAutoKontrolleDesc")} bodyPadded>
        <AutoKontrolleToggle
          userId={user.id}
          initialAktiv={user.autoKontrolleAktiv}
          initialPerDayMin={user.autoKontrollePerDayMin}
          initialPerDayMax={user.autoKontrollePerDayMax}
          initialRuheVon={user.autoKontrolleRuheVon}
          initialRuheBis={user.autoKontrolleRuheBis}
          initialFristVon={user.autoKontrolleFristVon}
          initialFristBis={user.autoKontrolleFristBis}
          initialFensterVon={user.autoKontrolleFensterVon}
          initialFensterBis={user.autoKontrolleFensterBis}
        />
      </SettingsSection>

      {/* Kontroll-Eskalation: Mahnung (Stufe 1) + optional automatisch als abgelegt markieren (Stufe 2) */}
      <SettingsSection title={t("sectionInspectionEscalation")} description={t("sectionInspectionEscalationDesc")} bodyPadded>
        <InspectionEscalationToggle
          userId={user.id}
          initialReminderEnabled={user.inspectionReminderEnabled}
          initialReminderDelayMinutes={user.inspectionReminderDelayMinutes}
          initialAutoMarkEnabled={user.inspectionAutoMarkEnabled}
          initialAutoMarkDelayMinutes={user.inspectionAutoMarkDelayMinutes}
        />
      </SettingsSection>

      {/* App */}
      <SettingsSection title={t("sectionApp")} description={t("sectionAppDesc")} bodyPadded>
        <MobileUploadToggle userId={user.id} initialValue={user.mobileDesktopUpload} />
      </SettingsSection>

      {/* KI-Keyholder-Regeln (MCP) — nur wenn der MCP-Server aktiviert ist */}
      {process.env.ENABLE_MCP === "true" && (
        <SettingsSection title={t("sectionKeyholder")} description={t("keyholderInstructionsDesc")} bodyPadded>
          <KeyholderInstructionsForm userId={user.id} initial={user.mcpKeyholderInstructions ?? ""} />
        </SettingsSection>
      )}

      {/* Benachrichtigungen */}
      <NotificationToggles userId={user.id} />

      {/* Trainingsvorgaben */}
      <SettingsSection title={t("sectionVorgaben")} description={t("sectionVorgabenDesc")}>
        <div className="flex flex-col gap-4 px-5 py-4">
          <VorgabeForm userId={id} categories={categories} />
        </div>
        {vorgaben.length > 0 && (() => {
          // Group by category — built-in (KG) first, then user-defined order, orphans last.
          const groups = categories
            .map((c) => ({
              category: c,
              vorgaben: vorgaben.filter((v) => v.categoryId === c.id),
            }))
            .filter((g) => g.vorgaben.length > 0);
          const orphans = vorgaben.filter((v) => !v.categoryId);
          const showHeaders = categories.length > 1 && groups.length + (orphans.length > 0 ? 1 : 0) > 1;
          const renderRow = (v: (typeof vorgaben)[number]) => (
            <VorgabeRow
              key={v.id}
              userId={id}
              vorgabeId={v.id}
              active={isActive(v)}
              dateLabel={`${formatDate(v.gueltigAb, dl, tz)}${v.gueltigBis ? ` → ${formatDate(v.gueltigBis, dl, tz)}` : ` → ${tc("open")}`}`}
              tagH={v.minProTagH}
              wocheH={v.minProWocheH}
              monatH={v.minProMonatH}
              jahrH={v.minProJahrH}
              notiz={v.notiz}
              categories={categories}
              categoryName={showHeaders ? null : (categories.find((c) => c.id === v.categoryId)?.name ?? null)}
              initialValues={{
                gueltigAb: toDateInput(v.gueltigAb),
                gueltigBis: v.gueltigBis ? toDateInput(v.gueltigBis) : "",
                validUntilManual: v.validUntilManual,
                tagVal: v.minProTagH != null ? String(v.minProTagH) : "",
                wocheVal: v.minProWocheH != null ? String(v.minProWocheH) : "",
                monatVal: v.minProMonatH != null ? String(v.minProMonatH) : "",
                jahrVal: v.minProJahrH != null ? String(v.minProJahrH) : "",
                notiz: v.notiz ?? "",
                categoryId: v.categoryId ?? "",
              }}
            />
          );
          if (!showHeaders) {
            return (
              <div className="border-t border-border-subtle divide-y divide-border-subtle">
                {vorgaben.map(renderRow)}
              </div>
            );
          }
          return (
            <div className="border-t border-border-subtle">
              {groups.map((g) => (
                <div key={g.category.id} className="border-b border-border-subtle last:border-b-0">
                  <p className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-foreground-faint bg-background-subtle">
                    {g.category.name}
                  </p>
                  <div className="divide-y divide-border-subtle">{g.vorgaben.map(renderRow)}</div>
                </div>
              ))}
              {orphans.length > 0 && (
                <div className="border-b border-border-subtle last:border-b-0">
                  <p className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-foreground-faint bg-background-subtle">
                    {tc("uncategorized")}
                  </p>
                  <div className="divide-y divide-border-subtle">{orphans.map(renderRow)}</div>
                </div>
              )}
            </div>
          );
        })()}
      </SettingsSection>

      {/* Gefahrenbereich */}
      {isGlobalAdmin && (
        <SettingsSection title={t("sectionDanger")} description={t("sectionDangerDesc")} bodyPadded>
          <DeleteUserButton id={user.id} username={user.username} isSelf={actorId === user.id} />
        </SettingsSection>
      )}
    </div>
  );
}
