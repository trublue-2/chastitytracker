import { auth } from "@/lib/auth";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { formatDateTime, toDateLocale, mapAnforderungStatus } from "@/lib/utils";
import { getLocale, getTranslations } from "next-intl/server";

export default async function StrafbuchPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const [t, dl] = [await getTranslations("admin"), toDateLocale(await getLocale())];
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-faint">Benutzer nicht gefunden.</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/strafbuch`);

  const [oeffnungen, sperrzeiten, kontrollAnforderungen] = await Promise.all([
    prisma.entry.findMany({
      where: { userId: id, type: "OEFFNEN" },
      orderBy: { startTime: "desc" },
    }),
    prisma.verschlussAnforderung.findMany({
      where: { userId: id, art: "SPERRZEIT" },
    }),
    prisma.kontrollAnforderung.findMany({
      where: { userId: id, entryId: { not: null } },
      include: { entry: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // 1. Unerlaubte Öffnungen: Öffnung während aktiver Sperrzeit
  const unerlaubteOeffnungen = oeffnungen.filter((o) =>
    sperrzeiten.some((s) => {
      const nachSperrzeit = o.startTime >= s.createdAt;
      const vorEnde = s.endetAt === null || o.startTime < s.endetAt;
      const nichtVorherZurueckgezogen = s.withdrawnAt === null || s.withdrawnAt > o.startTime;
      return nachSperrzeit && vorEnde && nichtVorherZurueckgezogen;
    })
  );

  // 2. Zu spät erfüllte Kontrollen
  const zuSpaet = kontrollAnforderungen.filter(
    (k) => mapAnforderungStatus(k, k.entry?.startTime ?? null, now) === "late"
  );

  // 3. Abgelehnte Kontrollen
  const abgelehnt = kontrollAnforderungen.filter(
    (k) => k.entry?.verifikationStatus === "rejected"
  );

  // 4. Kontrollen mit veränderten Zeitdaten
  const zeitKorrigiert = kontrollAnforderungen.filter(
    (k) => k.fulfilledAt && k.entry?.startTime &&
      k.entry.startTime.getTime() < k.fulfilledAt.getTime() - 60_000
  );

  const hasAny = unerlaubteOeffnungen.length > 0 || zuSpaet.length > 0 || abgelehnt.length > 0 || zeitKorrigiert.length > 0;

  function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
    return (
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{title}</p>
          <span className="text-xs font-semibold text-foreground-faint tabular-nums">{count}</span>
        </div>
        {count === 0 ? (
          <p className="px-5 py-4 text-sm text-foreground-faint">{t("strafbuchEmpty")}</p>
        ) : (
          <div className="divide-y divide-border-subtle">{children}</div>
        )}
      </div>
    );
  }

  return (
    <main className="w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      {!hasAny && (
        <div className="bg-surface rounded-2xl border border-border py-20 text-center text-foreground-faint text-sm">
          {t("strafbuchNoEntries")}
        </div>
      )}

      {/* Unerlaubte Öffnungen */}
      <Section title={t("strafbuchUnerlaubteOeffnungen")} count={unerlaubteOeffnungen.length}>
        {unerlaubteOeffnungen.map((o) => {
          const aktiveSperrzeit = sperrzeiten.find((s) => {
            const nachSperrzeit = o.startTime >= s.createdAt;
            const vorEnde = s.endetAt === null || o.startTime < s.endetAt;
            const nichtVorherZurueckgezogen = s.withdrawnAt === null || s.withdrawnAt > o.startTime;
            return nachSperrzeit && vorEnde && nichtVorherZurueckgezogen;
          });
          return (
            <div key={o.id} className="px-5 py-3 flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">{formatDateTime(o.startTime, dl)}</span>
              {aktiveSperrzeit && (
                <span className="text-xs text-warn">
                  {t("lockedUntil")}: {aktiveSperrzeit.endetAt ? formatDateTime(aktiveSperrzeit.endetAt, dl) : t("lockedIndefinite")}
                </span>
              )}
              {o.note && <span className="text-xs text-foreground-faint italic">„{o.note}"</span>}
            </div>
          );
        })}
      </Section>

      {/* Zu spät erfüllte Kontrollen */}
      <Section title={t("strafbuchZuSpaet")} count={zuSpaet.length}>
        {zuSpaet.map((k) => (
          <div key={k.id} className="px-5 py-3 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-[var(--color-inspect)] text-sm">{k.code}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
              <span>{t("frist")}: {formatDateTime(k.deadline, dl)}</span>
              {k.fulfilledAt && <span className="text-warn">Eingereicht: {formatDateTime(k.fulfilledAt, dl)}</span>}
            </div>
            {k.kommentar && <span className="text-xs text-foreground-faint italic">{t("instructionLabel")}: {k.kommentar}</span>}
          </div>
        ))}
      </Section>

      {/* Abgelehnte Kontrollen */}
      <Section title={t("strafbuchAbgelehnt")} count={abgelehnt.length}>
        {abgelehnt.map((k) => (
          <div key={k.id} className="px-5 py-3 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-[var(--color-inspect)] text-sm">{k.code}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
              {k.entry?.startTime && <span>{t("fulfilledLabel")}: {formatDateTime(k.entry.startTime, dl)}</span>}
              <span>{t("frist")}: {formatDateTime(k.deadline, dl)}</span>
            </div>
            {k.kommentar && <span className="text-xs text-foreground-faint italic">{t("instructionLabel")}: {k.kommentar}</span>}
            {k.entry?.note && <span className="text-xs text-foreground-faint italic">„{k.entry.note}"</span>}
          </div>
        ))}
      </Section>

      {/* Kontrollen mit veränderten Zeitdaten */}
      <Section title={t("strafbuchZeitKorrigiert")} count={zeitKorrigiert.length}>
        {zeitKorrigiert.map((k) => (
          <div key={k.id} className="px-5 py-3 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-[var(--color-inspect)] text-sm">{k.code}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
              <span>{t("frist")}: {formatDateTime(k.deadline, dl)}</span>
            </div>
            <span className="text-xs text-warn font-medium">
              {t("timeCorrected")} – {t("givenLabel")}: {formatDateTime(k.entry!.startTime, dl)} · {t("systemLabel")}: {formatDateTime(k.fulfilledAt!, dl)}
            </span>
            {k.kommentar && <span className="text-xs text-foreground-faint italic">{t("instructionLabel")}: {k.kommentar}</span>}
          </div>
        ))}
      </Section>
    </main>
  );
}
