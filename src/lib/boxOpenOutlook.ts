/**
 * Hält die Box, wenn der Sub jetzt eine Öffnung einträgt?
 *
 * Der Eintrag gelingt immer. Ob der Riegel folgt, entscheiden zwei unabhängige Instanzen:
 *
 *  1. Der TRACKER sendet gar kein `open`, wenn die Öffnung eine Sperrzeit bricht (`entries/route.ts`:
 *     „ein VERBOTENES Öffnen darf die Box NICHT physisch öffnen — sonst würde das Dokumentieren des
 *     Verstosses den Verstoss vollstrecken"). Diese Regel gehört dem Formular, das sie ohnehin für
 *     seine Absende-Warnung braucht — sie wird hier NICHT ein zweites Mal formuliert.
 *  2. Die BOX hält ihre eigene Frist. Das ist der Teil, den dieses Modul beantwortet.
 *
 * Was hier bewusst NICHT einfliesst: ein offenes Reinigungsfenster. Die Box meldet ihr `lockUntil`
 * unabhängig davon, ob gerade ein Fenster läuft; ob sie den Schlüssel darin freigibt, entscheidet
 * ihre Firmware. Aus einem offenen Fenster auf „der Riegel folgt" zu schliessen, wäre eine
 * Behauptung über Code, den der Tracker nicht kennt — und sie ginge in die beruhigende Richtung.
 * Das Fenster wird angezeigt, nicht verrechnet.
 */

/** `until: null` = unbefristet gehalten (bis die Keyholderin die Sperrzeit aufhebt). */
export interface BoxHold {
  until: string | null;
}

export interface BoxHoldParams {
  /** Aktive Sperrzeit des Subs, oder null. */
  sperrzeit: { endetAt: string | null; unbefristet: boolean } | null;
  /** Die Box, so wie sie sich zuletzt gemeldet hat. null = keine Box registriert. */
  box: { lockUntil: string | null } | null;
  now: Date;
}

/** Die Box hält → `BoxHold`. Sie folgt → `null`. */
export function boxHoldOutlook(p: BoxHoldParams): BoxHold | null {
  // Ohne Box gibt es nichts vorherzusagen — der Eintrag ist dann die ganze Wahrheit.
  if (!p.box) return null;

  // Eine UNBEFRISTETE Sperrzeit hat kein `endetAt`. Nur aus dem fehlenden Datum auf „öffnet" zu
  // schliessen hiesse, den Sub genau falsch herum zu beruhigen: gerade dann hält die Box am
  // längsten. Deshalb zählt hier die Sperrzeit selbst, nicht ihr Enddatum.
  const laeuft = !!p.sperrzeit && (p.sperrzeit.unbefristet || (!!p.sperrzeit.endetAt && new Date(p.sperrzeit.endetAt) > p.now));
  if (laeuft && p.sperrzeit!.unbefristet) return { until: null };

  const frist = p.box.lockUntil;
  return frist && new Date(frist) > p.now ? { until: frist } : null;
}
