import type {
  AppState,
  OptimizerSettings,
  PoolStatus,
  Resident,
  SchedulerMetrics,
  SchedulerMetricsSnapshot,
} from "../types";
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

interface PersistedState extends AppState {
  schedulerMetrics?: SchedulerMetricsSnapshot;
}

export function createMetricsInputSignature(state: AppState): string {
  return hashString(
    JSON.stringify({
      version: 1,
      dateRange: state.dateRange,
      residents: state.residents.map((resident) => ({
        id: resident.id,
        name: resident.name,
        note: resident.note,
      })),
      pool: normalizePoolForSignature(state.pool),
      vacationWeeks: normalizeVacationWeeksForSignature(state.vacationWeeks),
    }),
  );
}

export function createSchedulerMetricsSnapshot(
  state: AppState,
  metrics: SchedulerMetrics,
): SchedulerMetricsSnapshot {
  return {
    inputSignature: createMetricsInputSignature(state),
    metrics,
  };
}

export function isSchedulerMetricsSnapshotValid(state: AppState, snapshot: SchedulerMetricsSnapshot | null) {
  return Boolean(snapshot && snapshot.inputSignature === createMetricsInputSignature(state));
}

export function serializeState(state: AppState, schedulerMetrics?: SchedulerMetricsSnapshot | null): string {
  const persistedState: PersistedState = { ...state };
  if (isSchedulerMetricsSnapshotValid(state, schedulerMetrics ?? null)) {
    persistedState.schedulerMetrics = schedulerMetrics ?? undefined;
  }
  return JSON.stringify(persistedState, null, 2);
}

function normalizePoolStatus(value: unknown): PoolStatus {
  if (value === "inPool" || value === "vacation" || value === "requestedOff" || value === "empty") {
    return value;
  }
  return "empty";
}

export function parseImportedState(raw: string): AppState {
  return parseImportedStateWithMetrics(raw).state;
}

export function parseImportedStateWithMetrics(raw: string): {
  state: AppState;
  schedulerMetrics: SchedulerMetricsSnapshot | null;
} {
  const parsed = JSON.parse(raw) as Partial<PersistedState>;
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

  const state: AppState = {
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

  const schedulerMetrics = parseSchedulerMetricsSnapshot(parsed.schedulerMetrics);
  return {
    state,
    schedulerMetrics: isSchedulerMetricsSnapshotValid(state, schedulerMetrics) ? schedulerMetrics : null,
  };
}

function normalizePoolForSignature(pool: AppState["pool"]) {
  return Object.fromEntries(
    Object.entries(pool)
      .map(
        ([date, residentMap]): [string, Record<string, PoolStatus>] => [
          date,
          Object.fromEntries(
            Object.entries(residentMap)
              .filter(([, status]) => status !== "empty")
              .sort(([left], [right]) => left.localeCompare(right)),
          ),
        ],
      )
      .filter(([, residentMap]) => Object.keys(residentMap).length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeVacationWeeksForSignature(vacationWeeks: AppState["vacationWeeks"]) {
  return Object.fromEntries(
    Object.entries(vacationWeeks)
      .map(
        ([weekendId, residentMap]): [string, Record<string, boolean>] => [
          weekendId,
          Object.fromEntries(
            Object.entries(residentMap)
              .filter(([, isVacation]) => isVacation)
              .sort(([left], [right]) => left.localeCompare(right)),
          ),
        ],
      )
      .filter(([, residentMap]) => Object.keys(residentMap).length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function parseSchedulerMetricsSnapshot(value: unknown): SchedulerMetricsSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const snapshot = value as Partial<SchedulerMetricsSnapshot>;
  if (typeof snapshot.inputSignature !== "string" || !isSchedulerMetrics(snapshot.metrics)) {
    return null;
  }
  return {
    inputSignature: snapshot.inputSignature,
    metrics: snapshot.metrics,
  };
}

function isSchedulerMetrics(value: unknown): value is SchedulerMetrics {
  if (!value || typeof value !== "object") {
    return false;
  }
  const metrics = value as Partial<SchedulerMetrics>;
  return (
    metrics.engine === "typescript" &&
    Array.isArray(metrics.residentMetrics) &&
    Boolean(metrics.totals) &&
    typeof metrics.totals === "object"
  );
}

function hashString(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
