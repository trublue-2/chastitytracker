import { redirect } from "next/navigation";
import { ClipboardCheck, ClipboardList, Droplets, Bell, Gavel, Scale } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getIsLocked } from "@/lib/queries";
import { subLockPeriodCached } from "@/lib/dashboardData";
import { buildNewEntryCategoryRows } from "@/lib/categoryRows";
import { weightTrackingEnabled } from "@/lib/constants";
import { categoryStyle, wearActionHref } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import Section from "@/app/components/Section";
import { getTranslations } from "next-intl/server";
import ActionRow from "./ActionRow";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

export default async function AktionenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const [t, tw, tt] = await Promise.all([
    getTranslations("admin"),
    getTranslations("wearForm"),
    getTranslations("tasks"),
  ]);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const [isLocked, activeLockPeriod, categories] = await Promise.all([
    getIsLocked(id),
    subLockPeriodCached(id),
    buildNewEntryCategoryRows(id),
  ]);

  const hasEmail = !!user.email;
  // Gibt es überhaupt ein Ziel für eine Kontrolle? Der KG zählt nur verschlossen, jede laufende
  // Trage-Session ebenfalls (dieselbe Menge, die /api/admin/inspection-targets liefert).
  const hasInspectionTarget = isLocked || categories.some((c) => c.activeDeviceName !== null);
  const base = `/admin/users/${id}/aktionen`;

  return (
    <>
      <Section title={t("aktionenAnforderungen")}>
        <div className="divide-y divide-border-subtle">
          {/* Kontrollen brauchen ein LAUFENDES Ziel — verschlossen ODER etwas getragen (v5.0.1).
              Ohne beides gäbe es nichts zu zeigen, und `requestKontrolle` würde ablehnen. */}
          {/* Fehlt die E-Mail, bleibt die Zeile ANKLICKBAR und führt dorthin, wo der Mangel behoben
              wird. Vorher stand sie ausgegraut mit „Keine E-Mail hinterlegt" da — das ist keine
              Beschriftung, sondern eine Fehlermeldung ohne Behebung: kein Link, kein Hinweis wohin.
              Wer nicht erriet, dass die Lösung unter Einstellungen → Konto liegt, sass vor der
              Funktion, für die er die App benutzt. Weil die Zeile dann WOANDERS hinführt, tritt der
              Weg zur E-Mail an die Stelle der Beschreibung — er beschreibt, was der Tipp tut.

              Das fehlende ZIEL (nichts verschlossen, nichts getragen) bleibt dagegen gesperrt: das
              behebt keine Einstellung, sondern nur der Träger. */}
          <ActionRow
            href={
              !hasEmail ? `/admin/users/${id}/einstellungen`
              : hasInspectionTarget ? `${base}/kontrolle`
              : undefined
            }
            icon={<Bell className="size-4" />}
            title={t("requestInspection")}
            description={hasEmail ? t("requestInspectionHint") : t("noEmailFix")}
            lockedReason={hasEmail && !hasInspectionTarget ? t("entryOnlyIfLockedOrWorn") : undefined}
          />

          {/* Mehrere offene Anforderungen sind erlaubt, und eine E-Mail verlangt sie nicht —
              Begründung im Dienst. */}
          <ActionRow
            href={!isLocked ? `${base}/verschluss-anforderung` : undefined}
            icon={<LockClosedIcon className="size-4" />}
            title={t("requestLock")}
            description={t("requestLockHint")}
            lockedReason={isLocked ? t("alreadyLocked") : undefined}
          />

          {/* Sperrdauer: bestehende bearbeiten, sonst neu setzen — beides nur im verschlossenen Zustand */}
          {isLocked && activeLockPeriod ? (
            <ActionRow
              href={`${base}/lock-duration-edit`}
              icon={<LockClosedIcon className="size-4" />}
              title={t("editLockDuration")}
              description={t("editLockDurationHint")}
            />
          ) : (
            <ActionRow
              href={isLocked ? `${base}/verschluss-anforderung` : undefined}
              icon={<LockClosedIcon className="size-4" />}
              title={t("setLockDuration")}
              description={t("setLockDurationHint")}
              lockedReason={isLocked ? undefined : t("entryOnlyIfLocked")}
            />
          )}

          {/* Freigabe-Vorgabe: das Gewicht öffnet das nächste Fenster. Neben der Orgasmus-Anweisung,
              weil sie dasselbe Fenster stellt — nur an eine Bedingung geknüpft statt an einen
              Zeitpunkt. Ohne Gewichtstracking gibt es sie nicht (die Seite würde umleiten). */}
          {weightTrackingEnabled() && user.weightTrackingEnabled && (
            <ActionRow
              href={`${base}/gewichts-freigabe`}
              icon={<Scale className="size-4" />}
              title={t("releaseTitle")}
              description={t("releaseHint")}
            />
          )}

          <ActionRow
            href={`${base}/orgasmus-anforderung`}
            icon={<Droplets className="size-4" />}
            title={t("requestOrgasm")}
            description={t("requestOrgasmHint")}
          />

          {/* Kein Kategorien-Gate: „KG verschlossen" und reine Freitext-Aufgaben gehen auch ohne
              Gerätekategorien — siehe `aufgaben/page.tsx`. */}
          <ActionRow
            href={`${base}/aufgabe`}
            icon={<ClipboardList className="size-4" />}
            title={tt("actionTitle")}
            description={tt("actionHint")}
          />

          {/* Steht bei den Anforderungen und nicht bei den Einträgen: die Zeilen dort legen einen
              `Entry` an, ein notiertes Vergehen ist gerade die Art, die NICHT aus Einträgen
              abgeleitet wird (`offenseTypes.ts`). Kein Gate — es hat keine Vorbedingung. */}
          <ActionRow
            href={`${base}/vergehen`}
            icon={<Gavel className="size-4" />}
            title={t("recordOffense")}
            description={t("recordOffenseHint")}
          />
        </div>
      </Section>

      {/* Die Beschreibungen dieser Gruppe sagen, was ERFASST wird, nicht wie es um den Träger
          steht. Unter „Öffnen" stand „Gürtel abgelegt" — das liest sich wie eine Tatsache über den
          Träger, und wer den Schirm überfliegt, glaubt, der Gürtel sei ab. Gemeint war das
          Formular. Deshalb durchgehend die Handlung („Öffnung erfassen"): sie kann gar nicht als
          Zustandsmeldung missverstanden werden, weil sie noch nicht geschehen ist. */}
      <Section title={t("aktionenItems")}>
        <div className="divide-y divide-border-subtle">
          <ActionRow
            href={isLocked ? undefined : `${base}/verschluss`}
            icon={<LockClosedIcon className="size-4" />}
            title={t("entryVerschluss")}
            description={t("entryVerschlussDesc")}
            lockedReason={isLocked ? t("alreadyLocked") : undefined}
          />

          <ActionRow
            href={isLocked ? `${base}/oeffnen` : undefined}
            icon={<LockOpenIcon className="size-4" />}
            title={t("entryOeffnen")}
            description={t("entryOeffnenDesc")}
            lockedReason={isLocked ? undefined : t("entryOnlyIfLocked")}
          />

          <ActionRow
            href={`${base}/pruefung`}
            icon={<ClipboardCheck className="size-4" />}
            title={t("entryPruefung")}
            description={t("entryPruefungDesc")}
          />

          <ActionRow
            href={`${base}/orgasmus`}
            icon={<Droplets className="size-4" />}
            title={t("entryOrgasmus")}
            description={t("entryOrgasmusDesc")}
          />

          {/* Gewicht — nur mit Freischaltung. Ohne sie führte die Zeile auf eine Seite, die umleitet. */}
          {weightTrackingEnabled() && user.weightTrackingEnabled && (
            <ActionRow
              href={`${base}/gewicht`}
              icon={<Scale className="size-4" />}
              title={t("entryWeight")}
              description={t("entryWeightDesc")}
            />
          )}

          {/* Die Kategorie behält ihre Farbe, wo alle anderen Zeichen grau sind: sie sagt WELCHE
              Kategorie, nicht dass etwas dringend wäre — dieselbe Ausnahme wie in `EntryRow`. */}
          {categories.map((c) => {
            const active = c.activeDeviceName;
            return (
              <ActionRow
                key={c.id}
                href={wearActionHref({ categoryId: c.id, active: !!active, adminUserId: id })}
                icon={
                  <CategoryIconRender
                    name={c.icon}
                    className="size-4"
                    style={{ color: categoryStyle(c.color).color }}
                  />
                }
                title={c.name}
                description={active ? `${tw("endShort")} · ${active}` : tw("titleBegin")}
              />
            );
          })}
        </div>
      </Section>
    </>
  );
}
