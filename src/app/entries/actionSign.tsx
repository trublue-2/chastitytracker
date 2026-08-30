import { ClipboardList, Play, Square, ClipboardCheck, Droplets, Scale, KeyRound, ShowerHead, Eye } from "lucide-react";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

/**
 * Das Zeichen einer Erfassungs-Handlung: Symbol und Farbe, in einer Grösse.
 *
 * Es steht hier als Tabelle und nicht je Seite im JSX, weil es zwei Sorten Aufrufer gibt: die neun
 * Erfassungs-Seiten kennen ihre Handlung fest, das Bearbeiten-Formular erst zur Laufzeit aus
 * `Entry.type`. Eine Tabelle bedient beide; zehn Inline-Symbole hätten dem Bearbeiten-Formular
 * trotzdem eine eigene gebraucht.
 *
 * **Warum genau diese Symbole:** Sie sind nicht neu gewählt, sondern von den Keyholder-Formularen
 * übernommen (`admin/users/[id]/aktionen/*`). Verschluss und Verschluss müssen dasselbe Zeichen
 * tragen, egal wer erfasst — das ist der Punkt von Issue #85. Die Schlüsselbox-Zeilen folgen
 * derselben Regel gegenüber dem (+)-Blatt (`NewEntrySheet`), wo sie ihren einzigen Auftritt haben.
 *
 * **Nicht vollständig, und das ist bekannt:** dieselbe Zuordnung steht heute noch dreimal
 * daneben — in den dreizehn Keyholder-Formularen, im (+)-Blatt und in `EntryRow` (das für die
 * Liste eigene, kleinere Symbole führt: `ClipboardList` statt `ClipboardCheck`, `Play`/`Square`
 * statt `Circle`). Diese Tabelle ist der Ort, an dem die drei zusammenlaufen sollten; der Umbau
 * berührt Dateien ausserhalb dieses Durchgangs.
 */
export type ActionSignKey =
  | "VERSCHLUSS"
  | "OEFFNEN"
  | "PRUEFUNG"
  | "ORGASMUS"
  | "WEAR_BEGIN"
  | "WEAR_END"
  | "WEIGHT"
  | "BILDERSAFE_SEAL"
  | "BILDERSAFE_SHOW"
  | "REINIGUNG"
  | "TASK";

/** Die Farben stehen als CSS-Variable und nicht als Tailwind-Klasse, weil die Hülle sie als
 *  `style`-Wert setzt: das Zeichen färbt sich, ohne dass die Hülle die Palette kennen muss. */
const SIGNS: Record<ActionSignKey, { Icon: typeof LockClosedIcon; color: string }> = {
  VERSCHLUSS: { Icon: LockClosedIcon, color: "var(--color-lock)" },
  OEFFNEN: { Icon: LockOpenIcon, color: "var(--color-unlock)" },
  PRUEFUNG: { Icon: ClipboardCheck, color: "var(--color-inspect)" },
  ORGASMUS: { Icon: Droplets, color: "var(--color-orgasm)" },
  // Play/Square statt zweimal Circle: die Eintragsliste unterscheidet die beiden längst so
  // (`EntryRow.tsx`), und es sind die zwei häufigsten Erfassungen des Trägers — sie hätten sonst
  // einen identischen Kopf bekommen und wären nur am Titel zu unterscheiden gewesen.
  WEAR_BEGIN: { Icon: Play, color: "var(--foreground)" },
  WEAR_END: { Icon: Square, color: "var(--foreground)" },
  WEIGHT: { Icon: Scale, color: "var(--foreground)" },
  BILDERSAFE_SEAL: { Icon: KeyRound, color: "var(--color-lock)" },
  // `Eye` und NICHT das offene Schloss: der Bildersafe hat mit dem Verschluss nichts zu tun, und
  // seit das offene Schloss ein deutliches eigenes Zeichen ist, behauptete es hier „aufgeschlossen".
  // Was der Vorgang bedeutet, ist „die Bilder sind sichtbar".
  BILDERSAFE_SHOW: { Icon: Eye, color: "var(--foreground)" },
  // Eine Reinigung ist zwar eine Öffnung, aber in derselben Liste stand ihr Zeichen sonst auch für
  // „Session vorbei" — dasselbe Glyph für „Unterbrechung, es geht weiter" und für das Ende.
  REINIGUNG: { Icon: ShowerHead, color: "var(--foreground)" },
  TASK: { Icon: ClipboardList, color: "var(--foreground)" },
};

/**
 * Liefert `icon` und `iconColor` fertig für die Formular-Hülle — die Aufrufstelle schreibt
 * `{...actionSign("VERSCHLUSS")}` und muss weder Grösse noch Strichstärke kennen.
 *
 * Ein unbekannter Schlüssel (das Bearbeiten-Formular reicht `Entry.type` durch, und die Spalte ist
 * in der Datenbank ein String) gibt kein Zeichen statt eines falschen: der Kopf steht dann ohne
 * Symbol da, was niemanden in die Irre führt.
 */
export function actionSign(key: string): { icon: React.ReactNode; iconColor: string } {
  const sign = SIGNS[key as ActionSignKey];
  if (!sign) return { icon: null, iconColor: "var(--foreground)" };
  const { Icon, color } = sign;
  return { icon: <Icon size={20} strokeWidth={2} />, iconColor: color };
}

/**
 * Nur das ZEICHEN einer Art, ohne Farbe — für Listen, die ihre Farbe selbst bestimmen.
 *
 * Es gab drei Tabellen für dieselbe Zuordnung: diese hier, `typeIcon` in `EntryRow` und `iconFor`
 * in `SessionTimeline`. Sie waren bereits auseinandergelaufen — die Prüfung trug in der einen
 * `ClipboardCheck`, in der anderen `ClipboardList`, also dasselbe Zeichen wie eine Aufgabe. Wer
 * eine Art umzeichnet, soll das an EINER Stelle tun.
 *
 * `undefined` für eine unbekannte Art, weil die Aufrufer teils rohe Zeichenketten aus der Datenbank
 * hereinreichen; sie zeigen dann kein Zeichen statt zu stürzen.
 */
export function actionIcon(key: ActionSignKey): typeof LockClosedIcon;
export function actionIcon(key: string): typeof LockClosedIcon | undefined;
export function actionIcon(key: string): typeof LockClosedIcon | undefined {
  return SIGNS[key as ActionSignKey]?.Icon;
}
