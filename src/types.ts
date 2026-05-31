export type PoolStatus = "empty" | "inPool" | "vacation" | "requestedOff";

export type ViewMode = "pool" | "schedule";

export interface Resident {
  id: string;
  name: string;
  note: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface LockedRange extends DateRange {
  id: string;
}

export interface Weekend {
  id: string;
  saturday: string;
  sunday: string;
  weekLabel: string;
}

export interface WeekSeparatorRow {
  type: "week";
  id: string;
  weekendId: string;
  dates: string[];
  label: string;
}

export interface ShiftDateRow {
  type: "shift";
  id: string;
  weekendId: string;
  date: string;
  shiftKind: "twentyFour" | "twelve";
  label: string;
  timeLabel: string;
}

export type TableRow = WeekSeparatorRow | ShiftDateRow;

export interface Assignment {
  twentyFourResidentId?: string;
  twelveResidentId?: string;
  manualTwentyFour?: boolean;
  manualTwelve?: boolean;
  lockedTwentyFour?: boolean;
  lockedTwelve?: boolean;
  warnings?: string[];
}

export interface OptimizerSettings {
  hourFairnessWeight: number;
  twentyFourFairnessWeight: number;
  spacingWeight: number;
  adjacentWeekendWeight: number;
  requestedOffWeight: number;
  bookendWeight: number;
  iterations: number;
  randomSeed: number;
}

export interface AppState {
  version: 1;
  dateRange: DateRange;
  residents: Resident[];
  pool: Record<string, Record<string, PoolStatus>>;
  vacationWeeks: Record<string, Record<string, boolean>>;
  assignments: Record<string, Assignment>;
  lockedRanges: LockedRange[];
  settings: OptimizerSettings;
}

export interface SchedulerPayload {
  residents: Resident[];
  weekends: Weekend[];
  pool: AppState["pool"];
  vacationWeeks: AppState["vacationWeeks"];
  assignments: AppState["assignments"];
  lockedRanges: LockedRange[];
  settings: OptimizerSettings;
}

export interface ResidentMetric {
  residentId: string;
  residentName: string;
  assignedHours: number;
  opportunityHours: number;
  assignedHourRatio: number;
  twentyFourShifts: number;
  twentyFourShiftsPerWeekend: number;
  goldenWeekends: number;
  adjacentWeekendPairs: number;
  longestTwentyFourGap: number | null;
  minTwentyFourGap: number | null;
}

export interface SchedulerMetrics {
  engine: "typescript";
  score: number;
  residentMetrics: ResidentMetric[];
  totals: {
    assignedHours: number;
    twentyFourShifts: number;
    twelveHourShifts: number;
    lockedShifts: number;
    requestedOffAssignments: number;
    requestedDaysOff: number;
    requestedDaysOffGranted: number;
    vacationAssignments: number;
    vacationBookendWeekends: number;
    vacationBookendWeekendsGranted: number;
    fallbackAssignments: number;
    goldenWeekends: number;
    goldenWeekendOpportunities: number;
    recoveryGoldenOpportunities: number;
    recoveryGoldensGranted: number;
    adjacentWeekendPairs: number;
  };
}

export interface SchedulerMetricsSnapshot {
  inputSignature: string;
  metrics: SchedulerMetrics;
}

export interface SchedulerResult {
  assignments: Record<string, Assignment>;
  warnings: string[];
  score: number;
  metrics: SchedulerMetrics;
}
