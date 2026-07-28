import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { setRead, unreadCountFor } from "@/lib/messageService";
import { errorResponse } from "@/lib/serviceResult";

/** POST = gelesen, DELETE = wieder ungelesen. Beide antworten mit dem neuen Ungelesen-Stand, damit
 *  der Client Glocke und App-Badge ohne zweiten Abruf nachziehen kann. */
async function setReadState(read: boolean, params: Promise<{ id: string }>) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  const userId = session.user.id;
  const { id } = await params;

  // Die Nachricht wird IMMER zusammen mit `subjectUserId` gesucht (siehe messageService): eine
  // geratene ID findet damit nichts, statt die Nachricht eines fremden Nutzers zu quittieren.
  if (!(await setRead(userId, id, read))) return errorResponse(404, "NOT_FOUND");
  // Bewusst der ungecachte Zähler: nach einem Schreibvorgang wäre die Request-Memoisierung genau
  // falsch und lieferte den Stand von vorher.
  return NextResponse.json({ ok: true, unread: await unreadCountFor(userId) });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setReadState(true, params);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setReadState(false, params);
}
