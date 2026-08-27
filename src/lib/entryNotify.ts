import { prisma } from "@/lib/prisma";
import { sendMailSafe, escHtml, appBaseUrl, dashboardEmailHtml } from "@/lib/mail";
import { emailT, localeT, type EmailTranslator } from "@/lib/emailI18n";
import { sendPushToUser } from "@/lib/push";
import { getControllersOfUser } from "@/lib/keyholder";
import { getEventChannelsAny } from "@/lib/notificationPrefs";
import { effectiveOeffnenGruende, effectiveOrgasmusArten, resolveReasonLabel, resolveOrgasmusArtDisplay } from "@/lib/reasonsService";
import { formatDateTime, formatDurationBetween, toDateLocale } from "@/lib/utils";
import { TYPE_EMAIL_COLORS, EMAIL_BUTTON_COLORS, type NotificationEventType, APP_NAME } from "@/lib/constants";

export interface EntryNotifyParams {
  /** Der Träger, dessen Eintrag gemeldet wird. */
  userId: string;
  /** Wer den Eintrag ERFASST hat. Auf dem Sub-Pfad der Träger selbst, auf dem Keyholder-Pfad
   *  (`POST /api/admin/entries`) die Keyholderin — sie fällt dann aus der Empfängerliste, sie hat
   *  ihn ja gerade getippt. Fehlt der Wert, wird niemand gestrichen. */
  actorUserId?: string;
  username: string;
  type: string;
  startTime: Date;
  /** Öffnung während einer zurückgezogenen Sperrzeit — steuert nur die Empfänger-Auswahl. */
  withdrawnSperrzeit?: boolean;
  oeffnenGrund?: string | null;
  orgasmusArt?: string | null;
  kontrollCode?: string | null;
  note?: string | null;
  imageUrl?: string | null;
  /** Deklaration des Trägers beim Verschluss — nicht das spätere KI-Urteil. */
  keyInBoxDeclared?: boolean | null;
  /** Beginn der Session (nur bei OEFFNEN) — für die Tragedauer. */
  lockStartTime?: Date | null;
  deviceId?: string | null;
  /** Die Auswahllisten des Trägers: seine eigenen Labels gewinnen, sonst greift die Übersetzung. */
  reasonConfig: { oeffnenGruendeConfig: string | null; orgasmusArtenConfig: string | null } | null;
}

/** Welche Benachrichtigungs-Typen dieser Eintrag auslöst. Leer = niemand wird gemeldet.
 *
 *  Der Rückgabetyp ist die Liste aus `constants.ts`, nicht `string[]`: ein Eintragstyp, der einen
 *  Schalter nennt, den das Raster gar nicht kennt, wird so ein Compile-Fehler statt einer Meldung,
 *  die stumm nie ankommt. */
function eventTypesFor(p: EntryNotifyParams): NotificationEventType[] {
  switch (p.type) {
    case "VERSCHLUSS": return ["VERSCHLUSS"];
    case "OEFFNEN": return p.withdrawnSperrzeit ? ["OEFFNUNG_IMMER", "OEFFNUNG_VERBOTEN"] : ["OEFFNUNG_IMMER"];
    case "ORGASMUS": return ["ORGASMUS"];
    case "PRUEFUNG": return [p.kontrollCode ? "KONTROLLE_ANGEFORDERT" : "KONTROLLE_FREIWILLIG"];
    case "WEAR_BEGIN": return ["WEAR_BEGIN_ANY"];
    case "WEAR_END": return ["WEAR_END_ANY"];
    default: return [];
  }
}

/** Die aufgelösten Anzeige-Texte einer Meldung — in der Sprache EINES Empfängers. */
interface EntryLabels {
  grund: string | null;
  art: string | null;
  category: string | null;
  device: string | null;
}

/** Titel und Push-Zeile in EINER Sprache. */
function renderHeadline(
  p: EntryNotifyParams,
  t: EmailTranslator,
  time: string,
  labels: EntryLabels,
): { title: string; pushBody: string } {
  const username = p.username;
  switch (p.type) {
    case "VERSCHLUSS":
      return { title: t("entryLockedTitle", { username }), pushBody: time };
    case "OEFFNEN":
      return {
        title: t("entryOpenedTitle", { username }),
        pushBody: labels.grund ? `${time} · ${t("entryDetailReason")} ${labels.grund}` : time,
      };
    case "ORGASMUS":
      return {
        title: t("entryOrgasmTitle", { username }),
        pushBody: labels.art ? `${time} · ${labels.art}` : time,
      };
    case "PRUEFUNG":
      return {
        title: p.kontrollCode ? t("entryInspectionTitle", { username }) : t("entrySelfInspectionTitle", { username }),
        pushBody: p.kontrollCode ? `${time} · ${t("entryDetailCode")} ${p.kontrollCode}` : time,
      };
    // Ausdrücklich statt im default-Zweig: ein neuer Eintragstyp soll hier auffallen, statt still
    // als Trage-Meldung zu erscheinen.
    case "WEAR_BEGIN":
    case "WEAR_END": {
      const category = labels.category ?? "?";
      return {
        title: p.type === "WEAR_BEGIN"
          ? t("entryWearBeginTitle", { username, category })
          : t("entryWearEndTitle", { username, category }),
        pushBody: labels.device ? `${time} · ${labels.device}` : time,
      };
    }
    default:
      return { title: t("entryLockedTitle", { username }), pushBody: time };
  }
}

/** Die Detail-Tabelle der Mail in EINER Sprache. */
function renderDetails(
  p: EntryNotifyParams,
  t: EmailTranslator,
  time: string,
  labels: Pick<EntryLabels, "grund" | "art">,
  locale: string,
): string[] {
  const rows = [`<strong>${escHtml(t("entryDetailTime"))}</strong> ${escHtml(time)}`];
  if (p.type === "OEFFNEN" && labels.grund) {
    rows.push(`<strong>${escHtml(t("entryDetailReason"))}</strong> ${escHtml(labels.grund)}`);
  }
  if (p.type === "ORGASMUS" && labels.art) {
    rows.push(`<strong>${escHtml(t("entryDetailKind"))}</strong> ${escHtml(labels.art)}`);
  }
  if (p.kontrollCode) {
    rows.push(`<strong>${escHtml(t("entryDetailCode"))}</strong> <span style="font-family:monospace;font-weight:bold;color:${EMAIL_BUTTON_COLORS.inspection}">${escHtml(p.kontrollCode)}</span>`);
  }
  if (p.type === "OEFFNEN" && p.lockStartTime) {
    rows.push(`<strong>${escHtml(t("entryDetailDuration"))}</strong> ${escHtml(formatDurationBetween(p.lockStartTime, p.startTime, locale))}`);
  }
  rows.push(`<strong>${escHtml(t("entryDetailPhoto"))}</strong> ${escHtml(p.imageUrl ? t("entryPhotoYes") : t("entryPhotoNo"))}`);
  // Die DEKLARATION des Trägers, nicht das KI-Urteil: die Mail geht sofort raus, die Erkennung läuft
  // erst. „Nicht in der Box" in Rot — es ist die eine Angabe, die entscheidet, ob der Verschluss
  // überhaupt hardware-gesichert ist.
  if (p.type === "VERSCHLUSS" && p.keyInBoxDeclared != null) {
    rows.push(p.keyInBoxDeclared
      ? `<strong>${escHtml(t("entryDetailKey"))}</strong> ${escHtml(t("entryKeyInBox"))}`
      : `<strong>${escHtml(t("entryDetailKey"))}</strong> <span style="color:#dc2626;font-weight:bold">${escHtml(t("entryKeyNotInBox"))}</span>`);
  }
  if (p.note) rows.push(`<strong>${escHtml(t("entryDetailNote"))}</strong> <em>${escHtml(p.note)}</em>`);
  return rows;
}

/**
 * Die Meldung an die Keyholder über einen Eintrag des Trägers — „hat sich eingeschlossen",
 * „hat sich geöffnet", Orgasmus, Kontrolle, Trage-Beginn/-Ende.
 *
 * IN DER SPRACHE DES EMPFÄNGERS. Bis hierher war dies die einzige Meldung im Projekt, die das nicht
 * tat: Titel als deutsche Literale, die Detail-Beschriftungen ebenso, und die Gründe über
 * `getTranslations({ locale: "de" })`. Ein englischsprachiger Keyholder bekam sie auf Deutsch
 * (Issue #43).
 *
 * Gerendert wird je SPRACHE, nicht je Empfänger: zwei Keyholder mit derselben Sprache teilen sich
 * eine Mail-Vorlage, zwei mit verschiedenen bekommen je ihre. Der Text hängt ausschliesslich an der
 * Sprache, ein zweiter Aufbau für denselben Wortlaut wäre reine Wiederholung.
 *
 * Ausgelagert aus `POST /api/entries`: dort standen 120 Zeilen Mail-Aufbau mitten im Schreibpfad,
 * und die Sprachfrage liess sich gar nicht beantworten, ohne den Block je Empfänger auszuführen.
 *
 * Wirft nie — der Aufrufer ist ein fire-and-forget-Kontext, und eine gescheiterte Meldung darf den
 * bereits geschriebenen Eintrag nicht mitreissen.
 */
export async function notifyControllersAboutEntry(p: EntryNotifyParams): Promise<void> {
  try {
    const eventTypes = eventTypesFor(p);
    if (eventTypes.length === 0) return;

    // Die Einstellungen des TRÄGERS entscheiden, ob überhaupt gemeldet wird — gelesen über
    // `notificationPrefs` wie jede andere Meldung, statt mit einer eigenen Abfrage daneben. Die
    // zweite Lesart wich in zwei Punkten ab, und beide waren Fehler:
    //  - eine FEHLENDE Zeile hiess hier „stumm", im Rest des Hauses „an". Die Zeilen legt
    //    `ensureNotificationPreferences` beim Anlegen UND bei jedem Containerstart an; fehlt eine, ist
    //    das eine Anomalie — und dann ist Senden die sichere Richtung, nicht Schweigen.
    //  - ein Lesefehler riss den Aufrufer mit, statt auf Senden zurückzufallen.
    // Die ODER-Regel über mehrere Typen liegt mit dort: sie ist Semantik der Schalter, nicht dieser
    // Meldung — und der nächste Aufrufer mit zwei Ereignissen soll sie nicht neu herleiten.
    const channels = await getEventChannelsAny(p.userId, eventTypes);
    if (!channels.mail && !channels.push) return;

    // Den Handelnden streichen NUR, wenn er für JEMAND ANDEREN erfasst hat: dann wäre es eine
    // Meldung über etwas, das er gerade selbst getippt hat. Erfasst jemand für SICH, bleibt die
    // Liste unangetastet — `getControllersOfUser` liefert alle Admins, und ein Träger mit
    // Admin-Rolle (Ein-Personen-Instanz) steht darin selbst; ihn zu filtern nähme ihm die Meldung
    // über seine eigenen Einträge.
    const all = await getControllersOfUser(p.userId);
    const recipients = p.actorUserId && p.actorUserId !== p.userId
      ? all.filter((r) => r.id !== p.actorUserId)
      : all;
    if (recipients.length === 0) return;

    // Nur die Trage-Meldungen nennen Gerät und Kategorie. Verschluss und Kontrolle tragen ebenfalls
    // eine `deviceId`, lesen sie aber nie — ungefragt geladen wäre es ein Rundgang für nichts.
    // Und: der Name hängt nicht an der Sprache, also einmal statt je Empfänger.
    const device = (p.type === "WEAR_BEGIN" || p.type === "WEAR_END") && p.deviceId
      ? await prisma.device.findUnique({
          where: { id: p.deviceId },
          select: { name: true, category: { select: { name: true } } },
        })
      : null;

    const adminUrl = `/admin/users/${p.userId}`;
    const adminLink = `${appBaseUrl()}${adminUrl}`;
    const openingCfg = effectiveOeffnenGruende(p.reasonConfig?.oeffnenGruendeConfig ?? null);
    const orgasmCfg = effectiveOrgasmusArten(p.reasonConfig?.orgasmusArtenConfig ?? null);

    // Je Sprache einmal aufbauen, dann an alle Empfänger dieser Sprache.
    const byLocale = new Map<string, typeof recipients>();
    for (const r of recipients) {
      const group = byLocale.get(r.locale);
      if (group) group.push(r);
      else byLocale.set(r.locale, [r]);
    }

    for (const [locale, group] of byLocale) {
      const t = emailT(locale);
      const time = formatDateTime(p.startTime, toDateLocale(locale));
      const labels = {
        grund: p.oeffnenGrund
          ? resolveReasonLabel(p.oeffnenGrund, openingCfg, "opening", localeT(locale, "openForm"))
          : null,
        art: p.orgasmusArt
          ? resolveOrgasmusArtDisplay(p.orgasmusArt, orgasmCfg, localeT(locale, "orgasmForm")) ?? p.orgasmusArt
          : null,
        category: device?.category?.name ?? null,
        device: device?.name ?? null,
      };
      const { title, pushBody } = renderHeadline(p, t, time, labels);

      if (channels.push) {
        await Promise.allSettled(group.map((r) => sendPushToUser(r.id, title, pushBody, adminUrl)));
      }
      if (!channels.mail) continue;

      // Der geteilte Rahmen (`dashboardEmailHtml`), nicht eine eigene Kopie: die Farbe der
      // Eintragsart trägt der Balken am Titel, den `heading` roh aufnimmt.
      const accent = TYPE_EMAIL_COLORS[p.type] ?? "#1e293b";
      const emailHtml = dashboardEmailHtml(
        `<span style="border-left:4px solid ${accent};padding-left:12px">${escHtml(title)}</span>`,
        `<table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155">
            ${renderDetails(p, t, time, labels, locale).map((d) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">${d}</td></tr>`).join("")}
          </table>`,
        t("entryAdminButton"),
        {
          buttonHref: adminLink,
          afterHtml: `<p style="color:#94a3b8;font-size:12px">${escHtml(t("inspectionLinkFallback", { link: adminLink }))}</p>`,
        },
      );

      for (const r of group) {
        if (r.email) void sendMailSafe(r.email, `${APP_NAME} – ${title}`, emailHtml);
      }
    }
  } catch { /* ignore notification errors */ }
}
