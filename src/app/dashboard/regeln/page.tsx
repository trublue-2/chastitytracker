import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Badge from "@/app/components/Badge";
import DashboardBlock from "@/app/components/DashboardBlock";
import DetailField from "@/app/components/DetailField";
import SettingsSection from "@/app/components/SettingsSection";
import {
  AUTO_KONTROLLE_SETTINGS_SELECT,
  autoKontrolleSettingsFromUser,
  fixedWindowMinutes,
} from "@/lib/autoKontrolleService";
import {
  formatReinigungsFenster,
  maxPausesPerDaySentinel,
  parseReinigungsFenster,
} from "@/lib/reinigungService";
import {
  OFFENSE_MODE_I18N_KEYS, OFFENSE_TYPE_I18N_KEYS, switchableOffenseTypesFor,
} from "@/lib/offenseLabels";
import { getOffenseRules } from "@/lib/offenseRulesService";
import { weightTrackingEnabled } from "@/lib/constants";
import { weightReleaseStatus } from "@/lib/weightReleaseService";
import { weightForDisplay, type UnitSystem } from "@/lib/weight";
import { APP_TZ, formatDateTime, toDateLocale } from "@/lib/utils";

/** Ein „von–bis"-Paar als eine Zeile. Die Seite zeigt drei Sorten davon (Uhrzeiten, Minuten,
 *  Anzahl) — `formatReinigungsFenster` bleibt beim Reinigungs-Fenster, dessen Form es kennt. */
function range(from: string | number, to: string | number): string {
  return `${from}–${to}`;
}

/**
 * „Meine Regeln" — die Lese-Seite des Trägers.
 *
 * Er wird nach Regeln beurteilt, die bisher nur an ihren Bedien-Orten standen: die Reinigungs-Regeln
 * im Öffnen-Formular (also erst beim Öffnen), die Auto-Kontroll- und Vergehens-Regeln ausschliesslich
 * in der Keyholder-Oberfläche. Diese Seite trägt sie zusammen — rein lesend, ohne jedes Bedienelement.
 */
export default async function RulesPage() {
  const session = await auth();
  // SECURITY: die userId kommt ausschliesslich aus der Session — die Seite kennt keinen Parameter,
  // über den ein fremder Regelsatz erreichbar wäre (wie /dashboard/messages).
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [user, offenseRules, release, locale, t, ta, tc, tOffense, tRelease] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        reinigungErlaubt: true,
        reinigungMaxMinuten: true,
        reinigungMaxProTag: true,
        reinigungsFenster: true,
        weightTrackingEnabled: true,
        unitSystem: true,
        ...AUTO_KONTROLLE_SETTINGS_SELECT,
      },
    }),
    getOffenseRules(userId),
    // Die Vorgabe steht hier vollständig: „Meine Regeln" beantwortet die Frage „wonach werde ich
    // beurteilt", und eine Bedingung, die den nächsten Orgasmus entscheidet, gehört zu den
    // wichtigsten Antworten darauf.
    weightReleaseStatus(userId),
    getLocale(),
    getTranslations("rules"),
    getTranslations("admin"),
    getTranslations("common"),
    getTranslations("offenses"),
    getTranslations("release"),
  ]);

  // Seine Einheit und seine Zeitzone: hier schaut der Träger auf sich selbst.
  const viewerUnit = ((user?.unitSystem ?? "metric") as UnitSystem);
  const releaseUnitLabel = viewerUnit === "imperial" ? tc("unitLbs") : tc("unitKg");
  const tz = user?.timezone || APP_TZ;

  const cleaningWindows = parseReinigungsFenster(user?.reinigungsFenster);
  const auto = user ? autoKontrolleSettingsFromUser(user) : null;
  // Ein festes Auslöse-Fenster gilt nur, wenn beide Zeiten stehen und aufsteigend sind — genau die
  // Frage, die der Planer stellt. Über seinen Helfer statt über „beide Felder nicht leer", sonst
  // stünde hier ein Fenster, nach dem sich die Auslösungen gar nicht richten.
  const hasFixedWindow = !!auto && !!fixedWindowMinutes(auto);

  return (
    <DashboardBlock>
      <h1 className="text-lg font-semibold text-foreground mb-1">{t("title")}</h1>
      <p className="text-xs text-foreground-faint mb-4">{t("intro")}</p>

      <div className="flex flex-col gap-4">
        <SettingsSection title={ta("sectionReinigung")} description={t("cleaningDesc")} bodyPadded>
          <div className="flex flex-col gap-3">
            <DetailField label={t("cleaningAllowedLabel")}>
              <p className="text-sm font-semibold text-foreground">
                {user?.reinigungErlaubt ? tc("yes") : tc("no")}
              </p>
            </DetailField>
            {/* Die Parameter nur bei erlaubter Reinigung — abgeschaltet beschreiben sie nichts,
                was gälte, und liessen die Seite strenger aussehen als die Regel ist. */}
            {user?.reinigungErlaubt && (
              <>
                <DetailField label={ta("reinigungMaxLabel")}>
                  <p className="text-sm text-foreground-muted">
                    {user.reinigungMaxMinuten} {tc("minutesUnit")}
                  </p>
                </DetailField>
                <DetailField label={ta("reinigungMaxProTagLabel")}>
                  {/* Über `maxPausesPerDaySentinel`, nicht über ein eigenes `> 0`: dass die
                      gespeicherte `0` „unbegrenzt" HEISST, ist eine Regel und keine Formatierung —
                      sie steht bewusst an genau einer Stelle (Begründung dort). */}
                  <p className="text-sm text-foreground-muted">
                    {maxPausesPerDaySentinel(user.reinigungMaxProTag) ?? t("unlimited")}
                  </p>
                </DetailField>
                <DetailField label={ta("reinigungFensterLabel")}>
                  {cleaningWindows.length === 0 ? (
                    <p className="text-sm text-foreground-muted">{ta("reinigungFensterEmpty")}</p>
                  ) : (
                    <ul className="text-sm text-foreground-muted">
                      {/* Index als Schlüssel: zwei identische Fenster sind erlaubt (der Editor
                          verhindert sie nicht), die Liste ist rein lesend und ändert sich nicht. */}
                      {cleaningWindows.map((f, i) => (
                        <li key={i}>{formatReinigungsFenster(f)}</li>
                      ))}
                    </ul>
                  )}
                </DetailField>
              </>
            )}
          </div>
        </SettingsSection>

        <SettingsSection title={ta("sectionAutoKontrolle")} description={t("autoInspectionsDesc")} bodyPadded>
          <div className="flex flex-col gap-3">
            <DetailField label={t("autoInspectionsEnabledLabel")}>
              <p className="text-sm font-semibold text-foreground">{auto?.aktiv ? tc("yes") : tc("no")}</p>
            </DetailField>
            {auto?.aktiv && (
              <>
                <DetailField label={ta("autoKontrolleProTagLabel")}>
                  <p className="text-sm text-foreground-muted">{range(auto.perDayMin, auto.perDayMax)}</p>
                </DetailField>
                <DetailField label={ta("autoKontrolleRuheLabel")}>
                  <p className="text-sm text-foreground-muted">{range(auto.ruheVon, auto.ruheBis)}</p>
                </DetailField>
                <DetailField label={ta("autoKontrolleFristLabel")}>
                  <p className="text-sm text-foreground-muted">
                    {range(auto.fristVon, auto.fristBis)} {tc("minutesUnit")}
                  </p>
                </DetailField>
                {hasFixedWindow && (
                  <DetailField label={ta("autoKontrolleFensterLabel")}>
                    <p className="text-sm text-foreground-muted">
                      {range(auto.fensterVon, auto.fensterBis)}
                    </p>
                  </DetailField>
                )}
                {/* Nur wenn gesetzt: die Einschränkung als Regel benannt, erklärt mit demselben Satz,
                    den die Keyholderin beim Setzen liest. */}
                {auto.nurBeiSperre && (
                  <DetailField label={ta("autoKontrolleNurBeiSperreLabel")}>
                    <p className="text-sm text-foreground-muted">{ta("autoKontrolleNurBeiSperreDesc")}</p>
                  </DetailField>
                )}
              </>
            )}
          </div>
        </SettingsSection>

        {/* Nur wenn eine Vorgabe steht: ein leerer Abschnitt „Freigabe-Vorgabe" auf jeder
            Regel-Seite behauptete ein Feature, das die meisten Träger gar nicht haben. */}
        {release && (
          <SettingsSection title={tRelease("title")} description={tRelease("rulesDesc")} bodyPadded>
            <div className="flex flex-col gap-3">
              <DetailField label={tRelease("required", { days: release.release.averageDays })}>
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  {tRelease(release.release.direction === "above" ? "requiredAbove" : "requiredBelow", {
                    value: `${weightForDisplay(release.thresholdKg, viewerUnit)} ${releaseUnitLabel}`,
                  })}
                </p>
              </DetailField>
              <DetailField label={tRelease("current", { days: release.release.averageDays })}>
                <p className="text-sm text-foreground tabular-nums">
                  {release.averageKg === null
                    ? tRelease("noAverage")
                    : `${weightForDisplay(release.averageKg, viewerUnit)} ${releaseUnitLabel}`}
                </p>
              </DetailField>
              <DetailField label={tRelease("notBefore")}>
                <p className="text-sm text-foreground-muted">
                  {formatDateTime(release.release.notBeforeAt, toDateLocale(locale), tz)}
                </p>
              </DetailField>
              <DetailField label={tRelease("rulesWindow", { hours: release.release.windowHours })}>
                <p className="text-sm text-foreground-muted">
                  {release.nextThresholdKg === null
                    ? "—"
                    : tRelease("tomorrow", { value: `${weightForDisplay(release.nextThresholdKg, viewerUnit)} ${releaseUnitLabel}` })}
                </p>
              </DetailField>
            </div>
          </SettingsSection>
        )}

        <SettingsSection title={ta("sectionOffenseRules")} description={t("offensesDesc")} bodyPadded>
          <div className="flex flex-col gap-3">
            {/* AUCH die abgeschalteten Arten, mit ihrem Modus daneben: die Seite existiert, weil
                „zählt das bei mir überhaupt?" bisher unbeantwortbar war — eine gefilterte Liste
                beantwortet nur die halbe Frage. Draussen bleibt nur, was es bei ihm gar nicht gibt:
                ohne Gewichtstracking existiert die Meldepflicht nicht, „aus" wäre die Antwort auf
                eine Frage, die sich nie gestellt hat. */}
            {switchableOffenseTypesFor({
              weightTracking: weightTrackingEnabled() && !!user?.weightTrackingEnabled,
            }).map((type) => {
              const key = OFFENSE_TYPE_I18N_KEYS[type];
              const mode = offenseRules[type];
              return (
                <div key={type} className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{tOffense(`${key}.name`)}</span>
                    <Badge
                      size="sm"
                      variant={mode === "off" ? "neutral" : "warn"}
                      label={ta(OFFENSE_MODE_I18N_KEYS[mode])}
                      className="shrink-0"
                    />
                  </div>
                  <p className="text-xs text-foreground-faint">{tOffense(`${key}.desc`)}</p>
                </div>
              );
            })}
          </div>
        </SettingsSection>
      </div>
    </DashboardBlock>
  );
}
