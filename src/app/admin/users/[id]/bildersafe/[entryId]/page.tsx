import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth/auth";
import { isKeyholderOf } from "@/lib/auth/keyholder";
import { isCodeChangeState } from "@/lib/box/lockboxCodeCheck";
import { previousSealedCode } from "@/lib/box/lockboxCodeCheckService";
import { prisma } from "@/lib/prisma";
import { getUserTimezone } from "@/lib/queries";
import { logAccess } from "@/lib/serverLog";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import ImageViewer from "@/app/components/ImageViewer";
import Section from "@/app/components/Section";

export const dynamic = "force-dynamic";

function CodePhoto({ src, label, at, dl, tz }: { src: string; label: string; at: Date; dl: string; tz: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <ImageViewer src={src} alt={label} width={320} height={320} className="w-full h-auto rounded-xl object-contain" />
      <figcaption className="text-neben text-foreground-muted">
        <span className="font-medium text-foreground">{label}</span> · {formatDateTime(at, dl, tz)}
      </figcaption>
    </figure>
  );
}

/**
 * Bildersafe, Issue #115: die beiden Code-Fotos nebeneinander — das des Verschlusses und das zuletzt
 * davor versiegelte —, damit die Keyholderin selbst sieht, was die automatische Prüfung nicht sicher
 * entscheiden konnte (oder als „derselbe Code" erkannt hat). Ziel der Meldung im Posteingang.
 *
 * **Nur die ZUGEORDNETE Keyholderin** — nicht schon die Admin-Rolle (Entscheidung zu #115). Das Layout
 * lässt Admin und Keyholderin herein; diese Seite gibt es für alle anderen nicht (404). Die Bilder
 * selbst liefert `/api/uploads` nach dessen eigener Regel aus; dort ist der Besitzer bis zur nächsten
 * Öffnung gesperrt (#111), unabhängig davon, wer er sonst ist.
 */
export default async function CodeCheckPage({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const session = await auth();
  if (!session?.user?.id || !(await isKeyholderOf(session.user.id, id))) notFound();

  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: id, type: "VERSCHLUSS", codeImageUrl: { not: null } },
    select: { id: true, startTime: true, codeImageUrl: true, codeChangeCheck: true, user: { select: { username: true } } },
  });
  if (!entry?.codeImageUrl) notFound();

  const [previous, tz, t, locale] = await Promise.all([
    previousSealedCode(id, { excludeEntryId: entry.id, before: entry.startTime }),
    getUserTimezone(id),
    getTranslations("admin"),
    getLocale(),
  ]);
  const dl = toDateLocale(locale);
  const result = isCodeChangeState(entry.codeChangeCheck) ? entry.codeChangeCheck : null;
  logAccess(session.user.name ?? "?", `/admin/users/${entry.user.username}/bildersafe/${entry.id}`);

  return (
    <Section title={t("codeCheckTitle")}>
      <div className="flex flex-col gap-4">
        <p className="text-fliess text-foreground-muted">{t(result ? `codeCheckResult_${result}` : "codeCheckResult_none")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CodePhoto src={entry.codeImageUrl} label={t("codeCheckCurrent")} at={entry.startTime} dl={dl} tz={tz} />
          {previous
            ? <CodePhoto src={previous.codeImageUrl} label={t("codeCheckPrevious")} at={previous.startTime} dl={dl} tz={tz} />
            : <p className="text-neben text-foreground-faint">{t("codeCheckNoPrevious")}</p>}
        </div>
        <p className="text-neben text-foreground-faint">{t("codeCheckLimits")}</p>
      </div>
    </Section>
  );
}
