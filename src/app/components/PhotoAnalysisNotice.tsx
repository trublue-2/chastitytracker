"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import { quietLinkCls } from "@/app/components/inputStyles";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { useNoticeDismiss } from "@/app/hooks/useNoticeDismiss";

/**
 * Der Hinweis, wohin eingereichte Fotos zur Prüfung gehen — oder dass sie es nicht mehr tun.
 *
 * **Warum es ihn gibt.** Bis 6.2.4 schickte jede Instanz mit Schlüssel die Fotos an einen externen
 * KI-Dienst, und in der App stand davon nirgends ein Wort. Keyholder und Admins lösen diese Prüfung
 * aus und sollen wissen, wohin die Fotos gehen. **Nur im Keyholder-Bereich** — die Subs erfahren es
 * über das ⓘ am Foto-Feld (`PhotoAnalysisScope`).
 *
 * Gleiche Bauform wie der Umstellungs-Hinweis (`ChangeoverNotice`): Merker am `User`, quittiert über
 * `useNoticeDismiss`. Anders als dort ist der Text ein Zustand der INSTANZ — deshalb kommen Anbieter und
 * Stand als Props, und die Quittung schickt genau den Stand mit, der hier stand.
 *
 * Der Admin sieht zusätzlich, bis wann der geteilte Schlüssel des Portal-Betreibers noch gilt, und
 * wo er seinen eigenen einträgt. Ein Keyholder ohne Admin-Rolle bekommt davon nichts — es ist nicht seine Entscheidung.
 */
export default function PhotoAnalysisNotice({
  disclosure,
  label,
  sharedKeyUntil,
  isAdmin,
  stillChecked,
}: {
  disclosure: string;
  label: string | null;
  /** ISO-Datum; nur gesetzt für den Admin, solange der geteilte Schlüssel läuft. */
  sharedKeyUntil: string | null;
  isAdmin: boolean;
  /** Prüft noch jemand automatisch? Beim Wechsel von extern auf den EIGENEN Server ja — dann wäre
   *  „die Keyholderin prüft selbst" eine falsche Beschreibung des Datenwegs. */
  stillChecked: boolean;
}) {
  const t = useTranslations("photoAnalysis");
  const locale = useLocale();
  const { dismissed, dismiss } = useNoticeDismiss("/api/settings/photo-analysis-notice-seen", { photoAnalysisNoticeSeen: disclosure });
  if (dismissed) return null;

  const on = disclosure !== "none";
  const variant = on ? "On" : stillChecked ? "Local" : "Off";

  return (
    <Card variant="semantic" semantic="request">
      <div className="flex flex-col gap-3">
        <p className="text-zeile font-semibold text-foreground">
          {t(`noticeTitle${variant}`, { provider: label ?? "" })}
        </p>
        <p className="text-fliess text-foreground-muted">
          {t(`noticeBody${variant}`, { provider: label ?? "" })}
        </p>
        {on && <p className="text-neben text-foreground-faint">{t("noticeWhoSees")}</p>}
        {isAdmin && sharedKeyUntil && (
          <p className="text-neben text-foreground-muted">
            {t("noticeAdminShared", { date: formatDateTime(new Date(sharedKeyUntil), toDateLocale(locale)) })}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={dismiss}>{t("understood")}</Button>
          {isAdmin && (
            <Link href="/admin/settings#photo-analysis" onClick={dismiss} className={quietLinkCls}>
              {t("noticeAdminLink")}
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
