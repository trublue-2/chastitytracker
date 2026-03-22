import { auth } from "@/lib/auth";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { formatDateTime, toDateLocale, mapAnforderungStatus, mapVerifikationStatus } from "@/lib/utils";
import { getLocale } from "next-intl/server";
import ImageViewer from "@/app/components/ImageViewer";
import KontrolleActions from "@/app/admin/kontrollen/KontrolleActions";
import KontrolleButton from "@/app/admin/KontrolleButton";
import UserNav from "../UserNav";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import { ANFORDERUNG_PILLS, VERIFIKATION_PILLS } from "@/lib/kontrollePills";
import type { AnforderungStatus, VerifikationStatus } from "@/lib/utils";

export default async function AdminUserKontrollenPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const dl = toDateLocale(await getLocale());
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-gray-500">Benutzer nicht gefunden.</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/kontrollen`);

  const [pruefungen, alleAnforderungen, latestEntry] = await Promise.all([
    prisma.entry.findMany({
      where: { userId: id, type: "PRUEFUNG" },
      orderBy: { startTime: "desc" },
    }),
    prisma.kontrollAnforderung.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.entry.findFirst({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
    }),
  ]);

  const isLocked = latestEntry?.type === "VERSCHLUSS";
  const kaByEntryId = new Map(alleAnforderungen.filter(k => k.entryId).map(k => [k.entryId!, k]));

  type Row = {
    sortTime: Date;
    imageUrl: string | null;
    anforderungStatus: AnforderungStatus | null;
    verifikationStatus: VerifikationStatus | null;
    code: string | null;
    deadline: Date | null;
    createdAt: Date | null;
    fulfilledAt: Date | null;
    withdrawnAt: Date | null;
    kommentar: string | null;
    note: string | null;
    kontrolleId: string | null;
  };

  const pruefungRows: Row[] = pruefungen.map((e) => {
    const ka = kaByEntryId.get(e.id) ?? null;
    return {
      sortTime: e.startTime,
      imageUrl: e.imageUrl,
      anforderungStatus: ka ? mapAnforderungStatus(ka, e.startTime, now) : null,
      verifikationStatus: mapVerifikationStatus(e.verifikationStatus),
      code: ka?.code ?? e.kontrollCode ?? null,
      deadline: ka?.deadline ?? null,
      createdAt: ka?.createdAt ?? null,
      fulfilledAt: e.startTime,
      withdrawnAt: ka?.withdrawnAt ?? null,
      kommentar: ka?.kommentar ?? null,
      note: e.note,
      kontrolleId: ka?.id ?? null,
    };
  });

  const offeneRows: Row[] = alleAnforderungen
    .filter((k) => !k.entryId)
    .map((k) => ({
      sortTime: k.createdAt,
      imageUrl: null,
      anforderungStatus: mapAnforderungStatus(k, null, now),
      verifikationStatus: null,
      code: k.code,
      deadline: k.deadline,
      createdAt: k.createdAt,
      fulfilledAt: null,
      withdrawnAt: k.withdrawnAt,
      kommentar: k.kommentar,
      note: null,
      kontrolleId: k.id,
    }));

  const sortedOffene = [...offeneRows].sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());
  const sortedPruefungen = [...pruefungRows].sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());

  function KontrolleRow({ row, i }: { row: (typeof offeneRows)[0]; i: number }) {
    const aPill = row.anforderungStatus ? ANFORDERUNG_PILLS[row.anforderungStatus] : null;
    const vPill = row.verifikationStatus ? VERIFIKATION_PILLS[row.verifikationStatus] : null;
    return (
      <div key={i} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
        {row.imageUrl && (
          <ImageViewer src={row.imageUrl} alt="Kontroll-Foto" width={64} height={64}
            className="w-14 h-14 rounded-xl object-cover flex-shrink-0" kommentar={row.kommentar} />
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            {aPill && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${aPill.cls}`}>{aPill.label}</span>}
            {vPill && <span className={`text-xs font-medium border rounded-lg px-2 py-0.5 ${vPill.cls}`}>{vPill.label}</span>}
            {row.code && <span className="font-mono font-bold text-orange-500 text-sm">{row.code}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
            {row.fulfilledAt && <span>Erfüllt: {formatDateTime(row.fulfilledAt, dl)}</span>}
            {row.deadline && <span>Frist: {formatDateTime(row.deadline, dl)}</span>}
            {row.createdAt && <span>Erstellt: {formatDateTime(row.createdAt, dl)}</span>}
            {row.withdrawnAt && <span>Zurückgezogen: {formatDateTime(row.withdrawnAt, dl)}</span>}
          </div>
          {row.kommentar && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-0.5">
              <span className="font-semibold">Anweisung:</span> {row.kommentar}
            </p>
          )}
          {row.note && (
            <p className="text-xs text-gray-500 italic mt-0.5">„{row.note}"</p>
          )}
        </div>
        {row.kontrolleId && (
          <KontrolleActions
            id={row.kontrolleId}
            anforderungStatus={row.anforderungStatus ?? "open"}
            verifikationStatus={row.verifikationStatus}
          />
        )}
      </div>
    );
  }

  return (
    <main className="w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      <UserNav userId={id} username={user.username} current="kontrollen" />

      {isLocked && <KontrolleButton userId={id} hasEmail={!!user.email} />}

      {/* Offene Anforderungen */}
      {sortedOffene.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Offene Anforderungen</p>
          </div>
          <div className="divide-y divide-gray-50">
            {sortedOffene.map((row, i) => <KontrolleRow key={i} row={row} i={i} />)}
          </div>
        </div>
      )}

      {/* Prüfungen */}
      {sortedPruefungen.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Prüfungen ({sortedPruefungen.length})
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {sortedPruefungen.map((row, i) => <KontrolleRow key={i} row={row} i={i} />)}
          </div>
        </div>
      )}

      {sortedOffene.length === 0 && sortedPruefungen.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center text-gray-400 text-sm">
          Noch keine Kontrollen.
        </div>
      )}
    </main>
  );
}
