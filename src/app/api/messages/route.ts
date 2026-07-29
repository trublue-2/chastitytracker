import { NextRequest, NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { requireApi } from "@/lib/authGuards";
import { listMessagesFor } from "@/lib/messageService";
import { presentMessages } from "@/lib/messagePresenter";

/** GET /api/messages?cursor=<id> — eine Seite des eigenen Posteingangs.
 *
 *  Der Scope kommt AUSSCHLIESSLICH aus der Session — nie aus Query oder Body: eine `userId` am
 *  Aufrufer wäre die offene Tür zum Posteingang eines fremden Nutzers. */
export async function GET(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  const userId = session.user.id;

  // Kein Ungelesen-Stand in der Antwort: diese Route blättert nur, und Blättern ändert ihn nicht.
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const [page, locale] = await Promise.all([listMessagesFor(userId, { cursor }), getLocale()]);
  return NextResponse.json({
    messages: await presentMessages(page.messages, locale),
    nextCursor: page.nextCursor,
  });
}
