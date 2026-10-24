import { getFreshness, type EmergencyPacket, type Shelter } from "@signalbridge/shared";

export type Verdict = {
  shelterId: string;
  conflict: boolean;
  reportedStatus: Shelter["status"];
  recommendedStatus: Shelter["status"];
  verified: boolean;
  severity: "low" | "medium" | "high" | null;
  sourceIds: string[];
  reason: string;
};

// A shelter is only "verified" when no sources disagree and the data is not stale.
// Otherwise the recommended status is "unknown".
export function verifyPacket(p: EmergencyPacket, now: Date = new Date()): Verdict[] {
  return p.shelters.map((s) => {
    const base = { shelterId: s.id, reportedStatus: s.status };
    const conflict = p.conflicts.find((c) => c.field === `${s.id}.status`);

    if (conflict) {
      return {
        ...base,
        conflict: true,
        recommendedStatus: "unknown" as const,
        verified: false,
        severity: conflict.severity,
        sourceIds: conflict.sourceIds,
        reason: conflict.description,
      };
    }
    if (getFreshness(s.observedAt, s.staleAfterMinutes, now) === "stale") {
      return {
        ...base,
        conflict: false,
        recommendedStatus: "unknown" as const,
        verified: false,
        severity: "medium" as const,
        sourceIds: [s.sourceId],
        reason: `Not checked in the last ${s.staleAfterMinutes} minutes.`,
      };
    }
    if (s.status === "unknown") {
      return {
        ...base,
        conflict: false,
        recommendedStatus: "unknown" as const,
        verified: false,
        severity: "high" as const,
        sourceIds: [s.sourceId],
        reason: "The source did not give a recognizable status.",
      };
    }
    return {
      ...base,
      conflict: false,
      recommendedStatus: s.status,
      verified: true,
      severity: null,
      sourceIds: [s.sourceId],
      reason: "No conflicting sources found and data is current.",
    };
  });
}
