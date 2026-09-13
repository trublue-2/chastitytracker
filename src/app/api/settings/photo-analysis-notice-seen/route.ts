import { userSelfFieldRoute } from "@/lib/userSelfField";
import { currentVisionConfig, disclosureOf } from "@/lib/vision/config";

// Quittung des Hinweises zur Foto-Prüfung. Ein USER-SELF-Feld wie `notice-seen`: es hält fest, was
// DIESE Person gesehen hat.
//
// Der Client schickt den Stand mit, den er angezeigt hat, und die Route nimmt nur den AKTUELLEN an.
// Wechselt der Admin zwischen Anzeige und Klick den Anbieter, wird die alte Quittung abgelehnt statt
// gespeichert — sonst drückte der Nutzer still einen Empfänger weg, den er nie genannt bekam.
export const PATCH = userSelfFieldRoute("photoAnalysisNoticeSeen", async (value) =>
  value === disclosureOf(await currentVisionConfig()) ? null : "invalidNoticeVersion",
);
