import type { Assignment, SchedulerMetrics, SchedulerPayload, SchedulerResult } from "../types";

const SHIFT_HOURS = {
  twentyFour: 24,
  twelve: 12,
};

interface Candidate {
  residentId: string;
  status: string;
  fallback: boolean;
}

export function scheduleWithJs(payload: SchedulerPayload): SchedulerResult {
  if (!payload.residents.length || !payload.weekends.length) {
    return {
      assignments: {},
      warnings: ["Add residents and a date range before generating a schedule."],
      score: 0,
      metrics: emptyMetrics(),
    };
  }

  const opportunityHours = getOpportunityHours(payload);
  const bookends = getVacationBookends(payload);
  let best: SchedulerResult | null = null;
  const iterations = Math.max(payload.settings.iterations || 80, 1);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const result = scheduleOnce(payload, opportunityHours, bookends, payload.settings.randomSeed + iteration);
    if (!best || result.score < best.score) {
      best = result;
    }
  }

  return best!;
}

function scheduleOnce(
  payload: SchedulerPayload,
  opportunityHours: Record<string, number>,
  bookends: Record<string, Set<number>>,
  seed: number,
): SchedulerResult {
  const residentIds = new Set(payload.residents.map((resident) => resident.id));
  const assignments: Record<string, Assignment> = {};
  const warnings: string[] = [];
  const hoursByResident: Record<string, number> = {};
  const twentyFourByResident: Record<string, number> = {};
  const lastTwentyFourIndex: Record<string, number | undefined> = {};
  const lastAssignedWeekendIndex: Record<string, number | undefined> = {};
  const random = mulberry32(seed);
  let score = 0;

  payload.residents.forEach((resident) => {
    hoursByResident[resident.id] = 0;
    twentyFourByResident[resident.id] = 0;
  });

  payload.weekends.forEach((weekend, weekendIndex) => {
    const assignment: Assignment = {
      manualTwentyFour: false,
      manualTwelve: false,
      lockedTwentyFour: false,
      lockedTwelve: false,
      warnings: [],
    };

    const lockedTwentyFour = lockedAssignment(payload, weekend.id, weekend.saturday, "twentyFour");
    const manualTwentyFour = manualAssignment(payload.assignments, weekend.id, "twentyFour");
    if (lockedTwentyFour?.residentId && residentIds.has(lockedTwentyFour.residentId)) {
      applyAssignment(
        assignment,
        lockedTwentyFour.residentId,
        "twentyFour",
        hoursByResident,
        twentyFourByResident,
        lastTwentyFourIndex,
        lastAssignedWeekendIndex,
        weekendIndex,
        lockedTwentyFour.manual,
        true,
      );
    } else if (manualTwentyFour && residentIds.has(manualTwentyFour)) {
      applyAssignment(assignment, manualTwentyFour, "twentyFour", hoursByResident, twentyFourByResident, lastTwentyFourIndex, lastAssignedWeekendIndex, weekendIndex, true);
    } else {
      const ranked = candidatePool(payload, weekend.saturday)
        .map((candidate) => ({
          ...candidate,
          cost:
            candidateCost(
              payload,
              candidate,
              "twentyFour",
              weekendIndex,
              hoursByResident,
              twentyFourByResident,
              lastTwentyFourIndex,
              lastAssignedWeekendIndex,
              opportunityHours,
              bookends,
            ) +
            random() * 3,
        }))
        .sort((left, right) => left.cost - right.cost);

      if (ranked[0]) {
        const candidate = ranked[0];
        score += candidate.cost;
        applyAssignment(assignment, candidate.residentId, "twentyFour", hoursByResident, twentyFourByResident, lastTwentyFourIndex, lastAssignedWeekendIndex, weekendIndex);
        addCandidateWarnings(assignment, candidate, "24-hour");
      }
    }

    const lockedTwelve = lockedAssignment(payload, weekend.id, weekend.sunday, "twelve");
    const manualTwelve = manualAssignment(payload.assignments, weekend.id, "twelve");
    if (lockedTwelve?.residentId && residentIds.has(lockedTwelve.residentId)) {
      applyAssignment(
        assignment,
        lockedTwelve.residentId,
        "twelve",
        hoursByResident,
        twentyFourByResident,
        lastTwentyFourIndex,
        lastAssignedWeekendIndex,
        weekendIndex,
        lockedTwelve.manual,
        true,
      );
    } else if (manualTwelve && residentIds.has(manualTwelve)) {
      applyAssignment(assignment, manualTwelve, "twelve", hoursByResident, twentyFourByResident, lastTwentyFourIndex, lastAssignedWeekendIndex, weekendIndex, true);
    } else {
      const blockedResidentId = assignment.twentyFourResidentId;
      const ranked = candidatePool(payload, weekend.sunday, blockedResidentId)
        .map((candidate) => {
          const sameResident = candidate.residentId === blockedResidentId;
          return {
            ...candidate,
            sameResident,
            cost:
              candidateCost(
                payload,
                candidate,
                "twelve",
                weekendIndex,
                hoursByResident,
                twentyFourByResident,
                lastTwentyFourIndex,
                lastAssignedWeekendIndex,
                opportunityHours,
                bookends,
              ) +
              (sameResident ? 500 : 0) +
              random() * 3,
          };
        })
        .sort((left, right) => left.cost - right.cost);

      if (ranked[0]) {
        const candidate = ranked[0];
        score += candidate.cost;
        applyAssignment(assignment, candidate.residentId, "twelve", hoursByResident, twentyFourByResident, lastTwentyFourIndex, lastAssignedWeekendIndex, weekendIndex);
        addCandidateWarnings(assignment, candidate, "12-hour");
        if (candidate.sameResident) {
          assignment.warnings?.push("Same resident assigned to both weekend shifts.");
        }
      }
    }

    if (!assignment.twentyFourResidentId) {
      const warning = "Unable to assign the 24-hour shift.";
      assignment.warnings?.push(warning);
      warnings.push(`${weekend.saturday}: ${warning}`);
      score += 10000;
    }
    if (!assignment.twelveResidentId) {
      const warning = "Unable to assign the 12-hour shift.";
      assignment.warnings?.push(warning);
      warnings.push(`${weekend.sunday}: ${warning}`);
      score += 10000;
    }

    assignments[weekend.id] = assignment;
  });

  const metrics = buildMetrics(payload, assignments, opportunityHours, score);

  return {
    assignments,
    warnings,
    score,
    metrics,
  };
}

export function calculateScheduleMetrics(
  payload: SchedulerPayload,
  assignments: Record<string, Assignment> = payload.assignments,
  score = 0,
): SchedulerMetrics {
  return buildMetrics(payload, assignments, getOpportunityHours(payload), score);
}

function getStatus(payload: SchedulerPayload, date: string, residentId: string) {
  return payload.pool[date]?.[residentId] ?? "empty";
}

function getOpportunityHours(payload: SchedulerPayload) {
  const opportunities: Record<string, number> = {};
  payload.residents.forEach((resident) => {
    opportunities[resident.id] = 0;
  });

  payload.weekends.forEach((weekend) => {
    payload.residents.forEach((resident) => {
      const saturday = getStatus(payload, weekend.saturday, resident.id);
      const sunday = getStatus(payload, weekend.sunday, resident.id);
      if (saturday === "inPool" || saturday === "requestedOff") {
        opportunities[resident.id] += SHIFT_HOURS.twentyFour;
      }
      if (sunday === "inPool" || sunday === "requestedOff") {
        opportunities[resident.id] += SHIFT_HOURS.twelve;
      }
    });
  });

  return opportunities;
}

export function getVacationBookends(payload: SchedulerPayload) {
  const bookends: Record<string, Set<number>> = {};
  payload.residents.forEach((resident) => {
    bookends[resident.id] = new Set();
  });

  payload.weekends.forEach((weekend, index) => {
    payload.residents.forEach((resident) => {
      const hasWeekdayVacation = Boolean(payload.vacationWeeks[weekend.id]?.[resident.id]);
      if (hasWeekdayVacation) {
        if (index > 0) {
          bookends[resident.id].add(index - 1);
        }
        bookends[resident.id].add(index);
      }
    });
  });

  return bookends;
}

function candidatePool(payload: SchedulerPayload, date: string, blockedResidentId?: string): Candidate[] {
  const primary: Candidate[] = [];
  const requested: Candidate[] = [];
  const fallback: Candidate[] = [];

  payload.residents.forEach((resident) => {
    if (resident.id === blockedResidentId && payload.residents.length > 1) {
      return;
    }
    const status = getStatus(payload, date, resident.id);
    if (status === "vacation") {
      return;
    }
    if (status === "inPool") {
      primary.push({ residentId: resident.id, status, fallback: false });
    } else if (status === "requestedOff") {
      requested.push({ residentId: resident.id, status, fallback: false });
    } else {
      fallback.push({ residentId: resident.id, status, fallback: true });
    }
  });

  if (primary.length || requested.length) {
    return [...primary, ...requested];
  }
  if (fallback.length) {
    return fallback;
  }
  return payload.residents
    .filter((resident) => resident.id !== blockedResidentId)
    .map((resident) => ({ residentId: resident.id, status: "vacation", fallback: true }));
}

function manualAssignment(assignments: SchedulerPayload["assignments"], weekendId: string, shiftKind: "twentyFour" | "twelve") {
  const assignment = assignments[weekendId];
  if (shiftKind === "twentyFour" && assignment?.manualTwentyFour) {
    return assignment.twentyFourResidentId;
  }
  if (shiftKind === "twelve" && assignment?.manualTwelve) {
    return assignment.twelveResidentId;
  }
  return undefined;
}

function lockedAssignment(
  payload: SchedulerPayload,
  weekendId: string,
  date: string,
  shiftKind: "twentyFour" | "twelve",
) {
  if (!payload.lockedRanges.some((range) => date >= range.start && date <= range.end)) {
    return undefined;
  }

  const assignment = payload.assignments[weekendId];
  if (!assignment) {
    return undefined;
  }

  if (shiftKind === "twentyFour" && assignment.twentyFourResidentId) {
    return {
      residentId: assignment.twentyFourResidentId,
      manual: Boolean(assignment.manualTwentyFour),
    };
  }

  if (shiftKind === "twelve" && assignment.twelveResidentId) {
    return {
      residentId: assignment.twelveResidentId,
      manual: Boolean(assignment.manualTwelve),
    };
  }

  return undefined;
}

function applyAssignment(
  assignment: Assignment,
  residentId: string,
  shiftKind: "twentyFour" | "twelve",
  hoursByResident: Record<string, number>,
  twentyFourByResident: Record<string, number>,
  lastTwentyFourIndex: Record<string, number | undefined>,
  lastAssignedWeekendIndex: Record<string, number | undefined>,
  weekendIndex: number,
  manual = false,
  locked = false,
) {
  if (shiftKind === "twentyFour") {
    assignment.twentyFourResidentId = residentId;
    assignment.manualTwentyFour = manual;
    assignment.lockedTwentyFour = locked;
    twentyFourByResident[residentId] += 1;
    lastTwentyFourIndex[residentId] = weekendIndex;
  } else {
    assignment.twelveResidentId = residentId;
    assignment.manualTwelve = manual;
    assignment.lockedTwelve = locked;
  }
  lastAssignedWeekendIndex[residentId] = weekendIndex;
  hoursByResident[residentId] += SHIFT_HOURS[shiftKind];
}

function buildMetrics(
  payload: SchedulerPayload,
  assignments: Record<string, Assignment>,
  opportunityHours: Record<string, number>,
  score: number,
): SchedulerMetrics {
  const assignedHours: Record<string, number> = {};
  const twentyFourCounts: Record<string, number> = {};
  const twentyFourIndexes: Record<string, number[]> = {};
  const assignedWeekendIndexes: Record<string, Set<number>> = {};
  const goldenWeekends: Record<string, number> = {};
  const bookends = getVacationBookends(payload);
  let twelveHourShifts = 0;
  let lockedShifts = 0;
  let requestedOffAssignments = 0;
  let requestedDaysOff = 0;
  let vacationAssignments = 0;
  let vacationBookendWeekends = 0;
  let vacationBookendWeekendsGranted = 0;
  let fallbackAssignments = 0;
  let goldenWeekendOpportunities = 0;
  let recoveryGoldenOpportunities = 0;
  let recoveryGoldensGranted = 0;

  payload.residents.forEach((resident) => {
    assignedHours[resident.id] = 0;
    twentyFourCounts[resident.id] = 0;
    twentyFourIndexes[resident.id] = [];
    assignedWeekendIndexes[resident.id] = new Set();
    goldenWeekends[resident.id] = 0;
  });

  payload.weekends.forEach((weekend, index) => {
    const assignment = assignments[weekend.id];

    if (assignment?.twentyFourResidentId) {
      assignedHours[assignment.twentyFourResidentId] += SHIFT_HOURS.twentyFour;
      twentyFourCounts[assignment.twentyFourResidentId] += 1;
      twentyFourIndexes[assignment.twentyFourResidentId].push(index);
      assignedWeekendIndexes[assignment.twentyFourResidentId].add(index);
      lockedShifts += assignment.lockedTwentyFour ? 1 : 0;
      const status = getStatus(payload, weekend.saturday, assignment.twentyFourResidentId);
      requestedOffAssignments += status === "requestedOff" ? 1 : 0;
      vacationAssignments += status === "vacation" ? 1 : 0;
      fallbackAssignments += status === "empty" ? 1 : 0;
    }

    if (assignment?.twelveResidentId) {
      assignedHours[assignment.twelveResidentId] += SHIFT_HOURS.twelve;
      assignedWeekendIndexes[assignment.twelveResidentId].add(index);
      twelveHourShifts += 1;
      lockedShifts += assignment.lockedTwelve ? 1 : 0;
      const status = getStatus(payload, weekend.sunday, assignment.twelveResidentId);
      requestedOffAssignments += status === "requestedOff" ? 1 : 0;
      vacationAssignments += status === "vacation" ? 1 : 0;
      fallbackAssignments += status === "empty" ? 1 : 0;
    }

    payload.residents.forEach((resident) => {
      const saturdayStatus = getStatus(payload, weekend.saturday, resident.id);
      const sundayStatus = getStatus(payload, weekend.sunday, resident.id);
      const isInCallPool =
        saturdayStatus === "inPool" ||
        saturdayStatus === "requestedOff" ||
        sundayStatus === "inPool" ||
        sundayStatus === "requestedOff";
      const isAssigned =
        assignment?.twentyFourResidentId === resident.id || assignment?.twelveResidentId === resident.id;
      requestedDaysOff += saturdayStatus === "requestedOff" ? 1 : 0;
      requestedDaysOff += sundayStatus === "requestedOff" ? 1 : 0;
      if (bookends[resident.id]?.has(index)) {
        vacationBookendWeekends += 1;
        vacationBookendWeekendsGranted += isAssigned ? 0 : 1;
      }
      if (isInCallPool && !isAssigned) {
        goldenWeekends[resident.id] += 1;
      }
      goldenWeekendOpportunities += isInCallPool ? 1 : 0;
      if (index > 0 && assignedWeekendIndexes[resident.id].has(index - 1) && isInCallPool) {
        recoveryGoldenOpportunities += 1;
        recoveryGoldensGranted += isAssigned ? 0 : 1;
      }
    });
  });
  const requestedDaysOffGranted = requestedDaysOff - requestedOffAssignments;

  return {
    engine: "typescript",
    score,
    residentMetrics: payload.residents.map((resident) => {
      const gaps = getGaps(twentyFourIndexes[resident.id]);
      const opportunity = opportunityHours[resident.id] ?? 0;
      return {
        residentId: resident.id,
        residentName: resident.name,
        assignedHours: assignedHours[resident.id],
        opportunityHours: opportunity,
        assignedHourRatio: opportunity ? assignedHours[resident.id] / opportunity : 0,
        twentyFourShifts: twentyFourCounts[resident.id],
        twentyFourShiftsPerWeekend: opportunity ? (twentyFourCounts[resident.id] / opportunity) * 36 : 0,
        goldenWeekends: goldenWeekends[resident.id],
        adjacentWeekendPairs: getAdjacentPairs([...assignedWeekendIndexes[resident.id]]),
        longestTwentyFourGap: gaps.length ? Math.max(...gaps) : null,
        minTwentyFourGap: gaps.length ? Math.min(...gaps) : null,
      };
    }),
    totals: {
      assignedHours: Object.values(assignedHours).reduce((sum, hours) => sum + hours, 0),
      twentyFourShifts: Object.values(twentyFourCounts).reduce((sum, count) => sum + count, 0),
      twelveHourShifts,
      lockedShifts,
      requestedOffAssignments,
      requestedDaysOff,
      requestedDaysOffGranted,
      vacationAssignments,
      vacationBookendWeekends,
      vacationBookendWeekendsGranted,
      fallbackAssignments,
      goldenWeekends: Object.values(goldenWeekends).reduce((sum, count) => sum + count, 0),
      goldenWeekendOpportunities,
      recoveryGoldenOpportunities,
      recoveryGoldensGranted,
      adjacentWeekendPairs: Object.values(assignedWeekendIndexes).reduce(
        (sum, indexes) => sum + getAdjacentPairs([...indexes]),
        0,
      ),
    },
  };
}

function getGaps(indexes: number[]) {
  const gaps: number[] = [];
  for (let index = 1; index < indexes.length; index += 1) {
    gaps.push(indexes[index] - indexes[index - 1]);
  }
  return gaps;
}

function emptyMetrics(): SchedulerMetrics {
  return {
    engine: "typescript",
    score: 0,
    residentMetrics: [],
    totals: {
      assignedHours: 0,
      twentyFourShifts: 0,
      twelveHourShifts: 0,
      lockedShifts: 0,
      requestedOffAssignments: 0,
      requestedDaysOff: 0,
      requestedDaysOffGranted: 0,
      vacationAssignments: 0,
      vacationBookendWeekends: 0,
      vacationBookendWeekendsGranted: 0,
      fallbackAssignments: 0,
      goldenWeekends: 0,
      goldenWeekendOpportunities: 0,
      recoveryGoldenOpportunities: 0,
      recoveryGoldensGranted: 0,
      adjacentWeekendPairs: 0,
    },
  };
}

function candidateCost(
  payload: SchedulerPayload,
  candidate: Candidate,
  shiftKind: "twentyFour" | "twelve",
  weekendIndex: number,
  hoursByResident: Record<string, number>,
  twentyFourByResident: Record<string, number>,
  lastTwentyFourIndex: Record<string, number | undefined>,
  lastAssignedWeekendIndex: Record<string, number | undefined>,
  opportunityHours: Record<string, number>,
  bookends: Record<string, Set<number>>,
) {
  const hours = SHIFT_HOURS[shiftKind];
  const denominator = Math.max(opportunityHours[candidate.residentId] ?? 0, hours);
  let cost =
    ((hoursByResident[candidate.residentId] + hours) / denominator) *
    payload.settings.hourFairnessWeight;

  if (shiftKind === "twentyFour") {
    const projectedTwentyFourPerWeekend =
      ((twentyFourByResident[candidate.residentId] + 1) / denominator) * 36;
    cost += projectedTwentyFourPerWeekend * payload.settings.twentyFourFairnessWeight;
    const previous = lastTwentyFourIndex[candidate.residentId];
    if (previous !== undefined) {
      cost += payload.settings.spacingWeight * (10 / Math.max(weekendIndex - previous, 1));
    }
  }
  if (lastAssignedWeekendIndex[candidate.residentId] === weekendIndex - 1) {
    cost += payload.settings.adjacentWeekendWeight;
  }
  if (candidate.status === "requestedOff") {
    cost += payload.settings.requestedOffWeight;
  }
  if (bookends[candidate.residentId]?.has(weekendIndex)) {
    cost += payload.settings.bookendWeight;
  }
  if (candidate.fallback) {
    cost += 80;
  }
  if (candidate.status === "vacation") {
    cost += 1000;
  }

  return cost;
}

function addCandidateWarnings(assignment: Assignment, candidate: Candidate, shiftLabel: string) {
  if (candidate.fallback) {
    assignment.warnings?.push(`No in-pool ${shiftLabel} candidate was available.`);
  }
  if (candidate.status === "requestedOff") {
    assignment.warnings?.push(`Assigned ${shiftLabel} shift on a requested-off date.`);
  }
  if (candidate.status === "vacation") {
    assignment.warnings?.push(`Assigned ${shiftLabel} shift on a vacation date.`);
  }
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function getAdjacentPairs(indexes: number[]) {
  const sorted = [...indexes].sort((left, right) => left - right);
  let count = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] - sorted[index - 1] === 1) {
      count += 1;
    }
  }
  return count;
}
