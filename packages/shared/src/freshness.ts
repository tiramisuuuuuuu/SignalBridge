export type Freshness = "fresh" | "aging" | "stale";

export function ageMinutes(observedAt: string, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - Date.parse(observedAt)) / 60000);
}

export function getFreshness(
  observedAt: string,
  staleAfterMinutes: number,
  now: Date = new Date()
): Freshness {
  const age = ageMinutes(observedAt, now);
  if (age < staleAfterMinutes / 3) return "fresh";
  if (age < staleAfterMinutes) return "aging";
  return "stale";
}
