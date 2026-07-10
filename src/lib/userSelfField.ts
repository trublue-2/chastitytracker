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
 */
export function userSelfFieldRoute(
  column: SelfEditableUserField,
  validate: (value: unknown, session: ApiSession) => string | null | Promise<string | null>,
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
      data: { [column]: value } as Prisma.UserUpdateInput,
    });

    return NextResponse.json({ ok: true });
  };
}
