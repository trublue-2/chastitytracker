import { NextRequest, NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { requireApi, requireControllerApi } from "@/lib/authGuards";
import {
  deleteMessage,
  deleteMessages,
  keyholderInbox,
  listMessages,
  setRead,
  setReadMany,
  subInbox,
  unreadCount,
  type InboxScope,
} from "@/lib/messageService";
import { presentMessages } from "@/lib/messagePresenter";
import { parseMessageFilter } from "@/lib/messageCategories";
import { parseMessageBulkBody } from "@/lib/messageBulk";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";

/**
 * Die Endpunkt-Familie EINES Posteingangs — einmal geschrieben, von beiden Sichten benutzt.
 *
 * Der Träger-Posteingang (`/api/messages/*`) und der der Keyholderin (`/api/admin/messages/*`) waren
 * Datei für Datei Zeile für Zeile dasselbe; sie unterschieden sich in genau ZWEI Werten — welcher
 * Guard fragt und welchen Scope er daraus baut. Kopien einer Route sind nicht bloss lang: sie
 * laufen still auseinander, weil eine Antwort-Form (`unread`, `affected`, 404 statt 200) nur an
 * einer der beiden Stellen nachgezogen wird und niemand einen Fehler bekommt. Genau das soll die
 * Keyholder-Seite nicht — sie soll dieselbe Sprache sprechen, nicht eine zweite, kleinere lernen.
 *
 * Was ALLE Antworten teilen:
 *  - Der Scope kommt AUSSCHLIESSLICH aus der Session bzw. dem Guard, nie aus Query oder Body. Eine
 *    `userId` am Aufrufer wäre beim Träger der fremde Posteingang und beim Keyholder jeder.
 *  - Jeder schreibende Aufruf antwortet mit dem neuen Ungelesen-Stand (ungecacht, weil nach einem
 *    Schreibvorgang), damit Glocke und App-Badge ohne zweiten Abruf nachziehen. Das Blättern nicht:
 *    es ändert ihn nicht.
 *  - Eine Id ausserhalb des Scopes trifft NICHTS. Beim einzelnen Vorgang ist das ein 404, im
 *    Mengen-Vorgang fällt sie heraus, ohne den Aufruf zu kippen — der Aufrufer sieht es an
 *    `affected`.
 */

/** Der Scope dieses Aufrufs — oder die Absage des Guards, die unverändert ausgeliefert wird. */
type ScopeResolver = () => Promise<InboxScope | NextResponse>;

/** Next.js reicht die Pfad-Parameter als Promise herein (App Router, Next 16). */
type IdContext = { params: Promise<{ id: string }> };

export interface InboxRoutes {
  /** `GET …?page=&unread=&category=&sender=` — eine Seite. */
  list: (req: NextRequest) => Promise<NextResponse>;
  /** `DELETE …/[id]` — räumt EINE Zeile aus dem Posteingang. */
  remove: (req: NextRequest, ctx: IdContext) => Promise<NextResponse>;
  /** `POST …/[id]/read` */
  markRead: (req: NextRequest, ctx: IdContext) => Promise<NextResponse>;
  /** `DELETE …/[id]/read` */
  markUnread: (req: NextRequest, ctx: IdContext) => Promise<NextResponse>;
  /** `POST …/bulk` */
  bulk: (req: NextRequest) => Promise<NextResponse>;
}

export function makeInboxRoutes(resolveScope: ScopeResolver): InboxRoutes {
  /** Gelesen/ungelesen ist EIN Vorgang mit zwei Richtungen — POST und DELETE liegen ohnehin in
   *  derselben Datei und sollen sich nicht in der Fehlerbehandlung unterscheiden. */
  async function setReadState(read: boolean, ctx: IdContext): Promise<NextResponse> {
    const scope = await resolveScope();
    if (scope instanceof NextResponse) return scope;
    const { id } = await ctx.params;

    // Die Nachricht wird IMMER zusammen mit dem Scope gesucht (siehe messageService): eine geratene
    // Id findet damit nichts, statt die Zeile eines fremden Trägers zu quittieren.
    if (!(await setRead(scope, id, read))) return errorResponse(404, "NOT_FOUND");
    return NextResponse.json({ ok: true, unread: await unreadCount(scope) });
  }

  return {
    async list(req) {
      const scope = await resolveScope();
      if (scope instanceof NextResponse) return scope;

      // Die Filter liest `parseMessageFilter` — dieselbe Stelle, an der der Client sie schreibt.
      const filter = parseMessageFilter(req.nextUrl.searchParams);
      // Der Ungelesen-Zähler des Filters MIT in die Runde (statt seriell danach): der Umschalter
      // nennt „Ungelesen M", und `M` respektiert die Sichtbarkeitsregel des Trägers (`unreadCount`
      // hat dafür den materialisierten Pfad), was ein blosses `count` nicht könnte.
      const [result, locale, unreadInFilter] = await Promise.all([
        listMessages(scope, {
          page: Number(req.nextUrl.searchParams.get("page") ?? 1),
          filter,
        }),
        getLocale(),
        unreadCount(scope, [], filter),
      ]);
      return NextResponse.json({
        messages: await presentMessages(result.messages, locale),
        page: result.page,
        pageCount: result.pageCount,
        unreadInFilter,
      });
    },

    async remove(_req, ctx) {
      const scope = await resolveScope();
      if (scope instanceof NextResponse) return scope;
      const { id } = await ctx.params;

      // Gelöscht wird NUR die Nachricht. Der Vorgang, auf den sie zeigt (Strafe, Kontrolle,
      // Sperrzeit), bleibt unberührt — eine Nachricht ist die Zustellung, nicht der Vorgang. Beim
      // Keyholder gilt zusätzlich die geteilte Zeile: siehe `deleteMessages` im Service.
      if (!(await deleteMessage(scope, id))) return errorResponse(404, "NOT_FOUND");
      return NextResponse.json({ ok: true, unread: await unreadCount(scope) });
    },

    markRead: (_req, ctx) => setReadState(true, ctx),
    markUnread: (_req, ctx) => setReadState(false, ctx),

    async bulk(req) {
      const scope = await resolveScope();
      if (scope instanceof NextResponse) return scope;

      // `req.json()` wirft bei einem kaputten oder leeren Body — ungefangen wäre das ein 500 auf eine
      // reine Eingabe-Frage. `null` läuft durch dieselbe Prüfung wie jeder andere untaugliche Body
      // und bekommt deren 400.
      const parsed = parseMessageBulkBody(await req.json().catch(() => null));
      if (!parsed.ok) return serviceFailure(parsed);
      const { ids, action } = parsed.data;

      const affected = action === "delete"
        ? await deleteMessages(scope, ids)
        : await setReadMany(scope, ids, action === "read");

      return NextResponse.json({ ok: true, affected, unread: await unreadCount(scope) });
    },
  };
}

/** Der eigene Posteingang: der Angemeldete ist Betreff UND Leser. */
export const ownInboxRoutes = makeInboxRoutes(async () => {
  const session = await requireApi();
  return session instanceof NextResponse ? session : subInbox(session.user.id);
});

/** Der Posteingang der Keyholderin: die `audience: "keyholders"`-Zeilen IHRER Träger. Wer das ist,
 *  sagt allein der Guard — ein Sub ohne eigene Träger bekommt dort 403 statt einer leeren Liste. */
export const keyholderInboxRoutes = makeInboxRoutes(async () => {
  const scope = await requireControllerApi();
  return scope instanceof NextResponse ? scope : keyholderInbox(scope.session.user.id, scope.subs);
});
