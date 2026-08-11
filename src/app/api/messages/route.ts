import { NextRequest, NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { requireApi } from "@/lib/authGuards";
import { listMessagesFor } from "@/lib/messageService";
import { presentMessages } from "@/lib/messagePresenter";
import { parseMessageFilter } from "@/lib/messageCategories";

/** GET /api/messages?page=&unread=&category=&sender= — eine Seite des eigenen Posteingangs.
 *
 *  Der Scope kommt AUSSCHLIESSLICH aus der Session — nie aus Query oder Body: eine `userId` am
 *  Aufrufer wäre die offene Tür zum Posteingang eines fremden Nutzers.
 *
 *  Die Filter liest `parseMessageFilter` — dieselbe Stelle, an der der Client sie schreibt. */
export async function GET(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const [result, locale] = await Promise.all([
    listMessagesFor(session.user.id, {
      page: Number(req.nextUrl.searchParams.get("page") ?? 1),
      filter: parseMessageFilter(req.nextUrl.searchParams),
    }),
    getLocale(),
  ]);
  // Kein Ungelesen-Stand in der Antwort: diese Route blättert nur, und Blättern ändert ihn nicht.
  return NextResponse.json({
    messages: await presentMessages(result.messages, locale),
    page: result.page,
    pageCount: result.pageCount,
  });
}
