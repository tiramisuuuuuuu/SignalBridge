import type { EmergencyPacket } from "@signalbridge/shared";

export type Issue = {
  type: "missing_field" | "failed_fetch" | "old_timestamp" | "future_timestamp" | "unexpected_status";
  subject: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

export function checkSources(
  p: EmergencyPacket,
  failures: { source: string; field?: string; detail: string }[],
  now: Date = new Date()
): Issue[] {
  const issues: Issue[] = [];

  for (const f of failures) {
    issues.push({
      type: f.field ? "missing_field" : "failed_fetch",
      subject: f.source,
      detail: f.detail,
      severity: "high",
    });
  }

  for (const s of p.shelters) {
    for (const field of ["capacity", "petsAllowed", "wheelchairAccessible"] as const) {
      if (s[field] === null) {
        issues.push({
          type: "missing_field",
          subject: s.id,
          detail: `${s.name}: ${field} is missing. It will not be guessed.`,
          severity: "medium",
        });
      }
    }
    if (s.status === "unknown") {
      issues.push({
        type: "unexpected_status",
        subject: s.id,
        detail: `${s.name}: status was not open, full or closed.`,
        severity: "high",
      });
    }
    if (s.sourceUpdatedAt === null) {
      issues.push({
        type: "old_timestamp",
        subject: s.id,
        detail: `${s.name}: the source page gave no update time.`,
        severity: "medium",
      });
    } else {
      const ageMin = (now.getTime() - Date.parse(s.sourceUpdatedAt)) / 60000;
      if (ageMin < -2) {
        issues.push({
          type: "future_timestamp",
          subject: s.id,
          detail: `${s.name}: source claims an update time in the future.`,
          severity: "medium",
        });
      } else if (ageMin > s.staleAfterMinutes) {
        issues.push({
          type: "old_timestamp",
          subject: s.id,
          detail: `${s.name}: source last updated ${Math.round(ageMin)} minutes ago.`,
          severity: "medium",
        });
      }
    }
  }
  return issues;
}
