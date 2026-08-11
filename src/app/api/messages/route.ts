import { NextRequest, NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { requireApi } from "@/lib/authGuards";
import { listMessagesFor, type MessageFilter } from "@/lib/messageService";
import { presentMessages } from "@/lib/messagePresenter";
import { isMessageCategory } from "@/lib/messageCategories";
import { MESSAGE_SENDER_KINDS, type MessageSenderKind } from "@/lib/messageService";

/**
 * Die Filter aus den Query-Parametern — unbekannte Werte fallen weg, statt den Aufruf abzuweisen.
 *
 * Ein Filter ist eine ANSICHT, kein Vorgang: ein veralteter Link mit einer Kategorie, die es nicht
 * mehr gibt, soll den ungefilterten Posteingang zeigen und keinen Fehler.
 */
function parseFilter(params: URLSearchParams): MessageFilter {
  const category = params.get("category");
  const sender = params.get("sender");
  return {
    unreadOnly: params.get("unread") === "1",
    ...(category && isMessageCategory(category) ? { category } : {}),
    ...(sender && (MESSAGE_SENDER_KINDS as readonly string[]).includes(sender)
      ? { senderKind: sender as MessageSenderKind }
      : {}),
  };
}

/** GET /api/messages?page=&unread=&category=&sender= — eine Seite des eigenen Posteingangs.
 *
 *  Der Scope kommt AUSSCHLIESSLICH aus der Session — nie aus Query oder Body: eine `userId` am
 *  Aufrufer wäre die offene Tür zum Posteingang eines fremden Nutzers. */
export async function GET(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  const userId = session.user.id;

  // Kein Ungelesen-Stand in der Antwort: diese Route blättert nur, und Blättern ändert ihn nicht.
  const page = Number(req.nextUrl.searchParams.get("page") ?? 1);
  const [result, locale] = await Promise.all([
    listMessagesFor(userId, { page: Number.isFinite(page) ? page : 1, filter: parseFilter(req.nextUrl.searchParams) }),
    getLocale(),
  ]);
  return NextResponse.json({
    messages: await presentMessages(result.messages, locale),
    page: result.page,
    pageCount: result.pageCount,
    total: result.total,
  });
}
