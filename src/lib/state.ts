import type { AppState, OptimizerSettings, PoolStatus, Resident } from "../types";
import { buildDefaultDateRange } from "./dateUtils";

export const DEFAULT_SETTINGS: OptimizerSettings = {
  hourFairnessWeight: 10,
  twentyFourFairnessWeight: 8,
  spacingWeight: 7,
  adjacentWeekendWeight: 12,
  requestedOffWeight: 30,
  bookendWeight: 18,
  iterations: 80,
  randomSeed: 42,
};

export const STATUS_LABELS: Record<PoolStatus, string> = {
  empty: "",
  inPool: "Pool",
  vacation: "Vacation",
  requestedOff: "Off",
};

export const STATUS_DESCRIPTIONS: Record<PoolStatus, string> = {
  empty: "Not marked",
  inPool: "Available in call pool",
  vacation: "Unavailable: vacation",
  requestedOff: "Requested not to work",
};

export function createInitialState(today = new Date()): AppState {
  return {
    version: 1,
    dateRange: buildDefaultDateRange(today),
    residents: [],
    pool: {},
    vacationWeeks: {},
    assignments: {},
    lockedRanges: [],
    settings: DEFAULT_SETTINGS,
  };
}

export function createResident(name: string, note: string): Resident {
  return {
    id: `resident-${crypto.randomUUID()}`,
    name: name.trim(),
    note: note.trim(),
  };
}

export function setPoolCell(
  pool: AppState["pool"],
  date: string,
  residentId: string,
  status: PoolStatus,
): AppState["pool"] {
  return {
    ...pool,
    [date]: {
      ...(pool[date] ?? {}),
      [residentId]: status,
    },
  };
}

export function getPoolStatus(pool: AppState["pool"], date: string, residentId: string): PoolStatus {
  return pool[date]?.[residentId] ?? "empty";
}

export function serializeState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

function normalizePoolStatus(value: unknown): PoolStatus {
  if (value === "inPool" || value === "vacation" || value === "requestedOff" || value === "empty") {
    return value;
  }
  return "empty";
}

export function parseImportedState(raw: string): AppState {
  const parsed = JSON.parse(raw) as Partial<AppState>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The selected file does not contain scheduler state.");
  }

  const residents = Array.isArray(parsed.residents)
    ? parsed.residents
        .filter((resident) => resident && typeof resident.id === "string" && typeof resident.name === "string")
        .map((resident) => ({
          id: resident.id,
          name: resident.name,
          note: typeof resident.note === "string" ? resident.note : "",
        }))
    : [];

  const pool: AppState["pool"] = {};
  if (parsed.pool && typeof parsed.pool === "object") {
    Object.entries(parsed.pool).forEach(([date, residentMap]) => {
      if (!residentMap || typeof residentMap !== "object") {
        return;
      }
      pool[date] = {};
      Object.entries(residentMap).forEach(([residentId, status]) => {
        pool[date][residentId] = normalizePoolStatus(status);
      });
    });
  }

  return {
    version: 1,
    dateRange: {
      start: parsed.dateRange?.start || buildDefaultDateRange().start,
      end: parsed.dateRange?.end || buildDefaultDateRange().end,
    },
    residents,
    pool,
    vacationWeeks:
      parsed.vacationWeeks && typeof parsed.vacationWeeks === "object"
        ? Object.fromEntries(
            Object.entries(parsed.vacationWeeks).map(([weekendId, residentMap]) => [
              weekendId,
              residentMap && typeof residentMap === "object"
                ? Object.fromEntries(
                    Object.entries(residentMap).map(([residentId, value]) => [residentId, Boolean(value)]),
                  )
                : {},
            ]),
          )
        : {},
    assignments: parsed.assignments && typeof parsed.assignments === "object" ? parsed.assignments : {},
    lockedRanges: Array.isArray(parsed.lockedRanges)
      ? parsed.lockedRanges
          .filter((range) => range && typeof range.id === "string" && typeof range.start === "string" && typeof range.end === "string")
          .map((range) => ({ id: range.id, start: range.start, end: range.end }))
      : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings ?? {}),
    },
  };
}
