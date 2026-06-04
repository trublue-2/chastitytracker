import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, escHtml } from "@/lib/mail";
import { requireAdminApi } from "@/lib/authGuards";
import { formatDateTime } from "@/lib/utils";
import { sendPushToUser } from "@/lib/push";
import { ORGASMUS_ANFORDERUNG_ARTEN, ORGASMUS_ARTEN } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const err = await requireAdminApi();
    if (err) return err;

    const { userId, art, nachricht, beginntAt, endetAt, vorgegebeneArt } = await req.json();

    if (!userId) return NextResponse.json({ error: "userId fehlt" }, { status: 400 });
    if (!ORGASMUS_ANFORDERUNG_ARTEN.includes(art)) {
      return NextResponse.json({ error: "art muss ANWEISUNG oder GELEGENHEIT sein" }, { status: 400 });
    }
    if (!beginntAt || !endetAt) {
      return NextResponse.json({ error: "Start und Ende des Fensters sind erforderlich" }, { status: 400 });
    }
    const beginnt = new Date(beginntAt);
    const endet = new Date(endetAt);
    if (Number.isNaN(beginnt.getTime()) || Number.isNaN(endet.getTime())) {
      return NextResponse.json({ error: "Ungültiger Zeitpunkt" }, { status: 400 });
    }
    if (endet <= beginnt) {
      return NextResponse.json({ error: "Ende muss nach dem Start liegen" }, { status: 400 });
    }
    if (vorgegebeneArt && !(ORGASMUS_ARTEN as readonly string[]).includes(vorgegebeneArt)) {
      return NextResponse.json({ error: "Ungültige Orgasmus-Art" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User nicht gefunden" }, { status: 404 });

    // Withdraw existing open request + create the new one atomically (one active at a time).
    const anforderung = await prisma.$transaction(async (tx) => {
      await tx.orgasmusAnforderung.updateMany({
        where: { userId, fulfilledAt: null, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });
      return tx.orgasmusAnforderung.create({
        data: {
          userId,
          art,
          nachricht: nachricht?.trim() || null,
          beginntAt: beginnt,
          endetAt: endet,
          vorgegebeneArt: vorgegebeneArt || null,
        },
      });
    });

    const istAnweisung = art === "ANWEISUNG";
    const betreff = istAnweisung ? "Orgasmus angewiesen" : "Orgasmus-Gelegenheit";
    const einleitung = istAnweisung
      ? "Der Keyholder weist dich an, in diesem Zeitfenster einen Orgasmus zu erfassen."
      : "Der Keyholder gibt dir in diesem Zeitfenster die Gelegenheit für einen Orgasmus.";

    if (user.email) {
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const nachrichtHtml = nachricht?.trim()
        ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#713f12">Nachricht des Keyholders:</p><p style="margin:0;font-size:15px;color:#422006">${escHtml(nachricht.trim())}</p></div>`
        : "";
      const artHtml = vorgegebeneArt ? `<p><strong>Vorgegebene Art:</strong> ${escHtml(vorgegebeneArt)}</p>` : "";
      await sendMail(
        user.email,
        `KG-Tracker – ${betreff}`,
        `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e293b">${escHtml(betreff)}</h2>
          <p>Hallo ${escHtml(user.username)},</p>
          <p>${escHtml(einleitung)}</p>
          ${nachrichtHtml}
          <p><strong>Fenster:</strong> ${formatDateTime(beginnt)} – ${formatDateTime(endet)}</p>
          ${artHtml}
          <p>
            <a href="${baseUrl}/dashboard" style="display:inline-block;background:#be185d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">
              Zum Dashboard →
            </a>
          </p>
        </div>
        `
      );
    }

    const pushParts: string[] = [`Fenster: ${formatDateTime(beginnt)} – ${formatDateTime(endet)}`];
    if (vorgegebeneArt) pushParts.push(vorgegebeneArt);
    if (nachricht?.trim()) pushParts.push(nachricht.trim());
    sendPushToUser(userId, betreff, pushParts.join(" · "), "/dashboard").catch(() => { /* ignore push errors */ });

    return NextResponse.json({ ok: true, id: anforderung.id });
  } catch (err) {
    console.error("[POST /api/admin/orgasmus-anforderung]", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
