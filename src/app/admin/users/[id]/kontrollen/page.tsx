import { auth } from "@/lib/auth";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { getLocale } from "next-intl/server";
import ImageViewer from "@/app/components/ImageViewer";
import KontrolleActions from "@/app/admin/kontrollen/KontrolleActions";
import KontrolleButton from "@/app/admin/KontrolleButton";
import UserNav from "../UserNav";
import KontrolleBanner from "@/app/components/KontrolleBanner";

function getStatus(k: {
  fulfilledAt: Date | null;
  withdrawnAt: Date | null;
  manuallyVerifiedAt: Date | null;
  rejectedAt: Date | null;
  deadline: Date;
}, aiVerified: boolean | null) {
  if (k.withdrawnAt) return "withdrawn";
  if (k.rejectedAt) return "rejected";
  if (k.manuallyVerifiedAt) return "manual";
  if (aiVerified === true) return "ai";
  if (k.fulfilledAt) return "fulfilled";
  if (k.deadline < new Date()) return "overdue";
  return "open";
}

const statusLabel: Record<string, string> = {
  open: "Offen", overdue: "Überfällig", fulfilled: "Erfüllt",
  ai: "KI-verifiziert", manual: "Manuell verifiziert",
  rejected: "Nicht erfüllt", withdrawn: "Zurückgezogen",
};

const statusStyle: Record<string, string> = {
  open: "bg-amber-50 text-amber-700 border-amber-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  fulfilled: "bg-gray-100 text-gray-500 border-gray-200",
  ai: "bg-green-50 text-green-700 border-green-200",
  manual: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  withdrawn: "bg-gray-100 text-gray-400 border-gray-200",
};

export default async function AdminUserKontrollenPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const dl = toDateLocale(await getLocale());

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-gray-500">Benutzer nicht gefunden.</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/kontrollen`);

  const [kontrollen, latestEntry] = await Promise.all([
    prisma.kontrollAnforderung.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" } }),
    prisma.entry.findFirst({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
    }),
  ]);

  const isLocked = latestEntry?.type === "VERSCHLUSS";

  const fulfilled = kontrollen.filter((k) => k.fulfilledAt && k.code);
  const entries = fulfilled.length > 0
    ? await prisma.entry.findMany({
        where: {
          type: "PRUEFUNG",
          OR: fulfilled.map((k) => ({ userId: k.userId, kontrollCode: k.code })),
        },
        select: { userId: true, kontrollCode: true, aiVerified: true, imageUrl: true },
      })
    : [];

  const rows = kontrollen.map((k) => {
    const entry = entries.find((e) => e.userId === k.userId && e.kontrollCode === k.code) ?? null;
    return { ...k, entry, status: getStatus(k, entry?.aiVerified ?? null) };
  });

  return (
    <main className="w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      <UserNav userId={id} username={user.username} current="kontrollen" />

      {isLocked && (
        <div>
          <KontrolleButton userId={id} hasEmail={!!user.email} />
        </div>
      )}

      {/* Offene / überfällige Kontrolle – prominenter Banner */}
      {rows.filter(r => r.status === "open" || r.status === "overdue").map(k => (
        <KontrolleBanner
          key={k.id}
          deadline={k.deadline}
          code={k.code ?? ""}
          kommentar={k.kommentar}
          overdue={k.status === "overdue"}
          variant="large"
          actions={<KontrolleActions id={k.id} status={k.status} aiVerified={null} />}
        />
      ))}


      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center text-gray-400 text-sm">
          Noch keine Kontrollen angefordert.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {rows.map((k) => (
              <div key={k.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                {k.entry?.imageUrl && (
                  <ImageViewer src={k.entry.imageUrl} alt="Kontroll-Foto" width={64} height={64}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${statusStyle[k.status]}`}>
                      {statusLabel[k.status]}
                    </span>
                    <span className="font-mono font-bold text-orange-500 text-sm">{k.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                    <span>Frist: {formatDateTime(k.deadline, dl)}</span>
                    <span>Erstellt: {formatDateTime(k.createdAt, dl)}</span>
                    {k.fulfilledAt && !k.rejectedAt && <span>Erfüllt: {formatDateTime(k.fulfilledAt, dl)}</span>}
                    {k.withdrawnAt && <span>Zurückgezogen: {formatDateTime(k.withdrawnAt, dl)}</span>}
                    {k.manuallyVerifiedAt && <span>Verifiziert: {formatDateTime(k.manuallyVerifiedAt, dl)}</span>}
                    {k.rejectedAt && <span>Abgelehnt: {formatDateTime(k.rejectedAt, dl)}</span>}
                  </div>
                  {k.kommentar && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-0.5">
                      <span className="font-semibold">Anweisung:</span> {k.kommentar}
                    </p>
                  )}
                </div>
                <KontrolleActions id={k.id} status={k.status} aiVerified={k.entry?.aiVerified ?? null} />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
