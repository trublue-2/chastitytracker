/** Compares two dotted version strings (e.g. "4.16.7" vs "4.16.8").
 *  Returns negative if a < b, positive if a > b, 0 if equal.
 *  Ignores any pre-release suffix — strips at first non-digit/dot. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split(".").map((p) => parseInt(p, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
