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
} from "@/lib/autoKontrolleService";
import { fixedWindowMinutes, parseAutoInspectionDayRules } from "@/lib/autoKontrolleDayRules";
import {
  formatCleaningWindows,
  maxPausesPerDaySentinel,
  parseCleaningWindows, CLEANING_USER_SELECT } from "@/lib/cleaningService";
import {
  OFFENSE_MODE_I18N_KEYS, OFFENSE_TYPE_I18N_KEYS, switchableOffenseTypesFor,
} from "@/lib/offenseLabels";
import { getOffenseRules } from "@/lib/offenseRulesService";
import { weightTrackingEnabled } from "@/lib/constants";
import { weightReleaseStatus } from "@/lib/weightReleaseService";
import { weightText, type UnitSystem } from "@/lib/weight";
import { APP_TZ, formatDateTime, toDateLocale } from "@/lib/utils";
import { buildWeekdayLabels } from "@/lib/statsBuilders";
import { ALL_WEEKDAYS, weekdayMaskLabel } from "@/lib/weekdays";

/** Ein „von–bis"-Paar als eine Zeile. Die Seite zeigt drei Sorten davon (Uhrzeiten, Minuten,
 *  Anzahl) — `formatCleaningWindows` bleibt beim Reinigungs-Fenster, dessen Form es kennt. */
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
        ...CLEANING_USER_SELECT,
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

  const cleaningWindows = parseCleaningWindows(user?.cleaningWindows);
  // Dieselben sieben Kürzel, die die Jahres-Heatmap und der Wochentags-Wähler beschriften.
  const weekdayLabels = buildWeekdayLabels(toDateLocale(locale));
  const auto = user ? autoKontrolleSettingsFromUser(user) : null;
  const dayRules = parseAutoInspectionDayRules(auto?.dayRules);
  // Ein festes Auslöse-Fenster gilt nur, wenn beide Zeiten stehen und aufsteigend sind — genau die
  // Frage, die der Planer stellt. Über seinen Helfer statt über „beide Felder nicht leer", sonst
  // stünde hier ein Fenster, nach dem sich die Auslösungen gar nicht richten.
  const hasFixedWindow = !!auto && !!fixedWindowMinutes(auto);

  return (
    // `as="main"`: `dashboard/layout.tsx` setzt keine Landmarke, jede Seite darunter bringt ihre
    // eigene mit (#82). Für eine reine Lese-Seite ist das kein Nebenschauplatz — wer sie mit dem
    // Screenreader durchgeht, will an den Regeln entlanglesen und nicht jedes Mal zuerst durch
    // Kopfzeile und Seitenleiste.
    <DashboardBlock as="main">
      <h1 className="text-lg font-semibold text-foreground mb-1">{t("title")}</h1>
      <p className="text-xs text-foreground-faint mb-2">{t("intro")}</p>
      {/* Die EINE Stelle, an der „KG“ aufgelöst wird (Issue #93). Bewusst hier und nicht als
          Glossar oder Onboarding-Schritt: das ist laut dem Prüfer die einzige Seite, auf der
          steht, wonach der Träger beurteilt wird — also die, die er aufschlägt, wenn er etwas
          nicht versteht. Ein Onboarding-Hinweis sieht nur, wer neu ist, und nur einmal.
          Die Abkürzung selbst bleibt in der Oberfläche stehen; sie ist eingeführt. Was fehlte,
          war ein Ort, an dem sie einmal ausgeschrieben steht. */}
      <p className="text-xs text-foreground-faint mb-4">{t("glossary")}</p>

      <div className="flex flex-col gap-4">
        <SettingsSection title={ta("sectionReinigung")} description={t("cleaningDesc")} bodyPadded>
          <div className="flex flex-col gap-3">
            <DetailField label={t("cleaningAllowedLabel")}>
              <p className="text-sm font-semibold text-foreground">
                {user?.cleaningAllowed ? tc("yes") : tc("no")}
              </p>
            </DetailField>
            {/* Die Parameter nur bei erlaubter Reinigung — abgeschaltet beschreiben sie nichts,
                was gälte, und liessen die Seite strenger aussehen als die Regel ist. */}
            {user?.cleaningAllowed && (
              <>
                <DetailField label={ta("reinigungMaxLabel")}>
                  <p className="text-sm text-foreground-muted">
                    {user.cleaningMaxMinutes} {tc("minutesUnit")}
                  </p>
                </DetailField>
                <DetailField label={ta("reinigungMaxProTagLabel")}>
                  {/* Über `maxPausesPerDaySentinel`, nicht über ein eigenes `> 0`: dass die
                      gespeicherte `0` „unbegrenzt" HEISST, ist eine Regel und keine Formatierung —
                      sie steht bewusst an genau einer Stelle (Begründung dort). */}
                  <p className="text-sm text-foreground-muted">
                    {maxPausesPerDaySentinel(user.cleaningMaxPerDay) ?? t("unlimited")}
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
                        <li key={i}>
                          {formatCleaningWindows(f)}
                          {" · "}
                          {weekdayMaskLabel(f.days, weekdayLabels, tc("daily"))}
                        </li>
                      ))}
                    </ul>
                  )}
                  {cleaningWindows.length > 0 && (
                    <p className="text-xs text-foreground-muted italic">{ta("reinigungFensterClosedDayHint")}</p>
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
                {/* Nur wenn eingeschränkt: „täglich" ist der Normalfall und keine Regel, die der
                    Träger nachschlagen müsste. */}
                {auto.days !== ALL_WEEKDAYS && (
                  <DetailField label={ta("autoKontrolleDaysLabel")}>
                    <p className="text-sm text-foreground-muted">
                      {weekdayMaskLabel(auto.days, weekdayLabels, tc("daily"))}
                    </p>
                  </DetailField>
                )}
                {dayRules.length > 0 && (
                  <DetailField label={ta("autoKontrolleDayRulesLabel")}>
                    <ul className="text-sm text-foreground-muted">
                      {dayRules.map((r, i) => (
                        <li key={i}>
                          {weekdayMaskLabel(r.days, weekdayLabels, tc("daily"))}
                          {": "}
                          {ta("autoKontrolleRuheLabel")} {range(r.ruheVon, r.ruheBis)}
                          {/* Dieselbe Frage wie für den Grundstand oben (`hasFixedWindow`): ob ein
                              Fenster WIRKT, beantwortet der Planer, nicht die Nicht-Leerheit zweier
                              Zeichenketten. */}
                          {fixedWindowMinutes(r)
                            ? ` · ${ta("autoKontrolleFensterLabel")} ${range(r.fensterVon, r.fensterBis)}`
                            : ""}
                        </li>
                      ))}
                    </ul>
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
                    value: `${weightText(release.thresholdKg, viewerUnit, toDateLocale(locale))} ${releaseUnitLabel}`,
                  })}
                </p>
              </DetailField>
              <DetailField label={tRelease("current", { days: release.release.averageDays })}>
                <p className="text-sm text-foreground tabular-nums">
                  {release.averageKg === null
                    ? tRelease("noAverage")
                    : `${weightText(release.averageKg, viewerUnit, toDateLocale(locale))} ${releaseUnitLabel}`}
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
                    : tRelease("tomorrow", { value: `${weightText(release.nextThresholdKg, viewerUnit, toDateLocale(locale))} ${releaseUnitLabel}` })}
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
