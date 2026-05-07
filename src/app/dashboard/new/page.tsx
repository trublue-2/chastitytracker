import Link from "next/link";
import { Lock, LockOpen, ClipboardCheck, Droplets, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getIsLocked, getActiveWearSessions } from "@/lib/queries";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { CATEGORY_COLOR_HEX, type CategoryColor } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { getTranslations } from "next-intl/server";

export default async function NewEntryPage() {
  const [session, t, tw] = await Promise.all([
    auth(),
    getTranslations("newEntry"),
    getTranslations("wearForm"),
  ]);
  if (!session) return null;

  const flagOn = deviceCategoriesEnabled();
  const [isLocked, categories, activeWear] = await Promise.all([
    getIsLocked(session.user.id),
    flagOn
      ? prisma.deviceCategory.findMany({
          where: { userId: session.user.id, isBuiltIn: false },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, color: true, icon: true },
        })
      : Promise.resolve([]),
    flagOn ? getActiveWearSessions(session.user.id) : Promise.resolve([]),
  ]);
  const activeByCategory = new Map(activeWear.map((s) => [s.categoryId, s]));

  return (
    <main className="flex-1 w-full max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t("title")}</h1>

      <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle">

        {/* Verschluss */}
        {isLocked ? (
          <div className="flex items-center gap-4 px-5 py-4 rounded-t-2xl opacity-40 cursor-not-allowed">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
              <Lock size={22} strokeWidth={2} className="text-foreground-faint" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground-muted">Verschluss</p>
              <p className="text-xs text-foreground-faint">Nur möglich wenn offen</p>
            </div>
          </div>
        ) : (
          <Link
            href="/dashboard/new/verschluss"
            className="flex items-center gap-4 px-5 py-4 rounded-t-2xl hover:bg-surface-raised transition active:scale-[0.98]"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "var(--color-lock-bg)" }}
            >
              <Lock size={24} strokeWidth={2} style={{ color: "var(--color-lock)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Verschluss</p>
              <p className="text-xs text-foreground-faint">Gürtel angelegt</p>
            </div>
            <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
          </Link>
        )}

        {/* Öffnen */}
        {isLocked ? (
          <Link
            href="/dashboard/new/oeffnen"
            className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition active:scale-[0.98]"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "var(--color-unlock-bg)" }}
            >
              <LockOpen size={24} strokeWidth={2} style={{ color: "var(--color-unlock)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Öffnen</p>
              <p className="text-xs text-foreground-faint">Gürtel abgelegt</p>
            </div>
            <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
          </Link>
        ) : (
          <div className="flex items-center gap-4 px-5 py-4 opacity-40 cursor-not-allowed">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
              <LockOpen size={22} strokeWidth={2} className="text-foreground-faint" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground-muted">Öffnen</p>
              <p className="text-xs text-foreground-faint">Nur möglich wenn verschlossen</p>
            </div>
          </div>
        )}

        {/* Prüfung */}
        <Link
          href="/dashboard/new/pruefung"
          className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition active:scale-[0.98]"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "var(--color-inspect-bg)" }}
          >
            <ClipboardCheck size={24} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Kontrolle</p>
            <p className="text-xs text-foreground-faint">Kontrolle durchgeführt</p>
          </div>
          <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
        </Link>

        {/* Orgasmus */}
        <Link
          href="/dashboard/new/orgasmus"
          className={`flex items-center gap-4 px-5 py-4 ${categories.length === 0 ? "rounded-b-2xl" : ""} hover:bg-surface-raised transition active:scale-[0.98]`}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "var(--color-orgasm-bg)" }}
          >
            <Droplets size={24} strokeWidth={2} style={{ color: "var(--color-orgasm)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Orgasmus</p>
            <p className="text-xs text-foreground-faint">Orgasmus erfasst</p>
          </div>
          <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
        </Link>

        {/* Per-Category wear actions (begin or end based on state) */}
        {categories.map((c, i) => {
          const active = activeByCategory.get(c.id);
          const isLast = i === categories.length - 1;
          const href = active
            ? `/dashboard/new/wear-end?category=${c.id}`
            : `/dashboard/new/wear-begin?category=${c.id}`;
          const subLabel = active ? `${tw("endShort")} · ${active.deviceName}` : tw("titleBegin");
          const hex = CATEGORY_COLOR_HEX[c.color as CategoryColor] ?? "#64748b";
          return (
            <Link
              key={c.id}
              href={href}
              className={`flex items-center gap-4 px-5 py-4 ${isLast ? "rounded-b-2xl" : ""} hover:bg-surface-raised transition active:scale-[0.98]`}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: hex + "22" }}
              >
                <CategoryIconRender name={c.icon} className="size-6" />
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
    </main>
  );
}
