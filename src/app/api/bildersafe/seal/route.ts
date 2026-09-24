import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { bildersafeEnabled, isValidImageUrl } from "@/lib/constants";
import { markLastAction } from "@/lib/appMeta";
import { bildersafeMenuAction, getLatestKgEntry } from "@/lib/queries";

/**
 * Bildersafe: ein versiegeltes Schlüsselbox-Code-Foto an den AKTUELLEN Verschluss hängen.
 * Genutzt vom (+)-Menü („Schlüsselbox-Code versiegeln") — verfügbar während verschlossen, deckt
 * den Reinigungs-Re-Lock-Zyklus ab (nach jeder Öffnung ist es ein neuer Verschluss).
 *
 * **Einmal pro Verschluss** (Issue #111). Ein zweites Versiegeln ersetzte früher das erste still —
 * und damit den einzigen Nachweis eines Codes, der längst verdreht ist und sich nicht noch einmal
 * fotografieren lässt. Korrigiert wird vor dem Speichern, im Formular.
 */
const ALREADY_SEALED = "Für diesen Verschluss ist bereits ein Code versiegelt";

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
  // Über die geteilte Ableitung, nicht mit eigener Abfrage: sie kennt als einzige die Regel, dass
  // ein Verschluss ohne bestätigten Riegel noch kein Verschluss ist (`lockPending.ts`).
  // Dieselbe Regel wie der Menüeintrag (`bildersafeMenuAction`): „show" = nicht verschlossen,
  // null = der laufende Verschluss ist schon versiegelt.
  const latest = await getLatestKgEntry(userId);
  const action = bildersafeMenuAction(latest);
  if (action === "show" || !latest) {
    return NextResponse.json({ error: "Nicht verschlossen — versiegeln nur im verschlossenen Zustand" }, { status: 400 });
  }
  if (action === null) {
    return NextResponse.json({ error: ALREADY_SEALED }, { status: 409 });
  }

  // Zusätzlich bedingt schreiben: zwei gleichzeitige Anfragen bestehen beide die Prüfung oben,
  // gewinnen darf aber nur eine.
  const { count } = await prisma.entry.updateMany({
    where: { id: latest.id, codeImageUrl: null },
    data: { codeImageUrl, codeReadable: codeReadable ?? null },
  });
  if (count === 0) {
    return NextResponse.json({ error: ALREADY_SEALED }, { status: 409 });
  }
  markLastAction();
  return NextResponse.json({ ok: true });
}
