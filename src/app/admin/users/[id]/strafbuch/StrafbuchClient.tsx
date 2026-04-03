"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronDown } from "lucide-react";

export interface StrafeRecordData {
  refId: string;
  bestraftDatumStr: string;
  notiz: string | null;
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
  frist: string;
  systemLabel: string;
  givenLabel: string;
  timeCorrected: string;
  fulfilledLabel: string;
  instructionLabel: string;
  strafbuchUnerlaubteOeffnungen: string;
  strafbuchZuSpaet: string;
  strafbuchAbgelehnt: string;
  strafbuchNoEntries: string;
  strafbuchWurdeBestraft: string;
  strafbuchBestraftMarkieren: string;
  strafbuchBestraftDatum: string;
  strafbuchNotiz: string;
  strafbuchBestraftBadge: string;
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
}

interface Props {
  userId: string;
  unerlaubteOeffnungen: UnerlaubteOeffnungRow[];
  zuSpaet: KontrollRow[];
  abgelehnt: KontrollRow[];
  strafeRecords: StrafeRecordData[];
  labels: Labels;
}

function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

const fieldCls = "w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring transition";

export default function StrafbuchClient({ userId, unerlaubteOeffnungen, zuSpaet, abgelehnt, strafeRecords, labels }: Props) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [openFormId, setOpenFormId] = useState<string | null>(null);

  const punishedIds = new Set(strafeRecords.map(r => r.refId));

  const openOeffnungen = unerlaubteOeffnungen.filter(o => !punishedIds.has(o.id));
  const openZuSpaet = zuSpaet.filter(k => !punishedIds.has(k.id));
  const openAbgelehnt = abgelehnt.filter(k => !punishedIds.has(k.id));

  const hasAnyOpen = openOeffnungen.length > 0 || openZuSpaet.length > 0 || openAbgelehnt.length > 0;
  const hasAny = unerlaubteOeffnungen.length > 0 || zuSpaet.length > 0 || abgelehnt.length > 0;
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

  function BestrafenForm({ refId, offenseType }: { refId: string; offenseType: "KONTROLLANFORDERUNG" | "OEFFNEN_ENTRY" }) {
    const [datum, setDatum] = useState(todayLocal());
    const [notiz, setNotiz] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit(e: React.FormEvent) {
      e.preventDefault();
      setSaving(true);
      setError("");
      const res = await fetch("/api/admin/strafe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, offenseType, refId, bestraftDatum: datum, notiz }),
      });
      setSaving(false);
      if (res.ok) {
        setOpenFormId(null);
        router.refresh();
      } else {
        const d = await res.json();
        setError(d.error || "Fehler");
      }
    }

    return (
      <form onSubmit={submit} className="mt-2 bg-surface-raised rounded-xl border border-border p-3 flex flex-col gap-2">
        <div>
          <label className="block text-xs text-foreground-faint mb-1">{labels.strafbuchBestraftDatum}</label>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)} required className={fieldCls} />
        </div>
        <div>
          <label className="block text-xs text-foreground-faint mb-1">{labels.strafbuchNotiz}</label>
          <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} className={`${fieldCls} resize-none`} />
        </div>
        {error && <p className="text-xs text-warn">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setOpenFormId(null)}
            className="text-xs text-foreground-faint hover:text-foreground-muted transition px-3 py-1.5 rounded-lg border border-border">
            {labels.strafbuchAbbrechen}
          </button>
          <button type="submit" disabled={saving}
            className="text-xs font-semibold bg-[var(--color-ok)] text-white px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1 transition hover:opacity-90">
            <CheckCircle size={12} />
            {saving ? "…" : labels.strafbuchBestraftMarkieren}
          </button>
        </div>
      </form>
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

  function PunishedBadge({ refId }: { refId: string }) {
    const record = strafeRecords.find(r => r.refId === refId);
    if (!record) return null;
    return (
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-[var(--color-ok)] border border-[var(--color-ok)] px-2 py-0.5 rounded-lg flex items-center gap-1">
          <CheckCircle size={10} /> {labels.strafbuchBestraftBadge} {record.bestraftDatumStr}
        </span>
        {record.notiz && <span className="text-xs text-foreground-faint italic">„{record.notiz}"</span>}
        <button type="button" onClick={() => handleUndo(refId)}
          className="text-xs text-foreground-faint underline hover:text-warn transition ml-auto">
          {labels.strafbuchRueckgaengig}
        </button>
      </div>
    );
  }

  function WurdeBestraftButton({ refId, offenseType }: { refId: string; offenseType: "KONTROLLANFORDERUNG" | "OEFFNEN_ENTRY" }) {
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
            const punished = punishedIds.has(o.id);
            const qualifier = o.sperrzetUnbefristet
              ? labels.strafbuchTrotzUnbefristet
              : o.sperrzetEndetAtStr
                ? `${labels.strafbuchSperreLiefBis} ${o.sperrzetEndetAtStr}`
                : null;
            return (
              <div key={o.id} className={`px-5 py-3 flex flex-col gap-0.5 ${punished ? "opacity-50" : ""}`}>
                <p className={`text-sm font-semibold text-foreground ${punished ? "line-through" : ""}`}>
                  {labels.strafbuchGeoeffnetAm} {o.startTimeStr}
                  {qualifier && (
                    <> — <span className="text-warn font-normal">{qualifier}</span></>
                  )}
                </p>
                {o.note && <span className="text-xs text-foreground-faint italic">„{o.note}"</span>}
                {punished ? <PunishedBadge refId={o.id} /> : <WurdeBestraftButton refId={o.id} offenseType="OEFFNEN_ENTRY" />}
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
            const punished = punishedIds.has(k.id);
            return (
              <div key={k.id} className={`px-5 py-3 flex flex-col gap-0.5 ${punished ? "opacity-50" : ""}`}>
                <p className={`text-sm font-semibold text-foreground ${punished ? "line-through" : ""}`}>
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
                {punished ? <PunishedBadge refId={k.id} /> : <WurdeBestraftButton refId={k.id} offenseType="KONTROLLANFORDERUNG" />}
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
            const punished = punishedIds.has(k.id);
            return (
              <div key={k.id} className={`px-5 py-3 flex flex-col gap-0.5 ${punished ? "opacity-50" : ""}`}>
                <p className={`text-sm font-semibold text-foreground ${punished ? "line-through" : ""}`}>
                  <span className="font-mono text-[var(--color-inspect)]">{labels.strafbuchKontrollePrefix} {k.code}</span>
                  {" — "}
                  <span className="text-warn font-normal">
                    {labels.strafbuchAbgelehntAm} {k.entryStartTimeStr ?? k.deadlineStr}
                  </span>
                </p>
                <p className="text-xs text-foreground-faint">{labels.frist}: {k.deadlineStr}</p>
                {k.entryNote && <span className="text-xs text-foreground-faint italic">{labels.strafbuchAblehnungsgrund}: „{k.entryNote}"</span>}
                {k.kommentar && <span className="text-xs text-foreground-faint italic">{labels.instructionLabel}: {k.kommentar}</span>}
                {punished ? <PunishedBadge refId={k.id} /> : <WurdeBestraftButton refId={k.id} offenseType="KONTROLLANFORDERUNG" />}
              </div>
            );
          })}
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
