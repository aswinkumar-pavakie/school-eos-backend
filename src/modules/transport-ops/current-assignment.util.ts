// Mirrors the frontend's own currentAssignmentFor* helpers (VehiclesPanel/
// RoutesPanel/DriversPanel/PrincipalTransportTabs each have a copy) exactly: a
// truly-open row (effectiveTo null) is always the real current one when there
// is one; only fall back to "most recently started" when every candidate
// already has an end date. One shared copy here since this is new backend
// code, not a UI-per-panel display concern.
export function pickCurrentAssignment<
  T extends { effectiveFrom: string; effectiveTo: string | null },
>(assignments: T[]): T | null {
  if (assignments.length === 0) return null;
  const openEnded = assignments.filter((a) => !a.effectiveTo);
  const pool = openEnded.length > 0 ? openEnded : assignments;
  return pool.reduce((latest, a) =>
    a.effectiveFrom > latest.effectiveFrom ? a : latest,
  );
}
