/** IANA timezone list — kept in its own module (not constants.ts) so the ~400-entry array stays out
 *  of client bundles for routes that don't need it. Only the settings route/form imports this.
 *  Single source for the settings <Select> options AND the `/api/settings/timezone` validation. */
export const SUPPORTED_TIMEZONES: readonly string[] =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["Europe/Zurich", "UTC"];

/** Ready-to-use options for the shared <Select> (value = IANA id, label = human-readable). */
export const TIMEZONE_OPTIONS = SUPPORTED_TIMEZONES.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }));

export function isValidTimezone(tz: unknown): tz is string {
  return typeof tz === "string" && SUPPORTED_TIMEZONES.includes(tz);
}
