import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoxSync } from "@/lib/boxSync";
import { getActiveSperrzeit } from "@/lib/queries";
import { parseReinigungsFenster } from "@/lib/reinigungService";
import { APP_TZ } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Absicht (Tracker → Heimdall): die aktive Keyholder-Sperrzeit und die Reinigungs-Regeln des Subs.
 *
 * `sperrzeit` — Heimdall faltet `endetAt` per Hybrid-Regel in seine `lockUntil` (gekappt durch
 * hardCap). Unverändert seit P1.
 *
 * `reinigung` — NEU. Die Zeitfenster steuern, wann die Box physischen Schlüsselzugriff freigibt.
 * Bisher verliessen sie den Tracker nie: er nutzt sie nur für die Wiederverschluss-Frist im
 * Strafbuch, und auf der Box mussten sie ein zweites Mal von Hand gepflegt werden. Eine Änderung im
 * Admin-UI erreichte die Hardware also nicht — die beiden Konfigurationen konnten beliebig
 * auseinanderlaufen, ohne dass es irgendwo auffiel.
 *
 * `fenster` ist Wanduhrzeit des Subs, deshalb liegt `timezone` bei: ohne sie legte die Box die
 * Zeiten in ihrer eigenen Zone aus.
 *
 * Additiv: eine Box, die `reinigung` nicht kennt, ignoriert das Feld und verhält sich wie bisher.
 * Ob sie die Fenster ehrt, entscheidet ihre Firmware — der Tracker liefert sie, mehr nicht.
 */
export async function GET(req: NextRequest) {
  const denied = requireBoxSync(req);
  if (denied) return denied;

  // Heimdall mappt per Username (kein cuid-Lookup nötig).
  const username = req.nextUrl.searchParams.get("username");
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, timezone: true,
      reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Unknown user" }, { status: 404 });

  const sperre = await getActiveSperrzeit(user.id);

  return NextResponse.json({
    sperrzeit: sperre
      ? {
          endetAt: sperre.endetAt?.toISOString() ?? null,
          indefinite: sperre.endetAt === null,
          reinigungErlaubt: sperre.reinigungErlaubt,
        }
      : null,
    reinigung: {
      erlaubt: user.reinigungErlaubt ?? false,
      maxMinutenProPause: user.reinigungMaxMinuten ?? 15,
      /** 0 = unbegrenzt — dieselbe Sentinel-Regel wie im Admin-UI und in `buildReinigungView`. */
      maxProTag: user.reinigungMaxProTag ?? 0,
      /** Erlaubte Tages-Zeitfenster, leer = nicht zeitgebunden. `parseReinigungsFenster` verwirft
       *  ungültige und über Mitternacht laufende Paare — die Box bekommt nur valide Fenster. */
      fenster: parseReinigungsFenster(user.reinigungsFenster),
      /** IANA-Zone, in der `fenster` zu lesen ist. */
      timezone: user.timezone ?? APP_TZ,
    },
  });
}
