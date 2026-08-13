import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";
import { judgeOffense, type StoredOffenseType } from "@/lib/strafurteilService";

/**
 * Der Browser-Rand des Urteils — dieselbe Geschäftslogik wie der MCP (`judge_offense`), weil beide
 * durch {@link judgeOffense} gehen.
 *
 * DASS das hier nur noch ein Rand ist, ist der Punkt. Die Route schrieb ihren `StrafeRecord` früher
 * selbst, und die zweite Umsetzung lief prompt auseinander: wer im Browser verwarf, schickte dem
 * Träger nichts, und ein Urteil zog die daran hängende Strafaufgabe nicht zurück. Beides waren keine
 * Entscheidungen, sondern Auslassungen — sichtbar erst, als jemand beide Wege nebeneinander legte.
 * Was hier bleibt, sind die Fragen, die wirklich zur HTTP-Schicht gehören: wer darf, was steht im
 * Body, und darf über dieses Vergehen überhaupt (noch einmal) geurteilt werden.
 */
export async function POST(req: Request) {
  const { userId, offenseType, refId, status, reason } = await req.json();
  // action: "punish" (bestraft, default) | "dismiss" (verworfen / keine Strafe)
  const action: "punish" | "dismiss" = status === "DISMISSED" ? "dismiss" : "punish";

  if (!userId) return errorResponse(400, "USER_ID_REQUIRED");
  // Ohne ref gibt es kein Vergehen, auf das sich das Urteil bezieht — gleiche Abbildung wie im
  // `DELETE /api/admin/offense`: fehlende Referenz und unbekannte Referenz sind derselbe Satz.
  if (!refId) return errorResponse(400, "OFFENSE_REF_REQUIRED");
  // Die Art ist eine Behauptung des Clients, die der Service gegen die Erkennung prüft (siehe
  // `JudgeOffenseParams.offenseType`). Fehlt sie ganz, wäre das stillschweigend „irgendeins" —
  // aus dem Strafbuch kommt sie immer mit, denn dort steht sie am geklickten Abschnitt.
  if (!offenseType) return errorResponse(400, "OFFENSE_TYPE_REQUIRED");

  const session = await requireKeyholderOrAdminActor(userId);
  if (session instanceof NextResponse) return session;

  // Von hier an ist alles Geschäftslogik und steht genau einmal: Erkennungs-Schranke, Straftext-
  // Regel, das Urteil selbst, der Rückzug einer daran hängenden Strafaufgabe, die Meldung an den
  // Träger unter dem NAMEN des Handelnden und der `lastAction`-Stempel.
  //
  // `allowRevision: false` ist DIE Produktregel dieses Wegs: im Browser wird EINMAL geurteilt. Das
  // Strafbuch bietet Bestrafen, Strafaufgabe und Verwerfen nur an einer unbeurteilten Zeile an; ist
  // eine Zeile beurteilt, steht dort das Urteil mit „Rückgängig". Eine POST-Anfrage auf ein bereits
  // beurteiltes Vergehen kommt deshalb nicht aus einer Absicht, sondern aus einer VERALTETEN Seite —
  // und würde ein fremdes Urteil samt seiner Strafaufgabe stillschweigend ersetzen. Der MCP darf
  // revidieren (er lässt die Angabe weg), weil ein Agent seine Absicht ausspricht statt ein Formular
  // abzuschicken; hier ist der Weg zurück ausdrücklich „Rückgängig" (DELETE → reopen).
  //
  // Warum die Schranke im SERVICE liegt und nicht als Abfrage hier davor: nur dort ist sie atomar
  // (`create` gegen die Eindeutigkeit von `refId`). Eine vorgeschaltete Abfrage liesse zwischen
  // Lesen und Schreiben ein Fenster — und „Wurde bestraft" und „Verwerfen" lassen sich im selben Tab
  // gleichzeitig aufklappen, also nicht nur theoretisch gleichzeitig abschicken. Beide kämen durch,
  // die zweite überschriebe die erste, und der Träger läse zu EINEM Vergehen „Strafe verhängt" UND
  // „Vergehen fallengelassen", während die Datenbank nur eines davon hält.
  //
  // `offenseType` ist der einzige Wert, den die Route umwandelt: der rohe Body ist untypisiert, der
  // Service tippt hart. Geprüft wird der Wert im Service gegen die ERKENNUNG — eine erfundene Art
  // findet dort kein Vergehen und endet als OFFENSE_TYPE_MISMATCH, nicht als stilles „irgendeins".
  const result = await judgeOffense({
    userId, refId, action, text: reason,
    offenseType: offenseType as StoredOffenseType,
    allowRevision: false,
  }, sessionActor(session));
  if (!result.ok) return serviceFailure(result);
  // 201 wie bisher — das Urteil ist neu (ein bestehendes hätte der 409 des Service abgefangen). Der
  // Body ist nicht mehr die rohe Datenbank-Zeile: gelesen hat sie nie jemand, und der Service gibt
  // sie bewusst nicht heraus.
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { refId } = await req.json();
  if (!refId) return errorResponse(400, "OFFENSE_REF_REQUIRED");

  const record = await prisma.strafeRecord.findUnique({ where: { refId } });
  if (!record) return errorResponse(404, "JUDGMENT_NOT_FOUND");

  const session = await requireKeyholderOrAdminActor(record.userId);
  if (session instanceof NextResponse) return session;

  // Über `judgeOffense` statt mit einem eigenen `delete`: die Rücknahme zieht auch die Strafaufgabe
  // zurück, die am Urteil hängt. Von Hand gelöscht bliebe sie beim Sub stehen — die App forderte
  // weiter eine Strafe ein, die es nicht mehr gibt, und ihr Verstreichen wäre später ein neues
  // Vergehen. Genau diese Regel galt bisher nur auf dem MCP-Weg, während der Knopf hier daran vorbeilief.
  const result = await judgeOffense({ userId: record.userId, refId, action: "reopen" }, sessionActor(session));
  if (!result.ok) return serviceFailure(result);
  return NextResponse.json({ ok: true });
}

/**
 * Strafe als erledigt / wieder offen markieren (schliesst bzw. öffnet den Loop).
 *
 * Über `judgeOffense` statt mit einem eigenen `update`: das war zuletzt eine zweite Umsetzung
 * desselben Vorgangs, und sie war schon auseinandergelaufen — der Service schreibt
 * `erledigtAt: rec.erledigtAt ?? now` (der Zeitpunkt sagt, wann die Strafe abgeleistet war), die
 * Route schrieb `new Date()`, sodass ein zweiter Klick auf „Als erledigt" den Zeitpunkt nach vorne
 * schob. Dass sie überhaupt eigenständig blieb, lag allein an der fehlenden Gegenrichtung im Service
 * — die gibt es jetzt als `uncomplete`.
 *
 * Der `findUnique` bleibt: die Berechtigung hängt am TRÄGER der Zeile, und den kennt die Route erst,
 * wenn sie ihn gelesen hat. Die inhaltlichen Schranken („gibt es ein Urteil", „ist es eine Strafe")
 * prüft dagegen der Service — hier steht nur noch, was ohne Träger-Id nicht zu beantworten wäre.
 */
export async function PATCH(req: Request) {
  const { refId, done } = await req.json();
  if (!refId) return errorResponse(400, "OFFENSE_REF_REQUIRED");

  const record = await prisma.strafeRecord.findUnique({ where: { refId }, select: { userId: true } });
  if (!record) return errorResponse(404, "JUDGMENT_NOT_FOUND");

  const session = await requireKeyholderOrAdminActor(record.userId);
  if (session instanceof NextResponse) return session;

  const result = await judgeOffense(
    { userId: record.userId, refId, action: done === false ? "uncomplete" : "complete" },
    sessionActor(session),
  );
  if (!result.ok) return serviceFailure(result);
  return NextResponse.json({ ok: true });
}
