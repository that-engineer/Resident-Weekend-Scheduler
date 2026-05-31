import { describe, expect, it } from "vitest";
import type { SchedulerPayload } from "../types";
import { getVacationBookends, scheduleWithJs } from "../optimizer/jsScheduler";

const RESIDENTS = [
  { id: "resident-1", name: "Sam", note: "" },
  { id: "resident-2", name: "Sofia", note: "" },
  { id: "resident-3", name: "Maddy", note: "" },
  { id: "resident-4", name: "John", note: "" },
  { id: "resident-5", name: "Nick", note: "" },
  { id: "resident-6", name: "TJ", note: "" },
  { id: "resident-7", name: "Jae", note: "Vascular" },
  { id: "resident-8", name: "Brooke", note: "" },
];

const WEEKENDS = [
  ["2025-08-02", "2025-08-03"],
  ["2025-08-09", "2025-08-10"],
  ["2025-08-16", "2025-08-17"],
  ["2025-08-23", "2025-08-24"],
  ["2025-08-30", "2025-08-31"],
  ["2025-09-06", "2025-09-07"],
  ["2025-09-13", "2025-09-14"],
  ["2025-09-20", "2025-09-21"],
  ["2025-09-27", "2025-09-28"],
  ["2025-10-04", "2025-10-05"],
  ["2025-10-11", "2025-10-12"],
  ["2025-10-18", "2025-10-19"],
  ["2025-10-25", "2025-10-26"],
  ["2025-11-01", "2025-11-02"],
].map(([saturday, sunday]) => ({
  id: saturday,
  saturday,
  sunday,
  weekLabel: `Week of ${saturday}`,
}));

const POOL_GROUPS = [
  ["resident-7", "resident-6", "resident-4", "resident-2", "resident-1"],
  ["resident-7", "resident-6", "resident-4", "resident-2", "resident-1"],
  ["resident-7", "resident-6", "resident-4", "resident-2", "resident-1"],
  ["resident-7", "resident-6", "resident-4", "resident-2", "resident-1"],
  ["resident-7", "resident-6", "resident-4", "resident-2", "resident-1"],
  ["resident-3", "resident-5", "resident-1", "resident-6"],
  ["resident-3", "resident-5", "resident-1", "resident-6", "resident-8"],
  ["resident-3", "resident-5", "resident-1", "resident-6", "resident-8"],
  ["resident-3", "resident-5", "resident-1", "resident-6", "resident-8"],
  ["resident-8", "resident-1", "resident-2", "resident-5"],
  ["resident-1", "resident-2", "resident-5", "resident-8"],
  ["resident-1", "resident-2", "resident-5", "resident-8"],
  ["resident-1", "resident-2", "resident-5", "resident-8"],
  ["resident-1", "resident-2", "resident-5", "resident-4"],
];

function examplePayload(vacationWeeks = 0, requestedOffWeekends = 0): SchedulerPayload {
  const pool: SchedulerPayload["pool"] = {};
  WEEKENDS.forEach((weekend, index) => {
    [weekend.saturday, weekend.sunday].forEach((date) => {
      pool[date] = Object.fromEntries(POOL_GROUPS[index].map((residentId) => [residentId, "inPool"]));
    });
  });

  for (let index = 0; index < vacationWeeks; index += 1) {
    const weekend = WEEKENDS[5 + index];
    const residentId = RESIDENTS[index].id;
    pool[weekend.saturday][residentId] = "vacation";
    pool[weekend.sunday][residentId] = "vacation";
  }

  for (let index = 0; index < requestedOffWeekends; index += 1) {
    const weekend = WEEKENDS[8 + index];
    const residentId = RESIDENTS[RESIDENTS.length - index - 1].id;
    pool[weekend.saturday][residentId] = "requestedOff";
    pool[weekend.sunday][residentId] = "requestedOff";
  }

  return {
    residents: RESIDENTS,
    weekends: WEEKENDS,
    pool,
    vacationWeeks: {},
    assignments: {},
    lockedRanges: [],
    settings: {
      hourFairnessWeight: 10,
      twentyFourFairnessWeight: 8,
      spacingWeight: 7,
      adjacentWeekendWeight: 12,
      requestedOffWeight: 30,
      bookendWeight: 18,
      iterations: 80,
      randomSeed: 42,
    },
  };
}

describe("TypeScript scheduler", () => {
  it("maps week-of vacation rows to the surrounding bookend weekends", () => {
    const payload = examplePayload();
    payload.vacationWeeks = {
      "2025-08-30": {
        "resident-1": true,
      },
    };

    const bookends = getVacationBookends(payload);

    expect([...bookends["resident-1"]].sort((a, b) => a - b)).toEqual([3, 4]);
    expect(WEEKENDS[3].saturday).toBe("2025-08-23");
    expect(WEEKENDS[4].saturday).toBe("2025-08-30");
    expect(bookends["resident-1"].has(5)).toBe(false);
  });

  it("preserves locked assignments inside a locked date range", () => {
    const payload = examplePayload();
    payload.assignments = {
      "2025-08-02": {
        twentyFourResidentId: "resident-7",
        twelveResidentId: "resident-6",
      },
    };
    payload.lockedRanges = [{ id: "lock-1", start: "2025-08-02", end: "2025-08-03" }];

    const result = scheduleWithJs(payload);

    expect(result.assignments["2025-08-02"]).toMatchObject({
      twentyFourResidentId: "resident-7",
      twelveResidentId: "resident-6",
      lockedTwentyFour: true,
      lockedTwelve: true,
    });
    expect(result.metrics.totals.lockedShifts).toBe(2);
  });

  it("reports optimizer timing for import-like permutations", () => {
    const cases = [
      ["base", 0, 0],
      ["one_vacation_two_requested", 1, 2],
      ["two_vacations_three_requested", 2, 3],
    ] as const;

    const timings = cases.map(([name, vacationWeeks, requestedOffWeekends]) => {
      const started = performance.now();
      const result = scheduleWithJs(examplePayload(vacationWeeks, requestedOffWeekends));
      const elapsedMs = performance.now() - started;
      expect(Object.keys(result.assignments)).toHaveLength(WEEKENDS.length);
      return `${name}=${elapsedMs.toFixed(2)}ms`;
    });

    console.log(`Optimizer timings: ${timings.join(", ")}`);
  });
});
