import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bildersafeEnabled, isValidImageUrl } from "@/lib/constants";

/**
 * Bildersafe: ein (neues) versiegeltes Schlüsselbox-Code-Foto an den AKTUELLEN Verschluss hängen.
 * Genutzt vom (+)-Menü („Schlüsselbox-Code versiegeln") — verfügbar während verschlossen, deckt
 * den Reinigungs-Re-Lock-Zyklus ab (neuer Code nach jeder Reinigungsöffnung).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  return NextResponse.json({ ok: true });
}
