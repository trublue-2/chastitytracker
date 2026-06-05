import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertAdmin } from "@/lib/authGuards";
import RoleSelect from "@/app/admin/RoleSelect";
import ReinigungToggle from "@/app/admin/ReinigungToggle";
import AccountSection from "./AccountSection";
import MobileUploadToggle from "@/app/admin/MobileUploadToggle";
import KeyholderInstructionsForm from "@/app/admin/KeyholderInstructionsForm";
import NotificationToggles from "./NotificationToggles";
import DeleteUserButton from "@/app/admin/DeleteUserButton";
import Card from "@/app/components/Card";
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
  await assertAdmin();
  const session = await auth();

  const { id } = await params;

  const [user, vorgaben, categories, t, tc, dl] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.trainingVorgabe.findMany({ where: { userId: id }, orderBy: { gueltigAb: "desc" } }),
    // Vorgaben can only be set on KG-built-in or user-categories with allowVorgaben=true.
    prisma.deviceCategory.findMany({
      where: { userId: id, OR: [{ isBuiltIn: true }, { allowVorgaben: true }] },
      orderBy: [{ isBuiltIn: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    getTranslations("admin"),
    getTranslations("common"),
    getLocale().then(toDateLocale),
  ]);

  if (!user) redirect("/admin");

  return (
    <div className="flex flex-col gap-6">
      {/* Konto */}
      <AccountSection
        userId={user.id}
        username={user.username}
        email={user.email}
        role={user.role}
        isSelf={session?.user?.id === user.id}
      />

      {/* Rolle */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("roleLabel")}</p>
        </div>
        <div className="px-5 py-4">
          <RoleSelect id={user.id} currentRole={user.role} />
        </div>
      </Card>

      {/* Reinigung */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionReinigung")}</p>
        </div>
        <div className="px-5 py-4">
          <ReinigungToggle
            userId={user.id}
            initialErlaubt={user.reinigungErlaubt}
            initialMaxMinuten={user.reinigungMaxMinuten}
            initialMaxProTag={user.reinigungMaxProTag}
          />
        </div>
      </Card>

      {/* App */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionApp")}</p>
        </div>
        <div className="px-5 py-4">
          <MobileUploadToggle userId={user.id} initialValue={user.mobileDesktopUpload} />
        </div>
      </Card>

      {/* KI-Keyholder-Regeln (MCP) — nur wenn der MCP-Server aktiviert ist */}
      {process.env.ENABLE_MCP === "true" && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionKeyholder")}</p>
          </div>
          <div className="px-5 py-4">
            <KeyholderInstructionsForm userId={user.id} initial={user.mcpKeyholderInstructions ?? ""} />
          </div>
        </Card>
      )}

      {/* Benachrichtigungen */}
      <NotificationToggles userId={user.id} />

      {/* Trainingsvorgaben */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionVorgaben")}</p>
        </div>
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
              dateLabel={`${formatDate(v.gueltigAb, dl)}${v.gueltigBis ? ` → ${formatDate(v.gueltigBis, dl)}` : ` → ${tc("open")}`}`}
              tagH={v.minProTagH}
              wocheH={v.minProWocheH}
              monatH={v.minProMonatH}
              notiz={v.notiz}
              categories={categories}
              categoryName={showHeaders ? null : (categories.find((c) => c.id === v.categoryId)?.name ?? null)}
              initialValues={{
                gueltigAb: toDateInput(v.gueltigAb),
                gueltigBis: v.gueltigBis ? toDateInput(v.gueltigBis) : "",
                tagVal: v.minProTagH != null ? String(v.minProTagH) : "",
                wocheVal: v.minProWocheH != null ? String(v.minProWocheH) : "",
                monatVal: v.minProMonatH != null ? String(v.minProMonatH) : "",
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
      </Card>

      {/* Gefahrenbereich */}
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint mb-3">{t("sectionDanger")}</p>
        <DeleteUserButton id={user.id} username={user.username} isSelf={session?.user?.id === user.id} />
      </Card>
    </div>
  );
}
