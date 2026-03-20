import Link from "next/link";
import { Lock, LockOpen, ClipboardList, Droplets } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";

export default async function NewEntryPage() {
  const [session, t] = await Promise.all([auth(), getTranslations("newEntry")]);
  const latest = session ? await prisma.entry.findFirst({
    where: { userId: session.user.id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
  }) : null;
  const isLocked = latest?.type === "VERSCHLUSS";

  return (
    <div className="w-full max-w-5xl px-6 py-8"><div className="max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-8">{t("title")}</h1>

      <div className="flex flex-col gap-3">
        {isLocked ? (
          <div className="flex items-center gap-4 bg-gray-100 text-gray-400 rounded-2xl px-6 py-5 cursor-not-allowed">
            <Lock size={28} strokeWidth={2} />
            <div>
              <p className="font-bold text-lg">{t("lock")}</p>
              <p className="text-xs text-gray-400/80">{t("lockDisabled")}</p>
            </div>
          </div>
        ) : (
          <Link
            href="/dashboard/new/verschluss"
            className="flex items-center gap-4 bg-emerald-600 text-white rounded-2xl px-6 py-5 hover:bg-emerald-500 active:scale-[0.98] transition-all"
          >
            <Lock size={28} strokeWidth={2} />
            <div>
              <p className="font-bold text-lg">{t("lock")}</p>
              <p className="text-xs text-white/60">{t("lockSubtitle")}</p>
            </div>
          </Link>
        )}

        {isLocked ? (
          <Link
            href="/dashboard/new/oeffnen"
            className="flex items-center gap-4 bg-gray-900 text-white rounded-2xl px-6 py-5 hover:bg-gray-700 active:scale-[0.98] transition-all"
          >
            <LockOpen size={28} strokeWidth={2} />
            <div>
              <p className="font-bold text-lg">{t("open")}</p>
              <p className="text-xs text-white/60">{t("openSubtitle")}</p>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-4 bg-gray-100 text-gray-400 rounded-2xl px-6 py-5 cursor-not-allowed">
            <LockOpen size={28} strokeWidth={2} />
            <div>
              <p className="font-bold text-lg">{t("open")}</p>
              <p className="text-xs text-gray-400/80">{t("openDisabled")}</p>
            </div>
          </div>
        )}

        <div className="border-t border-gray-100 my-1" />

        <Link
          href="/dashboard/new/pruefung"
          className="flex items-center gap-4 bg-orange-500 text-white rounded-2xl px-6 py-5 hover:bg-orange-400 active:scale-[0.98] transition-all"
        >
          <ClipboardList size={28} strokeWidth={2} />
          <div>
            <p className="font-bold text-lg">{t("inspection")}</p>
            <p className="text-xs text-white/60">{t("inspectionSubtitle")}</p>
          </div>
        </Link>
        <Link
          href="/dashboard/new/orgasmus"
          className="flex items-center gap-4 bg-rose-500 text-white rounded-2xl px-6 py-5 hover:bg-rose-400 active:scale-[0.98] transition-all"
        >
          <Droplets size={28} strokeWidth={2} />
          <div>
            <p className="font-bold text-lg">{t("orgasm")}</p>
            <p className="text-xs text-white/60">{t("orgasmSubtitle")}</p>
          </div>
        </Link>
      </div>
    </div></div>
  );
}
