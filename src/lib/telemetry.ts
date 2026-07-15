// @deprecated Telemetrie ist stillgelegt und DEAKTIVIERT. `trackEvent` ist ein No-op — es sendet
// bewusst nichts mehr, auch wenn TELEMETRY_URL/TELEMETRY_INSTANCE_ID gesetzt sind. Der Portal-Empfänger
// + die Admin-Ansicht sind ebenfalls deprecated; ersetzt durch die anonyme Deployment-Zählung
// (Update-Check → /api/changelog). Bestehende Aufrufe sind wirkungslos; keine neuen hinzufügen.

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

/** @deprecated Deaktiviert — No-op (siehe Datei-Kopf). Signatur bleibt nur, damit Bestands-Aufrufe kompilieren. */
export function trackEvent(_event: TelemetryEvent, _payload?: Record<string, unknown>): void {
  // No-op: Telemetrie deaktiviert.
}
