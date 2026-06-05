import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getControlledSubs } from "@/lib/keyholder";

/** A keyholder's home: the list of subs they control. Phase 1 = read-only panels. */
export default async function KeyholderHome() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [subs, t] = await Promise.all([
    getControlledSubs(session.user.id),
    getTranslations("keyholder"),
  ]);
  if (subs.length === 0) redirect("/dashboard");

  return (
    <main className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-sm text-foreground-muted mt-1">{t("subtitle")}</p>
      </div>
      <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle">
        {subs.map((s) => (
          <Link
            key={s.id}
            href={`/keyholder/${s.id}`}
            className="flex items-center gap-4 px-5 py-4 first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-raised transition active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-surface-raised">
              <Lock size={20} className="text-foreground-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{s.username}</p>
              <p className="text-xs text-foreground-faint">{t("openPanel")}</p>
            </div>
            <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
          </Link>
        ))}
      </div>
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground transition">
        ← {t("backToOwn")}
      </Link>
    </main>
  );
}
