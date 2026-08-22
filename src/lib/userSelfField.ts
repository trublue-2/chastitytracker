import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi, type ApiSession } from "@/lib/authGuards";
import type { SelfEditableUserField } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

/**
 * Baut den PATCH-Handler für eine „User ändert EIN eigenes Feld"-Route:
 * Session-Guard → Body lesen → validieren → schreiben → `{ok:true}`.
 *
 * Bewusst NUR für die gleichförmigen Felder (timezone, locale, hideOwnTracker, startPage).
 * `settings/email` (trim→null + 409 emailTaken) und `settings/password` (anderer Body-Key +
 * bcrypt) bleiben eigene Handler — sie in Hooks zu pressen wäre mehr Indirektion als Ersparnis.
 *
 * Sicherheit: schreibt IMMER nur auf `session.user.id`, und `column` ist auf
 * `SelfEditableUserField` eingeschränkt. Damit ist die CLAUDE.md-Regel „Admin-Felder in
 * User-Settings brauchen requireAdminApi()" compilerseitig erzwungen statt bloss dokumentiert:
 * `userSelfFieldRoute("role", …)` kompiliert gar nicht erst.
 *
 * `validate` bekommt die Session mit, weil `startPage` gegen die Rolle des Aufrufers prüft
 * (`canControlSub`), und darf async sein. Rückgabe: Fehler-CODE (Client löst i18n auf) oder null.
 *
 * `transform` schreibt etwas anderes in die Spalte, als der Body enthielt. Gebraucht für
 * `dashboardLayout`: der Client schickt ein Objekt, die Spalte hält JSON — und die Umwandlung
 * gehört hinter die Prüfung, nicht davor. Ohne den Haken bräuchte es eine vierte Sonderroute
 * neben `email` und `password`, und mit ihr fiele die Compiler-Sperre auf
 * `SelfEditableUserField` weg.
 *
 * `transform` bekommt die Session aus demselben Grund wie `validate` — und muss **zustandsfrei**
 * sein. Der naheliegende Weg, das Prüfergebnis in einer Modulvariable zwischen beiden Aufrufen zu
 * merken, ist ein Datenleck: Modulzustand lebt im Server-Prozess, nicht in der Anfrage, und zwei
 * gleichzeitig speichernde Nutzer schrieben sich gegenseitig den Wert in die Zeile. Lieber
 * zweimal prüfen — die Prüfung ist rein und billig.
 */
export function userSelfFieldRoute(
  column: SelfEditableUserField,
  validate: (value: unknown, session: ApiSession) => string | null | Promise<string | null>,
  transform?: (value: unknown, session: ApiSession) => string | null,
): (req: NextRequest) => Promise<NextResponse> {
  return async function PATCH(req: NextRequest) {
    const session = await requireApi();
    if (session instanceof NextResponse) return session;

    const body = await req.json();
    const value = body[column];

    const errorCode = await validate(value, session);
    if (errorCode) return NextResponse.json({ error: errorCode }, { status: 400 });

    await prisma.user.update({
      where: { id: session.user.id },
      data: { [column]: transform ? transform(value, session) : value } as Prisma.UserUpdateInput,
    });

    return NextResponse.json({ ok: true });
  };
}
