import { getLocale, getTranslations } from "next-intl/server";
import { toDateLocale, formatDuration, formatDate, formatTime, formatDateTime, hasExifMismatch, interruptionPauseMs, APP_TZ, type ReinigungSettings } from "@/lib/utils";
import { getKombinierterPill } from "@/lib/kontrollePills";
import SessionListClient, { SessionListData } from "./SessionListClient";

interface KontrolleItem {
  time: Date;
  imageUrl: string | null;
  code: string | null;
  deadline: Date | null;
  kommentar: string | null;
  note: string | null;
  anforderungStatus: string | null;
  verifikationStatus: string | null;
  entryId: string | null;
  submittedAt: Date | null;
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
  interruptions?: { oeffnen: Entry; verschluss: Entry }[];
}

interface Props {
  pairs: Pair[];
  orgasmusEntries: Entry[];
}

export default async function SessionList({ pairs, orgasmusEntries }: Props) {
  const locale = await getLocale();
  const dl = toDateLocale(locale);
  const ta = await getTranslations("admin");

  const sessions: SessionListData[] = pairs.map((pair) => {
    const { verschluss, oeffnen, active, kontrollen } = pair;

    const dateStr = formatDate(verschluss.startTime, dl);
    const timeStr = formatTime(verschluss.startTime, dl);
    const pauseMs = interruptionPauseMs(pair.interruptions ?? []);
    const durationMs = oeffnen ? oeffnen.startTime.getTime() - verschluss.startTime.getTime() - pauseMs : null;
    const durationStr = durationMs !== null
      ? formatDuration(new Date(0), new Date(durationMs), dl)
      : null;
    const durationUnder24h = durationMs !== null && durationMs < 24 * 60 * 60 * 1000;

    let startAbbrevStr: string | null = null;
    if (!durationUnder24h && oeffnen) {
      const sYear = verschluss.startTime.getFullYear();
      const eYear = oeffnen.startTime.getFullYear();
      const sMonth = verschluss.startTime.getMonth();
      const eMonth = oeffnen.startTime.getMonth();
      if (sYear === eYear && sMonth === eMonth) {
        const s = verschluss.startTime.toLocaleDateString(dl, { day: "numeric", timeZone: APP_TZ });
        startAbbrevStr = s.endsWith(".") ? s : s + ".";
      } else if (sYear === eYear) {
        const s = verschluss.startTime.toLocaleDateString(dl, { day: "numeric", month: "numeric", timeZone: APP_TZ });
        startAbbrevStr = s.endsWith(".") ? s : s + ".";
      }
      // different year: null → use full dateStr
    }

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
        kombiniertePillLabel: null,
        kombiniertePillCls: null,
        orgasmusArt: null,
        timeCorrected: false,
      },
      ...kontrollen
        .filter((k) => k.anforderungStatus !== "withdrawn")
        .map((k) => ({
          type: "kontrolle" as const,
          time: k.time,
          dateStr: formatDate(k.time, dl),
          timeStr: formatTime(k.time, dl),
          imageUrl: k.imageUrl,
          exifStr: null,
          note: k.note,
          entryId: k.entryId,
          captureHref: !k.entryId && k.code ? `/dashboard/new/pruefung?code=${k.code}` : null,
          deadlineStr: k.deadline ? formatDateTime(k.deadline, dl) : null,
          isOverdue: k.anforderungStatus === "overdue",
          kontrolleCode: k.code,
          kontrolleKommentar: k.kommentar,
          kombiniertePillLabel: getKombinierterPill(k.anforderungStatus, k.verifikationStatus, ta)?.label ?? null,
          kombiniertePillCls: getKombinierterPill(k.anforderungStatus, k.verifikationStatus, ta)?.cls ?? null,
          orgasmusArt: null,
          timeCorrected: !!(k.submittedAt && k.time.getTime() < k.submittedAt.getTime() - 60_000),
          timeCorrectedSystemStr: k.submittedAt && k.time.getTime() < k.submittedAt.getTime() - 60_000
            ? formatDateTime(k.submittedAt, dl) : null,
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
        kombiniertePillLabel: null,
        kombiniertePillCls: null,
        orgasmusArt: e.orgasmusArt,
        timeCorrected: false,
      })),
      ...(pair.interruptions ?? []).map((intr) => ({
        type: "reinigung" as const,
        time: intr.oeffnen.startTime,
        dateStr: formatDate(intr.oeffnen.startTime, dl),
        timeStr: formatTime(intr.oeffnen.startTime, dl),
        imageUrl: null,
        exifStr: null,
        note: intr.oeffnen.note,
        entryId: null,
        captureHref: null,
        deadlineStr: null,
        isOverdue: false,
        kontrolleCode: null,
        kontrolleKommentar: null,
        kombiniertePillLabel: null,
        kombiniertePillCls: null,
        orgasmusArt: null,
        timeCorrected: false,
        pauseDurationStr: formatDuration(intr.oeffnen.startTime, intr.verschluss.startTime, dl),
      })),
    ].sort((a, b) => a.time.getTime() - b.time.getTime());

    return {
      id: verschluss.id,
      dateStr,
      timeStr,
      durationUnder24h,
      durationStr,
      active,
      thumbnailUrl: verschluss.imageUrl,
      events,
      startAbbrevStr,
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
