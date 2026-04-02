import { formatDuration } from "@/lib/utils";

export interface SessionEvent {
  type: "verschluss" | "kontrolle" | "orgasmus" | "reinigung";
  time: Date;
  imageUrl: string | null;
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
}

type ActivePair = {
  verschluss: { id: string; startTime: Date; imageUrl: string | null; imageExifTime: Date | null; note: string | null };
  kontrollen: {
    entryId: string | null; time: Date; imageUrl: string | null; note: string | null;
    deadline: Date | null; kommentar: string | null; code: string | null;
    anforderungStatus: string | null; verifikationStatus: string | null; submittedAt: Date | null;
  }[];
  interruptions: { oeffnen: { id: string; startTime: Date; note: string | null }; verschluss: { startTime: Date; imageUrl: string | null } }[];
};

type OrgasmusEntry = { id: string; startTime: Date; imageUrl: string | null; note: string | null; orgasmusArt: string | null };

/** Builds the sorted SessionEvent array for the active session timeline. */
export function buildSessionEvents(
  activePair: ActivePair,
  orgasmusEntries: OrgasmusEntry[],
  dl: string
): SessionEvent[] {
  return [
    {
      type: "verschluss" as const,
      time: activePair.verschluss.startTime,
      imageUrl: activePair.verschluss.imageUrl,
      imageExifTime: activePair.verschluss.imageExifTime,
      note: activePair.verschluss.note,
      entryId: activePair.verschluss.id,
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
        orgasmusArt: e.orgasmusArt,
      })),
    ...activePair.interruptions.map(intr => ({
      type: "reinigung" as const,
      time: intr.oeffnen.startTime,
      imageUrl: intr.verschluss.imageUrl,
      imageExifTime: null,
      note: intr.oeffnen.note,
      entryId: intr.oeffnen.id,
      pauseDurationStr: formatDuration(intr.oeffnen.startTime, intr.verschluss.startTime, dl),
    })),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());
}
