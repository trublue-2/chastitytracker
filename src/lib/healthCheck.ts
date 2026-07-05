import { visionConfigured, visionProvider } from "@/lib/vision";
import { visionHealthProbe } from "@/lib/vision/local";
import { embedAvailable, embedHealthProbe } from "@/lib/embed";
import { sendMail, escHtml } from "@/lib/mail";
import { structuredLog } from "@/lib/serverLog";

/**
 * Health-Check für die SELFHOSTED-KI (Vision-Modell + Embedding-Dienst). Läuft im bestehenden
 * Minuten-Poller mit (ein Prozess je Instanz) und pingt alle `HEALTHCHECK_INTERVAL_MIN` Minuten
 * (Default 5) jeden aktiven Backend mit einer echten Mini-Inferenz. Nicht-Erreichbarkeit landet
 * immer im Log (`[health]`); zusätzlich Mail an `HEALTHCHECK_ALERT_EMAIL`, falls gesetzt. Gemeldet
 * wird bei ZUSTANDSWECHSEL (down / recovered) plus eine ERINNERUNG je Stunde, solange weiter down —
 * kein Log-/Mail-Spam bei anhaltendem Ausfall.
 *
 * Vision und Embedding sind separat konfigurierbar: jeder Probe ist an, sobald sein Backend
 * konfiguriert ist, und einzeln per `HEALTHCHECK_VISION` / `HEALTHCHECK_EMBED` = "false" abschaltbar.
 */

const hlog = (label: string, fields: Record<string, unknown>) => structuredLog("health", label, fields);

const HOUR_MS = 60 * 60 * 1000;

export type ProbeResult = { ok: boolean; latencyMs: number; error?: string };
export type BackendState = { down: boolean; lastAlertAt: number };
export type HealthAction = "none" | "down" | "still_down" | "recovered";

/** Reine Zustands-Entscheidung (I/O-frei, testbar): aus vorigem Zustand + Probe-Ergebnis den
 *  Folge-Zustand und die zu meldende Aktion ableiten. Erst-Ausfall → "down", weiterhin down und
 *  Erinnerung fällig → "still_down", Erholung → "recovered", sonst "none". */
export function evaluateProbe(
  prev: BackendState,
  ok: boolean,
  now: number,
  remindEveryMs: number = HOUR_MS,
): { action: HealthAction; next: BackendState } {
  if (!ok) {
    if (!prev.down) return { action: "down", next: { down: true, lastAlertAt: now } };
    if (now - prev.lastAlertAt >= remindEveryMs) return { action: "still_down", next: { down: true, lastAlertAt: now } };
    return { action: "none", next: { down: true, lastAlertAt: prev.lastAlertAt } };
  }
  if (prev.down) return { action: "recovered", next: { down: false, lastAlertAt: prev.lastAlertAt } };
  return { action: "none", next: { down: false, lastAlertAt: prev.lastAlertAt } };
}

interface Backend { key: string; label: string; enabled: () => boolean; probe: (timeoutMs: number) => Promise<ProbeResult> }

/** Default an, sobald das jeweilige selfhosted-Backend konfiguriert ist; per Env einzeln abschaltbar.
 *  Vision nur im lokalen Provider-Modus (Anthropic ist kein selfhosting → kein Probe). */
function visionEnabled(): boolean {
  return process.env.HEALTHCHECK_VISION !== "false" && visionProvider() === "local" && visionConfigured();
}
function embedEnabled(): boolean {
  return process.env.HEALTHCHECK_EMBED !== "false" && embedAvailable();
}

const BACKENDS: Backend[] = [
  { key: "vision", label: "Vision-Modell", enabled: visionEnabled, probe: visionHealthProbe },
  { key: "embed", label: "Embedding-Dienst", enabled: embedEnabled, probe: embedHealthProbe },
];

/** Prüfintervall in ms (Default 5 min), env-überschreibbar, positiv geklemmt. */
function intervalMs(): number {
  const min = Number(process.env.HEALTHCHECK_INTERVAL_MIN);
  return (Number.isFinite(min) && min > 0 ? min : 5) * 60_000;
}

/** Timeout je Probe in ms (Default 20s), env-überschreibbar. Positiv geklemmt — ein negativer/0-Wert
 *  würde sonst jede Probe sofort abbrechen (Dauer-„down"-Fehlalarm). Zentral hier, damit die Proben
 *  reine Funktionen mit sinnvollem Default bleiben. */
function probeTimeoutMs(): number {
  const ms = Number(process.env.HEALTHCHECK_TIMEOUT_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : 20_000;
}

async function alertEmail(subject: string, bodyHtml: string): Promise<void> {
  const to = process.env.HEALTHCHECK_ALERT_EMAIL;
  if (!to) return;
  try {
    await sendMail(to, subject, `<div style="font-family:sans-serif;max-width:480px">${bodyHtml}</div>`);
  } catch (e) {
    hlog("email_failed", { error: (e as Error).message });
  }
}

interface HealthGlobal { states: Record<string, BackendState>; lastRunAt: number }
const g = globalThis as unknown as { __health?: HealthGlobal };

/** Pingt einen Backend, aktualisiert seinen Zustand und meldet die abgeleitete Aktion (Log immer,
 *  Mail optional). Wirft nie — Probe-Fehler zählen als „down". */
async function checkBackend(b: Backend, nowMs: number, states: Record<string, BackendState>): Promise<void> {
  const prev = (states[b.key] ??= { down: false, lastAlertAt: 0 });
  const res = await b.probe(probeTimeoutMs());
  const { action, next } = evaluateProbe(prev, res.ok, nowMs);
  states[b.key] = next;
  if (action === "none") return;
  if (action === "recovered") {
    hlog("recovered", { backend: b.key, latencyMs: res.latencyMs });
    await alertEmail(`KG-Tracker: ${b.label} wieder erreichbar`, `<p>Der selfhosted <strong>${escHtml(b.label)}</strong> antwortet wieder (Latenz ${res.latencyMs} ms).</p>`);
    return;
  }
  // "down" | "still_down"
  hlog(action, { backend: b.key, error: res.error, latencyMs: res.latencyMs });
  await alertEmail(
    `KG-Tracker: ${b.label} nicht erreichbar`,
    `<p>Der selfhosted <strong>${escHtml(b.label)}</strong> antwortet nicht.</p><p>Fehler: ${escHtml(res.error ?? "unbekannt")}</p>`,
  );
}

/**
 * Vom Poller je Tick gerufen: läuft nur alle `HEALTHCHECK_INTERVAL_MIN` und nur für aktive Backends.
 * No-op, wenn keine selfhosted-KI konfiguriert/aktiviert ist. Wirft nie (der Poller darf nie brechen).
 */
export async function maybeRunHealthChecks(now: Date = new Date()): Promise<void> {
  const active = BACKENDS.filter((b) => b.enabled());
  if (active.length === 0) return;
  const h = (g.__health ??= { states: {}, lastRunAt: 0 });
  const nowMs = now.getTime();
  if (h.lastRunAt && nowMs - h.lastRunAt < intervalMs()) return;
  h.lastRunAt = nowMs;
  for (const b of active) {
    try {
      await checkBackend(b, nowMs, h.states);
    } catch (e) {
      hlog("probe_exception", { backend: b.key, error: (e as Error).message });
    }
  }
}
