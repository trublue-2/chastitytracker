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

function getStatus(ka: {
  entryId: string | null;
  withdrawnAt: Date | null;
  deadline: Date;
}, verifikationStatus: string | null): string {
  if (ka.withdrawnAt) return "withdrawn";
  if (!ka.entryId) return ka.deadline < new Date() ? "overdue" : "open";
  if (verifikationStatus === "rejected") return "rejected";
  if (verifikationStatus === "manual") return "manual";
  if (verifikationStatus === "ai") return "ai";
  return "fulfilled";
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
    prisma.kontrollAnforderung.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      include: { entry: true },
    }),
    prisma.entry.findFirst({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
    }),
  ]);

  const isLocked = latestEntry?.type === "VERSCHLUSS";

  const rows = kontrollen.map((k) => ({
    ...k,
    status: getStatus(k, k.entry?.verifikationStatus ?? null),
  }));

  return (
    <main className="w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      <UserNav userId={id} username={user.username} current="kontrollen" />

      {isLocked && (
        <div>
          <KontrolleButton userId={id} hasEmail={!!user.email} />
        </div>
      )}

      {rows.filter(r => r.status === "open" || r.status === "overdue").map(k => (
        <KontrolleBanner
          key={k.id}
          deadline={k.deadline}
          code={k.code ?? ""}
          kommentar={k.kommentar}
          overdue={k.status === "overdue"}
          variant="large"
          actions={<KontrolleActions id={k.id} status={k.status} verifikationStatus={k.entry?.verifikationStatus ?? null} />}
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
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0" kommentar={k.kommentar} />
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
                    {k.entry && <span>Erfüllt: {formatDateTime(k.entry.startTime, dl)}</span>}
                    {k.withdrawnAt && <span>Zurückgezogen: {formatDateTime(k.withdrawnAt, dl)}</span>}
                  </div>
                  {k.kommentar && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-0.5">
                      <span className="font-semibold">Anweisung:</span> {k.kommentar}
                    </p>
                  )}
                </div>
                <KontrolleActions id={k.id} status={k.status} verifikationStatus={k.entry?.verifikationStatus ?? null} />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
