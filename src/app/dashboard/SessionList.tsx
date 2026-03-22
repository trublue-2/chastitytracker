import { getLocale } from "next-intl/server";
import { toDateLocale, formatDuration, formatDate, formatTime, formatDateTime, hasExifMismatch } from "@/lib/utils";
import { KONTROLLE_PILLS } from "@/lib/kontrollePills";
import SessionListClient, { SessionListData } from "./SessionListClient";

interface KontrolleItem {
  time: Date;
  imageUrl: string | null;
  code: string | null;
  deadline: Date | null;
  kommentar: string | null;
  status: string;
  entryId: string | null;
}

interface Entry {
  id: string;
  startTime: Date;
  imageUrl: string | null;
  imageExifTime: Date | null;
  note: string | null;
  orgasmusArt: string | null;
  oeffnenGrund: string | null;
}

interface Pair {
  verschluss: Entry;
  oeffnen: Entry | null;
  active: boolean;
  kontrollen: KontrolleItem[];
}

interface Props {
  pairs: Pair[];
  orgasmusEntries: Entry[];
}

export default async function SessionList({ pairs, orgasmusEntries }: Props) {
  const locale = await getLocale();
  const dl = toDateLocale(locale);

  const sessions: SessionListData[] = pairs.map((pair) => {
    const { verschluss, oeffnen, active, kontrollen } = pair;

    const dateStr = formatDate(verschluss.startTime, dl);
    const timeStr = formatTime(verschluss.startTime, dl);
    const durationStr = oeffnen ? formatDuration(verschluss.startTime, oeffnen.startTime, dl) : null;

    const sessionOrgasmen = orgasmusEntries.filter(
      (e) => e.startTime >= verschluss.startTime && (oeffnen === null || e.startTime < oeffnen.startTime)
    );

    const events = [
      {
        type: "verschluss" as const,
        time: verschluss.startTime,
        dateStr,
        timeStr,
        imageUrl: verschluss.imageUrl,
        exifStr: verschluss.imageExifTime && hasExifMismatch(verschluss.imageExifTime, verschluss.startTime)
          ? formatDateTime(verschluss.imageExifTime, dl)
          : null,
        note: verschluss.note,
        entryId: verschluss.id,
        captureHref: null,
        deadlineStr: null,
        isOverdue: false,
        kontrolleCode: null,
        kontrolleKommentar: null,
        kontrolleStatusLabel: null,
        orgasmusArt: null,
      },
      ...kontrollen
        .filter((k) => k.status !== "withdrawn")
        .map((k) => ({
          type: "kontrolle" as const,
          time: k.time,
          dateStr: formatDate(k.time, dl),
          timeStr: formatTime(k.time, dl),
          imageUrl: k.imageUrl,
          exifStr: null,
          note: null,
          entryId: k.entryId,
          captureHref: !k.entryId && k.code ? `/dashboard/new/pruefung?code=${k.code}` : null,
          deadlineStr: k.deadline ? formatDateTime(k.deadline, dl) : null,
          isOverdue: k.status === "overdue",
          kontrolleCode: k.code,
          kontrolleKommentar: k.kommentar,
          kontrolleStatusLabel: KONTROLLE_PILLS[k.status]?.label ?? null,
          orgasmusArt: null,
        })),
      ...sessionOrgasmen.map((e) => ({
        type: "orgasmus" as const,
        time: e.startTime,
        dateStr: formatDate(e.startTime, dl),
        timeStr: formatTime(e.startTime, dl),
        imageUrl: e.imageUrl,
        exifStr: null,
        note: e.note,
        entryId: e.id,
        captureHref: null,
        deadlineStr: null,
        isOverdue: false,
        kontrolleCode: null,
        kontrolleKommentar: null,
        kontrolleStatusLabel: null,
        orgasmusArt: e.orgasmusArt,
      })),
    ].sort((a, b) => a.time.getTime() - b.time.getTime());

    return {
      id: verschluss.id,
      dateStr,
      timeStr,
      durationStr,
      active,
      thumbnailUrl: verschluss.imageUrl,
      events,
      oeffnen: oeffnen
        ? {
            dateStr: formatDate(oeffnen.startTime, dl),
            timeStr: formatTime(oeffnen.startTime, dl),
            grund: oeffnen.oeffnenGrund,
            note: oeffnen.note,
          }
        : null,
    };
  });

  return <SessionListClient sessions={sessions} />;
}
