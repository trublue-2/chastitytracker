import { headers } from "next/headers";
import { logTimestamp } from "@/lib/logFormat";

export async function logAccess(adminName: string, path: string) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  console.log(`[ACCESS] ${logTimestamp().replace("T", " ")} | ${adminName} | ${path} | ${ip}`);
}

/** Strukturiertes Logging mit `[<scope>]`-Prefix. Felder als `key=value`-Pairs.
 *  Objekte werden via JSON.stringify serialisiert; primitives direkt. Timestamp im ISO-Format mit
 *  Offset (`logTimestamp`) am Anfang fuer einheitliches grep+sort — Lokalzeit statt UTC-`Z`, damit
 *  er neben den `[ACCESS]`-Zeilen dieselbe (korrekte) Wanduhrzeit zeigt.
 *
 *  Verwende fuer Failure-Diagnostik in Container-Logs (kein Telemetry-Replacement). */
export function structuredLog(scope: string, label: string, fields: Record<string, unknown>) {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "object" && v !== null ? JSON.stringify(v) : v}`);
  console.log(`[${scope}] ${logTimestamp()} ${label} ${parts.join(" ")}`);
}

/** Redaktiert lange Ziffernfolgen (>=4) — schuetzt Auth-Codes vor Log-Leak.
 *  Anwendbar auf KI-Antwort-Previews / parsed JSON, die einen erkannten Code enthalten koennen. */
export function redactDigits(s: string): string {
  return s.replace(/\d{4,}/g, (m) => `<${m.length}d>`);
}
