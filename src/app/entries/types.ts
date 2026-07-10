/**
 * Shared contracts for entry-form Cores (Orgasmus, Pruefung, Verschluss, Oeffnen).
 *
 * SubmitResult: what each `submitFn` callback returns:
 *   { ok: true }                   → Core calls onSuccess() (caller navigates).
 *   { ok: false, error: string }   → Core displays the error inline.
 *   { ok: true, offline: true }    → caller handled queuing, Core calls onSuccess().
 */

// `import type` — zur Laufzeit gelöscht, zieht also kein Prisma in das Client-Bundle.
import type { ReinigungsFenster } from "@/lib/reinigungService";
import type { CleaningBlockReason } from "@/lib/queries";
export type SubmitResult =
  | { ok: true; offline?: boolean }
  | { ok: false; error: string };

export interface OrgasmusPayload {
  type: "ORGASMUS";
  startTime: string;
  orgasmusArt: string;
  note: string | null;
}

export interface PruefungPayload {
  type: "PRUEFUNG";
  startTime: string;
  imageUrl: string | null;
  imageExifTime: string | null;
  note: string | null;
  kontrollCode: string | null;
  verifikationStatus: "ai" | null;
  /** Clockwise rotation applied to the photo in the form (0|90|180|270).
   *  Server-side AI verify must use the same rotation as the client preview. */
  imageRotation: number;
}

export interface VerschlussPayload {
  type: "VERSCHLUSS";
  startTime: string;
  imageUrl: string | null;
  imageExifTime: string | null;
  note: string | null;
  kontrollCode: string | null;
  deviceId: string | null;
  /** Bildersafe: versiegeltes Schlüsselbox-Code-Foto (nur wenn Instanz im Bildersafe-Modus). */
  codeImageUrl?: string | null;
  /** Bildersafe: Ziffern im Code-Foto erkannt (Lesbarkeits-✓). */
  codeReadable?: boolean | null;
}

export interface OeffnenPayload {
  type: "OEFFNEN";
  startTime: string;
  oeffnenGrund: string;
  note: string | null;
  /** Only set when user confirmed the Reinigung-limit-bypass sheet. */
  forcedReinigung?: boolean;
}

export interface WearBeginPayload {
  type: "WEAR_BEGIN";
  startTime: string;
  deviceId: string;
  imageUrl: string | null;
  imageExifTime: string | null;
  note: string | null;
}

export interface WearEndPayload {
  type: "WEAR_END";
  startTime: string;
  deviceId: string;
  imageUrl: string | null;
  imageExifTime: string | null;
  note: string | null;
}

/** Bundled user-cleaning config (kept together to avoid prop sprawl). Enthält bewusst KEIN
 *  `erlaubt`-Flag mehr: ob gereinigt werden darf, beantwortet `cleaningBlock` vollständig — samt
 *  Grund. Zwei Quellen für dieselbe Frage waren der Ursprung dieser ganzen Fehlerfamilie. */
export interface ReinigungConfig {
  maxMinuten: number;
  maxProTag: number;
  heuteAnzahl: number;
  /** Serverseitig gefälltes Urteil (eine Uhr, Sub-Zeitzone): darf JETZT gereinigt werden, und wenn
   *  nein — warum nicht? `null` = erlaubt. Kommt aus `cleaningBlockReason()`, derselben Regel, die
   *  serverseitig über den Sperrzeit-Bruch entscheidet. Fehlt die Prop (Admin-Formular, Edit-Seite),
   *  gilt „nicht blockieren": dort ist der Grund nie REINIGUNG bzw. wird nichts neu geöffnet. */
  cleaningBlock?: CleaningBlockReason | null;
  /** Das nächste beginnende Reinigungsfenster — rein informativ. */
  nextWindow?: ReinigungsFenster | null;
}

/** Bundled Sperrzeit state (user-dashboard only — admin skips these warnings). Das Sperr-Flag
 *  `reinigungErlaubt` steckt in `ReinigungConfig.cleaningBlock`, wo es mit dem User-Flag und dem
 *  Zeitfenster zu EINEM Urteil verrechnet ist. */
export interface SperrzeitState {
  endetAt: string | null;
  unbefristet: boolean;
}
