"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/app/components/Button";
import { CheckCircle, ChevronDown, ClipboardList, Plus, Undo2, XCircle } from "lucide-react";
import { parseApiError, parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import FormError from "@/app/components/FormError";
import { taskFormHref } from "@/lib/entryFormRoute";
import { STORED_TYPE, type AssertCoversAllOffenses, type OffenseCanonicalType, type StoredOffenseType } from "@/lib/offenseTypes";
import { AI_AUTHOR, hasAuthor } from "@/lib/constants";
import type { TaskOffenseState } from "@/lib/tasks";

export interface StrafeRecordData {
  refId: string;
  status: string; // "PUNISHED" | "DISMISSED"
  bestraftDatumStr: string;
  notiz: string | null;
  reason: string | null; // Strafe-Freitext (PUNISHED) bzw. Grund (DISMISSED)
  judgedBy: string | null;
  done: boolean;
  erledigtAtStr: string | null;
}

export interface ReinigungLimitRow {
  entryId: string;
  startTimeStr: string;
  note: string | null;
}

export interface UnerlaubteOeffnungRow {
  id: string;
  startTimeStr: string;
  note: string | null;
  sperrzeitEndetAtStr: string | null;
  sperrzeitUnbefristet: boolean;
}

/** Eine nicht erfüllte Aufgabe. `state` unterscheidet „nie (rechtzeitig) begonnen" von
 *  „begonnen und vor der Frist abgelegt" — dieselbe Unterscheidung wie im Strafbuch-Modell. */
export interface AufgabeRow {
  id: string;
  title: string;
  holdUntilStr: string;
  state: TaskOffenseState;
  /** Nur bei `aborted`: wann die Bedingung wegfiel. Beleg statt blossem Vorwurf. */
  failedAtStr: string | null;
  /** War die Aufgabe die Strafe für ein früheres Vergehen? Dann ist dieses hier aus jenem entstanden. */
  isPenaltyTask: boolean;
  /** Anlass-Freitext, wo einer gesetzt ist — Zusatz zur Kette, nicht ihr Beleg. */
  penaltyReason: string | null;
}

export interface KontrollRow {
  id: string;
  /** null = Kontrolle ohne Code-Pflicht (Gerät mit `requireInspectionCode: false`). */
  code: string | null;
  deadlineStr: string;
  fulfilledAtStr: string | null;
  entryStartTimeStr: string | null;
  backdated: boolean;
  entryNote: string | null;
  kommentar: string | null;
}

/** Reinigungs-Öffnung, der kein rechtzeitiger VERSCHLUSS folgte. */
export interface NichtVerschlossenRow {
  /** `relock:<entryId>` — die Präfix-ref aus `cleaningNotRelockedRef`, weil sich dieses Vergehen
   *  seinen Eintrag mit REINIGUNG_LIMIT teilt und `StrafeRecord.refId` global eindeutig ist. */
  refId: string;
  startTimeStr: string;
  deadlineStr: string;
  /** null = nie wieder verschlossen; sonst der (verspätete) Zeitpunkt. */
  relockAtStr: string | null;
  note: string | null;
}

/** Verschluss-Anforderung, deren Frist ohne rechtzeitigen VERSCHLUSS verstrich. */
export interface VerschlussVersaeumtRow {
  id: string;
  endetAtStr: string;
  /** null = nie eingeschlossen; sonst der verspätete Zeitpunkt. */
  fulfilledAtStr: string | null;
  nachricht: string | null;
}

/** Abgelaufene Orgasmus-Anweisung ohne passenden Orgasmus. */
export interface OrgasmusVersaeumtRow {
  id: string;
  endetAtStr: string;
  nachricht: string | null;
  /** Vorgegebene Art, falls die Anweisung eine verlangte. */
  requiredArt: string | null;
}

/** VERSCHLUSS mit einem anderen als dem angeforderten Gerät. */
export interface FalschesGeraetRow {
  entryId: string;
  startTimeStr: string;
  deviceName: string | null;
  note: string | null;
}

/** Passwortwechsel an einem Admin-Konto während einer laufenden Sperrzeit. */
export interface AdminPasswortRow {
  id: string;
  atStr: string;
  adminUsername: string;
  via: string;
  sperrzeitEndetAtStr: string | null;
}

/** Orgasmus ohne deckende Direktive. Die Sperrzeit-Angaben sind nur im Modus `lockedOnly` gesetzt —
 *  im Modus `always` kann der KG offen gewesen sein, dann gibt es keine. */
export interface UnerlaubterOrgasmusRow {
  id: string;
  startTimeStr: string;
  orgasmusArt: string | null;
  note: string | null;
  sperrzeitEndetAtStr: string | null;
  sperrzeitUnbefristet: boolean;
}

/** Von Hand notiertes Vergehen. */
export interface ManuellesVergehenRow {
  id: string;
  occurredAtStr: string;
  title: string;
  description: string | null;
  createdBy: string;
}

interface Labels {
  /** Generische Fehlermeldung, wenn die API keine eigene liefert (common.error). */
  errorFallback: string;
  /** Meldung bei Netzwerkfehler (common.networkError). */
  networkError: string;
  frist: string;
  instructionLabel: string;
  strafbuchUnerlaubteOeffnungen: string;
  strafbuchZuSpaet: string;
  strafbuchAbgelehnt: string;
  strafbuchAutoEntfernt: string;
  strafbuchAutoEntferntAm: string;
  strafbuchNoEntries: string;
  recordOffense: string;
  strafbuchWurdeBestraft: string;
  strafbuchStrafaufgabe: string;
  strafbuchAbbrechen: string;
  strafbuchRueckgaengig: string;
  strafbuchGeoeffnetAm: string;
  strafbuchTrotzUnbefristet: string;
  strafbuchSperreLiefBis: string;
  strafbuchKontrollePrefix: string;
  strafbuchEingereicht: string;
  strafbuchVordatiert: string;
  strafbuchAbgelehntAm: string;
  strafbuchAblehnungsgrund: string;
  strafbuchAlleVergehenBestraft: string;
  strafbuchAlleAnzeigen: string;
  strafbuchOffeneAnzeigen: string;
  strafbuchOffen: string;
  strafbuchGesamt: string;
  strafbuchReinigungLimit: string;
  strafbuchReinigungLimitDate: string;
  strafbuchVerwerfen: string;
  strafbuchVerworfenBadge: string;
  strafbuchBegruendung: string;
  strafbuchUrteilKI: string;
  strafbuchStrafeLabel: string;
  strafbuchStrafePlaceholder: string;
  strafbuchStrafeVerhaengen: string;
  strafbuchStrafeBadge: string;
  strafbuchErledigtBadge: string;
  strafbuchAlsErledigt: string;
  strafbuchWiederOffen: string;
  strafbuchAufgaben: string;
  strafbuchAufgabeVersaeumt: string;
  strafbuchAufgabeAbgebrochen: string;
  strafbuchAufgabeAbgelegtAm: string;
  strafbuchStrafaufgabeKette: string;
  strafbuchNichtVerschlossen: string;
  strafbuchNichtVerschlossenNie: string;
  strafbuchWiederVerschlossen: string;
  strafbuchVerschlussFrist: string;
  strafbuchVerschlussVersaeumt: string;
  strafbuchVerschlussNieErfuellt: string;
  strafbuchVerschlussZuSpaet: string;
  strafbuchOrgasmusVersaeumt: string;
  strafbuchOrgasmusAbgelaufen: string;
  strafbuchOrgasmusVorgegeben: string;
  strafbuchFalschesGeraet: string;
  strafbuchFalschesGeraetAm: string;
  strafbuchAdminPasswort: string;
  strafbuchAdminPasswortAm: string;
  strafbuchAdminPasswortKonto: string;
  strafbuchUnerlaubterOrgasmus: string;
  strafbuchOrgasmusAm: string;
  strafbuchOhneDirektive: string;
  strafbuchManuelleVergehen: string;
  strafbuchNotiertVon: string;
  strafbuchZurueckziehen: string;
  deviceLabel: string;
}

interface Props {
  userId: string;
  unerlaubteOeffnungen: UnerlaubteOeffnungRow[];
  zuSpaet: KontrollRow[];
  abgelehnt: KontrollRow[];
  autoEntfernt: KontrollRow[];
  reinigungLimitVergehen: ReinigungLimitRow[];
  unfulfilledTasks: AufgabeRow[];
  nichtVerschlossen: NichtVerschlossenRow[];
  verschlussVersaeumt: VerschlussVersaeumtRow[];
  orgasmusVersaeumt: OrgasmusVersaeumtRow[];
  falschesGeraet: FalschesGeraetRow[];
  adminPasswort: AdminPasswortRow[];
  unerlaubteOrgasmen: UnerlaubterOrgasmusRow[];
  manuelleVergehen: ManuellesVergehenRow[];
  strafeRecords: StrafeRecordData[];
  labels: Labels;
}

/** Eine Zeile einer Strafbuch-Sektion, schon fertig gerendert. `body` bekommt `judged`, weil die
 *  Überschrift der Zeile bei erledigtem Urteil durchgestrichen wird. */
interface OffenseRow {
  refId: string;
  body: (judged: boolean) => React.ReactNode;
  /** Was diese Zeile vom Rest ihrer Sektion unterscheidet — Zeitpunkt, Code, Titel. Die Vergehensart
   *  kommt beim Rendern aus dem Sektions-Titel davor; zusammen ergibt das den Straf-Anlass, der in
   *  `Task.penaltyReason` landet und den der Sub liest. Pflichtfeld, damit eine neue Vergehensart
   *  nicht still mit einer nichtssagenden Zeile dasteht. */
  anlass: string;
}

/** Baut eine Sektion. Generisch nur, damit `canonical` sein LITERAL behält — daraus zieht die
 *  Vollständigkeits-Prüfung unten ihre Aussage. */
function sec<C extends OffenseCanonicalType>(canonical: C, title: string, rows: OffenseRow[]) {
  return { canonical, title, rows };
}

/** Die Geometrie der kleinen Urteils-Knöpfe. Nur die FARBE unterscheidet sie — als vierte Kopie
 *  der ganzen Klassenkette drifteten Polsterung und Radius beim nächsten Umbau auseinander. */
const CHIP_CLS = "text-xs font-medium border transition px-2.5 py-1 rounded-lg flex items-center gap-1";

/** Nebenangabe unter der Kopfzeile (Frist, Zeitpunkt). */
const FACT_CLS = "text-xs text-foreground-faint";
/** Freitext — Notiz des Subs, Anweisung, Ablehnungsgrund. */
const NOTE_CLS = "text-xs text-foreground-faint italic";

const fieldCls ="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring transition";

/**
 * Ein von Hand notiertes Vergehen zurückziehen — der Weg zurück für einen Fehleintrag. Die Route
 * setzt `withdrawnAt`, löscht also nicht: das Vergehen fällt aus dem Strafbuch, bleibt aber
 * nachlesbar.
 *
 * Auf MODUL-Ebene, weil eine Komponente mit eigenem Zustand dorthin gehört. Das allein rettet ihren
 * Zustand hier noch nicht: ihr Elter `JudgmentSlot` wird weiterhin im Rumpf von `StrafbuchClient`
 * deklariert, bekommt also bei jedem Eltern-Render eine neue Identität, und React hängt den
 * Teilbaum samt `saving`/`error` neu ein. Praktisch heisst das: eine Fehlermeldung überlebt den
 * nächsten Klick auf einen anderen Chip nicht. Das aufzulösen hiesse, `JudgmentSlot` (und die
 * übrigen sechs Unter-Komponenten dieser Datei) mit herauszuziehen — eine eigene Aufräum-Runde,
 * nicht Teil dieser Änderung. Der Rückzug ist idempotent, ein zweiter Klick ergibt einen 409.
 */
function ZurueckziehenButton({ id, label, networkError, resolveError, onDone }: {
  id: string;
  label: string;
  networkError: string;
  resolveError: (code: string | null) => string;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function withdraw() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/offense", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) onDone();
      else setError(resolveError(await parseApiErrorCode(res)));
    } catch {
      setError(networkError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={withdraw} disabled={saving}
        className={`${CHIP_CLS} text-foreground-faint border-border hover:bg-surface-raised hover:text-foreground disabled:opacity-50`}>
        <Undo2 size={11} />
        {label}
      </button>
      <FormError message={error} variant="compact" />
    </div>
  );
}

export default function StrafbuchClient({ userId, unerlaubteOeffnungen, zuSpaet, abgelehnt, autoEntfernt, reinigungLimitVergehen, unfulfilledTasks, nichtVerschlossen, verschlussVersaeumt, orgasmusVersaeumt, falschesGeraet, adminPasswort, unerlaubteOrgasmen, manuelleVergehen, strafeRecords, labels }: Props) {
  const router = useRouter();
  // Die Vergehens-Route (`/api/admin/offense`) liefert stabile Fehler-CODES; `/api/admin/strafe`
  // liefert bis heute fertige Sätze und bleibt darum bei `parseApiError`.
  const apiError = useApiError();
  const [showAll, setShowAll] = useState(false);
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [openDismissId, setOpenDismissId] = useState<string | null>(null);

  // Urteils-Lebenszyklus: bestraft (PUNISHED, offen→erledigt) | verworfen (DISMISSED) | offen (kein Record).
  // „closed" = verworfen ODER bestraft & erledigt. Eine bestrafte, noch nicht erledigte Strafe bleibt relevant.
  const punishedIds = new Set(strafeRecords.filter(r => r.status === "PUNISHED").map(r => r.refId));
  const dismissedIds = new Set(strafeRecords.filter(r => r.status === "DISMISSED").map(r => r.refId));
  const closedIds = new Set(strafeRecords.filter(r => r.status === "DISMISSED" || (r.status === "PUNISHED" && r.done)).map(r => r.refId));

  const hasPunished = strafeRecords.length > 0;

  function Section({ title, openCount, totalCount, children }: {
    title: string; openCount: number; totalCount: number; children: React.ReactNode;
  }) {
    const showBoth = totalCount > openCount && totalCount > 0;
    return (
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{title}</p>
          <span className="text-xs tabular-nums text-foreground-faint">
            {showBoth
              ? <><span className="font-semibold">{openCount} {labels.strafbuchOffen}</span><span className="opacity-50"> / {totalCount} {labels.strafbuchGesamt}</span></>
              : <span className="font-semibold">{totalCount}</span>
            }
          </span>
        </div>
        <div className="divide-y divide-border-subtle">{children}</div>
      </div>
    );
  }

  /** Gemeinsames Urteils-Formular (bestrafen ODER verwerfen) — Freitext + Abbrechen/Submit. */
  function JudgmentForm({ refId, offenseType, status, label, placeholder, submitLabel, submitIcon, submitClass, onClose }: {
    refId: string; offenseType: StoredOffenseType; status: "PUNISHED" | "DISMISSED";
    label: string; placeholder?: string; submitLabel: string; submitIcon: React.ReactNode; submitClass: string; onClose: () => void;
  }) {
    const [text, setText] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit(e: React.FormEvent) {
      e.preventDefault();
      setSaving(true);
      setError("");
      try {
        const res = await fetch("/api/admin/strafe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, offenseType, refId, status, reason: text }),
        });
        setSaving(false);
        if (res.ok) {
          onClose();
          router.refresh();
        } else {
          setError(await parseApiError(res, labels.errorFallback));
        }
      } catch {
        // Netzwerkfehler (offline/DNS) — sonst bliebe die Promise unbehandelt.
        setSaving(false);
        setError(labels.networkError);
      }
    }

    return (
      <form onSubmit={submit} className="mt-2 bg-surface-raised rounded-xl border border-border p-3 flex flex-col gap-2">
        <div>
          <label className="block text-xs text-foreground-faint mb-1">{label}</label>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} required placeholder={placeholder}
            className={`${fieldCls} resize-none`} />
        </div>
        {error && <p className="text-xs text-warn">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose}
            className="text-xs text-foreground-faint hover:text-foreground-muted transition px-3 py-1.5 rounded-lg border border-border">
            {labels.strafbuchAbbrechen}
          </button>
          <button type="submit" disabled={saving}
            className={`text-xs font-semibold text-white px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1 transition hover:opacity-90 ${submitClass}`}>
            {submitIcon}
            {saving ? "…" : submitLabel}
          </button>
        </div>
      </form>
    );
  }

  function BestrafenForm({ refId, offenseType }: { refId: string; offenseType: StoredOffenseType }) {
    return (
      <JudgmentForm refId={refId} offenseType={offenseType} status="PUNISHED"
        label={labels.strafbuchStrafeLabel} placeholder={labels.strafbuchStrafePlaceholder}
        submitLabel={labels.strafbuchStrafeVerhaengen} submitIcon={<CheckCircle size={12} />}
        submitClass="bg-[var(--color-ok)]" onClose={() => setOpenFormId(null)} />
    );
  }

  async function handleUndo(refId: string) {
    await fetch("/api/admin/strafe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refId }),
    });
    router.refresh();
  }

  async function markDone(refId: string, done: boolean) {
    await fetch("/api/admin/strafe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refId, done }),
    });
    router.refresh();
  }

  function PunishedBadge({ refId }: { refId: string }) {
    const record = strafeRecords.find(r => r.refId === refId);
    if (!record) return null;
    const aiJudged = record.judgedBy === AI_AUTHOR;
    return (
      <div className="mt-1.5 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-warn border border-warn px-2 py-0.5 rounded-lg flex items-center gap-1">
            {labels.strafbuchStrafeBadge}{record.reason ? `: ${record.reason}` : ""}
          </span>
          {aiJudged && <span className={FACT_CLS}>{labels.strafbuchUrteilKI}</span>}
          <button type="button" onClick={() => handleUndo(refId)}
            className="text-xs text-foreground-faint underline hover:text-warn transition ml-auto">
            {labels.strafbuchRueckgaengig}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {record.done ? (
            <>
              <span className="text-xs font-semibold text-[var(--color-ok)] border border-[var(--color-ok)] px-2 py-0.5 rounded-lg flex items-center gap-1">
                <CheckCircle size={10} /> {labels.strafbuchErledigtBadge} {record.erledigtAtStr}
              </span>
              <button type="button" onClick={() => markDone(refId, false)}
                className="text-xs text-foreground-faint underline hover:text-warn transition">
                {labels.strafbuchWiederOffen}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => markDone(refId, true)}
              className="text-xs font-medium text-[var(--color-ok)] border border-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-ok)_15%,transparent)] transition px-2.5 py-1 rounded-lg flex items-center gap-1">
              <CheckCircle size={11} /> {labels.strafbuchAlsErledigt}
            </button>
          )}
        </div>
      </div>
    );
  }

  function DismissedBadge({ refId }: { refId: string }) {
    const record = strafeRecords.find(r => r.refId === refId);
    if (!record) return null;
    const aiJudged = record.judgedBy === AI_AUTHOR;
    return (
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-foreground-faint border border-border px-2 py-0.5 rounded-lg flex items-center gap-1">
          <XCircle size={10} /> {labels.strafbuchVerworfenBadge}
        </span>
        {aiJudged && <span className={FACT_CLS}>{labels.strafbuchUrteilKI}</span>}
        {record.reason && <span className={NOTE_CLS}>„{record.reason}"</span>}
        <button type="button" onClick={() => handleUndo(refId)}
          className="text-xs text-foreground-faint underline hover:text-warn transition ml-auto">
          {labels.strafbuchRueckgaengig}
        </button>
      </div>
    );
  }

  function VerwerfenForm({ refId, offenseType }: { refId: string; offenseType: StoredOffenseType }) {
    return (
      <JudgmentForm refId={refId} offenseType={offenseType} status="DISMISSED"
        label={labels.strafbuchBegruendung}
        submitLabel={labels.strafbuchVerwerfen} submitIcon={<XCircle size={12} />}
        submitClass="bg-foreground-faint" onClose={() => setOpenDismissId(null)} />
    );
  }

  function VerwerfenButton({ refId, offenseType }: { refId: string; offenseType: StoredOffenseType }) {
    const isOpen = openDismissId === refId;
    return (
      <div className="mt-2">
        <button type="button"
          onClick={() => setOpenDismissId(isOpen ? null : refId)}
          className="text-xs font-medium text-foreground-faint border border-border hover:bg-surface-raised transition px-2.5 py-1 rounded-lg flex items-center gap-1">
          <XCircle size={11} />
          {labels.strafbuchVerwerfen}
          <ChevronDown size={11} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && <VerwerfenForm refId={refId} offenseType={offenseType} />}
      </div>
    );
  }

  /** 3-Wege-Urteilsslot: bestraft → PunishedBadge, verworfen → DismissedBadge, offen → Aktionen.
   *
   *  Der Rückzug hängt hier mit dran, weil er dieselbe Sichtbarkeitsregel hat wie die Urteils-Chips:
   *  ist das Vergehen beurteilt, kehrt die Funktion oben aus, und er verschwindet mit ihnen. Nur die
   *  von Hand NOTIERTE Art hat ihn überhaupt — alle anderen leiten sich aus Einträgen ab, dort gäbe
   *  es nichts zurückzuziehen. */
  function JudgmentSlot({ refId, offenseType, anlass }: { refId: string; offenseType: StoredOffenseType; anlass: string }) {
    if (punishedIds.has(refId)) return <PunishedBadge refId={refId} />;
    if (dismissedIds.has(refId)) return <DismissedBadge refId={refId} />;
    return (
      <div className="flex flex-wrap items-start gap-2">
        <WurdeBestraftButton refId={refId} offenseType={offenseType} />
        <StrafaufgabeButton refId={refId} anlass={anlass} />
        <VerwerfenButton refId={refId} offenseType={offenseType} />
        {offenseType === STORED_TYPE.manual_offense && (
          <ZurueckziehenButton id={refId} label={labels.strafbuchZurueckziehen}
            networkError={labels.networkError} resolveError={apiError} onDone={() => router.refresh()} />
        )}
      </div>
    );
  }

  function WurdeBestraftButton({ refId, offenseType }: { refId: string; offenseType: StoredOffenseType }) {
    const isOpen = openFormId === refId;
    return (
      <div className="mt-2">
        <button type="button"
          onClick={() => setOpenFormId(isOpen ? null : refId)}
          className="text-xs font-medium text-[var(--color-ok)] border border-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-ok)_15%,transparent)] transition px-2.5 py-1 rounded-lg flex items-center gap-1">
          <CheckCircle size={11} />
          {labels.strafbuchWurdeBestraft}
          <ChevronDown size={11} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && <BestrafenForm refId={refId} offenseType={offenseType} />}
      </div>
    );
  }

  /**
   * Bestrafen, indem eine AUFGABE gestellt wird — der Weg vom Vergehen direkt ins Aufgaben-Formular.
   *
   * Ein Link, kein Formular an Ort und Stelle: eine Aufgabe hat Titel, Frist, Bedingungen und
   * Nachweis-Fotos, und das alles gibt es dort schon. Die Vergehens-ref reist als Query mit; erst der
   * Server macht daraus Aufgabe UND Urteil — hier wird nichts entschieden, nur weitergeleitet.
   */
  function StrafaufgabeButton({ refId, anlass }: { refId: string; anlass: string }) {
    const href = taskFormHref(userId, { offenseRef: refId, anlass });
    return (
      <div className="mt-2">
        <Link href={href}
          className={`${CHIP_CLS} text-foreground-muted border-border hover:bg-surface-raised hover:text-foreground`}>
          <ClipboardList size={11} />
          {labels.strafbuchStrafaufgabe}
        </Link>
      </div>
    );
  }


  /** Der Straf-Anlass einer Kontroll-Zeile: Code und Frist. Ohne den Code stünde bei zwei
   *  Kontrollen desselben Tages zweimal derselbe Anlass — und der Sub liest ihn an seiner Aufgabe.
   *  Die Vergehens-ART setzt die Sektion davor, sie steht dort ohnehin. */
  const kontrollAnlass = (k: KontrollRow) =>
    `${labels.strafbuchKontrollePrefix}${k.code ? ` ${k.code}` : ""} (${labels.frist} ${k.deadlineStr})`;

  /** Die Zeile einer Kontroll-Sektion — Code, Vorwurf, Frist, Anweisung. Der Vorwurf ist das
   *  Einzige, was die drei Kontroll-Arten unterscheidet, also kommt genau er als `vorwurf` rein. */
  const kontrollBody = (k: KontrollRow, vorwurf: React.ReactNode, extra?: React.ReactNode) =>
    (judged: boolean) => (
      <>
        <p className={`text-sm font-semibold text-foreground ${judged ? "line-through" : ""}`}>
          <span className="font-mono text-[var(--color-inspect)]">{labels.strafbuchKontrollePrefix}{k.code ? ` ${k.code}` : ""}</span>
          {" — "}
          <span className="text-warn font-normal">{vorwurf}</span>
        </p>
        <p className={FACT_CLS}>{labels.frist}: {k.deadlineStr}</p>
        {extra}
        {k.kommentar && <span className={NOTE_CLS}>{labels.instructionLabel}: {k.kommentar}</span>}
      </>
    );

  /** Die Kopfzeile einer Zeile: Betreff — Vorwurf. Trägt die Durchstreichung des Urteils. */
  const titleLine = (judged: boolean, betreff: React.ReactNode, vorwurf: React.ReactNode) => (
    <p className={`text-sm font-semibold text-foreground ${judged ? "line-through" : ""}`}>
      {betreff}{" — "}<span className="text-warn font-normal">{vorwurf}</span>
    </p>
  );

  /**
   * Alle Vergehensarten als EINE Liste — Reihenfolge, Titel und Zeilendarstellung je Art.
   *
   * Vorher stand jede Sektion als eigener Block da, samt eigenem `open`-Filter, eigenem
   * `showAll`-Display und eigenem Zähler. Fünf der elf Arten fehlten schlicht, und `hasAny` zählte
   * nur die sechs vorhandenen — ein Sub, dessen einziges Vergehen ein falsches Gerät war, bekam
   * „Kein Eintrag im Strafbuch." zu lesen, während der MCP für ihn ein offenes Vergehen meldete.
   *
   * Abgeleitet wird nichts mehr von Hand: die Zähler, `hasAny` und die Vollständigkeits-Prüfung
   * unten lesen alle aus dieser Liste.
   */
  /**
   * „Und dabei lief eine Sperrzeit" — der Zusatz, der aus einer Handlung ein Vergehen macht.
   *
   * Drei Arten stellen dieselbe Frage (unerlaubte Öffnung, unerlaubter Orgasmus, Passwortwechsel am
   * Admin-Konto) und hatten sie dreimal eigen zusammengesetzt, die dritte sogar mit vertauschten
   * Zweigen und ohne den Null-Fall. `fallback` ist das, was dort steht, wo gar keine Sperrzeit lief:
   * bei der Öffnung nichts (ohne Sperrzeit gäbe es das Vergehen nicht), beim Orgasmus der Hinweis
   * auf das fehlende Fenster (Modus `always` ahndet auch bei offenem KG).
   */
  const sperrzeitQualifier = (
    row: { sperrzeitEndetAtStr: string | null; sperrzeitUnbefristet: boolean },
    fallback: string | null = null,
  ): string | null =>
    row.sperrzeitUnbefristet
      ? labels.strafbuchTrotzUnbefristet
      : row.sperrzeitEndetAtStr
        ? `${labels.strafbuchSperreLiefBis} ${row.sperrzeitEndetAtStr}`
        : fallback;

  const sections = [
    sec("unauthorized_opening", labels.strafbuchUnerlaubteOeffnungen, unerlaubteOeffnungen.map((o) => ({
      refId: o.id,
      anlass: `${labels.strafbuchGeoeffnetAm} ${o.startTimeStr}`,
      body: (judged) => {
        const qualifier = sperrzeitQualifier(o);
        return (
          <>
            <p className={`text-sm font-semibold text-foreground ${judged ? "line-through" : ""}`}>
              {labels.strafbuchGeoeffnetAm} {o.startTimeStr}
              {qualifier && <> — <span className="text-warn font-normal">{qualifier}</span></>}
            </p>
            {o.note && <span className={NOTE_CLS}>„{o.note}"</span>}
          </>
        );
      },
    }))),

    sec("late_control", labels.strafbuchZuSpaet, zuSpaet.map((k) => ({
      refId: k.id,
      anlass: kontrollAnlass(k),
      body: kontrollBody(k, (
        <>
          {labels.strafbuchEingereicht} {k.fulfilledAtStr}
          {k.backdated && k.entryStartTimeStr && <> ({labels.strafbuchVordatiert} {k.entryStartTimeStr})</>}
        </>
      )),
    }))),

    sec("rejected_control", labels.strafbuchAbgelehnt, abgelehnt.map((k) => ({
      refId: k.id,
      anlass: kontrollAnlass(k),
      body: kontrollBody(
        k,
        <>{labels.strafbuchAbgelehntAm} {k.entryStartTimeStr ?? k.deadlineStr}</>,
        k.entryNote ? <span className={NOTE_CLS}>{labels.strafbuchAblehnungsgrund}: „{k.entryNote}"</span> : null,
      ),
    }))),

    sec("auto_removed_control", labels.strafbuchAutoEntfernt, autoEntfernt.map((k) => ({
      refId: k.id,
      anlass: kontrollAnlass(k),
      body: kontrollBody(k, <>{labels.strafbuchAutoEntferntAm} {k.entryStartTimeStr ?? k.deadlineStr}</>),
    }))),

    sec("unfulfilled_task", labels.strafbuchAufgaben, unfulfilledTasks.map((a) => ({
      refId: a.id,
      anlass: `„${a.title}" (${a.holdUntilStr})`,
      body: (judged) => (
        <>
          {titleLine(judged, a.title, a.state === "aborted" ? labels.strafbuchAufgabeAbgebrochen : labels.strafbuchAufgabeVersaeumt)}
          <p className={FACT_CLS}>{labels.frist}: {a.holdUntilStr}</p>
          {/* Bei „abgebrochen" den Beleg nennen: wann die Bedingung wegfiel. Ein Vorwurf ohne
              Zeitpunkt lässt sich weder prüfen noch bestreiten. */}
          {a.failedAtStr && <p className={FACT_CLS}>{labels.strafbuchAufgabeAbgelegtAm} {a.failedAtStr}</p>}
          {a.isPenaltyTask && (
            <p className={FACT_CLS}>
              {labels.strafbuchStrafaufgabeKette}{a.penaltyReason ? ` — ${a.penaltyReason}` : ""}
            </p>
          )}
        </>
      ),
    }))),

    sec("cleaning_limit", labels.strafbuchReinigungLimit, reinigungLimitVergehen.map((r) => ({
      refId: r.entryId,
      anlass: `${r.startTimeStr}`,
      body: (judged) => (
        <>
          <p className={`text-sm font-semibold text-foreground ${judged ? "line-through" : ""}`}>
            {labels.strafbuchReinigungLimitDate} {r.startTimeStr}
          </p>
          {r.note && <span className={NOTE_CLS}>„{r.note}"</span>}
        </>
      ),
    }))),

    sec("cleaning_not_relocked", labels.strafbuchNichtVerschlossen, nichtVerschlossen.map((c) => ({
      refId: c.refId,
      anlass: `${c.startTimeStr}`,
      body: (judged) => (
        <>
          {titleLine(judged, <>{labels.strafbuchGeoeffnetAm} {c.startTimeStr}</>,
            c.relockAtStr
              ? <>{labels.strafbuchWiederVerschlossen} {c.relockAtStr}</>
              : labels.strafbuchNichtVerschlossenNie,
          )}
          <p className={FACT_CLS}>{labels.strafbuchVerschlussFrist} {c.deadlineStr}</p>
          {c.note && <span className={NOTE_CLS}>„{c.note}"</span>}
        </>
      ),
    }))),

    sec("late_lock", labels.strafbuchVerschlussVersaeumt, verschlussVersaeumt.map((a) => ({
      refId: a.id,
      anlass: `${labels.strafbuchVerschlussFrist} ${a.endetAtStr}`,
      body: (judged) => (
        <>
          {titleLine(judged, <>{labels.frist} {a.endetAtStr}</>,
            a.fulfilledAtStr
              ? <>{labels.strafbuchVerschlussZuSpaet} {a.fulfilledAtStr}</>
              : labels.strafbuchVerschlussNieErfuellt,
          )}
          {a.nachricht && <span className={NOTE_CLS}>{labels.instructionLabel}: {a.nachricht}</span>}
        </>
      ),
    }))),

    sec("missed_orgasm", labels.strafbuchOrgasmusVersaeumt, orgasmusVersaeumt.map((m) => ({
      refId: m.id,
      anlass: `${m.endetAtStr}`,
      body: (judged) => (
        <>
          {titleLine(judged, <>{labels.strafbuchOrgasmusAbgelaufen} {m.endetAtStr}</>,
            m.requiredArt
              ? <>{labels.strafbuchOrgasmusVorgegeben}: {m.requiredArt}</>
              : labels.strafbuchOrgasmusVersaeumt,
          )}
          {m.nachricht && <span className={NOTE_CLS}>{labels.instructionLabel}: {m.nachricht}</span>}
        </>
      ),
    }))),

    sec("wrong_device", labels.strafbuchFalschesGeraet, falschesGeraet.map((v) => ({
      refId: v.entryId,
      anlass: `${v.startTimeStr}`,
      body: (judged) => (
        <>
          {titleLine(judged, <>{labels.strafbuchFalschesGeraetAm} {v.startTimeStr}</>,
            <>{labels.deviceLabel}: {v.deviceName ?? "–"}</>,
          )}
          {v.note && <span className={NOTE_CLS}>„{v.note}"</span>}
        </>
      ),
    }))),

    sec("unauthorized_orgasm", labels.strafbuchUnerlaubterOrgasmus, unerlaubteOrgasmen.map((o) => ({
      refId: o.id,
      anlass: `${labels.strafbuchOrgasmusAm} ${o.startTimeStr}`,
      body: (judged) => (
        <>
          {titleLine(judged,
            <>{labels.strafbuchOrgasmusAm} {o.startTimeStr}{o.orgasmusArt ? ` (${o.orgasmusArt})` : ""}</>,
            // Lief eine Sperrzeit, ist SIE der schwerere Teil des Vorwurfs; sonst bleibt es beim
            // fehlenden Fenster.
            sperrzeitQualifier(o, labels.strafbuchOhneDirektive),
          )}
          {o.note && <span className={NOTE_CLS}>„{o.note}"</span>}
        </>
      ),
    }))),

    sec("manual_offense", labels.strafbuchManuelleVergehen, manuelleVergehen.map((m) => ({
      refId: m.id,
      anlass: `${m.title} (${m.occurredAtStr})`,
      body: (judged) => (
        <>
          {titleLine(judged, m.title, m.occurredAtStr)}
          {m.description && <span className={NOTE_CLS}>{m.description}</span>}
          {/* Kein Autor festgehalten (Sitzung ohne Namen, siehe `POST /api/admin/offense`) = die
              ganze Zeile fällt weg, statt eine Beschriftung ohne Wert dahinter zu zeigen. Über
              `hasAuthor` und nicht über die blosse Wahrheitswertigkeit: ein Alt-Platzhalter „?"
              stünde sonst als Name da, während die Meldung an den Träger ihn als „niemand" liest. */}
          {hasAuthor(m.createdBy) && <p className={FACT_CLS}>{labels.strafbuchNotiertVon}: {m.createdBy}</p>}
        </>
      ),
    }))),

    sec("admin_password_change", labels.strafbuchAdminPasswort, adminPasswort.map((p) => ({
      refId: p.id,
      anlass: `${p.atStr}`,
      body: (judged) => (
        <>
          {titleLine(judged, <>{labels.strafbuchAdminPasswortAm} {p.atStr}</>,
            // `sperrzeitEndetAt: null` heisst hier unbefristet — die Zeile entsteht nur, wenn eine
            // Sperrzeit lief (`AdminPasswordChange`), es gibt also keinen dritten Fall.
            sperrzeitQualifier({ sperrzeitEndetAtStr: p.sperrzeitEndetAtStr, sperrzeitUnbefristet: p.sperrzeitEndetAtStr === null }),
          )}
          <p className={FACT_CLS}>
            {labels.strafbuchAdminPasswortKonto}: {p.adminUsername} · {p.via}
          </p>
        </>
      ),
    }))),
  ];

  // Fehlt oben eine Art, bricht der Build hier und nennt sie beim Namen — Begründung an der
  // Tabelle selbst (`offenseTypes.ts`).
  const _everyOffenseHasASection: AssertCoversAllOffenses<(typeof sections)[number]["canonical"]> = true;

  const openRowsOf = (s: (typeof sections)[number]) => s.rows.filter(r => !closedIds.has(r.refId));
  const hasAnyOpen = sections.some(s => openRowsOf(s).length > 0);
  const hasAny = sections.some(s => s.rows.length > 0);

  return (
    <div className="flex flex-col gap-6">

      {/* Der Einstieg gehört HIERHER: wer ein Vergehen notieren will, sitzt vor dem Buch, in dem es
          landen soll. Bisher gab es ihn nur im Aktionen-Hub — man musste die Seite verlassen, um
          etwas einzutragen, das man gerade vermisst. */}
      <div className="flex justify-end">
        <Link href={`/admin/users/${userId}/aktionen/vergehen`}>
          <Button variant="primary" icon={<Plus size={16} />}>{labels.recordOffense}</Button>
        </Link>
      </div>

      {!hasAnyOpen && !showAll && hasAny && (
        <div className="bg-surface rounded-2xl border border-border py-20 text-center text-foreground-faint text-sm">
          {labels.strafbuchAlleVergehenBestraft}
        </div>
      )}
      {!hasAny && (
        <div className="bg-surface rounded-2xl border border-border py-20 text-center text-foreground-faint text-sm">
          {labels.strafbuchNoEntries}
        </div>
      )}

      {sections.map((s) => {
        const openRows = openRowsOf(s);
        const display = showAll ? s.rows : openRows;
        if (display.length === 0) return null;
        return (
          <Section key={s.canonical} title={s.title} openCount={openRows.length} totalCount={s.rows.length}>
            {display.map((r) => {
              const judged = closedIds.has(r.refId);
              return (
                <div key={r.refId} className={`px-5 py-3 flex flex-col gap-0.5 ${judged ? "opacity-50" : ""}`}>
                  {r.body(judged)}
                  <JudgmentSlot refId={r.refId} offenseType={STORED_TYPE[s.canonical]} anlass={`${s.title}: ${r.anlass}`} />
                </div>
              );
            })}
          </Section>
        );
      })}

      {hasPunished && (
        <button type="button" onClick={() => setShowAll(v => !v)}
          className="w-full text-xs text-foreground-faint hover:text-foreground-muted transition border border-border rounded-xl px-3 py-2.5">
          {showAll ? labels.strafbuchOffeneAnzeigen : labels.strafbuchAlleAnzeigen}
        </button>
      )}

    </div>
  );
}
