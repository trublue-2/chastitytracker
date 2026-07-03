import { getLocale, getTranslations } from "next-intl/server";
import { toDateLocale, formatDuration, formatDate, formatTime, formatDateTime, hasExifMismatch, interruptionPauseMs, APP_TZ, isTimeCorrected, type ReinigungSettings } from "@/lib/utils";
import { getKombinierterPill } from "@/lib/kontrollePills";
import { effectiveOrgasmusArten, effectiveOeffnenGruende, resolveOrgasmusArtDisplay, resolveReasonLabel } from "@/lib/reasonsService";
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
  kontrollCode: string | null;
  verifikationStatus: string | null;
  device?: { name?: string | null; categoryId?: string | null } | null;
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
  /** Whether the user has any devices — gates the "Gerät: —" row on lock entries.
   *  Omitted (e.g. admin view) → no device row. */
  userHasDevices?: boolean;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
  /** Data-owner's per-user reason configs (JSON strings, null = built-in defaults). Govern the
   *  display labels of orgasmusArt / oeffnenGrund codes. Omitted → built-in i18n labels. */
  orgasmusArtenConfig?: string | null;
  oeffnenGruendeConfig?: string | null;
}

export default async function SessionList({ pairs, orgasmusEntries, userHasDevices = false, tz = APP_TZ, orgasmusArtenConfig = null, oeffnenGruendeConfig = null }: Props) {
  const locale = await getLocale();
  const dl = toDateLocale(locale);
  const ta = await getTranslations("admin");
  const tOrgasm = await getTranslations("orgasmForm");
  const tOpen = await getTranslations("openForm");
  const orgasmCfg = effectiveOrgasmusArten(orgasmusArtenConfig);
  const openCfg = effectiveOeffnenGruende(oeffnenGruendeConfig);
  const orgasmLabel = (art: string | null) => resolveOrgasmusArtDisplay(art, orgasmCfg, tOrgasm);
  const openLabel = (grund: string | null) => grund ? resolveReasonLabel(grund, openCfg, "opening", tOpen) : null;

  const sessions: SessionListData[] = pairs.map((pair) => {
    const { verschluss, oeffnen, active, kontrollen } = pair;

    const dateStr = formatDate(verschluss.startTime, dl, tz);
    const timeStr = formatTime(verschluss.startTime, dl, tz);
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
        const s = verschluss.startTime.toLocaleDateString(dl, { day: "numeric", timeZone: tz });
        startAbbrevStr = s.endsWith(".") ? s : s + ".";
      } else if (sYear === eYear) {
        const s = verschluss.startTime.toLocaleDateString(dl, { day: "numeric", month: "numeric", timeZone: tz });
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
        timeIso: verschluss.startTime.toISOString(),
        dateStr,
        timeStr,
        imageUrl: verschluss.imageUrl,
        exifStr: verschluss.imageExifTime && hasExifMismatch(verschluss.imageExifTime, verschluss.startTime)
          ? formatDateTime(verschluss.imageExifTime, dl, tz)
          : null,
        note: verschluss.note,
        entryId: verschluss.id,
        captureHref: null,
        deadlineStr: null,
        isOverdue: false,
        kontrolleCode: verschluss.kontrollCode,
        kontrolleKommentar: null,
        kombiniertePillLabel: null,
        kombiniertePillCls: null,
        orgasmusArt: null,
        timeCorrected: false,
        deviceName: verschluss.device?.name ?? null,
        showDevice: userHasDevices,
      },
      ...kontrollen
        .filter((k) => k.anforderungStatus !== "withdrawn")
        .map((k) => {
          const pill = getKombinierterPill(k.anforderungStatus, k.verifikationStatus, ta);
          const corrected = isTimeCorrected(k.time, k.submittedAt);
          return {
            type: "kontrolle" as const,
            time: k.time,
            timeIso: k.time.toISOString(),
            dateStr: formatDate(k.time, dl, tz),
            timeStr: formatTime(k.time, dl, tz),
            imageUrl: k.imageUrl,
            exifStr: null,
            note: k.note,
            entryId: k.entryId,
            captureHref: !k.entryId && k.code ? `/dashboard/new/pruefung?code=${k.code}` : null,
            deadlineStr: k.deadline ? formatDateTime(k.deadline, dl, tz) : null,
            isOverdue: k.anforderungStatus === "overdue",
            kontrolleCode: k.code,
            kontrolleKommentar: k.kommentar,
            kombiniertePillLabel: pill?.label ?? null,
            kombiniertePillCls: pill?.cls ?? null,
            orgasmusArt: null,
            timeCorrected: corrected,
            timeCorrectedSystemStr: corrected ? formatDateTime(k.submittedAt!, dl, tz) : null,
          };
        }),
      ...sessionOrgasmen.map((e) => ({
        type: "orgasmus" as const,
        time: e.startTime,
        timeIso: e.startTime.toISOString(),
        dateStr: formatDate(e.startTime, dl, tz),
        timeStr: formatTime(e.startTime, dl, tz),
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
        orgasmusArt: orgasmLabel(e.orgasmusArt),
        timeCorrected: false,
      })),
      ...(pair.interruptions ?? []).map((intr) => ({
        type: "reinigung" as const,
        time: intr.oeffnen.startTime,
        timeIso: intr.oeffnen.startTime.toISOString(),
        dateStr: formatDate(intr.oeffnen.startTime, dl, tz),
        timeStr: formatTime(intr.oeffnen.startTime, dl, tz),
        imageUrl: intr.verschluss.imageUrl,
        exifStr: null,
        note: intr.oeffnen.note,
        entryId: intr.oeffnen.id,
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
      sessionStartIso: verschluss.startTime.toISOString(),
      sessionEndIso: oeffnen ? oeffnen.startTime.toISOString() : null,
      oeffnen: oeffnen
        ? {
            dateStr: formatDate(oeffnen.startTime, dl, tz),
            timeStr: formatTime(oeffnen.startTime, dl, tz),
            grundLabel: openLabel(oeffnen.oeffnenGrund),
            note: oeffnen.note,
          }
        : null,
    };
  });

  return <SessionListClient sessions={sessions} />;
}
