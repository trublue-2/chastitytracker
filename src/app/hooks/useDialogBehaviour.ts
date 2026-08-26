"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Was ein modaler Dialog können muss, damit er mit der Tastatur und mit einem Screenreader
 * überhaupt bedienbar ist: Fokus hinein, Fokus drinnen halten, Escape, Fokus zurück an den
 * Auslöser, und die Seite dahinter still stellen.
 *
 * Der Hook existiert, weil dieselbe Mechanik VIERMAL im Baum stand — `Sheet`, `ActionModal`,
 * `CalendarContainer` und der Bild-Betrachter — und jede Fassung andere Teile davon vergessen
 * hatte. Die Fehler dieser Mechanik sind samt und sonders unsichtbar, solange man mit der Maus
 * prüft; das Vollbild etwa hatte gar keine Fokus-Falle, lag aber über allem anderen. Alle vier
 * nehmen inzwischen diesen Hook, und ein fünfter Dialog nimmt ihn auch.
 *
 * **Fokus-Falle statt `inert` — bewusst.** Sauberer wäre, alles hinter dem Dialog `inert` zu
 * setzen. Nur liegt der Dialog hier nicht verlässlich unter `document.body`: `ActionModal`
 * portiert in den nächstgelegenen Theme-Wrapper, damit es die CSS-Variablen seines Bereichs erbt.
 * „Der Hintergrund" wäre damit kein Element, sondern die Geschwister auf jeder Ebene zwischen
 * Portal-Ziel und Wurzel — ein Baumlauf, der bei jedem Öffnen fremde Knoten beschreibt und in der
 * Bauteil-Schau (zwei Themes nebeneinander) den halben Bildschirm lahmlegte. Die Falle bleibt im
 * Dialog und fasst nichts an, was ihm nicht gehört. `aria-modal="true"` sagt dem Screenreader
 * zusätzlich, dass der Rest der Seite gerade nicht gemeint ist.
 */

/**
 * Was Tab erreichen kann. `:not([disabled])` ist nicht Kosmetik: ein deaktivierter Knopf steht in
 * der Trefferliste, bekommt aber nie den Fokus — steht er zufällig am Ende, vergleicht die
 * Umlauf-Prüfung unten gegen ein Element, das `document.activeElement` niemals ist, und der
 * nächste Tab fällt aus dem Dialog heraus. Genau dieser Fall tritt in der Rückfrage ein, sobald
 * der Bestätigen-Knopf lädt (`Button` setzt dann `disabled`).
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "iframe",
  "audio[controls]",
  "video[controls]",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Die sichtbaren unter den treffbaren Elementen. `getClientRects()` statt `offsetParent`, weil
 * `offsetParent` bei `position: fixed` auch dann null ist, wenn das Element bestens sichtbar ist —
 * und der Dialog liegt in genau so einem Kontext. Ausgeblendete Felder gibt es real: die
 * Foto-Aufnahme trägt ihr `<input type="file">` mit `display: none` mit sich.
 */
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => el.getClientRects().length > 0);
}

/**
 * Alle GERADE offenen Dialoge, in der Reihenfolge ihres Öffnens. Ein Modulwert, weil die Frage,
 * die er beantwortet, keinem einzelnen Dialog gehört: **welcher ist der oberste?**
 *
 * Ohne ihn hängt jeder Dialog seinen eigenen Tastatur-Hänger an `document` und alle reagieren
 * gleichzeitig. Escape schloss damit nicht den obersten, sondern jeden offenen; und bei Tab riefen
 * beide `preventDefault()` und zogen den Fokus zu sich, weil keiner den anderen enthält (`ActionModal`
 * portiert in den Theme-Wrapper) — der untere blieb sichtbar und war mit der Tastatur unerreichbar.
 * Zu sehen in der Bauteil-Schau, die dasselbe Modal zweimal nebeneinander stellt.
 */
const openDialogs: HTMLElement[] = [];

/**
 * Die Scroll-Sperre gehört dem STAPEL, nicht dem einzelnen Dialog. Merkte sich jeder seinen eigenen
 * Vorwert, gäbe eine Schliess-Reihenfolge, die nicht der Öffnungs-Reihenfolge folgt, am Ende den
 * Wert des ZWEITEN zurück — also `"hidden"`, obwohl kein Dialog mehr offen ist. Die Seite liesse
 * sich dann bis zum Neuladen nicht mehr scrollen.
 */
let overflowBeforeFirstDialog: string | null = null;

function pushDialog(dialog: HTMLElement): void {
  openDialogs.push(dialog);
  if (openDialogs.length === 1) {
    overflowBeforeFirstDialog = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function popDialog(dialog: HTMLElement): void {
  const i = openDialogs.lastIndexOf(dialog);
  if (i !== -1) openDialogs.splice(i, 1);
  if (openDialogs.length === 0 && overflowBeforeFirstDialog !== null) {
    document.body.style.overflow = overflowBeforeFirstDialog;
    overflowBeforeFirstDialog = null;
  }
}

/**
 * Wohin der Fokus zurückgeht. Erste Wahl ist der Auslöser — aber der ist es oft nicht mehr:
 *
 *  - Er wurde mit der Zeile gelöscht, die er bediente, oder wir sind weiter navigiert
 *    (`isConnected`).
 *  - Er wird im SELBEN Durchlauf deaktiviert, in dem der Dialog schliesst: die Rückfragen starten
 *    ihre Anfrage im `onConfirm`, der auslösende `Button` bekommt `loading` und damit `disabled`.
 *    `focus()` auf einem deaktivierten Element ist wirkungslos — der Fokus fiele auf `<body>`.
 *
 * Dann übernimmt der Dialog darunter (bei geschachtelten Rückfragen), sonst der Hauptbereich der
 * Seite. `<main>` bekommt dafür `tabIndex={-1}`: der Screenreader beginnt damit am Anfang des
 * Inhalts statt am Anfang des Dokuments, und ein Tab-Halt entsteht nicht.
 */
function restoreFocus(opener: Element | null): void {
  if (
    opener instanceof HTMLElement
    && opener !== document.body
    && opener.isConnected
    && !opener.matches(":disabled")
  ) {
    opener.focus();
    return;
  }
  const below = openDialogs[openDialogs.length - 1];
  if (below?.isConnected) {
    below.focus();
    return;
  }
  const main = document.querySelector("main");
  if (main) {
    main.tabIndex = -1;
    main.focus();
  }
}

interface DialogBehaviour {
  /** Ist der Dialog gerade im DOM? Nicht „soll er offen sein" — siehe Hinweis unten. */
  open: boolean;
  onClose: () => void;
  /** Läuft im Dialog eine Anfrage, schliesst Escape nicht. */
  busy?: boolean;
}

/**
 * `dialogRef` muss auf das Element mit `role="dialog"` zeigen, und dieses Element braucht
 * `tabIndex={-1}`: der Fokus landet beim Öffnen auf dem Dialog selbst, nicht auf seinem ersten
 * Knopf. Der Screenreader liest dann Rolle und Titel („Dialog, Nachricht löschen?") statt bloss
 * „Schaltfläche" — was der Grund für die ganze Übung war. Ein Fokus auf dem ersten Bedienelement
 * überspringt die Ansage.
 *
 * `open` ist bewusst „ist gerendert", nicht „soll offen sein". Wer den Dialog erst nach einem
 * zweiten Durchlauf einhängt (`ActionModal` wartet auf sein Portal-Ziel), muss diese Bedingung
 * mitgeben — sonst läuft der Effekt einmal ins Leere und danach nie wieder, weil sich sein
 * einziger Auslöser nicht mehr ändert.
 */
export function useDialogBehaviour(
  dialogRef: RefObject<HTMLElement | null>,
  { open, onClose, busy = false }: DialogBehaviour,
): void {
  // Beide über eine Ref, damit der Effekt nur an `open` hängt. Hinge er an `onClose`, liefe er bei
  // jedem Render des Aufrufers neu — und weil seine Aufräum-Funktion den Fokus zurückgibt, spränge
  // der Fokus dann mitten in der Bedienung aus dem Dialog heraus. Die Aufrufer übergeben durchweg
  // frisch gebaute Pfeilfunktionen; das ist kein hypothetischer Fall.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    // Wer den Dialog aufgemacht hat, bekommt den Fokus am Ende zurück. Ohne das steht man nach
    // einer Rückfrage wieder am Seitenanfang und muss sich zur eigenen Zeile zurücktabben.
    const opener = document.activeElement;

    // Der Dialog holt den Fokus nur, wenn ihn nicht schon ein Feld im Inhalt hat. Ein `autoFocus`
    // im Formular (die Gewichts-Korrektur hat eines) ist eine bewusste Ansage des Aufrufers, wo die
    // Eingabe beginnt — sie zugunsten der Titel-Ansage zu überschreiben, verlöre mehr als es bringt.
    // Der Fall, um den es hier geht, ist der andere: dass der Fokus DRAUSSEN stehen bleibt.
    if (!dialog.contains(document.activeElement)) dialog.focus();

    // Als Pfeilfunktion statt Deklaration: nur so behält TypeScript die Erkenntnis,
    // dass `dialog` hier nicht mehr null sein kann (eine Deklaration wird gehoben und
    // gilt dem Compiler als potentiell früher aufgerufen).
    const onKeyDown = (e: KeyboardEvent) => {
      // Nur der OBERSTE Dialog hört zu. Der Hänger sitzt an `document`, also bekommt ihn jeder
      // offene Dialog — ohne diese Zeile schlösse ein Escape alle gleichzeitig.
      if (openDialogs[openDialogs.length - 1] !== dialog) return;
      if (e.key === "Escape") {
        // Eine laufende Anfrage darf ihre Rückfrage nicht unter sich verlieren: der Nutzer sähe
        // die Seite unverändert, während im Hintergrund gelöscht wird.
        if (busyRef.current) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusablesIn(dialog);
      const active = document.activeElement;

      // Nichts zu bedienen (ein Dialog, der seinen Inhalt noch lädt): Fokus bleibt auf dem Dialog,
      // statt in die Seite dahinter zu entkommen.
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];

      if (!active || !dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      // Der Dialog selbst ist der Startpunkt: von ihm aus geht es vorwärts zum ersten und
      // rückwärts zum letzten Element.
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    pushDialog(dialog);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      popDialog(dialog);
      restoreFocus(opener);
    };
  }, [open, dialogRef]);
}
