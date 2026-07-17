import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { bildersafeEnabled, isValidImageUrl } from "@/lib/constants";
import { markLastAction } from "@/lib/appMeta";

/**
 * Bildersafe: ein (neues) versiegeltes Schlüsselbox-Code-Foto an den AKTUELLEN Verschluss hängen.
 * Genutzt vom (+)-Menü („Schlüsselbox-Code versiegeln") — verfügbar während verschlossen, deckt
 * den Reinigungs-Re-Lock-Zyklus ab (neuer Code nach jeder Reinigungsöffnung).
 */
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!bildersafeEnabled()) return NextResponse.json({ error: "Bildersafe nicht aktiviert" }, { status: 404 });

  const userId = session.user.id;
  const { codeImageUrl, codeReadable } = await req.json();
  if (!codeImageUrl || !isValidImageUrl(codeImageUrl)) {
    return NextResponse.json({ error: "Ungültiges Code-Foto" }, { status: 400 });
  }

  // Aktueller Verschluss = jüngster VERSCHLUSS/OEFFNEN-Eintrag, der ein VERSCHLUSS ist (= verschlossen).
  const latest = await prisma.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { id: true, type: true },
  });
  if (!latest || latest.type !== "VERSCHLUSS") {
    return NextResponse.json({ error: "Nicht verschlossen — versiegeln nur im verschlossenen Zustand" }, { status: 400 });
  }

  await prisma.entry.update({
    where: { id: latest.id },
    data: { codeImageUrl, codeReadable: codeReadable ?? null },
  });
  markLastAction();
  return NextResponse.json({ ok: true });
}
