import { NOTICE_VERSION } from "@/lib/notice";
import { userSelfFieldRoute } from "@/lib/userSelfField";

// Quittung des Umstellungs-Hinweises (Issue #87). Ein USER-SELF-Feld: es hält fest, was DIESE
// Person gesehen hat — laut CLAUDE.md brauchen nur admin-gesetzte Felder `requireAdminApi()`.
//
// Der Client schickt die Version mit, und die Route nimmt nur die AKTUELLE an. Damit quittiert er
// genau den Hinweis, den er gelesen hat: liegt zwischen Anzeige und Klick ein Deploy mit einem
// neuen Hinweis, wird die alte Quittung abgelehnt (400) statt gespeichert — der Nutzer bekommt
// beim nächsten Aufbau den NEUEN Text zu sehen, statt still einen wegzudrücken, den er nie sah.
// Die Absage schluckt die Komponente bewusst; ein Hinweis ist kein Formular.
export const PATCH = userSelfFieldRoute("noticeSeenVersion", (value) =>
  value === NOTICE_VERSION ? null : "invalidNoticeVersion",
);
