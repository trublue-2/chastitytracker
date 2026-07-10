"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronDown, XCircle } from "lucide-react";
import { parseApiError } from "@/lib/apiClient";

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
  sperrzetEndetAtStr: string | null;
  sperrzetUnbefristet: boolean;
}

export interface KontrollRow {
  id: string;
  code: string;
  deadlineStr: string;
  fulfilledAtStr: string | null;
  entryStartTimeStr: string | null;
  backdated: boolean;
  kommentar: string | null;
  entryNote: string | null;
}

interface Labels {
  /** Generische Fehlermeldung, wenn die API keine eigene liefert (common.error). */
  errorFallback: string;
  /** Meldung bei Netzwerkfehler (common.networkError). */
  networkError: string;
  frist: string;
  systemLabel: string;
  givenLabel: string;
  timeCorrected: string;
  fulfilledLabel: string;
  instructionLabel: string;
  strafbuchUnerlaubteOeffnungen: string;
  strafbuchZuSpaet: string;
  strafbuchAbgelehnt: string;
  strafbuchAutoEntfernt: string;
  strafbuchAutoEntferntAm: string;
  strafbuchNoEntries: string;
  strafbuchWurdeBestraft: string;
  strafbuchAbbrechen: string;
  strafbuchRueckgaengig: string;
  strafbuchGeoeffnetAm: string;
  strafbuchTrotzUnbefristet: string;
  strafbuchSperreLiefBis: string;
  strafbuchKontrollePrefix: string;
  strafbuchEingereicht: string;
  strafbuchFristWar: string;
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
}

interface Props {
  userId: string;
  unerlaubteOeffnungen: UnerlaubteOeffnungRow[];
  zuSpaet: KontrollRow[];
  abgelehnt: KontrollRow[];
  autoEntfernt: KontrollRow[];
  reinigungLimitVergehen: ReinigungLimitRow[];
  strafeRecords: StrafeRecordData[];
  labels: Labels;
}

const fieldCls ="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring transition";

export default function StrafbuchClient({ userId, unerlaubteOeffnungen, zuSpaet, abgelehnt, autoEntfernt, reinigungLimitVergehen, strafeRecords, labels }: Props) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [openDismissId, setOpenDismissId] = useState<string | null>(null);

  // Urteils-Lebenszyklus: bestraft (PUNISHED, offen→erledigt) | verworfen (DISMISSED) | offen (kein Record).
  // „closed" = verworfen ODER bestraft & erledigt. Eine bestrafte, noch nicht erledigte Strafe bleibt relevant.
  const punishedIds = new Set(strafeRecords.filter(r => r.status === "PUNISHED").map(r => r.refId));
  const dismissedIds = new Set(strafeRecords.filter(r => r.status === "DISMISSED").map(r => r.refId));
  const closedIds = new Set(strafeRecords.filter(r => r.status === "DISMISSED" || (r.status === "PUNISHED" && r.done)).map(r => r.refId));

  const openOeffnungen = unerlaubteOeffnungen.filter(o => !closedIds.has(o.id));
  const openZuSpaet = zuSpaet.filter(k => !closedIds.has(k.id));
  const openAbgelehnt = abgelehnt.filter(k => !closedIds.has(k.id));
  const openAutoEntfernt = autoEntfernt.filter(k => !closedIds.has(k.id));

  const hasAnyOpen = openOeffnungen.length > 0 || openZuSpaet.length > 0 || openAbgelehnt.length > 0 || openAutoEntfernt.length > 0;
  const hasAny = unerlaubteOeffnungen.length > 0 || zuSpaet.length > 0 || abgelehnt.length > 0 || autoEntfernt.length > 0 || reinigungLimitVergehen.length > 0;
  const hasPunished = strafeRecords.filter(r => r.refId && !reinigungLimitVergehen.some(rl => rl.entryId === r.refId)).length > 0;

  type OffenseType = "KONTROLLANFORDERUNG" | "OEFFNEN_ENTRY" | "REINIGUNG_LIMIT" | "AUTO_ENTFERNT";

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
    refId: string; offenseType: OffenseType; status: "PUNISHED" | "DISMISSED";
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

  function BestrafenForm({ refId, offenseType }: { refId: string; offenseType: OffenseType }) {
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
    const aiJudged = record.judgedBy === "ai";
    return (
      <div className="mt-1.5 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-warn border border-warn px-2 py-0.5 rounded-lg flex items-center gap-1">
            {labels.strafbuchStrafeBadge}{record.reason ? `: ${record.reason}` : ""}
          </span>
          {aiJudged && <span className="text-xs text-foreground-faint">{labels.strafbuchUrteilKI}</span>}
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
    const aiJudged = record.judgedBy === "ai";
    return (
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-foreground-faint border border-border px-2 py-0.5 rounded-lg flex items-center gap-1">
          <XCircle size={10} /> {labels.strafbuchVerworfenBadge}
        </span>
        {aiJudged && <span className="text-xs text-foreground-faint">{labels.strafbuchUrteilKI}</span>}
        {record.reason && <span className="text-xs text-foreground-faint italic">„{record.reason}"</span>}
        <button type="button" onClick={() => handleUndo(refId)}
          className="text-xs text-foreground-faint underline hover:text-warn transition ml-auto">
          {labels.strafbuchRueckgaengig}
        </button>
      </div>
    );
  }

  function VerwerfenForm({ refId, offenseType }: { refId: string; offenseType: OffenseType }) {
    return (
      <JudgmentForm refId={refId} offenseType={offenseType} status="DISMISSED"
        label={labels.strafbuchBegruendung}
        submitLabel={labels.strafbuchVerwerfen} submitIcon={<XCircle size={12} />}
        submitClass="bg-foreground-faint" onClose={() => setOpenDismissId(null)} />
    );
  }

  function VerwerfenButton({ refId, offenseType }: { refId: string; offenseType: OffenseType }) {
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

  /** 3-Wege-Urteilsslot: bestraft → PunishedBadge, verworfen → DismissedBadge, offen → Aktionen. */
  function JudgmentSlot({ refId, offenseType }: { refId: string; offenseType: OffenseType }) {
    if (punishedIds.has(refId)) return <PunishedBadge refId={refId} />;
    if (dismissedIds.has(refId)) return <DismissedBadge refId={refId} />;
    return (
      <div className="flex flex-wrap items-start gap-2">
        <WurdeBestraftButton refId={refId} offenseType={offenseType} />
        <VerwerfenButton refId={refId} offenseType={offenseType} />
      </div>
    );
  }

  function WurdeBestraftButton({ refId, offenseType }: { refId: string; offenseType: OffenseType }) {
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

  const oeffnungDisplay = showAll ? unerlaubteOeffnungen : openOeffnungen;
  const zuSpaetDisplay  = showAll ? zuSpaet : openZuSpaet;
  const abgelehntDisplay = showAll ? abgelehnt : openAbgelehnt;
  const autoEntferntDisplay = showAll ? autoEntfernt : openAutoEntfernt;
  // Reinigung-Limit offenses are auto-logged — always shown (no open/closed split)
  const reinigungDisplay = reinigungLimitVergehen;

  return (
    <div className="flex flex-col gap-6">

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

      {oeffnungDisplay.length > 0 && (
        <Section title={labels.strafbuchUnerlaubteOeffnungen}
          openCount={openOeffnungen.length}
          totalCount={unerlaubteOeffnungen.length}>
          {oeffnungDisplay.map((o) => {
            const judged = closedIds.has(o.id);
            const qualifier = o.sperrzetUnbefristet
              ? labels.strafbuchTrotzUnbefristet
              : o.sperrzetEndetAtStr
                ? `${labels.strafbuchSperreLiefBis} ${o.sperrzetEndetAtStr}`
                : null;
            return (
              <div key={o.id} className={`px-5 py-3 flex flex-col gap-0.5 ${judged ? "opacity-50" : ""}`}>
                <p className={`text-sm font-semibold text-foreground ${judged ? "line-through" : ""}`}>
                  {labels.strafbuchGeoeffnetAm} {o.startTimeStr}
                  {qualifier && (
                    <> — <span className="text-warn font-normal">{qualifier}</span></>
                  )}
                </p>
                {o.note && <span className="text-xs text-foreground-faint italic">„{o.note}"</span>}
                <JudgmentSlot refId={o.id} offenseType="OEFFNEN_ENTRY" />
              </div>
            );
          })}
        </Section>
      )}

      {zuSpaetDisplay.length > 0 && (
        <Section title={labels.strafbuchZuSpaet}
          openCount={openZuSpaet.length}
          totalCount={zuSpaet.length}>
          {zuSpaetDisplay.map((k) => {
            const judged = closedIds.has(k.id);
            return (
              <div key={k.id} className={`px-5 py-3 flex flex-col gap-0.5 ${judged ? "opacity-50" : ""}`}>
                <p className={`text-sm font-semibold text-foreground ${judged ? "line-through" : ""}`}>
                  <span className="font-mono text-[var(--color-inspect)]">{labels.strafbuchKontrollePrefix} {k.code}</span>
                  {" — "}
                  <span className="text-warn font-normal">
                    {labels.strafbuchEingereicht} {k.fulfilledAtStr}
                    {k.backdated && k.entryStartTimeStr && (
                      <> ({labels.strafbuchVordatiert} {k.entryStartTimeStr})</>
                    )}
                  </span>
                </p>
                <p className="text-xs text-foreground-faint">
                  {labels.strafbuchFristWar} {k.deadlineStr}
                </p>
                {k.kommentar && <span className="text-xs text-foreground-faint italic">{labels.instructionLabel}: {k.kommentar}</span>}
                <JudgmentSlot refId={k.id} offenseType="KONTROLLANFORDERUNG" />
              </div>
            );
          })}
        </Section>
      )}

      {abgelehntDisplay.length > 0 && (
        <Section title={labels.strafbuchAbgelehnt}
          openCount={openAbgelehnt.length}
          totalCount={abgelehnt.length}>
          {abgelehntDisplay.map((k) => {
            const judged = closedIds.has(k.id);
            return (
              <div key={k.id} className={`px-5 py-3 flex flex-col gap-0.5 ${judged ? "opacity-50" : ""}`}>
                <p className={`text-sm font-semibold text-foreground ${judged ? "line-through" : ""}`}>
                  <span className="font-mono text-[var(--color-inspect)]">{labels.strafbuchKontrollePrefix} {k.code}</span>
                  {" — "}
                  <span className="text-warn font-normal">
                    {labels.strafbuchAbgelehntAm} {k.entryStartTimeStr ?? k.deadlineStr}
                  </span>
                </p>
                <p className="text-xs text-foreground-faint">{labels.frist}: {k.deadlineStr}</p>
                {k.entryNote && <span className="text-xs text-foreground-faint italic">{labels.strafbuchAblehnungsgrund}: „{k.entryNote}"</span>}
                {k.kommentar && <span className="text-xs text-foreground-faint italic">{labels.instructionLabel}: {k.kommentar}</span>}
                <JudgmentSlot refId={k.id} offenseType="KONTROLLANFORDERUNG" />
              </div>
            );
          })}
        </Section>
      )}

      {autoEntferntDisplay.length > 0 && (
        <Section title={labels.strafbuchAutoEntfernt}
          openCount={openAutoEntfernt.length}
          totalCount={autoEntfernt.length}>
          {autoEntferntDisplay.map((k) => {
            const judged = closedIds.has(k.id);
            return (
              <div key={k.id} className={`px-5 py-3 flex flex-col gap-0.5 ${judged ? "opacity-50" : ""}`}>
                <p className={`text-sm font-semibold text-foreground ${judged ? "line-through" : ""}`}>
                  <span className="font-mono text-[var(--color-inspect)]">{labels.strafbuchKontrollePrefix} {k.code}</span>
                  {" — "}
                  <span className="text-warn font-normal">
                    {labels.strafbuchAutoEntferntAm} {k.entryStartTimeStr ?? k.deadlineStr}
                  </span>
                </p>
                <p className="text-xs text-foreground-faint">{labels.frist}: {k.deadlineStr}</p>
                {k.kommentar && <span className="text-xs text-foreground-faint italic">{labels.instructionLabel}: {k.kommentar}</span>}
                <JudgmentSlot refId={k.id} offenseType="AUTO_ENTFERNT" />
              </div>
            );
          })}
        </Section>
      )}

      {reinigungDisplay.length > 0 && (
        <Section title={labels.strafbuchReinigungLimit}
          openCount={reinigungDisplay.length}
          totalCount={reinigungDisplay.length}>
          {reinigungDisplay.map((r) => (
            <div key={r.entryId} className="px-5 py-3 flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-foreground">
                {labels.strafbuchReinigungLimitDate} {r.startTimeStr}
              </p>
              {r.note && <span className="text-xs text-foreground-faint italic">„{r.note}"</span>}
              <div className="mt-1.5">
                <span className="text-xs font-semibold text-warn border border-warn px-2 py-0.5 rounded-lg">
                  ⚠ {labels.strafbuchReinigungLimit}
                </span>
              </div>
              <div className="mt-1">
                <button type="button" onClick={() => handleUndo(r.entryId)}
                  className="text-xs text-foreground-faint underline hover:text-warn transition">
                  {labels.strafbuchRueckgaengig}
                </button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {hasPunished && (
        <button type="button" onClick={() => setShowAll(v => !v)}
          className="w-full text-xs text-foreground-faint hover:text-foreground-muted transition border border-border rounded-xl px-3 py-2.5">
          {showAll ? labels.strafbuchOffeneAnzeigen : labels.strafbuchAlleAnzeigen}
        </button>
      )}

    </div>
  );
}
