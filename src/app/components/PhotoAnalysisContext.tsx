"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import InfoDot from "@/app/components/InfoDot";

/**
 * Weiss jedes Foto-Formular, wohin sein Foto zur Prüfung geht — ohne dass die Angabe durch jede
 * Formular-Seite als Prop gereicht wird.
 *
 * Die Formulare hängen an fünf verschiedenen Stellen (Kontrolle, Verschluss, Nachweis, Waage, Box,
 * Referenzbilder), teils im Träger-, teils im Keyholder-Bereich. Die Einstellung ist eine der
 * INSTANZ, nicht der Seite: gesetzt wird sie einmal im Bereichs-Layout (`PhotoAnalysisScope`).
 *
 * Ohne umgebenden Provider gilt „nicht extern" — und das ⓘ bleibt weg. Die Offenlegung selbst trägt
 * trotzdem der einmalige Hinweis im Layout; das ⓘ ist die Erinnerung am Ort, nicht die einzige Stelle.
 */

interface PhotoAnalysisState {
  external: boolean;
  label: string | null;
}

const PhotoAnalysisCtx = createContext<PhotoAnalysisState>({ external: false, label: null });

export function PhotoAnalysisProvider({ external, label, children }: PhotoAnalysisState & { children: ReactNode }) {
  return <PhotoAnalysisCtx.Provider value={{ external, label }}>{children}</PhotoAnalysisCtx.Provider>;
}

/** Der Anbieter, an den Fotos extern gehen — `null`, wenn nichts extern geprüft wird. */
function useExternalProvider(): string | null {
  const { external, label } = useContext(PhotoAnalysisCtx);
  return external ? label ?? "" : null;
}

/** Das ⓘ neben einem Foto-Feld, dessen Foto an den Anbieter gehen KANN. Rendert nichts, solange
 *  nichts extern geprüft wird. */
export function PhotoAnalysisInfo() {
  const provider = useExternalProvider();
  const t = useTranslations("photoAnalysis");
  if (provider === null) return null;
  return <InfoDot label={t("infoLabel")}>{t("infoPhoto", { provider })}</InfoDot>;
}

/**
 * Dasselbe für die Keyholderin, die eine Kontrolle anfordert: sie reicht kein Foto ein, löst aber
 * aus, dass eines hinausgeht. Dort gibt es kein Foto-Feld, an dem das ⓘ stehen könnte — deshalb
 * eine leise Zeile als Anker, die Einzelheiten dahinter.
 */
export function PhotoAnalysisRequestHint() {
  const provider = useExternalProvider();
  const t = useTranslations("photoAnalysis");
  if (provider === null) return null;
  return (
    <p className="flex items-center gap-1 text-neben text-foreground-faint">
      {t("requestHint", { provider })}
      <InfoDot label={t("infoLabel")}>{t("infoRequest", { provider })}</InfoDot>
    </p>
  );
}
