import { getFreshness, type EmergencyPacket } from "@signalbridge/shared";
import { verifyPacket } from "./verification.js";

export type Filters = {
  petsRequired: boolean;
  accessibleRequired: boolean;
  transportation: "no_car" | "car" | "unspecified";
};

export const DISCLAIMER =
  "Demo data. SignalBridge supplements official emergency alerts. It does not replace 911, WEA, or local emergency instructions.";

export function parseRequest(text: string): Filters {
  const t = text.toLowerCase();
  const noCar = /no car|without a car|don'?t have a car|do not have a car|no vehicle|no ride|on foot|walking|\bbus\b|transit/.test(t);
  return {
    petsRequired: /\b(pet|pets|dog|dogs|cat|cats|puppy|kitten|animal|animals)\b/.test(t),
    accessibleRequired: /wheelchair|accessib|mobility|disab/.test(t),
    transportation: noCar ? "no_car" : /\b(my car|have a car|drive|driving)\b/.test(t) ? "car" : "unspecified",
  };
}

export function recommend(p: EmergencyPacket, filters: Filters, now: Date = new Date()) {
  const verdicts = verifyPacket(p, now);
  const recommended: any[] = [];
  const checkFirst: any[] = [];
  const excluded: any[] = [];

  for (const s of p.shelters) {
    const v = verdicts.find((x) => x.shelterId === s.id)!;
    const src = p.sources.find((x) => x.id === s.sourceId);
    const item = {
      id: s.id,
      name: s.name,
      reportedStatus: s.status,
      capacity: s.capacity,
      petsAllowed: s.petsAllowed,
      wheelchairAccessible: s.wheelchairAccessible,
      evidence: {
        sourceId: s.sourceId,
        sourceName: src?.name ?? s.sourceId,
        sourceUrl: src?.url ?? null,
        observedAt: s.observedAt,
        sourceUpdatedAt: s.sourceUpdatedAt,
        freshness: getFreshness(s.observedAt, s.staleAfterMinutes, now),
        conflictSources: v.conflict ? v.sourceIds : [],
      },
      reason: v.reason,
    };

    // Unknown answers never count as a match.
    if (filters.petsRequired && s.petsAllowed !== true) {
      excluded.push({ ...item, reason: s.petsAllowed === false ? "Does not accept pets." : "Pet policy unknown." });
    } else if (filters.accessibleRequired && s.wheelchairAccessible !== true) {
      excluded.push({ ...item, reason: s.wheelchairAccessible === false ? "Not wheelchair accessible." : "Accessibility unknown." });
    } else if (v.recommendedStatus === "open" && v.verified) {
      recommended.push(item);
    } else if (v.recommendedStatus === "unknown") {
      checkFirst.push({ ...item, reason: `Unverified. ${v.reason} Confirm before traveling.` });
    } else {
      excluded.push({ ...item, reason: `Reported ${s.status}.` });
    }
  }

  recommended.sort((a, b) => (b.capacity ?? -1) - (a.capacity ?? -1));

  const notes: string[] = [];
  for (const r of p.roadClosures) {
    if (r.status === "closed") notes.push(`Road closed: ${r.description}.`);
  }
  if (filters.transportation === "no_car") {
    notes.push("SignalBridge has no transit or ride data. Ask local officials about transportation.");
  }

  return { filters, recommended, checkFirst, excluded, notes, disclaimer: DISCLAIMER, packetVersion: p.version };
}
