import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminActor } from "@/lib/authGuards";
import { isDevBypassEnabled } from "@/lib/devMode";
import { createEntryForUser } from "@/lib/entryCreateService";

/**
 * Ein Ereignis für einen Träger nachtragen — der Keyholder-Pfad.
 *
 * Die REGELN stehen in `entryCreateService.ts`: Rückdatierung, Nachbar-Prüfung, Sperrzeit-Freigabe,
 * Erfüllung, Riegel-Felder und die Meldung an die übrigen Kontrolleure. Sie liegen dort, weil die
 * KI-Keyholderin denselben Weg über den MCP nimmt (`add_entry`) — zwei Fassungen dieser Kette wären
 * beim nächsten Umbau zwei verschiedene Wahrheiten darüber, was ein Nachtrag anstösst.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, type, startTime, note, oeffnenGrund, orgasmusArt, imageUrl, imageExifTime, kontrollCode, deviceId,
    keyInBox, boxImageUrl } = body;

  if (!userId) return NextResponse.json({ error: "USER_ID_REQUIRED" }, { status: 400 });

  const session = await requireKeyholderOrAdminActor(userId);
  if (session instanceof NextResponse) return session;

  // Ziel-User (= Entry-Eigentümer) laden — dessen Reason-Listen governieren die Validierung.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });

  const result = await createEntryForUser(
    user,
    { type, startTime, note, oeffnenGrund, orgasmusArt, imageUrl, imageExifTime, kontrollCode, deviceId,
      // Geprüft, nicht geschrieben — wie vor der Extraktion (Begründung an `EntryCreateInput`).
      keyInBox, boxImageUrl },
    { actorUserId: session.user.id, allowFuture: isDevBypassEnabled(req.headers.get("host")) },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.entry, { status: 201 });
}
