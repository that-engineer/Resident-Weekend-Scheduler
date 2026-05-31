import { describe, expect, it } from "vitest";
import { generateTableRows, generateWeekends } from "../lib/dateUtils";
import { filterRowsForImage } from "../lib/scheduleImage";

describe("date utilities", () => {
  it("generates complete Saturday-Sunday weekends inside the range", () => {
    const weekends = generateWeekends("2026-06-01", "2026-06-30");

    expect(weekends.map((weekend) => [weekend.saturday, weekend.sunday])).toEqual([
      ["2026-06-06", "2026-06-07"],
      ["2026-06-13", "2026-06-14"],
      ["2026-06-20", "2026-06-21"],
      ["2026-06-27", "2026-06-28"],
    ]);
  });

  it("adds a non-shift week separator before each weekend", () => {
    const rows = generateTableRows(generateWeekends("2026-06-01", "2026-06-15"));

    expect(rows.map((row) => row.type)).toEqual(["week", "shift", "shift", "week", "shift", "shift"]);
    expect(rows[0]).toMatchObject({ type: "week" });
    expect(rows[1]).toMatchObject({ type: "shift", shiftKind: "twentyFour" });
    expect(rows[2]).toMatchObject({ type: "shift", shiftKind: "twelve" });
  });

  it("filters schedule image rows to selected dates with matching week separators", () => {
    const rows = generateTableRows(generateWeekends("2026-06-01", "2026-06-30"));
    const imageRows = filterRowsForImage(rows, "2026-06-13", "2026-06-14");

    expect(imageRows.map((row) => row.type)).toEqual(["week", "shift", "shift"]);
    expect(imageRows[1]).toMatchObject({ type: "shift", date: "2026-06-13" });
    expect(imageRows[2]).toMatchObject({ type: "shift", date: "2026-06-14" });
  });
});
