import {
  BarChart3,
  BookOpen,
  CalendarDays,
  FileImage,
  Save,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppState,
  Assignment,
  OptimizerSettings,
  PoolStatus,
  Resident,
  SchedulerMetrics,
  SchedulerMetricsSnapshot,
  SchedulerPayload,
  ShiftDateRow,
  TableRow,
  WeekSeparatorRow,
  ViewMode,
} from "./types";
import { generateTableRows, generateWeekends } from "./lib/dateUtils";
import {
  DEFAULT_SETTINGS,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  createInitialState,
  createSchedulerMetricsSnapshot,
  createResident,
  getPoolStatus,
  clearLocalState,
  loadLocalState,
  parseImportedStateWithMetrics,
  saveLocalState,
  serializeState,
  setPoolCell,
} from "./lib/state";
import { validateAssignments } from "./lib/validation";
import { exportScheduleImage } from "./lib/scheduleImage";
import { calculateScheduleMetrics, runScheduler } from "./optimizer/schedulerClient";
import "./styles.css";

const MODES: Array<{ status: PoolStatus; label: string; detail: string }> = [
  { status: "inPool", label: "In-Pool", detail: "Available to work" },
  { status: "vacation", label: "Vacation", detail: "Hard unavailable" },
  { status: "requestedOff", label: "Requested Off", detail: "Avoid if possible" },
  { status: "empty", label: "Erase", detail: "Clear painted cells" },
];

function App() {
  const [localState] = useState(() => loadLocalState());
  const [state, setState] = useState<AppState>(() => localState?.state ?? createInitialState());
  const [view, setView] = useState<ViewMode>("pool");
  const [paintMode, setPaintMode] = useState<PoolStatus>("inPool");
  const [isPainting, setIsPainting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [residentDraft, setResidentDraft] = useState({ name: "", note: "" });
  const [showSettings, setShowSettings] = useState(false);
  const [imageRange, setImageRange] = useState(() => state.dateRange);
  const [lockRange, setLockRange] = useState(() => state.dateRange);
  const [hideLockedDates, setHideLockedDates] = useState(false);
  const [schedulerMetricsSnapshot, setSchedulerMetricsSnapshot] = useState<SchedulerMetricsSnapshot | null>(
    () => localState?.schedulerMetrics ?? null,
  );
  const [isMetricsDialogOpen, setIsMetricsDialogOpen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<"idle" | "running" | "error">("idle");
  const [schedulerMessage, setSchedulerMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextLocalSaveRef = useRef(false);

  const weekends = useMemo(
    () => generateWeekends(state.dateRange.start, state.dateRange.end),
    [state.dateRange.end, state.dateRange.start],
  );
  const rows = useMemo(() => generateTableRows(weekends), [weekends]);
  const visibleRows = useMemo(
    () => (view === "schedule" && hideLockedDates ? filterLockedRows(rows, state.lockedRanges) : rows),
    [hideLockedDates, rows, state.lockedRanges, view],
  );
  const validationIssues = useMemo(() => validateAssignments(state, weekends), [state, weekends]);
  const schedulerMetrics = schedulerMetricsSnapshot?.metrics ?? null;

  useEffect(() => {
    if (skipNextLocalSaveRef.current) {
      skipNextLocalSaveRef.current = false;
      return;
    }
    saveLocalState(state, schedulerMetricsSnapshot);
  }, [schedulerMetricsSnapshot, state]);

  const addResident = () => {
    if (!residentDraft.name.trim()) {
      return;
    }
    const resident = createResident(residentDraft.name, residentDraft.note);
    setState((current) => ({
      ...current,
      residents: [...current.residents, resident],
    }));
    setSchedulerMetricsSnapshot(null);
    setResidentDraft({ name: "", note: "" });
    setIsDialogOpen(false);
  };

  const updateDateRange = (field: "start" | "end", value: string) => {
    setState((current) => ({
      ...current,
      dateRange: {
        ...current.dateRange,
        [field]: value,
      },
    }));
    setImageRange((current) => ({
      ...current,
      [field]: value,
    }));
    setLockRange((current) => ({
      ...current,
      [field]: value,
    }));
    setSchedulerMetricsSnapshot(null);
  };

  const paintCell = (date: string, residentId: string) => {
    setSchedulerMetricsSnapshot(null);
    setState((current) => ({
      ...current,
      pool: setPoolCell(current.pool, date, residentId, paintMode),
    }));
  };

  const paintWeekCells = (row: WeekSeparatorRow, residentId: string) => {
    if (paintMode !== "vacation" && paintMode !== "empty") {
      return;
    }
    setSchedulerMetricsSnapshot(null);
    setState((current) => ({
      ...current,
      vacationWeeks: {
        ...current.vacationWeeks,
        [row.weekendId]: {
          ...(current.vacationWeeks[row.weekendId] ?? {}),
          [residentId]: paintMode === "vacation",
        },
      },
    }));
  };

  const handlePoolPointerDown = (event: PointerEvent, row: ShiftDateRow, residentId: string) => {
    event.preventDefault();
    setIsPainting(true);
    paintCell(row.date, residentId);
  };

  const handlePoolPointerEnter = (row: ShiftDateRow, residentId: string) => {
    if (isPainting) {
      paintCell(row.date, residentId);
    }
  };

  const handleWeekPointerDown = (event: PointerEvent, row: WeekSeparatorRow, residentId: string) => {
    event.preventDefault();
    setIsPainting(true);
    paintWeekCells(row, residentId);
  };

  const handleWeekPointerEnter = (row: WeekSeparatorRow, residentId: string) => {
    if (isPainting) {
      paintWeekCells(row, residentId);
    }
  };

  const assignResident = (row: ShiftDateRow, residentId: string) => {
    setState((current) => {
      const currentAssignment = current.assignments[row.weekendId] ?? {};
      const isClearingManualTwentyFour =
        row.shiftKind === "twentyFour" &&
        currentAssignment.manualTwentyFour &&
        currentAssignment.twentyFourResidentId === residentId;
      const isClearingManualTwelve =
        row.shiftKind === "twelve" &&
        currentAssignment.manualTwelve &&
        currentAssignment.twelveResidentId === residentId;
      const nextAssignment: Assignment = { ...currentAssignment };

      if (isClearingManualTwentyFour) {
        delete nextAssignment.twentyFourResidentId;
        delete nextAssignment.manualTwentyFour;
        delete nextAssignment.lockedTwentyFour;
      } else if (isClearingManualTwelve) {
        delete nextAssignment.twelveResidentId;
        delete nextAssignment.manualTwelve;
        delete nextAssignment.lockedTwelve;
      } else if (row.shiftKind === "twentyFour") {
        nextAssignment.twentyFourResidentId = residentId;
        nextAssignment.manualTwentyFour = true;
      } else {
        nextAssignment.twelveResidentId = residentId;
        nextAssignment.manualTwelve = true;
      }

      const nextState = {
        ...current,
        assignments: {
          ...current.assignments,
          [row.weekendId]: nextAssignment,
        },
      };
      setSchedulerMetricsSnapshot(
        createSchedulerMetricsSnapshot(
          nextState,
          calculateScheduleMetrics(buildSchedulerPayload(nextState), nextState.assignments, schedulerMetrics?.score ?? 0),
        ),
      );
      setSchedulerStatus("idle");
      setSchedulerMessage(
        isClearingManualTwentyFour || isClearingManualTwelve
          ? "Manual assignment cleared."
          : "Manual assignment updated.",
      );
      return nextState;
    });
  };

  const buildSchedulerPayload = (
    sourceState: AppState = state,
    randomSeed = sourceState.settings.randomSeed,
  ): SchedulerPayload => ({
    residents: sourceState.residents,
    weekends,
    pool: sourceState.pool,
    vacationWeeks: sourceState.vacationWeeks,
    assignments: sourceState.assignments,
    lockedRanges: sourceState.lockedRanges,
    settings: {
      ...sourceState.settings,
      randomSeed,
    },
  });

  const generateSchedule = async () => {
    if (!state.residents.length || !weekends.length) {
      setSchedulerStatus("error");
      setSchedulerMessage("Add residents and a valid date range before generating a schedule.");
      return;
    }

    setSchedulerStatus("running");
      setSchedulerMessage("Optimizing assignments...");
    try {
      const runSeed = createRandomSeed();
      const result = await runScheduler(buildSchedulerPayload(state, runSeed));
      setState((current) => ({
        ...current,
        assignments: result.assignments,
        settings: {
          ...current.settings,
          randomSeed: runSeed,
        },
      }));
      setSchedulerMetricsSnapshot(createSchedulerMetricsSnapshot({ ...state, assignments: result.assignments }, result.metrics));
      setView("schedule");
      setSchedulerStatus("idle");
      setSchedulerMessage(
        result.warnings.length
          ? `Schedule generated with ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}.`
          : "Schedule generated.",
      );
    } catch (error) {
      setSchedulerStatus("error");
      setSchedulerMessage(
        error instanceof Error
          ? `Scheduler failed: ${error.message}`
          : "Scheduler failed.",
      );
    }
  };

  const exportState = () => {
    const blob = new Blob([serializeState(state, schedulerMetricsSnapshot)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resident-weekend-scheduler-state.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportScheduleImage = () => {
    const result = exportScheduleImage(state, rows, imageRange.start, imageRange.end);
    setSchedulerStatus(result.ok ? "idle" : "error");
    setSchedulerMessage(result.message);
  };

  const importState = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const { state: importedState, schedulerMetrics: importedMetrics } = parseImportedStateWithMetrics(text);
      setState(importedState);
      setImageRange(importedState.dateRange);
      setLockRange(importedState.dateRange);
      setSchedulerMetricsSnapshot(importedMetrics);
      setIsMetricsDialogOpen(false);
      setSchedulerStatus("idle");
      setSchedulerMessage("State imported.");
    } catch (error) {
      setSchedulerStatus("error");
      setSchedulerMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      event.target.value = "";
    }
  };

  const resetLocalData = () => {
    const freshState = createInitialState();
    skipNextLocalSaveRef.current = true;
    clearLocalState();
    setState(freshState);
    setView("pool");
    setPaintMode("inPool");
    setIsPainting(false);
    setIsDialogOpen(false);
    setResidentDraft({ name: "", note: "" });
    setShowSettings(false);
    setImageRange(freshState.dateRange);
    setLockRange(freshState.dateRange);
    setHideLockedDates(false);
    setSchedulerMetricsSnapshot(null);
    setIsMetricsDialogOpen(false);
    setIsClearDialogOpen(false);
    setSchedulerStatus("idle");
    setSchedulerMessage("Saved browser data cleared.");
  };

  const updateSetting = (field: keyof OptimizerSettings, value: number) => {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [field]: value,
      },
    }));
  };

  const updateImageMonth = (value: string) => {
    if (!value) {
      return;
    }
    setImageRange(monthToDateRange(value));
  };

  const addLockedRange = () => {
    if (!lockRange.start || !lockRange.end || lockRange.start > lockRange.end) {
      setSchedulerStatus("error");
      setSchedulerMessage("Choose a valid lock start and end date.");
      return;
    }

    setState((current) => ({
      ...current,
      lockedRanges: [
        ...current.lockedRanges,
        {
          id: `locked-${crypto.randomUUID()}`,
          start: lockRange.start,
          end: lockRange.end,
        },
      ],
    }));
    setSchedulerStatus("idle");
    setSchedulerMessage(`Locked assignments from ${lockRange.start} through ${lockRange.end}.`);
  };

  const clearLockedRanges = () => {
    setState((current) => ({
      ...current,
      lockedRanges: [],
    }));
    setHideLockedDates(false);
  };

  return (
    <div className="app-shell" onPointerUp={() => setIsPainting(false)}>
      <header className="top-bar">
        <div className="brand">
          <CalendarDays aria-hidden="true" />
          <div>
            <h1>Resident Weekend Scheduler</h1>
            <p>Pool setup, weekend call optimization, and portable state files.</p>
          </div>
        </div>
        <div className="top-center">
          <a
            className="icon-text readme-link"
            href="https://github.com/that-engineer/Resident-Weekend-Scheduler/blob/main/README.md"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen aria-hidden="true" />
            README
          </a>
        </div>
        <div className="top-actions">
          <button className="icon-text" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload aria-hidden="true" />
            Import Saved Data
          </button>
          <button className="icon-text" type="button" onClick={exportState}>
            <Save aria-hidden="true" />
            Export Backup Data
          </button>
          <button className="icon-text" type="button" onClick={() => setIsClearDialogOpen(true)}>
            <Trash2 aria-hidden="true" />
            Clear Browser Save
          </button>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={importState}
          />
        </div>
      </header>

      <section className="control-band" aria-label="Schedule setup">
        <label>
          Start date
          <input
            type="date"
            value={state.dateRange.start}
            onChange={(event) => updateDateRange("start", event.target.value)}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            value={state.dateRange.end}
            onChange={(event) => updateDateRange("end", event.target.value)}
          />
        </label>
        <div className="segmented" aria-label="View">
          <button
            type="button"
            className={view === "pool" ? "active" : ""}
            onClick={() => setView("pool")}
          >
            Pool Set
          </button>
          <button
            type="button"
            className={view === "schedule" ? "active" : ""}
            onClick={() => setView("schedule")}
          >
            Weekend Schedule
          </button>
        </div>
        <button className="primary" type="button" onClick={generateSchedule} disabled={schedulerStatus === "running"}>
          <Sparkles aria-hidden="true" />
          {schedulerStatus === "running" ? "Optimizing..." : "Generate Schedule"}
        </button>
        <button className="icon-button" type="button" onClick={() => setShowSettings((current) => !current)}>
          <Settings aria-hidden="true" />
          <span className="sr-only">Optimizer settings</span>
        </button>
      </section>

      {showSettings && (
        <section className="settings-band" aria-label="Optimizer settings">
          {Object.entries(state.settings).map(([key, value]) => (
            <label key={key}>
              {settingLabel(key as keyof OptimizerSettings)}
              <input
                type="number"
                min={key === "iterations" ? 1 : 0}
                step={key === "randomSeed" || key === "iterations" ? 1 : 0.5}
                value={value}
                onChange={(event) => updateSetting(key as keyof OptimizerSettings, Number(event.target.value))}
              />
            </label>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => setState((current) => ({ ...current, settings: DEFAULT_SETTINGS }))}
          >
            Reset Defaults
          </button>
        </section>
      )}

      {schedulerMessage && (
        <div className={`status-message ${schedulerStatus === "error" ? "error" : ""}`}>{schedulerMessage}</div>
      )}

      {view === "schedule" && (
        <section className="schedule-tools-band" aria-label="Schedule tools">
          <div className="tool-group" aria-label="Schedule image export">
            <label>
              Image month
              <input type="month" onChange={(event) => updateImageMonth(event.target.value)} />
            </label>
            <label>
              Image start
              <input
                type="date"
                value={imageRange.start}
                onChange={(event) => setImageRange((current) => ({ ...current, start: event.target.value }))}
              />
            </label>
            <label>
              Image end
              <input
                type="date"
                value={imageRange.end}
                onChange={(event) => setImageRange((current) => ({ ...current, end: event.target.value }))}
              />
            </label>
            <button className="icon-text" type="button" onClick={handleExportScheduleImage}>
              <FileImage aria-hidden="true" />
              Export Schedule Image
            </button>
          </div>
          <div className="tool-group lock-tools" aria-label="Schedule lock controls">
            <label>
              Lock start
              <input
                type="date"
                value={lockRange.start}
                onChange={(event) => setLockRange((current) => ({ ...current, start: event.target.value }))}
              />
            </label>
            <label>
              Lock end
              <input
                type="date"
                value={lockRange.end}
                onChange={(event) => setLockRange((current) => ({ ...current, end: event.target.value }))}
              />
            </label>
            <button className="icon-text" type="button" onClick={addLockedRange}>
              Lock Date Range
            </button>
            <button className="secondary" type="button" onClick={clearLockedRanges}>
              Clear Locks
            </button>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={hideLockedDates}
                onChange={(event) => setHideLockedDates(event.target.checked)}
              />
              Hide locked dates
            </label>
          </div>
        </section>
      )}

      <main className={view === "pool" ? "workspace pool-layout" : "workspace"}>
        {view === "pool" && (
          <aside className="mode-panel" aria-label="Pool status mode">
            {MODES.map((mode) => (
              <button
                key={mode.status}
                type="button"
                className={`mode-button ${paintMode === mode.status ? "active" : ""} ${mode.status}`}
                onClick={() => setPaintMode(mode.status)}
              >
                <span>{mode.label}</span>
                <small>{mode.detail}</small>
              </button>
            ))}
          </aside>
        )}

        <section className="table-surface" aria-label={view === "pool" ? "Pool Set table" : "Weekend Schedule table"}>
          {weekends.length === 0 ? (
            <div className="empty-state">
              Choose a start and end date that include at least one complete Saturday-Sunday weekend.
            </div>
          ) : (
            <SchedulerTable
              view={view}
              rows={visibleRows}
              residents={state.residents}
              state={state}
              onAddResident={() => setIsDialogOpen(true)}
              onPoolPointerDown={handlePoolPointerDown}
              onPoolPointerEnter={handlePoolPointerEnter}
              onWeekPointerDown={handleWeekPointerDown}
              onWeekPointerEnter={handleWeekPointerEnter}
              onAssignResident={assignResident}
            />
          )}
        </section>

        {view === "schedule" && (
          <aside className="warnings-panel" aria-label="Schedule warnings">
            <h2>Warnings</h2>
            {validationIssues.length === 0 ? (
              <p>No assignment warnings.</p>
            ) : (
              <ul>
                {validationIssues.map((issue) => (
                  <li key={issue.id} className={issue.severity}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
            <h2>Schedule Metrics</h2>
            <textarea
              className="metrics-textbox"
              readOnly
              value={schedulerMetrics ? formatMetrics(schedulerMetrics) : "Generate a schedule to view metrics."}
            />
            <button
              className="icon-text metrics-chart-button"
              type="button"
              onClick={() => setIsMetricsDialogOpen(true)}
              disabled={!schedulerMetrics}
            >
              <BarChart3 aria-hidden="true" />
              View Metrics Charts
            </button>
          </aside>
        )}
      </main>

      {isDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-resident-title">
            <div className="dialog-header">
              <h2 id="add-resident-title">Add Resident</h2>
              <button className="icon-button" type="button" onClick={() => setIsDialogOpen(false)}>
                <X aria-hidden="true" />
                <span className="sr-only">Cancel</span>
              </button>
            </div>
            <label>
              Name
              <input
                autoFocus
                value={residentDraft.name}
                onChange={(event) => setResidentDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              Note
              <textarea
                value={residentDraft.note}
                onChange={(event) => setResidentDraft((current) => ({ ...current, note: event.target.value }))}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={addResident} disabled={!residentDraft.name.trim()}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {isClearDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="clear-save-title">
            <div className="dialog-header">
              <div>
                <h2 id="clear-save-title">Clear Schedule Data</h2>
                <p>This will remove the saved browser data for this device and reset the current schedule.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsClearDialogOpen(false)}>
                <X aria-hidden="true" />
                <span className="sr-only">Close clear confirmation</span>
              </button>
            </div>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={() => setIsClearDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={resetLocalData}>
                Clear Data
              </button>
            </div>
          </div>
        </div>
      )}

      {isMetricsDialogOpen && schedulerMetrics && (
        <MetricsDialog metrics={schedulerMetrics} onClose={() => setIsMetricsDialogOpen(false)} />
      )}
    </div>
  );
}

interface SchedulerTableProps {
  view: ViewMode;
  rows: ReturnType<typeof generateTableRows>;
  residents: Resident[];
  state: AppState;
  onAddResident: () => void;
  onPoolPointerDown: (event: PointerEvent, row: ShiftDateRow, residentId: string) => void;
  onPoolPointerEnter: (row: ShiftDateRow, residentId: string) => void;
  onWeekPointerDown: (event: PointerEvent, row: WeekSeparatorRow, residentId: string) => void;
  onWeekPointerEnter: (row: WeekSeparatorRow, residentId: string) => void;
  onAssignResident: (row: ShiftDateRow, residentId: string) => void;
}

function SchedulerTable({
  view,
  rows,
  residents,
  state,
  onAddResident,
  onPoolPointerDown,
  onPoolPointerEnter,
  onWeekPointerDown,
  onWeekPointerEnter,
  onAssignResident,
}: SchedulerTableProps) {
  return (
    <div className="table-scroll">
      <table className="scheduler-table">
        <thead>
          <tr>
            <th className="date-col">Shift Date</th>
            {residents.map((resident) => (
              <th key={resident.id}>
                <span className="resident-heading" title={resident.note || resident.name}>
                  <span>{resident.name}</span>
                  {resident.note && <small>{resident.note}</small>}
                </span>
              </th>
            ))}
            {view === "pool" && (
              <th className="add-col">
                <button className="round-add" type="button" onClick={onAddResident} title="Add resident">
                  <Plus aria-hidden="true" />
                  <span className="sr-only">Add resident</span>
                </button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.type === "week") {
              return view === "pool" ? (
                <tr key={row.id} className="week-row pool-week-row">
                  <th className="date-cell week-date-cell" scope="row">
                    {row.label}
                  </th>
                  {residents.map((resident) => {
                    const status = getWeekStatus(state.vacationWeeks, row.weekendId, resident.id);
                    return (
                      <td
                        key={resident.id}
                        className={`week-paint-cell ${status}`}
                        title="Vacation or Erase applies to the whole weekend"
                        onPointerDown={(event) => onWeekPointerDown(event, row, resident.id)}
                        onPointerEnter={() => onWeekPointerEnter(row, resident.id)}
                      >
                        {weekStatusLabel(status)}
                      </td>
                    );
                  })}
                  <td className="add-col ghost" />
                </tr>
              ) : (
                <tr key={row.id} className="week-row">
                  <td colSpan={residents.length + 1}>{row.label}</td>
                </tr>
              );
            }
            return (
              <tr
                key={row.id}
                className={`shift-row ${isLockedDate(row.date, state.lockedRanges) ? "locked-row" : ""}`}
              >
                <th className="date-cell" scope="row">
                  <span>{row.label}</span>
                  <small>{row.timeLabel}</small>
                </th>
                {residents.map((resident) => {
                  const rowIsLocked = isLockedDate(row.date, state.lockedRanges);
                  const status = getPoolStatus(state.pool, row.date, resident.id);
                  const isBookend = isBookendCell(rows, state.vacationWeeks, row.weekendId, resident.id);
                  const assignment = state.assignments[row.weekendId];
                  const isAssigned =
                    row.shiftKind === "twentyFour"
                      ? assignment?.twentyFourResidentId === resident.id
                      : assignment?.twelveResidentId === resident.id;
                  const isManual =
                    row.shiftKind === "twentyFour" ? assignment?.manualTwentyFour : assignment?.manualTwelve;
                  const cellTitle =
                    isAssigned && isManual
                      ? `Clear manual assignment for ${resident.name}`
                      : isAssigned
                        ? `${resident.name} assigned`
                        : `Assign ${resident.name}`;

                  return view === "pool" ? (
                    <td
                      key={resident.id}
                      className={`pool-cell ${status}`}
                      title={STATUS_DESCRIPTIONS[status]}
                      onPointerDown={(event) => onPoolPointerDown(event, row, resident.id)}
                      onPointerEnter={() => onPoolPointerEnter(row, resident.id)}
                    >
                      {STATUS_LABELS[status]}
                    </td>
                  ) : (
                    <td
                      key={resident.id}
                      className={`schedule-cell ${isAssigned ? "assigned" : ""} ${!isAssigned && rowIsLocked ? "locked-empty" : ""} ${!isAssigned && isBookend ? "bookend-hint" : ""} ${!isAssigned && status === "requestedOff" ? "requested-off-hint" : ""} ${status}`}
                      title={cellTitle}
                      onClick={() => onAssignResident(row, resident.id)}
                    >
                      {isAssigned ? (
                        <div className="assignment-marker">
                          <span>{row.shiftKind === "twentyFour" ? "24" : "12"}</span>
                          {isManual && <small>Manual</small>}
                        </div>
                      ) : null}
                    </td>
                  );
                })}
                {view === "pool" && <td className="add-col ghost" />}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function settingLabel(key: keyof OptimizerSettings): string {
  const labels: Record<keyof OptimizerSettings, string> = {
    hourFairnessWeight: "Hour fairness",
    twentyFourFairnessWeight: "24-hour fairness",
    spacingWeight: "24-hour spacing",
    adjacentWeekendWeight: "Adjacent weekends",
    requestedOffWeight: "Requested off",
    bookendWeight: "Vacation bookends",
    iterations: "Iterations",
    randomSeed: "Random seed",
  };
  return labels[key];
}

function monthToDateRange(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const end = new Date(year, month, 0);
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
  };
}

function filterLockedRows(rows: TableRow[], lockedRanges: AppState["lockedRanges"]) {
  const filtered: TableRow[] = [];
  let pendingWeek: TableRow | null = null;

  rows.forEach((row) => {
    if (row.type === "week") {
      pendingWeek = row;
      return;
    }
    if (lockedRanges.some((range) => row.date >= range.start && row.date <= range.end)) {
      return;
    }
    if (pendingWeek) {
      filtered.push(pendingWeek);
      pendingWeek = null;
    }
    filtered.push(row);
  });

  return filtered;
}

function formatMetrics(metrics: SchedulerMetrics) {
  const lines = [
    `Engine: ${metrics.engine}`,
    `Score: ${metrics.score.toFixed(2)}`,
    `Assigned hours: ${metrics.totals.assignedHours}`,
    `24-hour shifts: ${metrics.totals.twentyFourShifts}`,
    `12-hour shifts: ${metrics.totals.twelveHourShifts}`,
    `Locked shifts preserved: ${metrics.totals.lockedShifts}`,
    `Shifts scheduled over requested days off: ${metrics.totals.requestedOffAssignments}`,
    `Vacation assignments: ${metrics.totals.vacationAssignments}`,
    `Not-in-pool fallback assignments: ${metrics.totals.fallbackAssignments}`,
    `Golden weekends: ${formatFraction(metrics.totals.goldenWeekends, metrics.totals.goldenWeekendOpportunities)}`,
    `Vacation bookend weekends granted: ${formatFraction(metrics.totals.vacationBookendWeekendsGranted, metrics.totals.vacationBookendWeekends)}`,
    `Requested days off granted: ${formatFraction(metrics.totals.requestedDaysOffGranted, metrics.totals.requestedDaysOff)}`,
    `Recovery goldens granted: ${formatFraction(metrics.totals.recoveryGoldensGranted, metrics.totals.recoveryGoldenOpportunities)}`,
    `Consecutive weekend shifts scheduled: ${metrics.totals.adjacentWeekendPairs}`,
    "",
    "Resident fairness:",
    ...metrics.residentMetrics.map((metric) => {
      const ratio = `${(metric.assignedHourRatio * 100).toFixed(1)}%`;
      const minGap = metric.minTwentyFourGap === null ? "n/a" : `${metric.minTwentyFourGap} wk`;
      const maxGap = metric.longestTwentyFourGap === null ? "n/a" : `${metric.longestTwentyFourGap} wk`;
      return `${metric.residentName}: ${metric.assignedHours}h / ${metric.opportunityHours}h (${ratio}), 24h=${metric.twentyFourShifts}, 24h/36 pool hrs=${metric.twentyFourShiftsPerWeekend.toFixed(2)}, golden weekends=${metric.goldenWeekends}, consecutive weekends=${metric.adjacentWeekendPairs}, 24h gap min/max=${minGap}/${maxGap}`;
    }),
  ];
  return lines.join("\n");
}

function MetricsDialog({ metrics, onClose }: { metrics: SchedulerMetrics; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog metrics-dialog" role="dialog" aria-modal="true" aria-labelledby="metrics-charts-title">
        <div className="dialog-header">
          <div>
            <h2 id="metrics-charts-title">Schedule Metrics</h2>
            <p>Resident workload balance by opportunity-adjusted measures.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" />
            <span className="sr-only">Close metrics charts</span>
          </button>
        </div>
        <div className="metrics-summary-row" aria-label="Schedule summary">
          <MetricSummary
            label="% of Weekends that are Golden"
            value={formatFraction(metrics.totals.goldenWeekends, metrics.totals.goldenWeekendOpportunities)}
          />
          <MetricSummary
            label="Vacation Bookend Weekends Granted"
            value={formatFraction(metrics.totals.vacationBookendWeekendsGranted, metrics.totals.vacationBookendWeekends)}
          />
          <MetricSummary
            label="Requested Days Off Granted"
            value={formatFraction(metrics.totals.requestedDaysOffGranted, metrics.totals.requestedDaysOff)}
          />
          <MetricSummary
            label="Recovery Goldens Granted"
            value={formatFraction(metrics.totals.recoveryGoldensGranted, metrics.totals.recoveryGoldenOpportunities)}
          />
        </div>
        <div className="chart-grid">
          <MetricBarChart
            title="Resident utilization rate"
            valueLabel="Assigned hours / pool hours"
            bars={metrics.residentMetrics.map((metric) => ({
              id: metric.residentId,
              label: metric.residentName,
              value: metric.assignedHourRatio * 100,
              displayValue: `${(metric.assignedHourRatio * 100).toFixed(1)}%`,
            }))}
            baseline={100}
          />
          <MetricBarChart
            title="Number of 24-hr shifts per weekend"
            valueLabel="24-hr shifts / 36 pool hours"
            bars={metrics.residentMetrics.map((metric) => ({
              id: metric.residentId,
              label: metric.residentName,
              value: metric.twentyFourShiftsPerWeekend,
              displayValue: metric.twentyFourShiftsPerWeekend.toFixed(2),
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function MetricSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface MetricBar {
  id: string;
  label: string;
  value: number;
  displayValue: string;
}

function MetricBarChart({
  title,
  valueLabel,
  bars,
  baseline = 0,
}: {
  title: string;
  valueLabel: string;
  bars: MetricBar[];
  baseline?: number;
}) {
  const maxValue = Math.max(baseline, 1, ...bars.map((bar) => bar.value));

  return (
    <section className="metric-chart" aria-labelledby={`${slugify(title)}-title`}>
      <div className="metric-chart-header">
        <h3 id={`${slugify(title)}-title`}>{title}</h3>
        <span>{valueLabel}</span>
      </div>
      <div className="bar-list">
        {bars.length === 0 ? (
          <p className="empty-chart">Generate a schedule with residents to view this chart.</p>
        ) : (
          bars.map((bar) => (
            <div className="bar-row" key={bar.id}>
              <span className="bar-label">{bar.label}</span>
              <div className="bar-track" aria-hidden="true">
                <div className="bar-fill" style={{ width: `${Math.max((bar.value / maxValue) * 100, 2)}%` }} />
              </div>
              <span className="bar-value">{bar.displayValue}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatFraction(numerator: number, denominator: number) {
  if (!denominator) {
    return "0 / 0 (n/a)";
  }
  return `${numerator} / ${denominator} (${((numerator / denominator) * 100).toFixed(0)}%)`;
}

function createRandomSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

function isLockedDate(date: string, lockedRanges: AppState["lockedRanges"]) {
  return lockedRanges.some((range) => date >= range.start && date <= range.end);
}

function isBookendCell(
  rows: TableRow[],
  vacationWeeks: AppState["vacationWeeks"],
  weekendId: string,
  residentId: string,
) {
  const weekendIds = rows
    .filter((row): row is WeekSeparatorRow => row.type === "week")
    .map((row) => row.weekendId);
  const index = weekendIds.indexOf(weekendId);
  if (index < 0) {
    return false;
  }
  const currentVacation = vacationWeeks[weekendIds[index]]?.[residentId];
  const nextVacation = index + 1 < weekendIds.length && vacationWeeks[weekendIds[index + 1]]?.[residentId];
  return Boolean(currentVacation || nextVacation);
}

function getWeekStatus(vacationWeeks: AppState["vacationWeeks"], weekendId: string, residentId: string) {
  return vacationWeeks[weekendId]?.[residentId] ? "vacation" : "empty";
}

function weekStatusLabel(status: "vacation" | "empty" | "mixed") {
  if (status === "vacation") {
    return "Vacation";
  }
  if (status === "mixed") {
    return "Mixed";
  }
  return "";
}

export default App;
