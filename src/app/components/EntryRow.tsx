"use client";

import { useState } from "react";
import { ClipboardList, Droplets, Camera, Play, Square } from "lucide-react";
import { formatDateTime, formatTime, APP_TZ } from "@/lib/utils";
import { TYPE_STATS_KEYS } from "@/lib/constants";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import EntryDetailPanel from "@/app/components/EntryDetailPanel";
import CategoryIconRender from "@/app/components/CategoryIcon";
import { categoryStyle } from "@/lib/categoryConstants";
import { listRowCls, listRowButtonCls, listRowTimeCls } from "@/app/components/inputStyles";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { actionIcon } from "@/app/entries/actionSign";
import { LockClosedIcon } from "@/app/components/lockIcons";
import Badge from "@/app/components/Badge";
import type { KontrollePill } from "@/lib/kontrollePills";

/**
 * Das Zeichen einer Eintragsart — aus der geteilten Registratur, nicht aus einer eigenen Tabelle.
 *
 * Hier stand eine zweite Zuordnung, und sie war schon abgedriftet: die Prüfung trug `ClipboardList`
 * und damit dasselbe Zeichen wie eine Aufgabe, während `actionSign` ihr `ClipboardCheck` gibt.
 * Genau so laufen zwei Tabellen für dieselbe Frage auseinander — unbemerkt, weil beide für sich
 * plausibel aussehen.
 */
function typeIcon(type: string, size: number): ReactNode {
  const Icon = actionIcon(type);
  return Icon ? <Icon size={size} /> : null;
}

interface Entry {
  id: string;
  type: string;
  startTime: Date | string;
  note: string | null;
  orgasmusArt: string | null;
  kontrollCode: string | null;
  imageUrl?: string | null;
  imageExifTime?: Date | string | null;
  oeffnenGrund?: string | null;
  /** Category info for WEAR_BEGIN/WEAR_END entries — derived via Entry.device.category. */
  category?: { name: string; color: string; icon: string } | null;
}

interface Props {
  entry: Entry;
  locale: string;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
  /** Pre-resolved display labels via the data-owner's reason config (from a server parent). When
   *  omitted, the raw stored value (orgasmusArt) / built-in i18n (oeffnenGrund) is shown. */
  orgasmusLabel?: string | null;
  openingLabel?: string | null;
  /** Fertig beschriftete und eingefärbte Kontroll-Pille; kommt vom Server-Elternteil über
   *  `entryInspectionPill()` (das braucht die verknüpfte Anforderung, also eine Abfrage).
   *  Warum es sie gibt, steht in `kontrollePills.ts`. */
  inspectionPill?: KontrollePill | null;
  /** Optional action slot (e.g. EntryActions menu) */
  actions?: ReactNode;
  /** Nur die Uhrzeit statt Datum und Uhrzeit — für Listen, die ihre Tage schon überschreiben
   *  (`DayGroups`). Ohne Tageskopf drumherum wäre eine reine Uhrzeit nicht datierbar, deshalb
   *  bleibt das volle Datum der Standard. */
  timeOnly?: boolean;
}

/**
 * Die Notiz, wie sie in der ZEILE steht — auf eine Länge gekürzt, die auf eine Zeile passt.
 *
 * Die Kürzung muss im Code passieren und kann nicht dem CSS überlassen werden: die Zeile trägt
 * `min-width: max-content`, damit eine Notiz umbricht statt abgeschnitten zu werden — und
 * `min-width` schlägt jedes `max-width`. Eine 350-Zeichen-Notiz schob damit die ganze Liste über den
 * Rand der Karte hinaus (im Versuch gesehen).
 *
 * 100 Zeichen sind rund die Breite einer vollen Zeile bei dieser Schriftgrösse. Was länger ist,
 * gehört ohnehin ins Detail — die Zeile ist eine Übersicht, und der volle Text steht im `title` und
 * einen Klick entfernt.
 */
const NOTE_PREVIEW_MAX = 100;
function notePreview(note: string): string {
  return note.length > NOTE_PREVIEW_MAX ? `${note.slice(0, NOTE_PREVIEW_MAX).trimEnd()}…` : note;
}

export default function EntryRow({ entry: e, locale, tz = APP_TZ, orgasmusLabel, openingLabel, inspectionPill, actions, timeOnly }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const tStats = useTranslations("stats");

  const startTime = e.startTime instanceof Date ? e.startTime : new Date(e.startTime);

  const isWear = e.type === "WEAR_BEGIN" || e.type === "WEAR_END";
  const wearActionLabel = isWear ? tStats(e.type === "WEAR_BEGIN" ? "wearBeginShort" : "wearEndShort") : "";
  const wearLabel = isWear && e.category
    ? `${e.category.name} · ${wearActionLabel}`
    : tStats(TYPE_STATS_KEYS[e.type] ?? "lock");

  /* Bei einer Tragezeit steht das Zeichen der KATEGORIE, nicht das der Eintragsart.
     Die Zeile darunter macht es längst so; nur dieser Titel — er läuft in die Detail-Ansicht und
     in die Fusszeile des Bild-Betrachters — zeigte weiter `Play`/`Square` der Art. „Plug · Ende"
     stand deshalb neben einem leeren Quadrat, das wie ein unausgefülltes Kästchen aussah, während
     die Kategorie einen Anker führt. */
  const typeTitle = (
    <span className="flex items-center gap-1.5">
      {isWear && e.category ? (
        <CategoryIconRender
          name={e.category.icon}
          className="size-3.5 flex-shrink-0"
          style={{ color: categoryStyle(e.category.color).color }}
        />
      ) : typeIcon(e.type, 14)}
      {wearLabel}
    </span>
  );

  return (
    <>
      <div className={listRowCls}>
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          // `flex-wrap` NUR hier, nicht in der geteilten Klasse: eine Wiege-Zeile trägt Zahl und
          // Delta, die zusammen nie überlaufen. Eine Eintragszeile dagegen kann Art, Pille UND eine
          // freie Notiz führen — und dann reicht eine Zeile nicht. Gebrochen wird erst, wenn der
          // Platz wirklich fehlt (siehe die Mindestbreite an der Notiz); im Regelfall bleibt die
          // Zeile einzeilig und der Rhythmus der Liste erhalten.
          className={`${listRowButtonCls} flex-wrap`}
        >
          {/* Die Zeit führt die Zeile an, nicht die Art. In einer nach Tagen gruppierten Liste ist
              sie die einzige Spalte, die jede Zeile hat und die geordnet ist — an ihr entlang liest
              man. Feste Breite, damit die Arten darunter auf einer Kante stehen. */}
          <span className={listRowTimeCls}>
            {timeOnly ? formatTime(startTime, locale, tz) : formatDateTime(startTime, locale, tz)}
          </span>

          {/* Die Art ist neutral. Farbe heisst in diesem System „das will jetzt etwas von dir" —
              ein vergangener Eintrag will nichts mehr. Zwölf korallene „Kontrolle" untereinander
              haben genau deshalb aufgehört, etwas zu bedeuten. Die einzige Farbe, die bleibt, ist
              die der Kategorie: sie sagt WELCHE, nicht ob — und sie sitzt nur noch im Zeichen. */}
          {/* `min-w-fit`: die Art schrumpft NICHT. Sie ist es, die die Zeile identifiziert — mit
              `min-w-0` gab sie zuerst nach und stand als „Kont…" da, während die Pille daneben
              ungekürzt blieb (gemeldet 02.09.2026). Was zu kürzen ist, ist die Notiz.

              Der `truncate` innen greift damit nicht mehr; er bleibt trotzdem stehen, weil er es
              wieder tut, sobald jemand die Breite hier ändert. Ohne Deckel wäre das ein Risiko —
              ein Kategorie-Name kann aber höchstens 40 Zeichen lang sein
              (`CATEGORY_NAME_MAX_LENGTH`), und die passen samt Zeit und Art in jede Zeile. */}
          <span className="flex items-center gap-1.5 min-w-fit text-fliess text-foreground">
            {isWear && e.category ? (
              <>
                <CategoryIconRender
                  name={e.category.icon}
                  className="size-3.5 flex-shrink-0"
                  style={{ color: categoryStyle(e.category.color).color }}
                />
                <span className="truncate">{e.category.name}</span>
                <span className="text-foreground-faint whitespace-nowrap">{wearActionLabel}</span>
              </>
            ) : (
              <>
                <span className="text-foreground-faint flex-shrink-0">{typeIcon(e.type, 13)}</span>
                <span className="truncate">{tStats(TYPE_STATS_KEYS[e.type] ?? "lock")}</span>
              </>
            )}
          </span>

          {e.imageUrl && (
            <Camera size={12} className="text-foreground-faint flex-shrink-0" />
          )}
          {e.orgasmusArt && (
            <span className="text-neben text-foreground-muted whitespace-nowrap">{orgasmusLabel ?? e.orgasmusArt}</span>
          )}
          {e.type === "VERSCHLUSS" && e.kontrollCode && (
            <span className="text-neben text-foreground-faint font-mono tabular-nums">#{e.kontrollCode}</span>
          )}
          {/* Über `Badge`, nicht als eigenes `span`: dieselbe Pille rendern Zeitachse,
              Kontroll-Listen und Statistik alle darüber. Von Hand gebaut fehlte ihr das
              `font-semibold` — derselbe Vorgang hätte in dieser Liste anders ausgesehen. */}
          {inspectionPill && <Badge label={inspectionPill.label} tone={inspectionPill.cls} />}
          {/* Die Notiz ist mindestens so breit wie ihr Text (`min-width: max-content`, unten). Daraus
              folgt genau das gewünschte Verhalten, ohne eine Länge zu raten: was in die Zeile passt,
              bleibt darin; was nicht passt, rutscht über `flex-wrap` auf die nächste und steht dort
              auf voller Breite.

              Eine feste Mindestbreite kann das nicht, weil sie den Inhalt nicht kennt: zu klein
              gewählt bleibt eine lange Notiz in der Zeile und wird abgeschnitten, zu gross gewählt
              bricht ein „Kurz" um, für das die Zeile gereicht hätte. Beide Fälle waren im Versuch zu
              sehen.

              Vorher teilte sich die Notiz das Kürzen mit der ART daneben, und lesbar war dann keins
              von beiden — „Kont…" neben einer angeschnittenen Notiz (gemeldet 02.09.2026). */}
          {e.note && (
            <span
              title={e.note}
              className="text-neben text-foreground-faint italic truncate flex-1"
              // PUR und nicht als `min(100%, max-content)`, was näher läge: intrinsische Grössen
              // sind in `min()`/`max()`/`calc()` nicht erlaubt, die Deklaration wäre ungültig und
              // würde stillschweigend verworfen. Als Inline-Style, weil Tailwind die Klasse mit dem
              // Wert nicht erzeugt — eine Layout-Regel ohne Design-Wert, es wird kein Token umgangen.
              style={{ minWidth: "max-content" }}
            >
              „{notePreview(e.note)}"
            </span>
          )}
        </button>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>

      {showDetail && (
        <FullscreenImageModal
          src={e.imageUrl ?? ""}
          /* `wearLabel` und nicht die blosse Art: der Titel daneben nennt bei einer Tragezeit die
             Kategorie („Plug · Ende"), und die Bildbeschreibung sagte „Tragezeit-Ende". Wer nur sie
             hört, erfährt sonst nicht, worum es geht. */
          alt={wearLabel}
          onClose={() => setShowDetail(false)}
          title={typeTitle}
          panel={
            <EntryDetailPanel
              startTime={startTime}
              locale={locale}
              tz={tz}
              imageExifTime={e.imageExifTime}
              oeffnenGrund={e.oeffnenGrund}
              orgasmusArt={e.orgasmusArt}
              openingLabel={openingLabel}
              orgasmusLabel={orgasmusLabel}
              kontrollCode={e.kontrollCode}
              inspectionPill={inspectionPill}
              note={e.note}
            />
          }
        />
      )}
    </>
  );
}
