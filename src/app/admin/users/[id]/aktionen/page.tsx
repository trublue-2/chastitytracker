import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, LockOpen, ClipboardCheck, Droplets, Bell, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";
import { getIsLocked, getActiveSperrzeit, getActiveWearSessions } from "@/lib/queries";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { getTranslations } from "next-intl/server";

export default async function AktionenPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();
  const [t, tw] = await Promise.all([
    getTranslations("admin"),
    getTranslations("wearForm"),
  ]);

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const flagOn = deviceCategoriesEnabled();
  const [isLocked, offeneAnforderung, activeSperrzeit, categories, activeWear] = await Promise.all([
    getIsLocked(id),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
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
  const hasOffeneAnforderung = !!offeneAnforderung;
  const hasActiveSperrzeit = !!activeSperrzeit;

  const canKontrolle = hasEmail && isLocked;

  return (
    <>
      {/* Anforderungen */}
      <div>
        <p className="text-xs font-semibold text-foreground-faint uppercase tracking-wider px-1 mb-2">{t("aktionenAnforderungen")}</p>
        <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle">

          {/* Kontrolle anfordern */}
          {canKontrolle ? (
            <Link
              href={`/admin/users/${id}/aktionen/kontrolle`}
              className="flex items-center gap-4 px-5 py-4 rounded-t-2xl hover:bg-surface-raised transition active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-inspect-bg)" }}>
                <Bell size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("requestInspection")}</p>
                <p className="text-xs text-foreground-faint">{t("requestInspectionHint")}</p>
              </div>
              <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
            </Link>
          ) : (
            <div className="flex items-center gap-4 px-5 py-4 rounded-t-2xl opacity-40 cursor-not-allowed">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <Bell size={20} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">{t("requestInspection")}</p>
                <p className="text-xs text-foreground-faint">{!hasEmail ? t("noEmail") : t("entryOnlyIfLocked")}</p>
              </div>
            </div>
          )}

          {/* Verschluss anfordern */}
          {!isLocked && hasEmail && !hasOffeneAnforderung ? (
            <Link
              href={`/admin/users/${id}/aktionen/verschluss-anforderung`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-request-bg)" }}>
                <Lock size={20} strokeWidth={2} style={{ color: "var(--color-request)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("requestLock")}</p>
                <p className="text-xs text-foreground-faint">{t("requestLockHint")}</p>
              </div>
              <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
            </Link>
          ) : (
            <div className="flex items-center gap-4 px-5 py-4 opacity-40 cursor-not-allowed">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <Lock size={20} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">{t("requestLock")}</p>
                <p className="text-xs text-foreground-faint">
                  {isLocked ? t("alreadyLocked") : hasOffeneAnforderung ? t("alreadyHasAnforderung") : t("noEmail")}
                </p>
              </div>
            </div>
          )}

          {/* Sperrdauer setzen / bearbeiten */}
          {isLocked && hasActiveSperrzeit ? (
            <Link
              href={`/admin/users/${id}/aktionen/sperrdauer-edit`}
              className="flex items-center gap-4 px-5 py-4 rounded-b-2xl hover:bg-surface-raised transition active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-sperrzeit-bg)" }}>
                <Lock size={20} strokeWidth={2} style={{ color: "var(--color-sperrzeit)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("editLockDuration")}</p>
                <p className="text-xs text-foreground-faint">{t("editLockDurationHint")}</p>
              </div>
              <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
            </Link>
          ) : isLocked ? (
            <Link
              href={`/admin/users/${id}/aktionen/verschluss-anforderung`}
              className="flex items-center gap-4 px-5 py-4 rounded-b-2xl hover:bg-surface-raised transition active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-sperrzeit-bg)" }}>
                <Lock size={20} strokeWidth={2} style={{ color: "var(--color-sperrzeit)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("setLockDuration")}</p>
                <p className="text-xs text-foreground-faint">{t("setLockDurationHint")}</p>
              </div>
              <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
            </Link>
          ) : (
            <div className="flex items-center gap-4 px-5 py-4 rounded-b-2xl opacity-40 cursor-not-allowed">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <Lock size={20} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">{t("setLockDuration")}</p>
                <p className="text-xs text-foreground-faint">{t("entryOnlyIfLocked")}</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Items */}
      <div>
        <p className="text-xs font-semibold text-foreground-faint uppercase tracking-wider px-1 mb-2">{t("aktionenItems")}</p>
        <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle">

          {/* Verschluss */}
          {isLocked ? (
            <div className="flex items-center gap-4 px-5 py-4 rounded-t-2xl opacity-40 cursor-not-allowed">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <Lock size={20} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">{t("entryVerschluss")}</p>
                <p className="text-xs text-foreground-faint">{t("entryOnlyIfOpen")}</p>
              </div>
            </div>
          ) : (
            <Link
              href={`/admin/users/${id}/aktionen/verschluss`}
              className="flex items-center gap-4 px-5 py-4 rounded-t-2xl hover:bg-surface-raised transition active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-lock-bg)" }}>
                <Lock size={20} strokeWidth={2} style={{ color: "var(--color-lock)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("entryVerschluss")}</p>
                <p className="text-xs text-foreground-faint">{t("entryVerschlussDesc")}</p>
              </div>
              <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
            </Link>
          )}

          {/* Öffnen */}
          {isLocked ? (
            <Link
              href={`/admin/users/${id}/aktionen/oeffnen`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-unlock-bg)" }}>
                <LockOpen size={20} strokeWidth={2} style={{ color: "var(--color-unlock)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("entryOeffnen")}</p>
                <p className="text-xs text-foreground-faint">{t("entryOeffnenDesc")}</p>
              </div>
              <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
            </Link>
          ) : (
            <div className="flex items-center gap-4 px-5 py-4 opacity-40 cursor-not-allowed">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <LockOpen size={20} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">{t("entryOeffnen")}</p>
                <p className="text-xs text-foreground-faint">{t("entryOnlyIfLocked")}</p>
              </div>
            </div>
          )}

          {/* Prüfung */}
          <Link
            href={`/admin/users/${id}/aktionen/pruefung`}
            className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-inspect-bg)" }}>
              <ClipboardCheck size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{t("entryPruefung")}</p>
              <p className="text-xs text-foreground-faint">{t("entryPruefungDesc")}</p>
            </div>
            <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
          </Link>

          {/* Orgasmus */}
          <Link
            href={`/admin/users/${id}/aktionen/orgasmus`}
            className={`flex items-center gap-4 px-5 py-4 ${categories.length === 0 ? "rounded-b-2xl" : ""} hover:bg-surface-raised transition active:scale-[0.98]`}
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-orgasm-bg)" }}>
              <Droplets size={20} strokeWidth={2} style={{ color: "var(--color-orgasm)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{t("entryOrgasmus")}</p>
              <p className="text-xs text-foreground-faint">{t("entryOrgasmusDesc")}</p>
            </div>
            <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
          </Link>

          {/* Per-Category wear actions */}
          {categories.map((c, i) => {
            const active = activeByCategory.get(c.id);
            const isLast = i === categories.length - 1;
            const href = active
              ? `/admin/users/${id}/aktionen/wear-end?category=${c.id}`
              : `/admin/users/${id}/aktionen/wear-begin?category=${c.id}`;
            const subLabel = active ? `${tw("endShort")} · ${active.deviceName}` : tw("titleBegin");
            const style = categoryStyle(c.color);
            return (
              <Link
                key={c.id}
                href={href}
                className={`flex items-center gap-4 px-5 py-4 ${isLast ? "rounded-b-2xl" : ""} hover:bg-surface-raised transition active:scale-[0.98]`}
              >
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: style.backgroundColor, color: style.color }}
                >
                  <CategoryIconRender name={c.icon} className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="text-xs text-foreground-faint truncate">{subLabel}</p>
                </div>
                <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
              </Link>
            );
          })}

        </div>
      </div>
    </>
  );
}
