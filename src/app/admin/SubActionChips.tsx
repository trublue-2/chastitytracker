import KontrolleButton from "./KontrolleButton";
import VerschlussAnforderungButton from "./VerschlussAnforderungButton";
import ReleaseNowButton from "./ReleaseNowButton";

/**
 * Die drei Hauptaktionen der Keyholderin für EINEN Sub: Kontrolle anfordern, Sperrzeit setzen bzw.
 * Einschliessen anfordern, sofort aufschliessen.
 *
 * Steht in der Übersicht in jeder Sub-Zeile UND oben auf der Seite des Subs. Mit nur einem Sub
 * landet die Keyholderin nach der Anmeldung direkt auf dessen Seite — dort fehlten die Knöpfe, und
 * der Weg führte zurück in die Übersicht. Die Sichtbarkeits-Regeln stehen deshalb hier, einmal.
 *
 * Liefert ein Fragment: der Aufrufer bestimmt die Zeile, in der die Chips stehen (in der Übersicht
 * teilen sie sie mit den Schnellschaltern).
 */
export default function SubActionChips({ userId, hasEmail, isLocked, hasActiveLockPeriod, tz, minNow }: {
  userId: string;
  hasEmail: boolean;
  isLocked: boolean;
  hasActiveLockPeriod: boolean;
  /** Zeitzone des Subs — seine Zeitpunkte gelten in ihr. */
  tz: string;
  /** Server-„jetzt" als Wanduhr in `tz` — `min` der Datums-Eingaben. */
  minNow: string;
}) {
  return (
    <>
      {isLocked && <KontrolleButton userId={userId} hasEmail={hasEmail} />}
      <VerschlussAnforderungButton
        userId={userId}
        isLocked={isLocked}
        hasActiveLockPeriod={hasActiveLockPeriod}
        tz={tz}
        minNow={minNow}
      />
      {/* Das Gegenstück zur Sperrzeit steht NEBEN ihr, nicht in einem Menü — das war die
          Rückmeldung, aus der es entstand. */}
      {isLocked && <ReleaseNowButton userId={userId} hasActiveLockPeriod={hasActiveLockPeriod} />}
    </>
  );
}
