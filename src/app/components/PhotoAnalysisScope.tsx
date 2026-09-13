import type { ReactNode } from "react";
import { userRowCached } from "@/lib/dashboardData";
import { currentVisionConfig, disclosureOf, photoAnalysisNoticeDue, visionSpec } from "@/lib/vision/config";
import PhotoAnalysisNotice from "@/app/components/PhotoAnalysisNotice";
import { PhotoAnalysisProvider } from "@/app/components/PhotoAnalysisContext";

/**
 * Die Foto-Prüfung eines Bereichs: löst die Einstellung EINMAL auf, gibt den Formularen darunter mit,
 * ob ihr Foto extern geprüft wird (→ ⓘ am Foto-Feld), und zeigt im Keyholder-Bereich bei Bedarf den
 * einmaligen Hinweis.
 *
 * **Wer was sieht.** Subs erfahren es NUR über das ⓘ an dem Foto, das sie gerade einreichen — ein
 * Hinweis-Kasten im Träger-Bereich war ausdrücklich nicht gewollt. Den Kasten bekommen Keyholder und
 * Admins (`notice` im Keyholder-Layout): sie lösen die Prüfung aus bzw. entscheiden über sie.
 *
 * Hängt in BEIDEN Bereichs-Layouts — im Träger-Bereich nur für das ⓘ. Ein eigenes Bauteil statt
 * zweimal derselben Verdrahtung, damit die Bedingung für den Hinweis nur einmal existiert.
 */
export default async function PhotoAnalysisScope({
  notice,
  children,
}: {
  /** Nur im Keyholder-Bereich gesetzt: wer den einmaligen Hinweis bekommen kann. Fehlt es, gibt der
   *  Bereich nur das ⓘ weiter — so im Träger-Bereich, wo Subs es allein daran erkennen. */
  notice?: { userId: string | undefined; isAdmin: boolean };
  children: ReactNode;
}) {
  const [config, user] = await Promise.all([
    currentVisionConfig(),
    notice?.userId ? userRowCached(notice.userId) : Promise.resolve(null),
  ]);
  const disclosure = disclosureOf(config);
  const isAdmin = !!notice?.isAdmin;
  const due = !!user && photoAnalysisNoticeDue(disclosure, user.photoAnalysisNoticeSeen);

  return (
    <PhotoAnalysisProvider external={visionSpec(config).external} label={config.label}>
      {due && (
        <PhotoAnalysisNotice
          disclosure={disclosure}
          label={config.label}
          sharedKeyUntil={isAdmin ? config.sharedKeyUntil?.toISOString() ?? null : null}
          isAdmin={isAdmin}
          stillChecked={config.provider !== "off"}
        />
      )}
      {children}
    </PhotoAnalysisProvider>
  );
}
