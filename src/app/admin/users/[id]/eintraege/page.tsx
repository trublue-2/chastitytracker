import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { effectiveOrgasmusArten, effectiveOeffnenGruende, resolveOrgasmusArtDisplay, resolveReasonLabel } from "@/lib/reasonsService";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { weightTrackingEnabled } from "@/lib/constants";
import { loadWeightRows } from "@/lib/weightRows";
import { weightText, type UnitSystem } from "@/lib/weight";
import EntryRow from "@/app/components/EntryRow";
import { entryInspectionPill, INSPECTION_PILL_SELECT } from "@/lib/kontrollePills";
import DayGroups from "@/app/components/DayGroups";
import ListPagerLinks from "@/app/components/ListPagerLinks";
import WeightRow from "@/app/components/WeightRow";
import WeightRowActions from "@/app/admin/WeightRowActions";
import EntryActions from "@/app/dashboard/EntryActions";

const PAGE_SIZE = 100;

export default async function AdminUserEintraegePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { userId: actorId } = await assertKeyholderOrAdmin(id);
  const { page: pageStr } = await searchParams;
  const page = Math.max(0, parseInt(pageStr ?? "0", 10) || 0);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");
  const tz = user.timezone;

  const [locale, t, tStats, tOrgasm, tOpen, tWeight, ta] = await Promise.all([
    getLocale(),
    getTranslations("common"),
    getTranslations("stats"),
    getTranslations("orgasmForm"),
    getTranslations("openForm"),
    getTranslations("weightList"),
    getTranslations("admin"),
  ]);
  const dl = toDateLocale(locale);
  const now = new Date();
  const orgasmCfg = effectiveOrgasmusArten(user.orgasmusArtenConfig);
  const openCfg = effectiveOeffnenGruende(user.oeffnenGruendeConfig);

  const weightOn = weightTrackingEnabled() && user.weightTrackingEnabled;

  const [total, entries, actor, weightTotal, previousPageOldest] = await Promise.all([
    prisma.entry.count({ where: { userId: id } }),
    prisma.entry.findMany({
      where: { userId: id },
      orderBy: { startTime: "desc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        device: { select: { category: { select: { name: true, color: true, icon: true, isBuiltIn: true } } } },
        // Ohne die Anforderung hiesse jede Kontrolle „Selbstkontrolle", auch die angeforderte.
        kontrollAnforderung: { select: INSPECTION_PILL_SELECT },
      },
    }),
    // Die Anzeige-Einheit DER KEYHOLDERIN: die Gewichts-Zeilen stehen in ihrer Einheit, nicht in
    // der des Trägers (docs/gewicht-konzept.md, Abschnitt 2). Führt die Instanz das Feature nicht,
    // wird gar nicht gefragt.
    weightOn
      ? prisma.user.findUnique({ where: { id: actorId }, select: { unitSystem: true } })
      : Promise.resolve(null),
    // Eigener Zähler, weil die Wiegungen NICHT in `total` stecken: die Seitengrenzen sind die der
    // Einträge (Begründung unten), und dieselbe Zahl für beides zu nehmen hiesse, entweder die
    // Seiten falsch zu rechnen oder mehr Zeilen zu zeigen, als der Kopf ankündigt.
    weightOn ? prisma.weightEntry.count({ where: { userId: id } }) : Promise.resolve(0),
    // Der älteste Eintrag der VORIGEN Seite — die obere Grenze des Wiege-Fensters (Begründung
    // unten). Hängt nur an `page`, nicht an den geladenen Einträgen, und geht deshalb hier mit
    // statt in einem eigenen Roundtrip danach.
    weightOn && page > 0
      ? prisma.entry.findFirst({
          where: { userId: id },
          orderBy: { startTime: "desc" },
          skip: page * PAGE_SIZE - 1,
          select: { startTime: true },
        })
      : Promise.resolve(null),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /**
   * Die Wiegungen der Seite — eingemischt, nicht angehängt: sie gehören in denselben Tagesverlauf
   * wie Verschluss, Öffnung und Kontrolle.
   *
   * Das Fenster spannen die EINTRÄGE auf, nicht ein eigener `skip`/`take`. Eine zweite Paginierung
   * über eine zweite Tabelle müsste beide Zählungen zusammenrechnen, um zu wissen, wo Seite drei
   * beginnt — hier bleiben die Seitengrenzen die der Einträge, und die Messungen fallen dazwischen.
   *
   * Die OBERE Grenze ist der älteste Eintrag der VORIGEN Seite, ausschliessend — nicht der jüngste
   * dieser Seite. Der Unterschied ist eine Lücke: zwischen dem letzten Eintrag von Seite eins und
   * dem ersten von Seite zwei liegt eine Spanne, die zu keiner der beiden Seiten gehörte, und jede
   * dort gemessene Wiegung wäre in der Liste schlicht nicht auffindbar gewesen. So schliesst
   * `[ältester dieser Seite, ältester der vorigen Seite)` lückenlos an die Nachbarseite an.
   * Nach oben (erste Seite) und nach unten (letzte Seite) bleibt das Fenster offen, sonst fehlten
   * die Wiegungen jenseits des jüngsten und ältesten Eintrags überhaupt.
   */
  const showWeightRows = weightOn && (entries.length > 0 || page === 0);
  const weightRows = showWeightRows
    ? await loadWeightRows(id, {
        from: page >= totalPages - 1 ? undefined : entries.at(-1)?.startTime,
        before: previousPageOldest?.startTime,
      })
    : [];
  const unitSystem = ((actor?.unitSystem ?? "metric") as UnitSystem);
  const unitLabel = unitSystem === "imperial" ? t("unitLbs") : t("unitKg");
  const base = `/admin/users/${id}/eintraege`;

  // Beide Sorten auf EINER Zeitachse. Die Zeilen tragen ihren `key` selbst, deshalb reicht hier der
  // Zeitstempel zum Sortieren — die Sortierung ist die einzige Gemeinsamkeit, die beide brauchen.
  const rows: { at: Date; node: React.ReactNode }[] = [
    ...entries.map((e) => ({
      at: e.startTime,
      node: (
        <EntryRow
          key={e.id}
          timeOnly
          entry={{
            ...e,
            category: e.device?.category && !e.device.category.isBuiltIn
              ? { name: e.device.category.name, color: e.device.category.color, icon: e.device.category.icon }
              : null,
          }}
          locale={dl}
          tz={tz}
          orgasmusLabel={resolveOrgasmusArtDisplay(e.orgasmusArt, orgasmCfg, tOrgasm)}
          openingLabel={e.oeffnenGrund ? resolveReasonLabel(e.oeffnenGrund, openCfg, "opening", tOpen) : null}
          inspectionPill={entryInspectionPill(e, ta, now)}
          actions={<EntryActions id={e.id} editHref={`/dashboard/edit/${e.id}?from=admin&userId=${id}`} tz={tz} />}
        />
      ),
    })),
    ...weightRows.map((w) => ({
      at: w.measuredAt,
      node: (
        <WeightRow
          key={w.id}
          timeOnly
          row={w}
          locale={dl}
          tz={tz}
          unitSystem={unitSystem}
          // Löschen gibt es NUR hier, nicht in seiner Statistik: der Träger korrigiert eigene
          // Zeilen nicht selbst (dieselbe Trennung wie bei den Einträgen).
          actions={
            <WeightRowActions
              id={w.id}
              label={`${formatDateTime(w.measuredAt, dl, tz)} · ${weightText(w.weightKg, unitSystem, dl)} ${unitLabel}`}
              weightKg={w.weightKg}
              note={w.note}
              unitSystem={unitSystem}
              locale={dl}
            />
          }
        />
      ),
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-titel text-foreground">{tStats("allEntries")}</h2>
        <span className="text-neben text-foreground-faint tabular-nums">
          {total} {t("total")}
          {weightTotal > 0 && ` · ${tWeight("countInList", { count: weightTotal })}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-fliess text-foreground-faint">{t("noEntriesYet")}</p>
      ) : (
        <>
          <DayGroups
            rows={rows}
            locale={dl}
            tz={tz}
            today={t("today")}
            yesterday={t("yesterday")}
          />
          <ListPagerLinks
            page={page}
            totalPages={totalPages}
            href={(p) => `${base}?page=${p}`}
            previousLabel={t("previous")}
            nextLabel={t("next")}
          />
        </>
      )}
    </>
  );
}
