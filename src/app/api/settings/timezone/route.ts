import { NextRequest, NextResponse } from "next/server";
import { isValidTimezone } from "@/lib/timezones";
import { requireApi, sessionActor } from "@/lib/authGuards";
import { setUserTimezone } from "@/lib/timezoneRules";

/**
 * PATCH /api/settings/timezone — die Zone des Trägers umstellen.
 *
 * Bleibt ein Selbst-Feld: wer reist, muss sie selbst umstellen können. Läuft aber NICHT über
 * `userSelfFieldRoute`, weil dort ein blosses `user.update` steht und die Umstellung eine Zeile in
 * der Historie braucht — sonst beurteilte das Strafbuch jede vergangene Reinigungsöffnung nach der
 * neuen Zone (siehe `timezoneRules.ts`). Damit ist es der dritte eigene Handler in dieser Familie,
 * neben `settings/email` und `settings/password`, und aus demselben Grund: ein Feld, dessen
 * Schreiben mehr ist als eine Zuweisung.
 */
export async function PATCH(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { timezone } = await req.json();
  if (!isValidTimezone(timezone)) {
    return NextResponse.json({ error: "invalidTimezone" }, { status: 400 });
  }

  await setUserTimezone(session.user.id, timezone, { changedBy: sessionActor(session) });
  return NextResponse.json({ ok: true });
}
