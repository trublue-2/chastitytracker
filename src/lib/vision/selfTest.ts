import { verifyCodeOnImage } from "@/lib/verifyCode";
import { withVisionConfig, type VisionConfig } from "./config";
import { SELF_TEST_IMAGE_BASE64 } from "./selfTestImage";

/**
 * „Einstellung testen" — prüft, ob ein Anbieter die Aufgabe KANN, nicht nur, ob er antwortet.
 *
 * Eine reine Verbindungsprobe sagt nichts über das, woran es in der Praxis scheitert. Ein lokales
 * Modell hat einmal jede erwartete Zahl bestätigt, auch falsche (#102): erreichbar, schnell, und
 * vollkommen wertlos. Deshalb zwei Durchgänge desselben Ablaufs, den eine echte Kontrolle nimmt
 * (`verifyCodeOnImage`, samt Gegenlesung):
 *
 * 1. mit dem RICHTIGEN Code → muss erkannt werden
 * 2. mit einem FALSCHEN Code → muss abgelehnt werden
 *
 * Erst beide zusammen heissen „brauchbar". Der zweite Durchgang läuft nur, wenn der erste trägt —
 * ein Modell, das nicht lesen kann, muss nicht auch noch beim Zurückweisen beobachtet werden.
 * Kosten: zwei bis vier kleine Aufrufe, ein Bruchteil eines Cents.
 */

export const SELF_TEST_CODE = "58314";
/** Stelle für Stelle ohne Verwechslungspaar zum echten Code — sonst hülfe der Unschärfe-Abgleich
 *  (`fuzzyMatch`) einem schwachen Modell über die Hürde. */
const WRONG_CODE = "20976";

export type SelfTestOutcome = "ok" | "unreadable" | "echo" | "keyRejected" | "modelNotFound" | "requestFailed" | "notConfigured";

export interface SelfTestResult {
  outcome: SelfTestOutcome;
  /** Was das Modell im ersten Durchgang gelesen hat — hilft, „liest falsch" von „liest nichts" zu
   *  unterscheiden. */
  detected: string | null;
  status?: number;
}

/** HTTP-Status aus beiden Fehlerformen: das Anthropic-SDK trägt `.status`, der OpenAI-kompatible
 *  Client schreibt ihn in die Meldung. */
function statusOf(e: unknown): number | undefined {
  const direct = (e as { status?: unknown })?.status;
  if (typeof direct === "number") return direct;
  const m = /vision HTTP (\d{3})/.exec((e as Error)?.message ?? "");
  return m ? Number(m[1]) : undefined;
}

export async function runVisionSelfTest(config: VisionConfig): Promise<SelfTestResult> {
  if (config.provider === "off") return { outcome: "notConfigured", detected: null };
  const img = { base64: SELF_TEST_IMAGE_BASE64, mediaType: "image/jpeg" as const };
  try {
    return await withVisionConfig(config, async (): Promise<SelfTestResult> => {
      const right = await verifyCodeOnImage(img, SELF_TEST_CODE);
      if (!right.match) return { outcome: "unreadable", detected: right.detected };
      const wrong = await verifyCodeOnImage(img, WRONG_CODE);
      return { outcome: wrong.match ? "echo" : "ok", detected: right.detected };
    });
  } catch (e) {
    const status = statusOf(e);
    if (status === 401 || status === 403) return { outcome: "keyRejected", detected: null, status };
    if (status === 404) return { outcome: "modelNotFound", detected: null, status };
    return { outcome: "requestFailed", detected: null, status };
  }
}
