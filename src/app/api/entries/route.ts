import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";
import { verifyKontrolleCode } from "@/lib/verifyCode";
import { VALID_TYPES, ORGASMUS_ARTEN, OEFFNEN_GRUENDE, isValidImageUrl, parseOrgasmusArtBase, GRUND_I18N_KEYS, TYPE_EMAIL_COLORS } from "@/lib/constants";
import { sendPushToUser } from "@/lib/push";
import { sendMail, escHtml } from "@/lib/mail";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.entry.findMany({
    where: { userId: session.user.id },
    orderBy: { startTime: "desc" },
    select: {
      id: true, type: true, startTime: true, imageUrl: true, note: true,
      orgasmusArt: true, kontrollCode: true, oeffnenGrund: true, verifikationStatus: true,
    },
    take: 200,
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // verifikationStatus is never accepted from client – set server-side only
  const { type, startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode, forcedReinigung } = body;

  if (!isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Ungültige imageUrl" }, { status: 400 });
  }
  if (!startTime) return NextResponse.json({ error: "startTime is required" }, { status: 400 });
  if (new Date(startTime) > new Date()) {
    return NextResponse.json({ error: "Zeitpunkt darf nicht in der Zukunft liegen" }, { status: 400 });
  }
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Ungültiger Typ" }, { status: 400 });
  }
  if (type === "OEFFNEN") {
    if (!oeffnenGrund || !OEFFNEN_GRUENDE.includes(oeffnenGrund)) {
      return NextResponse.json({ error: "Grund der Öffnung ist erforderlich" }, { status: 400 });
    }
    if (!note?.trim()) {
      return NextResponse.json({ error: "Kommentar ist erforderlich" }, { status: 400 });
    }
  }
  if (type === "PRUEFUNG" && !imageUrl) {
    return NextResponse.json({ error: "Foto ist bei Kontrolle zwingend" }, { status: 400 });
  }
  const orgasmusArtBase = parseOrgasmusArtBase(orgasmusArt);
  if (type === "ORGASMUS" && !(ORGASMUS_ARTEN as readonly string[]).includes(orgasmusArtBase ?? "")) {
    return NextResponse.json({ error: "Ungültige Art" }, { status: 400 });
  }

  // Wrap state-check + create in a transaction to prevent TOCTOU races
  let entry: Awaited<ReturnType<typeof prisma.entry.create>>;
  let withdrawnSperrzeit = false;
  let lockStartTime: Date | null = null;
  try {
    entry = await prisma.$transaction(async (tx) => {
      if (type === "VERSCHLUSS") {
        const latest = await tx.entry.findFirst({
          where: { userId: session.user.id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
        });
        if (latest?.type === "VERSCHLUSS") throw Object.assign(new Error(), { _code: "ALREADY_LOCKED" });
        if (latest?.type === "OEFFNEN" && new Date(startTime) <= latest.startTime) {
          throw Object.assign(new Error(), { _code: "TIME_BEFORE" });
        }
      }
      if (type === "OEFFNEN") {
        const latest = await tx.entry.findFirst({
          where: { userId: session.user.id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
        });
        if (!latest || latest.type !== "VERSCHLUSS") throw Object.assign(new Error(), { _code: "NOT_LOCKED" });
        if (new Date(startTime) <= latest.startTime) throw Object.assign(new Error(), { _code: "TIME_BEFORE" });
        lockStartTime = latest.startTime;
      }

      // Trotziges Öffnen während aktiver SPERRZEIT → Sperrzeit aufheben (Strafbuch greift separat)
      if (type === "OEFFNEN") {
        const now = new Date();
        const result = await tx.verschlussAnforderung.updateMany({
          where: {
            userId: session.user.id,
            art: "SPERRZEIT",
            withdrawnAt: null,
            OR: [{ endetAt: { gt: now } }, { endetAt: null }],
          },
          data: { withdrawnAt: now },
        });
        if (result.count > 0) withdrawnSperrzeit = true;
      }

      const created = await tx.entry.create({
        data: {
          userId: session.user.id,
          type,
          startTime: new Date(startTime),
          imageUrl: imageUrl || null,
          imageExifTime: imageExifTime ? new Date(imageExifTime) : null,
          note: note || null,
          oeffnenGrund: oeffnenGrund || null,
          orgasmusArt: orgasmusArt || null,
          kontrollCode: kontrollCode || null,
          verifikationStatus: null,
        },
      });

      // KontrollAnforderung verknüpfen + fulfilledAt server-seitig setzen (unveränderlich)
      if (type === "PRUEFUNG" && kontrollCode) {
        await tx.kontrollAnforderung.updateMany({
          where: { userId: session.user.id, code: kontrollCode, entryId: null, withdrawnAt: null },
          data: { entryId: created.id, fulfilledAt: new Date() },
        });
      }

      // VerschlussAnforderung (ANFORDERUNG) als erfüllt markieren + ggf. SPERRZEIT erstellen
      if (type === "VERSCHLUSS") {
        const offeneAnforderung = await tx.verschlussAnforderung.findFirst({
          where: { userId: session.user.id, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
        });
        if (offeneAnforderung) {
          await tx.verschlussAnforderung.update({
            where: { id: offeneAnforderung.id },
            data: { fulfilledAt: new Date() },
          });
          if (offeneAnforderung.dauerH) {
            await tx.verschlussAnforderung.create({
              data: {
                userId: session.user.id,
                art: "SPERRZEIT",
                nachricht: offeneAnforderung.nachricht,
                endetAt: new Date(Date.now() + offeneAnforderung.dauerH * 60 * 60 * 1000),
              },
            });
          }
        }
      }

      return created;
    });
  } catch (e: unknown) {
    const code = (e as { _code?: string })?._code;
    if (code === "ALREADY_LOCKED") return NextResponse.json({ error: "Verschluss nur möglich wenn aktuell offen" }, { status: 400 });
    if (code === "NOT_LOCKED") return NextResponse.json({ error: "Öffnen nur möglich wenn aktuell verschlossen" }, { status: 400 });
    if (code === "TIME_BEFORE") return NextResponse.json({ error: "Zeitpunkt muss nach dem vorherigen Eintrag liegen" }, { status: 400 });
    throw e;
  }

  // Auto-create StrafeRecord when user bypassed the daily REINIGUNG limit
  if (type === "OEFFNEN" && forcedReinigung === true && oeffnenGrund === "REINIGUNG") {
    try {
      await prisma.strafeRecord.create({
        data: {
          userId: session.user.id,
          offenseType: "REINIGUNG_LIMIT",
          refId: entry.id,
          bestraftDatum: new Date(),
          notiz: null,
        },
      });
    } catch { /* ignore if duplicate — e.g. offline replay */ }
  }

  if (type === "PRUEFUNG" && kontrollCode) {
    trackEvent("kontrolle.fulfilled", { type });
  } else {
    trackEvent(`entry.created.${type}` as Parameters<typeof trackEvent>[0]);
  }

  // Notify admins based on per-user NotificationPreference (fire-and-forget)
  (async () => {
    try {
      const eventTypes: string[] = [];
      if (type === "VERSCHLUSS") eventTypes.push("VERSCHLUSS");
      if (type === "OEFFNEN") {
        eventTypes.push("OEFFNUNG_IMMER");
        if (withdrawnSperrzeit) eventTypes.push("OEFFNUNG_VERBOTEN");
      }
      if (type === "ORGASMUS") eventTypes.push("ORGASMUS");
      if (type === "PRUEFUNG" && kontrollCode) eventTypes.push("KONTROLLE_ANGEFORDERT");
      if (type === "PRUEFUNG" && !kontrollCode) eventTypes.push("KONTROLLE_FREIWILLIG");

      if (eventTypes.length === 0) return;

      const prefs = await prisma.notificationPreference.findMany({
        where: { userId: session.user.id, eventType: { in: eventTypes }, OR: [{ mail: true }, { push: true }] },
      });
      if (prefs.length === 0) return;

      const shouldPush = prefs.some((p) => p.push);
      const shouldMail = prefs.some((p) => p.mail);

      // Build descriptive message
      const username = session.user.name ?? "User";
      const time = formatDateTime(new Date(startTime));
      const tOpen = await getTranslations({ locale: "de", namespace: "openForm" });
      let title = "";
      let pushBody = "";

      const grundLabel = (g: string) =>
        GRUND_I18N_KEYS[g as keyof typeof GRUND_I18N_KEYS]
          ? tOpen(GRUND_I18N_KEYS[g as keyof typeof GRUND_I18N_KEYS])
          : g;

      if (type === "VERSCHLUSS") {
        title = `${username} hat sich eingeschlossen`;
        pushBody = time;
      } else if (type === "OEFFNEN") {
        title = `${username} hat sich geöffnet`;
        pushBody = oeffnenGrund ? `${time} · Grund: ${grundLabel(oeffnenGrund)}` : time;
      } else if (type === "ORGASMUS") {
        title = `${username} — Orgasmus`;
        pushBody = orgasmusArt ? `${time} · ${orgasmusArt}` : time;
      } else if (type === "PRUEFUNG") {
        title = kontrollCode ? `${username} hat Kontrolle erfüllt` : `${username} — Selbstkontrolle`;
        pushBody = kontrollCode ? `${time} · Code: ${kontrollCode}` : time;
      }

      const adminUrl = `/admin/users/${session.user.id}`;
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const adminLink = `${baseUrl}${adminUrl}`;

      // Fetch admins once for both channels
      const admins = await prisma.user.findMany({
        where: { role: "admin" },
        select: { id: true, email: true },
      });

      if (shouldPush) {
        await Promise.allSettled(
          admins.map((a) => sendPushToUser(a.id, title, pushBody, adminUrl))
        );
      }
      if (shouldMail) {
        const details: string[] = [];
        details.push(`<strong>Zeitpunkt:</strong> ${escHtml(time)}`);

        if (type === "OEFFNEN" && oeffnenGrund) {
          details.push(`<strong>Grund:</strong> ${escHtml(grundLabel(oeffnenGrund))}`);
        }
        if (type === "ORGASMUS" && orgasmusArt) {
          details.push(`<strong>Art:</strong> ${escHtml(orgasmusArt)}`);
        }
        if (kontrollCode) {
          details.push(`<strong>Siegel / Code:</strong> <span style="font-family:monospace;font-weight:bold;color:#f97316">${escHtml(kontrollCode)}</span>`);
        }
        if (type === "OEFFNEN" && lockStartTime) {
          const dur = formatDuration(lockStartTime, new Date(startTime));
          details.push(`<strong>Tragedauer:</strong> ${escHtml(dur)}`);
        }

        details.push(`<strong>Foto:</strong> ${imageUrl ? "Ja ✓" : "Nein"}`);

        if (note) {
          details.push(`<strong>Notiz:</strong> <em>${escHtml(note)}</em>`);
        }

        const accent = TYPE_EMAIL_COLORS[type] ?? "#1e293b";

        const emailHtml = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="border-left:4px solid ${accent};padding-left:16px;margin-bottom:16px">
            <h2 style="color:#1e293b;margin:0 0 4px 0">${escHtml(title)}</h2>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155">
            ${details.map((d) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">${d}</td></tr>`).join("")}
          </table>
          <p style="margin-top:20px">
            <a href="${escHtml(adminLink)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:14px">
              Im Admin-Dashboard ansehen →
            </a>
          </p>
          <p style="color:#94a3b8;font-size:12px;margin-top:12px">Falls der Link nicht funktioniert: ${escHtml(adminLink)}</p>
        </div>`;

        for (const admin of admins) {
          if (admin.email) {
            sendMail(admin.email, `KG-Tracker – ${title}`, emailHtml).catch(() => {});
          }
        }
      }
    } catch { /* ignore notification errors */ }
  })();

  // Server-side AI verification for PRUEFUNG entries — never trusted from client.
  // Runs after the transaction; failure leaves verifikationStatus: null (admin can manually verify).
  if (type === "PRUEFUNG" && imageUrl && kontrollCode) {
    try {
      const status = await verifyKontrolleCode(imageUrl, kontrollCode);
      if (status) {
        await prisma.entry.update({ where: { id: entry.id }, data: { verifikationStatus: status } });
        entry = { ...entry, verifikationStatus: status };
      }
    } catch (err) {
      console.error("[POST /api/entries] AI verification failed for entry", entry.id, err);
    }
  }

  if (type === "VERSCHLUSS" || type === "OEFFNEN") {
    revalidatePath("/dashboard", "layout");
  }

  return NextResponse.json(entry, { status: 201 });
}
