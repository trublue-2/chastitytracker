import { NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/serviceResult";
import { heimdallEnabled } from "@/lib/constants";
import { getIsLocked, getCurrentLockKeyInBox } from "@/lib/queries";
import { setBoxCommandForUser } from "@/lib/boxCommand";
import { PENDING_LOCK_FILTER } from "@/lib/lockPending";
import { notifyHeimdall } from "@/lib/heimdallNotify";

export const dynamic = "force-dynamic";

// POST /api/box/relock — den Box-Schliessbefehl NEU setzen. Der Reparaturweg für genau einen
// Zustand: die Session läuft (Tracker sagt verschlossen, Schlüssel liegt laut Deklaration in der
// Box), aber die Box steht offen bzw. ihr SOLL ist offen — z.B. weil eine Sperrzeit ablief und die
// (scharfgestellte) Öffnung vollzogen wurde, oder weil das one-shot-lock verloren ging.
//
// Das pendingCommand-Modell ist consume-on-read ohne Ack („geht es verloren, setzt der Sub es
// einfach neu") — dieser Endpoint IST dieses Neu-Setzen. Vor v4.50.56 gab es dafür keinen
// bedienbaren Weg: das Verschluss-Formular lehnt bei laufender Session ab.
//
// UI-Konsument: aktuell KEINER (die (+)-Sheet-Aktion wurde in v4.50.57 bewusst entfernt —
// „Neu erfassen" erfasst nur Einträge). Geplanter Konsument ist die BoxStatusCard-Aktion
// (zurückgestellt, Entscheid 16.07); bis dahin bleibt der Endpoint der API-Reparaturweg.
export async function POST() {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!heimdallEnabled()) return NextResponse.json([]);
  const userId = session.user.id;

  const [locked, keyInBox, pending] = await Promise.all([
    getIsLocked(userId),
    getCurrentLockKeyInBox(userId),
    // Ein wartender Verschluss-Aufruf zählt hier MIT (docs/riegel-konzept.md): genau dann ist die
    // Box scharfgestellt, aber der Riegel meldet nichts — und genau dann ist dieser Endpunkt der
    // Reparaturweg. Ohne diese Zeile lehnte er ausgerechnet den Fall ab, für den es ihn gibt.
    prisma.entry.findFirst({ where: { userId, ...PENDING_LOCK_FILTER }, select: { id: true } }),
  ]);
  // Nur bei laufendem Verschluss (nicht in Reinigungspause): ohne Session gehört das Schliessen
  // in einen VERSCHLUSS-Eintrag — die Box folgt den Einträgen, das bleibt der Normalweg.
  if (!locked && !pending) return errorResponse(409, "BOX_RELOCK_NOT_LOCKED");
  // Schlüssel laut Deklaration NICHT in der Box (Reise) → ein lock wäre dieselbe Falschmeldung,
  // die keyInBox=false gerade verhindert. Beim wartenden Aufruf ist `keyInBox` null (er gilt ja
  // noch nicht) — dort ist die Frage schon beim Anlegen beantwortet: mit `false` wäre gar nicht
  // erst gewartet worden (`lockAwaitsBolt`).
  if (keyInBox === false) return errorResponse(409, "BOX_RELOCK_KEY_NOT_IN_BOX");

  await setBoxCommandForUser(prisma, userId, "lock");
  // Instant-Push (best effort) — sonst zieht die Box das Kommando beim nächsten Sync.
  notifyHeimdall(session.user.name, "lock");
  return NextResponse.json({ ok: true });
}
