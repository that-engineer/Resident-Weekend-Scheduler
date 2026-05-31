import { describe, expect, it } from "vitest";
import { createInitialState, parseImportedState, serializeState, setPoolCell } from "../lib/state";

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
});
