import { getLocale } from "next-intl/server";
import { toDateLocale, formatDuration, APP_TZ } from "@/lib/utils";
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

    const dateStr = verschluss.startTime.toLocaleDateString(dl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: APP_TZ });
    const timeStr = verschluss.startTime.toLocaleTimeString(dl, { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ });
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
        exifStr: (() => {
          if (!verschluss.imageExifTime) return null;
          const diff = Math.abs(verschluss.imageExifTime.getTime() - verschluss.startTime.getTime());
          return diff > 3_600_000
            ? verschluss.imageExifTime.toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })
            : null;
        })(),
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
          dateStr: k.time.toLocaleDateString(dl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: APP_TZ }),
          timeStr: k.time.toLocaleTimeString(dl, { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }),
          imageUrl: k.imageUrl,
          exifStr: null,
          note: null,
          entryId: k.entryId,
          captureHref: !k.entryId && k.code ? `/dashboard/new/pruefung?code=${k.code}` : null,
          deadlineStr: k.deadline
            ? k.deadline.toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })
            : null,
          isOverdue: k.status === "overdue",
          kontrolleCode: k.code,
          kontrolleKommentar: k.kommentar,
          kontrolleStatusLabel: KONTROLLE_PILLS[k.status]?.label ?? null,
          orgasmusArt: null,
        })),
      ...sessionOrgasmen.map((e) => ({
        type: "orgasmus" as const,
        time: e.startTime,
        dateStr: e.startTime.toLocaleDateString(dl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: APP_TZ }),
        timeStr: e.startTime.toLocaleTimeString(dl, { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }),
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
            dateStr: oeffnen.startTime.toLocaleDateString(dl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: APP_TZ }),
            timeStr: oeffnen.startTime.toLocaleTimeString(dl, { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }),
            grund: oeffnen.oeffnenGrund,
            note: oeffnen.note,
          }
        : null,
    };
  });

  return <SessionListClient sessions={sessions} />;
}
