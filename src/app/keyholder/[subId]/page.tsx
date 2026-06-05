import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import UserStatsView from "@/app/components/UserStatsView";

/** Read-only view of a controlled sub for their keyholder (Phase 1). Directives come in Phase 2.
 *  Guard rejects anyone who is not an admin or a keyholder of this sub (and never the sub itself). */
export default async function KeyholderSubPage({ params }: { params: Promise<{ subId: string }> }) {
  const { subId } = await params;
  await assertKeyholderOrAdmin(subId);

  const [user, t] = await Promise.all([
    prisma.user.findUnique({ where: { id: subId }, select: { username: true } }),
    getTranslations("keyholder"),
  ]);
  if (!user) redirect("/keyholder");

  return (
    <main className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <Link href="/keyholder" className="text-sm text-foreground-faint hover:text-foreground transition">
        ← {t("title")}
      </Link>
      <h1 className="text-xl font-bold text-foreground">{t("subHeading", { name: user.username })}</h1>
      <UserStatsView userId={subId} />
    </main>
  );
}
