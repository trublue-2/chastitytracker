"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { CheckCircle2, Droplets, MoreVertical, Camera, AlertTriangle, AlertCircle, KeyRound, ShowerHead } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import Badge from "@/app/components/Badge";
import { blockInsetCls } from "@/app/components/inputStyles";
import DetailField from "@/app/components/DetailField";
import SealedCodePhoto from "./SealedCodePhoto";
import PhotoChoice, { usePhotoChoice } from "@/app/components/PhotoChoice";
import PhotoThumb from "@/app/components/PhotoThumb";
import { formatVerifyReason, type VerifyFailure } from "@/lib/verifyReason";
import type { KeyProofSource } from "@/lib/boxKeyProof";
import { LockClosedIcon } from "@/app/components/lockIcons";

/**
 * Die Daten EINER Zeitleisten-Zeile.
 *
 * **Kein Feld ist optional — auch die, die `undefined` sein dürfen, müssen genannt werden.**
 * Dieselbe Zeile wird an zwei Stellen gebaut (`buildSessionEvents` für die laufende Session,
 * `SessionList` für die abgeschlossenen). Solange ein Feld weggelassen werden durfte, war jedes
 * davon eine stille Falle: wer es in EINEM Bauer vergass, bekam keinen Compile-Fehler, sondern eine
 * Zeile, die im einen Zusammenhang erschien und im anderen lautlos fehlte.
 *
 * Das ist zweimal passiert (`verifyFailure`, dann `codeImageUrl` — Issue #53), und beim zweiten Mal
 * stand der Hinweis bereits als Kommentar im Code. Ein Kommentar, der eine Falle beschreibt,
 * entschärft sie nicht; ein Pflichtfeld schon.
 *
 * Das ist der Zwischenschritt aus Issue #54 und ersetzt die dort vorgeschlagene Zusammenlegung der
 * beiden Bauer nicht — es macht sie nur ungefährlich, bis sie kommt.
 */
export interface SessionEventData {
  type: "verschluss" | "kontrolle" | "orgasmus" | "cleaning";
  /** Raw ISO timestamp — used by SessionTimeline for bucket grouping. */
  timeIso: string | undefined;
  dateStr: string;
  timeStr: string;
  imageUrl: string | null;
  /** Bildersafe (VERSCHLUSS): versiegeltes Code-Foto. Sichtbarkeit entscheidet der Server (403-Gate). */
  codeImageUrl: string | null | undefined;
  /** Urteil des Gates, sofern der Aufrufer es schon kennt (siehe `SealedCodePhoto`). Weggelassen =
   *  die Zeile fragt selbst nach — ein voller Bild-Download für einen Boolean. */
  codeRevealed: boolean | undefined;
  exifStr: string | null;
  note: string | null;
  entryId: string | null;
  captureHref: string | null;
  /** Keyholder-Sicht: Banner zeigen, Erfassen-Knopf NICHT. Der Link führte auf eine Sub-Route, wo das
   *  Formular über die eigene Session schreibt — der Keyholder hätte die Kontrolle seines Subs auf
   *  SEINEM Konto erfasst. Bewusst ein eigenes Feld statt `captureHref: null`: das Feld steuert auch
   *  die Alarm-Darstellung, und die Frist seines Subs soll der Keyholder sehr wohl sehen. */
  captureDisabled: boolean | undefined;
  deadlineStr: string | null;
  isOverdue: boolean;
  kontrolleCode: string | null;
  kontrolleKommentar: string | null;
  kombiniertePillLabel: string | null;
  kombiniertePillCls: string | null;
  /** KONTROLLE: WARUM der automatische Foto-Check nicht gematcht hat. Steht direkt unter der Pille,
   *  weil die sonst „Nicht verifiziert" sagt und nichts weiter — der Träger sah eine Ablehnung ohne
   *  Grund und konnte weder nachbessern noch widersprechen.
   *
   *  ROH, nicht übersetzt: übersetzt wird unten in DIESER Komponente. Beide Aufrufer bauen dieselbe
   *  Zeile, und ein fertiger String hiesse, dass jeder von ihnen den Übersetzer selbst holen und den
   *  Aufruf richtig hinschreiben muss — wer es vergisst, bekommt keinen Fehler, sondern eine Zeile,
   *  die stumm wieder verschwindet. */
  verifyFailure: VerifyFailure | null | undefined;
  orgasmusArt: string | null;
  pauseDurationStr: string | null | undefined;
  timeCorrected: boolean | undefined;
  timeCorrectedSystemStr: string | null | undefined;
  /** VERSCHLUSS + KONTROLLE: the device worn (null = none selected). */
  deviceName: string | null | undefined;
  /** VERSCHLUSS + KONTROLLE: show the device row (true when the user has any devices). */
  showDevice: boolean | undefined;
  /** Schlüssel-Urteil. `null`/undefined = nicht geprüft (kein Foto, keine KI, keine Telemetrie,
   *  Alt-Eintrag) → KEINE Pille: „kein Schlüssel erkannt" zu behaupten, wo niemand hingesehen hat,
   *  wäre eine Falschaussage über den Sub. */
  keyDetected: boolean | null | undefined;
  /** Quelle des Urteils, siehe `lib/boxKeyProof.ts`. Fehlt sie, gilt „Foto" — das ist keine Annahme
   *  ins Blaue: `Entry.keyDetected` schreibt ausschliesslich die Bild-Erkennung, die Telemetrie wird
   *  nie gespeichert. Eine Zeile OHNE Quelle kann also gar kein Telemetrie-Urteil tragen. */
  keyProofSource: KeyProofSource | null | undefined;
  /** Foto durchs Sichtfenster der Box. Im Vollbild neben dem Haupt-Foto wählbar. */
  boxImageUrl: string | null | undefined;
}


function CaptureButton({ href }: { href: string }) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent | TouchEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  return (
    <div className="relative flex-shrink-0">
      <button ref={btnRef} type="button" onClick={openMenu}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-foreground-faint hover:text-foreground-muted hover:bg-surface-raised active:bg-border-subtle transition">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div ref={menuRef} style={{ top: pos.top, right: pos.right }}
          className="fixed w-40 bg-surface border border-border-subtle rounded-xl shadow-lg z-50 overflow-hidden">
          <Link href={href} onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-foreground-muted hover:bg-surface-raised transition">
            <Camera size={14} className="text-foreground-faint" />
            {t("captureNow")}
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Der Kopf einer Ereignis-Zeile: Art, Datum, Uhrzeit — und rechts, wo eine gebraucht wird, eine
 * Handlung.
 *
 * Er stand zweimal im Baum, in den beiden Zweigen unten, und lief bereits auseinander: der
 * Reinigungs-Zweig setzte die Uhrzeit fest auf `text-foreground-faint` und übersah dabei
 * `timeCorrected` — ein Feld, das `SessionEventData` ihm garantiert liefert. Eine nachträglich
 * korrigierte Uhrzeit wurde dort also stillschweigend als normale angezeigt. Genau diese Klasse
 * von Abweichung meint Issue #54 („Session-Zeilen werden zweimal gebaut — optionale Felder fallen
 * still durch"); hier fällt sie für den Kopf weg.
 *
 * Die ART steht ÜBER dem Datum, auf jeder Breite. Sie stand auf dem Handy dort und ab `sm` am
 * rechten Zeilenende — eine Karten-Entscheidung: in einem Kasten von 400 px ist „rechts" nah. In
 * einer Spalte von 720 px ist es einen halben Meter weit weg, und die Zeile zerfällt in zwei
 * Inseln mit einem Loch dazwischen. Was zusammengehört, bleibt zusammen; der freie Platz bleibt am
 * Rand, wo er niemanden stört.
 */
function EventRowHead({ pills, dateStr, timeStr, timeCorrected, action }: {
  pills: ReactNode;
  dateStr: string;
  timeStr: string;
  timeCorrected?: boolean;
  /** Rechts aussen, nur wo es etwas zu tun gibt. Fehlt sie, bleibt der Platz einfach leer. */
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0">
        <div className="mb-0.5 flex flex-wrap items-center gap-1.5">{pills}</div>
        <span className="block text-fliess font-semibold text-foreground tabular-nums">{dateStr}</span>
        <span className={`block text-neben tabular-nums ${timeCorrected ? "text-warn font-medium" : "text-foreground-faint"}`}>{timeStr}</span>
      </div>
      {action}
    </div>
  );
}

export default function SessionEventRow({ ev, icon }: { ev: SessionEventData; icon: React.ReactNode }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  // Derselbe Namensraum, aus dem das Prüfungs-Formular schon VOR dem Absenden zitiert
  // (`PruefungFormCore`) — der Träger liest hinterher wortgleich, was ihm der Check damals sagte.
  const tReason = useTranslations("inspectionForm");
  const [open, setOpen] = useState(false);
  const photo = usePhotoChoice(ev.imageUrl, ev.boxImageUrl);
  const verifyReasonStr = formatVerifyReason(ev.verifyFailure?.reason, ev.verifyFailure?.detected, tReason);

  // Grün = Schlüssel nachgewiesen, Warn-Optik = kein Schlüssel erkannt (siehe `keyDetected`). Der
  // grüne Fall nennt seine Quelle (`keyProofFor` in `lib/boxKeyProof.ts`).
  // Der NACHWEIS ist der Normalfall und deshalb neutral; nur sein Fehlen ist eine Aussage. Vorher
  // war es umgekehrt gewichtet: der erbrachte Nachweis leuchtete grün, das Fehlen rot — zwei
  // Signale, wo eines gemeint ist.
  const keyPill = ev.keyDetected == null ? null : (
    <Badge
      size="sm"
      variant={ev.keyDetected ? "neutral" : "warn"}
      icon={<KeyRound size={11} />}
      label={ev.keyDetected
        ? t(ev.keyProofSource === "telemetry" ? "keyDetectedTelemetry" : "keyDetected")
        : t("keyNotDetected")}
    />
  );

  // Reinigung → compact inline row with optional modal
  if (ev.type === "cleaning") {
    // `ShowerHead`, nicht das offene Schloss: dieselbe Liste zeigt es weiter unten für das ENDE
    // einer Tragezeit, und dasselbe Zeichen hiesse dann einmal „Unterbrechung, es geht weiter" und
    // einmal „vorbei".
    const cleaningPill = <Badge size="sm" icon={<ShowerHead size={11} />} label={t("sessionReinigung")} />;

    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
          className={`w-full flex items-center gap-4 ${blockInsetCls} py-3 text-left hover:bg-surface-raised/60 transition active:bg-border-subtle/60 cursor-pointer`}
        >
          <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden">
            {/* Foto des WIEDERVERSCHLUSSES; fehlt es, aber ein Box-Foto ist da, zeigt die Zeile
                dieses — sonst bliebe der Nachweis „Schlüssel wieder drin" unsichtbar. */}
            {photo.mainUrl ?? photo.boxUrl ? (
              <PhotoThumb url={(photo.mainUrl ?? photo.boxUrl)!} alt="" size="lg" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-foreground-faint">
                {/* Dasselbe Zeichen wie das Abzeichen dieser Zeile — es vertritt ein fehlendes Foto,
                    also muss es dieselbe Sache benennen. */}
                <ShowerHead size={18} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <EventRowHead
              pills={<>{cleaningPill}{keyPill}</>}
              dateStr={ev.dateStr}
              timeStr={ev.timeStr}
              timeCorrected={ev.timeCorrected}
            />
            {ev.pauseDurationStr && (
              <p className="text-neben text-foreground-muted mt-0.5">{ev.pauseDurationStr}</p>
            )}
            {ev.note && <p className="text-neben text-foreground-faint italic mt-0.5 truncate">„{ev.note}"</p>}
            {ev.codeImageUrl && (
              <div onClick={(e) => e.stopPropagation()}>
                <SealedCodePhoto url={ev.codeImageUrl} revealed={ev.codeRevealed} />
              </div>
            )}
          </div>
        </div>

        {open && (
          <FullscreenImageModal
            src={photo.src}
            alt=""
            onClose={() => setOpen(false)}
            title={cleaningPill}
            panel={
              <div className="flex flex-col gap-3">
                <PhotoChoice photo={photo} />
                <DetailField label={tc("dateTime")}>
                  <p className="text-sm font-semibold text-foreground">{ev.dateStr}, {ev.timeStr}</p>
                </DetailField>
                {ev.pauseDurationStr && (
                  <DetailField label={t("sessionPauseDuration")}>
                    <p className="text-sm text-foreground-muted">{ev.pauseDurationStr}</p>
                  </DetailField>
                )}
                {ev.note && (
                  <DetailField label={tc("note")}>
                    <p className="text-sm text-foreground-muted italic">„{ev.note}"</p>
                  </DetailField>
                )}
              </div>
            }
          />
        )}
      </>
    );
  }

  // Der Verschluss und der Orgasmus sind EINTRAGSARTEN, keine Signale — sie sagen, was passiert
  // ist, nicht dass etwas zu tun wäre. Nur die Kontrolle trägt eine Farbe, und die kommt aus ihrem
  // Zustand (`kombiniertePillCls`): offen und überfällig fallen auf, erledigt nicht.
  const typePill = ev.type === "verschluss" ? (
    <Badge size="sm" icon={<LockClosedIcon size={11} />} label={t("lock")} />
  ) : ev.type === "kontrolle" ? (
    <Badge size="sm" icon={<CheckCircle2 size={11} />} label={ev.kombiniertePillLabel ?? t("sessionKontrolle")} tone={ev.kombiniertePillCls ?? undefined} />
  ) : (
    <Badge size="sm" icon={<Droplets size={11} />} label={t("sessionOrgasmus")} />
  );

  // Geräte-Zeile (getragenes Gerät) — dieselbe Darstellung an zwei Positionen im Detail-Panel:
  // bei Kontrollen direkt unter Datum/Zeit, bei Verschlüssen weiter unten (bewusst getrennte Orte).
  const deviceRow = ev.showDevice ? (
    <DetailField label={tc("device")}>
      <p className="text-sm text-foreground-muted">{ev.deviceName ?? "—"}</p>
    </DetailField>
  ) : null;

  // Open / overdue kontrolle → banner style
  if (ev.captureHref) {
    const textCls = ev.isOverdue ? "text-warn-text" : "text-[var(--color-warn)]";
    return (
      <div className={`${blockInsetCls} py-3 flex items-center gap-3 border-t border-b bg-warn-bg border-[var(--color-warn-border)] ${textCls}`}>
        {ev.isOverdue
          ? <AlertCircle size={20} className="flex-shrink-0 text-warn" />
          : <AlertTriangle size={20} className="flex-shrink-0 text-[var(--color-warn)]" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">
            {ev.isOverdue ? t("inspectionOverdue") : t("inspectionRequired")}
          </p>
          {ev.deadlineStr && (
            <p className="text-neben opacity-80">
              {ev.isOverdue ? t("overduePrefix") : t("untilPrefix")} {ev.deadlineStr}
              {ev.kontrolleCode && <> · <span className="font-mono font-bold">{ev.kontrolleCode}</span></>}
            </p>
          )}
          {ev.kontrolleKommentar && (
            <p className="text-neben font-medium mt-1 opacity-90">{ev.kontrolleKommentar}</p>
          )}
        </div>
        {!ev.captureDisabled && (
          <div onClick={(e) => e.stopPropagation()}>
            <CaptureButton href={ev.captureHref} />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
        className={`w-full flex items-start gap-4 ${blockInsetCls} py-4 text-left hover:bg-surface-raised/60 transition active:bg-border-subtle/60 cursor-pointer`}
      >
        {/* Foto — ohne Haupt-Foto das Box-Foto, sonst das Typ-Icon. */}
        <div className="shrink-0">
          {photo.mainUrl ?? photo.boxUrl ? (
            <PhotoThumb url={(photo.mainUrl ?? photo.boxUrl)!} alt="" size="lg" />
          ) : (
            /* Ohne Foto steht das Zeichen frei statt in einer leeren Kachel. Eine Fläche in
               Bildgrösse, in der kein Bild ist, sieht aus wie ein Bild, das nicht geladen hat —
               und sie stellt einen Kasten in eine Zeile, die schon in einer Liste steht. */
            <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center text-foreground-faint">
              {icon}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <EventRowHead
            pills={<>{typePill}{keyPill}</>}
            dateStr={ev.dateStr}
            timeStr={ev.timeStr}
            timeCorrected={ev.timeCorrected}
            /* Zweite Aufrufstelle desselben Knopfes. Heute unerreichbar (der Banner-Zweig oben
               kehrt zurück, sobald `captureHref` gesetzt ist) — trotzdem mit demselben Riegel:
               eine Regel, die nur an einer von zwei Stellen steht, ist keine Regel, und ein
               Verengen der Bedingung oben brächte den Keyholder-Knopf sonst durch die Hintertür
               zurück.

               Der Riegel sitzt jetzt am Behälter statt darin: vorher stand hier bei JEDER Zeile
               ein leerer Flex-Kasten, weil die Bedingung nie zutreffen kann. */
            action={ev.captureHref && !ev.captureDisabled ? (
              <div className="flex items-center gap-1.5 shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
                <CaptureButton href={ev.captureHref} />
              </div>
            ) : undefined}
          />
          {verifyReasonStr && <p className="text-neben text-warn mt-0.5">{verifyReasonStr}</p>}
          {ev.exifStr && <p className="text-neben text-[var(--color-warn)] mt-0.5">{tc("exifDate")}: {ev.exifStr}</p>}
          {ev.orgasmusArt && <p className="text-neben text-[var(--color-orgasm)] mt-0.5">{ev.orgasmusArt}</p>}
          {ev.kontrolleKommentar && <p className="text-neben text-[var(--color-warn)] mt-0.5 truncate">{ev.kontrolleKommentar}</p>}
          {ev.note && <p className="text-neben text-foreground-faint italic mt-0.5 truncate">„{ev.note}"</p>}
          {ev.type === "verschluss" && ev.codeImageUrl && (
            <div onClick={(e) => e.stopPropagation()}>
              <SealedCodePhoto url={ev.codeImageUrl} revealed={ev.codeRevealed} />
            </div>
          )}
        </div>
      </div>

      {open && (
        <FullscreenImageModal
          src={photo.src}
          alt=""
          onClose={() => setOpen(false)}
          title={typePill}
          panel={
            <div className="flex flex-col gap-3">
              <PhotoChoice photo={photo} />
              <DetailField label={tc("dateTime")}>
                <p className="text-sm font-semibold text-foreground">{ev.dateStr}, {ev.timeStr}</p>
              </DetailField>
              {ev.type === "kontrolle" && deviceRow}
              {ev.exifStr && (
                <DetailField label={tc("exifDate")}>
                  <p className="text-sm text-[var(--color-warn)]">{ev.exifStr}</p>
                </DetailField>
              )}
              {ev.orgasmusArt && (
                <DetailField label={tc("type")}>
                  <p className="text-sm text-foreground-muted">{ev.orgasmusArt}</p>
                </DetailField>
              )}
              {ev.deadlineStr && (
                <DetailField label={tc("deadline")}>
                  <p className="text-sm text-foreground-muted">{ev.deadlineStr}</p>
                </DetailField>
              )}
              {ev.timeCorrectedSystemStr && (
                <DetailField label={tc("timeCorrected")} tone="warn">
                  <p className="text-sm text-[var(--color-warn)]">{tc("specified")}: {ev.dateStr}, {ev.timeStr}</p>
                  <p className="text-sm text-[var(--color-warn)]">{tc("systemTime")}: {ev.timeCorrectedSystemStr}</p>
                </DetailField>
              )}
              {ev.kontrolleCode && (
                <DetailField label={ev.type === "verschluss" ? tc("sealNumber") : tc("controlCode")}>
                  <p className="text-sm font-mono font-bold text-[var(--color-inspect)]">{ev.kontrolleCode}</p>
                </DetailField>
              )}
              {ev.kontrolleKommentar && (
                <DetailField label={tc("instruction")}>
                  <p className="text-sm text-[var(--color-warn)]">{ev.kontrolleKommentar}</p>
                </DetailField>
              )}
              {ev.type === "verschluss" && deviceRow}
              {ev.note && (
                <DetailField label={tc("note")}>
                  <p className="text-sm text-foreground-muted italic">„{ev.note}"</p>
                </DetailField>
              )}
            </div>
          }
        />
      )}
    </>
  );
}
