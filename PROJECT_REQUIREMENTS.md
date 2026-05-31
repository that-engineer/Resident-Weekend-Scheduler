# Resident Weekend Scheduler Requirements

## Project Goal
Create a resident weekend scheduler that runs as a static GitHub Pages site and does not require users to install software. The app must let non-technical users define resident availability, generate a fair weekend call schedule, manually adjust the result, and preserve all work through import/export of state data.

## Deployment And Architecture
- The frontend is a Vite, React, and TypeScript static app suitable for GitHub Pages deployment.
- The optimizer is TypeScript running directly in the static browser app.
- There is no hosted database, login system, or server persistence in v1.
- JSON import/export is the source of portable persistence.
- The app can export the visible schedule as a PNG image for a user-selected date window.

## Core Scheduling Model
- Each weekend has two required shifts:
  - A 24-hour shift from Saturday 5 AM to Sunday 5 AM.
  - A 12-hour shift from Sunday 5 AM to Sunday 5 PM.
- Each shift date may have a different resident pool.
- Saturday rows determine eligibility for the 24-hour shift.
- Sunday rows determine eligibility for the 12-hour shift.
- Vacation is a hard unavailable status.
- Requested Off is a strong preference to avoid assigning the resident, but it may be used if needed to complete the schedule.

## Optimization Goals
- Equalize total assigned hours relative to the number of times each resident is in the call pool.
- Equalize the number of 24-hour shifts.
- Maximize spacing between 24-hour shifts for the same resident.
- Avoid requested-off dates whenever possible.
- Equalize 24-hour shifts relative to each resident's total in-pool/requested-off hours, rather than equalizing raw 24-hour shift counts.
- Avoid assigning the same resident on adjacent weekends when possible.
- Prefer vacation bookends by keeping the immediately adjacent weekends before and after a vacation week free for that resident when feasible.
- Use a transparent heuristic and local-search style optimizer for v1 rather than a hosted exact solver.

## User Interface
- The app has two primary views: Pool Set and Weekend Schedule.
- The top bar includes a centered button-style link to the GitHub README documentation.
- Both views use a table as the primary visual.
- Table rows are shift dates, with a non-selectable week separator row before each weekend.
- Table columns are residents.
- A circular plus button appears along the table header row to the right of the right-most resident column.
- Adding a resident is only available in the Pool Set view.
- The add-resident prompt includes Name, Note, Cancel, and Add controls.

## Pool Set View
- Users select one of four modes from a vertical button group to the left of the table:
  - In-Pool: available to work.
  - Vacation: unavailable to work.
  - Requested Off: preference not to work.
  - Erase: clear previously painted status cells.
- Clicking and dragging across cells paints the selected status onto shift dates for the resident columns under the pointer.
- In the week separator row, Vacation and Erase can be painted as week-level vacation markers. These markers do not make Saturday/Sunday shifts unavailable; they inform vacation bookend optimization.

## Weekend Schedule View
- The schedule view shows generated 24-hour and 12-hour assignments in the same table structure.
- Users can click a resident cell to manually assign that resident to the corresponding shift.
- Users can click an existing manual assignment to clear that shift assignment.
- Manual edits are retained in exported state and respected on future optimizer runs.
- The view displays warnings for missing assignments, vacation conflicts, requested-off assignments, not-in-pool assignments, and same-resident double assignments.
- The view displays schedule metrics related to the optimization goals, including assigned hours, opportunity hours, 24-hour counts, spacing, and exception counts.
- Users can open a metrics charts pop-up from the Weekend Schedule view showing resident utilization rate, 24-hour shifts per 36 pool hours, golden weekend percentage, vacation bookends granted, requested days off granted, and recovery goldens granted.
- The table visually hints vacation bookend weekends with light red cells and requested-off weekends with light yellow cells, but these hints are UI-only and are not included in schedule image exports.
- The image export date range can be set manually or by selecting a calendar month.
- Users can lock a date range so existing assignments in that range are preserved on future optimizer runs.
- Users can hide locked dates in the Weekend Schedule table.

## State Import And Export
- The primary state file is JSON and is exported from a clearly labeled "Export Schedule Data to Save for Later" action.
- Exported state includes app version, date range, residents, notes, pool statuses, assignments, manual assignment flags, locked ranges, and optimizer settings.
- Exported state includes generated schedule metrics only while they still match the current resident roster, date range, and painted pool/vacation statuses.
- Imported state should normalize unknown pool statuses to empty and preserve compatible data.
- Imported schedule metrics should be restored only when their validity signature matches the imported state.
- Schedule image export is a separate action from JSON state export and does not include editable app state.

## Testing Expectations
- Unit test date-range weekend generation and week separator rows.
- Unit test JSON import/export round trips.
- Unit test selected-date filtering for schedule image exports.
- Unit test the TypeScript scheduler for shift completion, locked assignment preservation, requested-off/vacation behavior, and performance timing.
- Verify the app builds as static GitHub Pages output.
