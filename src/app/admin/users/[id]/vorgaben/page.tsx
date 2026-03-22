import { auth } from "@/lib/auth";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import VorgabeForm from "../VorgabeForm";
import VorgabeRow from "../VorgabeRow";
import UserNav from "../UserNav";
import { getLocale, getTranslations } from "next-intl/server";
import { toDateLocale, APP_TZ } from "@/lib/utils";

function isActive(v: { gueltigAb: Date; gueltigBis: Date | null }): boolean {
  const now = new Date();
  return v.gueltigAb <= now && (v.gueltigBis === null || v.gueltigBis >= now);
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function VorgabenPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const tc = await getTranslations("common");
  const dl = toDateLocale(await getLocale());

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-gray-500">Benutzer nicht gefunden.</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/vorgaben`);

  const vorgaben = await prisma.trainingVorgabe.findMany({
    where: { userId: id },
    orderBy: { gueltigAb: "desc" },
  });

  return (
    <main className="w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      <UserNav userId={id} username={user.username} current="vorgaben" />

      <VorgabeForm userId={id} />

      {vorgaben.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Alle Vorgaben</p>
          </div>
          <div className="divide-y divide-gray-50">
            {vorgaben.map((v) => (
              <VorgabeRow
                key={v.id}
                userId={id}
                vorgabeId={v.id}
                active={isActive(v)}
                dateLabel={`${new Date(v.gueltigAb).toLocaleDateString(dl, { timeZone: APP_TZ })}${v.gueltigBis ? ` → ${new Date(v.gueltigBis).toLocaleDateString(dl, { timeZone: APP_TZ })}` : ` → ${tc("open")}`}`}
                tagH={v.minProTagH}
                wocheH={v.minProWocheH}
                monatH={v.minProMonatH}
                notiz={v.notiz}
                initialValues={{
                  gueltigAb: toDateInput(v.gueltigAb),
                  gueltigBis: v.gueltigBis ? toDateInput(v.gueltigBis) : "",
                  tagVal: v.minProTagH != null ? String(v.minProTagH) : "",
                  wocheVal: v.minProWocheH != null ? String(v.minProWocheH) : "",
                  monatVal: v.minProMonatH != null ? String(v.minProMonatH) : "",
                  notiz: v.notiz ?? "",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
