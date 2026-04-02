import Link from "next/link";
import { Lock, LockOpen, ClipboardCheck, Droplets, Bell, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";

export default async function AktionenPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const now = new Date();

  const [latest, offeneAnforderung, activeSperrzeit] = await Promise.all([
    prisma.entry.findFirst({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
      select: { type: true },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "SPERRZEIT", withdrawnAt: null, OR: [{ endetAt: { gt: now } }, { endetAt: null }] },
    }),
  ]);

  const isLocked = latest?.type === "VERSCHLUSS";
  const hasEmail = !!user.email;
  const hasOffeneAnforderung = !!offeneAnforderung;
  const hasActiveSperrzeit = !!activeSperrzeit;

  const canKontrolle = hasEmail && isLocked;
  const art = isLocked ? "SPERRZEIT" : "ANFORDERUNG";
  const canVerschlussAnforderung = art === "ANFORDERUNG"
    ? (!isLocked && hasEmail && !hasOffeneAnforderung)
    : (isLocked && !hasActiveSperrzeit);

  return (
    <main className="w-full max-w-3xl px-4 sm:px-6 py-6 flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">{user.username}</h1>

      {/* Anforderungen */}
      <div>
        <p className="text-xs font-semibold text-foreground-faint uppercase tracking-wider px-1 mb-2">Anforderungen</p>
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
                <p className="text-sm font-semibold text-foreground">Kontrolle anfordern</p>
                <p className="text-xs text-foreground-faint">Prüfanforderung per E-Mail</p>
              </div>
              <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
            </Link>
          ) : (
            <div className="flex items-center gap-4 px-5 py-4 rounded-t-2xl opacity-40 cursor-not-allowed">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <Bell size={20} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">Kontrolle anfordern</p>
                <p className="text-xs text-foreground-faint">{!hasEmail ? "Keine E-Mail hinterlegt" : "Nur möglich wenn verschlossen"}</p>
              </div>
            </div>
          )}

          {/* Verschluss/Sperrzeit */}
          {canVerschlussAnforderung ? (
            <Link
              href={`/admin/users/${id}/aktionen/verschluss-anforderung`}
              className="flex items-center gap-4 px-5 py-4 rounded-b-2xl hover:bg-surface-raised transition active:scale-[0.98]"
            >
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: art === "SPERRZEIT" ? "var(--color-sperrzeit-bg)" : "var(--color-request-bg)" }}
              >
                <Lock size={20} strokeWidth={2} style={{ color: art === "SPERRZEIT" ? "var(--color-sperrzeit)" : "var(--color-request)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{art === "SPERRZEIT" ? "Sperrdauer setzen" : "Verschluss anfordern"}</p>
                <p className="text-xs text-foreground-faint">{art === "SPERRZEIT" ? "Sperrzeit festlegen" : "Anforderung per E-Mail"}</p>
              </div>
              <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
            </Link>
          ) : (
            <div className="flex items-center gap-4 px-5 py-4 rounded-b-2xl opacity-40 cursor-not-allowed">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <Lock size={20} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">{art === "SPERRZEIT" ? "Sperrdauer setzen" : "Verschluss anfordern"}</p>
                <p className="text-xs text-foreground-faint">
                  {isLocked && hasActiveSperrzeit ? "Sperrdauer bereits aktiv" :
                   !isLocked && hasOffeneAnforderung ? "Offene Anforderung vorhanden" :
                   !hasEmail ? "Keine E-Mail hinterlegt" : ""}
                </p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Items */}
      <div>
        <p className="text-xs font-semibold text-foreground-faint uppercase tracking-wider px-1 mb-2">Items</p>
        <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle">

          {/* Verschluss */}
          {isLocked ? (
            <div className="flex items-center gap-4 px-5 py-4 rounded-t-2xl opacity-40 cursor-not-allowed">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <Lock size={20} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">Verschluss</p>
                <p className="text-xs text-foreground-faint">Nur möglich wenn offen</p>
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
                <p className="text-sm font-semibold text-foreground">Verschluss</p>
                <p className="text-xs text-foreground-faint">Gürtel angelegt</p>
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
                <p className="text-sm font-semibold text-foreground">Öffnen</p>
                <p className="text-xs text-foreground-faint">Gürtel abgelegt</p>
              </div>
              <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
            </Link>
          ) : (
            <div className="flex items-center gap-4 px-5 py-4 opacity-40 cursor-not-allowed">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-surface-raised flex-shrink-0">
                <LockOpen size={20} strokeWidth={2} className="text-foreground-faint" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground-muted">Öffnen</p>
                <p className="text-xs text-foreground-faint">Nur möglich wenn verschlossen</p>
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
              <p className="text-sm font-semibold text-foreground">Prüfung</p>
              <p className="text-xs text-foreground-faint">Kontrolle durchgeführt</p>
            </div>
            <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
          </Link>

          {/* Orgasmus */}
          <Link
            href={`/admin/users/${id}/aktionen/orgasmus`}
            className="flex items-center gap-4 px-5 py-4 rounded-b-2xl hover:bg-surface-raised transition active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-orgasm-bg)" }}>
              <Droplets size={20} strokeWidth={2} style={{ color: "var(--color-orgasm)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Orgasmus</p>
              <p className="text-xs text-foreground-faint">Orgasmus erfasst</p>
            </div>
            <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
          </Link>

        </div>
      </div>
    </main>
  );
}
