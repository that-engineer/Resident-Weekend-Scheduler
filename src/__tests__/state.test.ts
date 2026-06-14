import { beforeEach, describe, expect, it } from "vitest";
import type { SchedulerMetrics } from "../types";
import {
  LOCAL_STATE_STORAGE_KEY,
  clearLocalState,
  createInitialState,
  createSchedulerMetricsSnapshot,
  loadLocalState,
  parseImportedState,
  parseImportedStateWithMetrics,
  saveLocalState,
  serializeState,
  setPoolCell,
} from "../lib/state";

beforeEach(() => {
  localStorage.clear();
});

describe("state import and export", () => {
  it("round trips app state through JSON", () => {
    const initial = createInitialState(new Date(2026, 5, 1));
    const state = {
      ...initial,
      residents: [{ id: "r1", name: "Dr. Ada", note: "PGY-2" }],
      pool: setPoolCell(initial.pool, "2026-06-06", "r1", "inPool"),
      assignments: {
        "2026-06-06": {
          twentyFourResidentId: "r1",
          manualTwentyFour: true,
        },
      },
    };

    expect(parseImportedState(serializeState(state))).toEqual(state);
  });

  it("normalizes unknown pool statuses to empty", () => {
    const imported = parseImportedState(
      JSON.stringify({
        dateRange: { start: "2026-06-01", end: "2026-06-30" },
        residents: [{ id: "r1", name: "Dr. Ada" }],
        pool: { "2026-06-06": { r1: "maybe" } },
      }),
    );

    expect(imported.pool["2026-06-06"].r1).toBe("empty");
  });

  it("round trips valid scheduler metrics through JSON", () => {
    const initial = createInitialState(new Date(2026, 5, 1));
    const state = {
      ...initial,
      residents: [{ id: "r1", name: "Dr. Ada", note: "PGY-2" }],
      pool: setPoolCell(initial.pool, "2026-06-06", "r1", "inPool"),
    };
    const snapshot = createSchedulerMetricsSnapshot(state, sampleMetrics);

    const imported = parseImportedStateWithMetrics(serializeState(state, snapshot));

    expect(imported.state).toEqual(state);
    expect(imported.schedulerMetrics?.metrics).toEqual(sampleMetrics);
  });

  it("does not export metrics after resident or pool inputs change", () => {
    const initial = createInitialState(new Date(2026, 5, 1));
    const state = {
      ...initial,
      residents: [{ id: "r1", name: "Dr. Ada", note: "PGY-2" }],
      pool: setPoolCell(initial.pool, "2026-06-06", "r1", "inPool"),
    };
    const snapshot = createSchedulerMetricsSnapshot(state, sampleMetrics);
    const changedResidents = {
      ...state,
      residents: [...state.residents, { id: "r2", name: "Dr. Grace", note: "" }],
    };
    const changedPool = {
      ...state,
      pool: setPoolCell(state.pool, "2026-06-07", "r1", "requestedOff"),
    };

    expect(JSON.parse(serializeState(changedResidents, snapshot))).not.toHaveProperty("schedulerMetrics");
    expect(JSON.parse(serializeState(changedPool, snapshot))).not.toHaveProperty("schedulerMetrics");
  });

  it("ignores imported metrics when their signature no longer matches the imported state", () => {
    const initial = createInitialState(new Date(2026, 5, 1));
    const state = {
      ...initial,
      residents: [{ id: "r1", name: "Dr. Ada", note: "PGY-2" }],
      pool: setPoolCell(initial.pool, "2026-06-06", "r1", "inPool"),
    };
    const snapshot = createSchedulerMetricsSnapshot(state, sampleMetrics);
    const exported = JSON.parse(serializeState(state, snapshot));
    exported.residents.push({ id: "r2", name: "Dr. Grace", note: "" });

    expect(parseImportedStateWithMetrics(JSON.stringify(exported)).schedulerMetrics).toBeNull();
  });
});

describe("local browser state", () => {
  it("saves and loads app state through localStorage", () => {
    const initial = createInitialState(new Date(2026, 5, 1));
    const state = {
      ...initial,
      residents: [{ id: "r1", name: "Dr. Ada", note: "PGY-2" }],
      pool: setPoolCell(initial.pool, "2026-06-06", "r1", "inPool"),
    };

    saveLocalState(state);

    expect(loadLocalState()?.state).toEqual(state);
  });

  it("saves and loads valid scheduler metrics through localStorage", () => {
    const initial = createInitialState(new Date(2026, 5, 1));
    const state = {
      ...initial,
      residents: [{ id: "r1", name: "Dr. Ada", note: "PGY-2" }],
      pool: setPoolCell(initial.pool, "2026-06-06", "r1", "inPool"),
    };
    const snapshot = createSchedulerMetricsSnapshot(state, sampleMetrics);

    saveLocalState(state, snapshot);

    expect(loadLocalState()?.schedulerMetrics?.metrics).toEqual(sampleMetrics);
  });

  it("ignores locally stored metrics when their signature no longer matches", () => {
    const initial = createInitialState(new Date(2026, 5, 1));
    const state = {
      ...initial,
      residents: [{ id: "r1", name: "Dr. Ada", note: "PGY-2" }],
      pool: setPoolCell(initial.pool, "2026-06-06", "r1", "inPool"),
    };
    const snapshot = createSchedulerMetricsSnapshot(state, sampleMetrics);
    const stored = JSON.parse(serializeState(state, snapshot));
    stored.residents.push({ id: "r2", name: "Dr. Grace", note: "" });
    localStorage.setItem(LOCAL_STATE_STORAGE_KEY, JSON.stringify(stored));

    const loaded = loadLocalState();

    expect(loaded?.state.residents).toHaveLength(2);
    expect(loaded?.schedulerMetrics).toBeNull();
  });

  it("clears malformed localStorage content and returns null", () => {
    localStorage.setItem(LOCAL_STATE_STORAGE_KEY, "{not json");

    expect(loadLocalState()).toBeNull();
    expect(localStorage.getItem(LOCAL_STATE_STORAGE_KEY)).toBeNull();
  });

  it("clears saved localStorage state", () => {
    saveLocalState(createInitialState(new Date(2026, 5, 1)));

    clearLocalState();

    expect(localStorage.getItem(LOCAL_STATE_STORAGE_KEY)).toBeNull();
  });
});

const sampleMetrics: SchedulerMetrics = {
  engine: "typescript",
  score: 12,
  residentMetrics: [
    {
      residentId: "r1",
      residentName: "Dr. Ada",
      assignedHours: 24,
      opportunityHours: 36,
      assignedHourRatio: 2 / 3,
      twentyFourShifts: 1,
      twentyFourShiftsPerWeekend: 1,
      goldenWeekends: 0,
      adjacentWeekendPairs: 0,
      longestTwentyFourGap: null,
      minTwentyFourGap: null,
    },
  ],
  totals: {
    assignedHours: 24,
    twentyFourShifts: 1,
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
    goldenWeekendOpportunities: 1,
    recoveryGoldenOpportunities: 0,
    recoveryGoldensGranted: 0,
    adjacentWeekendPairs: 0,
  },
};
