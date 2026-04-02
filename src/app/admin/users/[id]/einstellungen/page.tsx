import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertAdmin } from "@/lib/authGuards";
import ChangeEmailButton from "@/app/admin/ChangeEmailButton";
import ChangePasswordButton from "@/app/admin/ChangePasswordButton";
import RoleSelect from "@/app/admin/RoleSelect";
import ReinigungToggle from "@/app/admin/ReinigungToggle";
import MobileUploadToggle from "@/app/admin/MobileUploadToggle";
import DeleteUserButton from "@/app/admin/DeleteUserButton";
import VorgabeForm from "../VorgabeForm";
import VorgabeRow from "../VorgabeRow";
import { getLocale, getTranslations } from "next-intl/server";
import { toDateLocale, formatDate } from "@/lib/utils";

function isActive(v: { gueltigAb: Date; gueltigBis: Date | null }): boolean {
  const now = new Date();
  return v.gueltigAb <= now && (v.gueltigBis === null || v.gueltigBis >= now);
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function EinstellungenPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();
  const session = await auth();

  const { id } = await params;

  const [user, vorgaben, tc, dl] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.trainingVorgabe.findMany({ where: { userId: id }, orderBy: { gueltigAb: "desc" } }),
    getTranslations("common"),
    getLocale().then(toDateLocale),
  ]);

  if (!user) redirect("/admin");

  return (
    <main className="w-full max-w-3xl px-4 sm:px-6 py-6 flex flex-col gap-6">

      {/* ── Konto ── */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">Konto</p>
        </div>
        <div className="divide-y divide-border-subtle">

          {/* Benutzername */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Benutzername</p>
              <p className="text-xs text-foreground-faint font-mono mt-0.5">{user.username}</p>
            </div>
          </div>

          {/* E-Mail */}
          <div className="flex items-start justify-between px-5 py-4 gap-4">
            <div className="pt-0.5">
              <p className="text-sm font-medium text-foreground">E-Mail</p>
              {user.email
                ? <p className="text-xs text-foreground-faint mt-0.5">{user.email}</p>
                : <p className="text-xs text-foreground-faint mt-0.5 italic">Keine E-Mail hinterlegt</p>
              }
            </div>
            <div className="flex-shrink-0">
              <ChangeEmailButton userId={user.id} currentEmail={user.email ?? null} />
            </div>
          </div>

          {/* Passwort */}
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <p className="text-sm font-medium text-foreground">Passwort</p>
            <div className="flex-shrink-0">
              <ChangePasswordButton userId={user.id} />
            </div>
          </div>

          {/* Rolle */}
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <p className="text-sm font-medium text-foreground">Rolle</p>
            <RoleSelect id={user.id} currentRole={user.role} />
          </div>

        </div>
      </div>

      {/* ── Reinigung ── */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">Reinigung</p>
        </div>
        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Reinigungspausen erlauben</p>
            <p className="text-xs text-foreground-faint mt-0.5">Kurzes Öffnen ohne Eintrag</p>
          </div>
          <ReinigungToggle
            userId={user.id}
            initialErlaubt={user.reinigungErlaubt}
            initialMaxMinuten={user.reinigungMaxMinuten}
          />
        </div>
      </div>

      {/* ── App ── */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">App</p>
        </div>
        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Dateiauswahl auf Mobile</p>
            <p className="text-xs text-foreground-faint mt-0.5">Dateiauswahl statt direkter Kamera beim Foto-Upload</p>
          </div>
          <MobileUploadToggle userId={user.id} initialValue={user.mobileDesktopUpload} />
        </div>
      </div>

      {/* ── Trainingsvorgaben ── */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">Trainingsvorgaben</p>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">
          <VorgabeForm userId={id} />
        </div>
        {vorgaben.length > 0 && (
          <div className="border-t border-border-subtle divide-y divide-border-subtle">
            {vorgaben.map((v) => (
              <VorgabeRow
                key={v.id}
                userId={id}
                vorgabeId={v.id}
                active={isActive(v)}
                dateLabel={`${formatDate(v.gueltigAb, dl)}${v.gueltigBis ? ` → ${formatDate(v.gueltigBis, dl)}` : ` → ${tc("open")}`}`}
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
        )}
      </div>

      {/* ── Gefahrenbereich ── */}
      <div className="bg-surface rounded-2xl border border-border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint mb-3">Gefahrenbereich</p>
        <DeleteUserButton id={user.id} username={user.username} isSelf={session?.user?.id === user.id} />
      </div>

    </main>
  );
}
