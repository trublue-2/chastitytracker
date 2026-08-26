import Link from "next/link";
import PruefungForm from "../../PruefungForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sealRequiredForCode, inspectionCodeRequired } from "@/lib/kontrolleService";
import { generateKontrollCode } from "@/lib/utils";
import { getBoxFormContext, getOpenKontrollen, getMobileDesktopMode } from "@/lib/queries";
import { resolveInspectionTarget, isKgTarget, inspectionTargetLabel } from "@/lib/inspectionTarget";
import { getTranslations } from "next-intl/server";
import { nowDatetimeLocal, APP_TZ } from "@/lib/utils";
import { readingColCls } from "@/app/components/inputStyles";

export default async function NewPruefungPage({ searchParams }: { searchParams: Promise<{ code?: string; kommentar?: string; cat?: string }> }) {
  const [{ code, kommentar, cat }, session] = await Promise.all([searchParams, auth()]);
  const userId = session?.user?.id;
  const tz = session?.user?.timezone ?? APP_TZ;

  const [mobileDesktopMode, resolved, box, openKontrollen] = await Promise.all([
    userId ? getMobileDesktopMode(userId) : false,
    // Das ZIEL aus dem Link (`cat`): ohne Parameter der KG — dieselbe Auflösung, mit der die
    // Anforderung angelegt wurde. Sie liefert zugleich das gerade getragene Gerät, an dem die
    // Code-Pflicht hängt, und (nur beim KG) den Lock-Eintrag für die Siegel-Regel.
    userId ? resolveInspectionTarget(userId, { categoryId: cat ?? null }) : null,
    // Box-User: die Kontrolle verlangt zusätzlich ein Foto durchs Sichtfenster — der Nachweis,
    // dass der Schlüssel seit dem Einschliessen drin GEBLIEBEN ist.
    userId ? getBoxFormContext(userId) : null,
    // Die offenen Anforderungen — gebraucht allein, um die zum Code aus dem Link zu finden: der
    // Knopf, der den Code noch einmal als Meldung schickt, braucht ihre Id.
    //
    // Nur wenn der Code AUS DEM LINK kommt: eine freiwillige Selbstkontrolle würfelt ihren Code
    // erst weiter unten, er steht in keiner Zeile — und geriete er hier in die Suche, träfe er im
    // Ausnahmefall die Anforderung eines fremden Ziels und böte einen Knopf an, der den falschen
    // Code schickt.
    userId && code ? getOpenKontrollen(userId) : null,
  ]);
  const requested = openKontrollen?.find((k) => k.code === code) ?? null;
  const target = resolved?.ok ? resolved.target : null;
  // Das Trage-Ziel, oder null beim KG — die Formular-Props hängen alle an dieser einen Frage.
  const wearTarget = target && !isKgTarget(target) ? target : null;

  // Angeforderter Code (Mail-Link) hat Vorrang; sonst bekommt die Selbstkontrolle bei laufendem
  // Ziel einen frischen Zufallscode (Frische-Beweis statt wiederverwendbarem Siegel-Foto).
  // Verlangt das getragene Gerät überhaupt einen Code? Wenn nicht, wird auch für die
  // Selbstkontrolle KEINER gewürfelt — das Formular fragte sonst nach einer Zahl, die die
  // Anforderung nicht hat und die niemand prüft.
  const codeRequired = await inspectionCodeRequired(target?.activeDeviceId ?? null);
  const effectiveCode = codeRequired ? (code || (target?.active ? generateKontrollCode() : undefined)) : undefined;
  // Bei aktivem Siegel prüft die Verifikation die Siegel-Nummer zusätzlich (server-seitig). Sie
  // beweist, dass die Schlüsselbox unberührt ist — reine KG-Semantik; eine Trage-Kontrolle hat
  // keine Box, und `lockEntry` ist dort null.
  const sealRequired = sealRequiredForCode(effectiveCode, target?.lockEntry ?? null, codeRequired);
  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("inspectionForm");
  return (
    <div className={`${readingColCls} py-6`}>
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tf("title")}</h1>
      <PruefungForm
        tz={tz}
        nowDefault={nowDatetimeLocal(tz)}
        initialCode={effectiveCode}
        initialKommentar={kommentar}
        sealRequired={sealRequired}
        codeRequired={codeRequired}
        // Beim KG bleibt das Gerät weg (es steht am VERSCHLUSS); bei einer Trage-Kontrolle ist das
        // getragene Gerät zugleich das gezeigte und der Schlüssel zur richtigen Anforderung.
        targetDeviceId={wearTarget?.activeDeviceId ?? null}
        targetLabel={inspectionTargetLabel(wearTarget)}
        codePushControlId={requested?.id ?? null}
        // Das AUFGELÖSTE Ziel, nicht der rohe `cat`-Parameter: die Meldung des Code-Push führt
        // damit exakt auf dieselbe Auflösung zurück, auf der der Sub gerade steht.
        categoryId={target?.categoryId ?? null}
        mobileDesktopMode={mobileDesktopMode}
        boxConfirm={box?.boxConfirm ?? false}
      />
    </div>
  );
}
