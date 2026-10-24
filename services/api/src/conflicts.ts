type ShelterLike = { id: string; name: string; status: string };
type CountyRecord = { id: string; status: string };

// Compares the county's status with the shelter's own page.
// It never picks a winner. It only flags the disagreement.
export function detectConflicts(shelters: ShelterLike[], county: CountyRecord[]) {
  const out: {
    id: string;
    field: string;
    sourceIds: string[];
    description: string;
    severity: "low" | "medium" | "high";
  }[] = [];

  for (const c of county) {
    const s = shelters.find((x) => x.id === c.id);
    if (!s || c.status === "unknown" || s.status === "unknown") continue;
    if (c.status !== s.status) {
      out.push({
        id: `conflict-${s.id}-status`,
        field: `${s.id}.status`,
        sourceIds: ["county-emergency", "shelter-status"],
        description: `County page says ${s.name} is ${c.status}. Shelter page says ${s.status}. Status unverified.`,
        // Highest risk: someone is told a shelter is open when it may not be.
        severity: c.status === "open" || s.status === "open" ? "high" : "medium",
      });
    }
  }
  return out;
}
