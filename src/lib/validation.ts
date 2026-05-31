import type { AppState, Weekend } from "../types";
import { getPoolStatus } from "./state";

export interface ValidationIssue {
  id: string;
  weekendId: string;
  message: string;
  severity: "warning" | "error";
}

export function validateAssignments(state: AppState, weekends: Weekend[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const residentIds = new Set(state.residents.map((resident) => resident.id));

  weekends.forEach((weekend) => {
    const assignment = state.assignments[weekend.id];
    if (!assignment?.twentyFourResidentId) {
      issues.push({
        id: `${weekend.id}-missing-24`,
        weekendId: weekend.id,
        severity: "error",
        message: `${weekend.saturday}: no 24-hour resident assigned.`,
      });
    }
    if (!assignment?.twelveResidentId) {
      issues.push({
        id: `${weekend.id}-missing-12`,
        weekendId: weekend.id,
        severity: "error",
        message: `${weekend.sunday}: no 12-hour resident assigned.`,
      });
    }

    const checks = [
      {
        residentId: assignment?.twentyFourResidentId,
        date: weekend.saturday,
        label: "24-hour shift",
      },
      {
        residentId: assignment?.twelveResidentId,
        date: weekend.sunday,
        label: "12-hour shift",
      },
    ];

    checks.forEach(({ residentId, date, label }) => {
      if (!residentId) {
        return;
      }
      const resident = state.residents.find((item) => item.id === residentId);
      if (!residentIds.has(residentId)) {
        issues.push({
          id: `${weekend.id}-${label}-unknown`,
          weekendId: weekend.id,
          severity: "error",
          message: `${date}: assigned resident no longer exists.`,
        });
        return;
      }
      const status = getPoolStatus(state.pool, date, residentId);
      if (status === "vacation") {
        issues.push({
          id: `${weekend.id}-${label}-vacation`,
          weekendId: weekend.id,
          severity: "error",
          message: `${resident?.name} is on vacation for the ${label} on ${date}.`,
        });
      } else if (status === "requestedOff") {
        issues.push({
          id: `${weekend.id}-${label}-requested`,
          weekendId: weekend.id,
          severity: "warning",
          message: `${resident?.name} requested off for the ${label} on ${date}.`,
        });
      } else if (status !== "inPool") {
        issues.push({
          id: `${weekend.id}-${label}-not-pool`,
          weekendId: weekend.id,
          severity: "warning",
          message: `${resident?.name} is not marked in-pool for the ${label} on ${date}.`,
        });
      }
    });

    if (
      assignment?.twentyFourResidentId &&
      assignment?.twelveResidentId &&
      assignment.twentyFourResidentId === assignment.twelveResidentId
    ) {
      const resident = state.residents.find((item) => item.id === assignment.twentyFourResidentId);
      issues.push({
        id: `${weekend.id}-same-resident`,
        weekendId: weekend.id,
        severity: "warning",
        message: `${resident?.name} is assigned to both shifts on the same weekend.`,
      });
    }
  });

  return issues;
}
