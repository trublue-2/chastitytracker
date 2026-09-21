import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { prepareEmailInput } from "@/lib/loginIdentity";
import { isUniqueConstraintOn } from "@/lib/prismaErrors";

/** Die hinterlegte Adresse des angemeldeten Users. Existiert, damit das Feedback-Formular sein
 *  Pflichtfeld vorbelegen kann, ohne dass jede Seite die Adresse mitrendern muss — geladen wird
 *  erst, wenn das Formular geöffnet wird. */
export async function GET() {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  return NextResponse.json({ email: user?.email ?? null });
}

// Eigener Handler statt userSelfFieldRoute: normalisiert (leer → null), prüft die Adresse auch
// über andere Schreibweisen und mappt den Unique-Constraint auf 409 emailTaken — beides passt nicht in den generischen „validieren & schreiben"-Ablauf.
export async function PATCH(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { email } = await req.json();
  // Gespeichert wird die EINE Schreibweise (`normalizeEmail`) — sonst stünden `A@x.ch` und `a@x.ch`
  // nebeneinander, und die Anmeldung per E-Mail ginge für beide nicht mehr.
  const prepared = await prepareEmailInput(email, session.user.id);
  if ("error" in prepared) return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  const value = prepared.value;

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { email: value },
    });
  } catch (e: unknown) {
    if (isUniqueConstraintOn(e, "email")) {
      return NextResponse.json({ error: "emailTaken" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
