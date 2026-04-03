import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertAdmin } from "@/lib/authGuards";
import ChangeEmailButton from "@/app/admin/ChangeEmailButton";
import ChangePasswordButton from "@/app/admin/ChangePasswordButton";
import RoleSelect from "@/app/admin/RoleSelect";
import ReinigungToggle from "@/app/admin/ReinigungToggle";
import MobileUploadToggle from "@/app/admin/MobileUploadToggle";
import NotificationToggles from "./NotificationToggles";
import DeleteUserButton from "@/app/admin/DeleteUserButton";
import Card from "@/app/components/Card";
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

  const [user, vorgaben, t, tc, dl] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.trainingVorgabe.findMany({ where: { userId: id }, orderBy: { gueltigAb: "desc" } }),
    getTranslations("admin"),
    getTranslations("common"),
    getLocale().then(toDateLocale),
  ]);

  if (!user) redirect("/admin");

  return (
    <main className="w-full max-w-3xl px-4 sm:px-6 py-6 flex flex-col gap-6">

      {/* Konto */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionAccount")}</p>
        </div>
        <div className="divide-y divide-border-subtle">

          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">{t("usernameLabel")}</p>
              <p className="text-xs text-foreground-faint font-mono mt-0.5">{user.username}</p>
            </div>
          </div>

          <div className="flex items-start justify-between px-5 py-4 gap-4">
            <div className="pt-0.5">
              <p className="text-sm font-medium text-foreground">{t("emailLabel")}</p>
              {user.email
                ? <p className="text-xs text-foreground-faint mt-0.5">{user.email}</p>
                : <p className="text-xs text-foreground-faint mt-0.5 italic">{t("noEmail")}</p>
              }
            </div>
            <div className="flex-shrink-0">
              <ChangeEmailButton userId={user.id} currentEmail={user.email ?? null} />
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <p className="text-sm font-medium text-foreground">{t("passwordLabel")}</p>
            <div className="flex-shrink-0">
              <ChangePasswordButton userId={user.id} />
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <p className="text-sm font-medium text-foreground">{t("roleLabel")}</p>
            <RoleSelect id={user.id} currentRole={user.role} />
          </div>

        </div>
      </Card>

      {/* Reinigung */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionReinigung")}</p>
        </div>
        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">{t("reinigungPausenLabel")}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("reinigungPausenDesc")}</p>
          </div>
          <ReinigungToggle
            userId={user.id}
            initialErlaubt={user.reinigungErlaubt}
            initialMaxMinuten={user.reinigungMaxMinuten}
          />
        </div>
      </Card>

      {/* App */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionApp")}</p>
        </div>
        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">{t("mobileUploadAdminTitle")}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("mobileUploadAdminDesc")}</p>
          </div>
          <MobileUploadToggle userId={user.id} initialValue={user.mobileDesktopUpload} />
        </div>
      </Card>

      {/* Benachrichtigungen */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("notificationsTitle")}</p>
          <p className="text-[11px] text-foreground-faint mt-0.5">{t("notificationsDesc")}</p>
        </div>
        <NotificationToggles
          userId={user.id}
          initial={{
            notifyVerschluss: user.notifyVerschluss,
            notifyOeffnungImmer: user.notifyOeffnungImmer,
            notifyOeffnungVerboten: user.notifyOeffnungVerboten,
            notifyOrgasmus: user.notifyOrgasmus,
            notifyKontrolleFreiwillig: user.notifyKontrolleFreiwillig,
            notifyKontrolleAngefordert: user.notifyKontrolleAngefordert,
          }}
        />
      </Card>

      {/* Trainingsvorgaben */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionVorgaben")}</p>
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
      </Card>

      {/* Gefahrenbereich */}
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint mb-3">{t("sectionDanger")}</p>
        <DeleteUserButton id={user.id} username={user.username} isSelf={session?.user?.id === user.id} />
      </Card>

    </main>
  );
}
