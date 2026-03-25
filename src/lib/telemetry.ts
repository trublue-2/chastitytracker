const TELEMETRY_URL = process.env.TELEMETRY_URL;
const TELEMETRY_INSTANCE_ID = process.env.TELEMETRY_INSTANCE_ID;

type TelemetryEvent =
  | "entry.created.VERSCHLUSS"
  | "entry.created.OEFFNEN"
  | "entry.created.PRUEFUNG"
  | "entry.created.ORGASMUS"
  | "kontrolle.fulfilled"
  | "kontrolle.rejected"
  | "kontrolle.withdrawn"
  | "kontrolle.verified"
  | "upload.success";

export function trackEvent(event: TelemetryEvent, payload?: Record<string, unknown>): void {
  if (!TELEMETRY_URL || !TELEMETRY_INSTANCE_ID) return;
  fetch(TELEMETRY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instanceId: TELEMETRY_INSTANCE_ID, event, payload: payload ?? null }),
  }).catch(() => {});
}
