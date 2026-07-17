import { formatDuration, buildLockPoints, wornDeviceNameAt } from "@/lib/utils";

export interface SessionEvent {
  type: "verschluss" | "kontrolle" | "orgasmus" | "reinigung";
  time: Date;
  imageUrl: string | null;
  /** Bildersafe (VERSCHLUSS): versiegeltes Schlüsselbox-Code-Foto. Sichtbarkeit entscheidet der Server (403-Gate). */
  codeImageUrl?: string | null;
  imageExifTime: Date | null;
  note: string | null;
  entryId: string | null;
  deadline?: Date | null;
  kontrolleKommentar?: string | null;
  kontrolleCode?: string | null;
  kontrolleAnforderungStatus?: string | null;
  kontrolleVerifikationStatus?: string | null;
  orgasmusArt?: string | null;
  pauseDurationStr?: string | null;
  submittedAt?: Date | null;
  /** KONTROLLE: getragenes Gerät zum Kontroll-Zeitpunkt (re-lock-bewusst). */
  deviceName?: string | null;
}

type LockRef = { name?: string | null };
type ActivePair = {
  verschluss: { id: string; startTime: Date; imageUrl: string | null; codeImageUrl?: string | null; imageExifTime: Date | null; note: string | null; kontrollCode: string | null; device?: LockRef | null };
  kontrollen: {
    entryId: string | null; time: Date; imageUrl: string | null; note: string | null;
    deadline: Date | null; kommentar: string | null; code: string | null;
    anforderungStatus: string | null; verifikationStatus: string | null; submittedAt: Date | null;
  }[];
  interruptions: { oeffnen: { id: string; startTime: Date; note: string | null }; verschluss: { startTime: Date; imageUrl: string | null; codeImageUrl?: string | null; device?: LockRef | null } }[];
};

type OrgasmusEntry = { id: string; startTime: Date; imageUrl: string | null; note: string | null; orgasmusArt: string | null };

/** Builds the sorted SessionEvent array for the active session timeline.
 *  `resolveOrgasmus` maps a stored orgasmusArt code (+ optional detail suffix) to its owner-config
 *  display label; omitted → the raw stored value is shown (built-in-compatible). */
export function buildSessionEvents(
  activePair: ActivePair,
  orgasmusEntries: OrgasmusEntry[],
  dl: string,
  resolveOrgasmus?: (art: string | null) => string | null,
): SessionEvent[] {
  // (Wieder-)Verschluss-Zeitpunkte mit Gerät — für das getragene Gerät je Kontrolle (re-lock-bewusst).
  const lockPoints = buildLockPoints(activePair);
  return [
    {
      type: "verschluss" as const,
      time: activePair.verschluss.startTime,
      imageUrl: activePair.verschluss.imageUrl,
      codeImageUrl: activePair.verschluss.codeImageUrl ?? null,
      imageExifTime: activePair.verschluss.imageExifTime,
      note: activePair.verschluss.note,
      entryId: activePair.verschluss.id,
      kontrolleCode: activePair.verschluss.kontrollCode,
      deviceName: activePair.verschluss.device?.name ?? null,
    },
    ...activePair.kontrollen
      .filter(k => k.entryId !== null)
      .map(k => ({
        type: "kontrolle" as const,
        time: k.time,
        imageUrl: k.imageUrl,
        imageExifTime: null,
        note: k.note,
        entryId: k.entryId,
        deadline: k.deadline,
        kontrolleKommentar: k.kommentar,
        kontrolleCode: k.code,
        kontrolleAnforderungStatus: k.anforderungStatus,
        kontrolleVerifikationStatus: k.verifikationStatus,
        submittedAt: k.submittedAt,
        deviceName: wornDeviceNameAt(lockPoints, k.time),
      })),
    ...orgasmusEntries
      .filter(e => e.startTime >= activePair.verschluss.startTime)
      .map(e => ({
        type: "orgasmus" as const,
        time: e.startTime,
        imageUrl: e.imageUrl,
        imageExifTime: null,
        note: e.note,
        entryId: e.id,
        orgasmusArt: resolveOrgasmus ? resolveOrgasmus(e.orgasmusArt) : e.orgasmusArt,
      })),
    ...activePair.interruptions.map(intr => ({
      type: "reinigung" as const,
      time: intr.oeffnen.startTime,
      imageUrl: intr.verschluss.imageUrl,
      codeImageUrl: intr.verschluss.codeImageUrl ?? null,
      imageExifTime: null,
      note: intr.oeffnen.note,
      entryId: intr.oeffnen.id,
      pauseDurationStr: formatDuration(intr.oeffnen.startTime, intr.verschluss.startTime, dl),
    })),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());
}
