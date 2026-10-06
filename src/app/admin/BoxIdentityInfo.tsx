import { getTranslations } from "next-intl/server";
import DetailField from "@/app/components/DetailField";
import type { BoxIdentity } from "@/lib/queries";
import { toBoxKind } from "@/lib/boxStatus";

/**
 * Welche Box dieser Träger hinterlegt hat — Art (Heimdall, LockMeBox) und Box-Nr. —, oder dass keine
 * hinterlegt ist. Steht über dem Riegel-Schalter im Bereich „Box": die Keyholderin sieht dort, WORÜBER
 * sie entscheidet, bevor sie etwas umlegt. Die Nummer ist `boxId` (bei der LockMeBox der Bluetooth-Name,
 * bei Heimdall die Geräte-id); der Anzeigename steht nur dabei, wo er sich davon unterscheidet.
 */
export default async function BoxIdentityInfo({ boxes }: { boxes: BoxIdentity[] }) {
  const t = await getTranslations("admin");
  if (boxes.length === 0) return <p className="text-sm text-foreground-muted">{t("boxInfoNone")}</p>;
  return (
    <div className="flex flex-col gap-3">
      {boxes.map((b) => (
        <div key={b.boxId} className="grid grid-cols-2 gap-3">
          <DetailField label={t("boxInfoKind")}>
            <p className="text-sm text-foreground">{toBoxKind(b.kind) === "lockmebox" ? t("boxKindLockmebox") : t("boxKindHeimdall")}</p>
          </DetailField>
          <DetailField label={t("boxInfoNumber")}>
            <p className="text-sm font-mono text-foreground break-all">{b.boxId}</p>
            {b.name && b.name !== b.boxId && <p className="text-neben text-foreground-faint">{b.name}</p>}
          </DetailField>
        </div>
      ))}
    </div>
  );
}
