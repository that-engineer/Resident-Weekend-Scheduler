# Resident Weekend Scheduler

A static, GitHub Pages-ready resident weekend scheduler with a React frontend and a TypeScript optimizer that runs entirely in the browser.

## Web App

The deployed app is available at:

https://that-engineer.github.io/Resident-Weekend-Scheduler/

## How to Use

There are two main steps for creating a schedule with this tool. Step 1 is to add residents in the Pool Set view and select the availability level you want to paint the schedule with. Just click and drag the mouse over the table cells you want to assign with one of the three states: In Pool, Vacation, or Requested Off. The initial setup of determining who is available to work will take the most time. Step 2 is to click Generate Schedule and the view will switch over to the Weekend Schedule tab to show the optimized schedule. The optimizer tries to balance the number of hours worked per number of hours in the weekend pool across all residents as well as the number of 24-hour shifts worked per weekend in the pool. It will also attempt to avoid scheduling a resident on the weekend following a weekend where they worked (recovery golden) and maximize the number of requested days off granted and the number of vacation bookends. The user should review the schedule metrics by clicking the button on the right sidebar on the Weekend Schedule tab. Manual edits to the schedule can be made by clicking a cell to assign the shift and clicking again to unassign it. When a specific date range of the schedule looks good, use the Lock Date Range button after inputting the dates to lock in. When the dates are locked in, that portion of the schedule will not change with future presses of the Generate Schedule button unless it is unlocked. To export an image of the schedule to share with others, select a month or a start and end date and click Export Schedule Image.

**Most importantly:** this app does not store any data. Save your progress with the Export Schedule Data to Save for Later button in the upper right corner. Do not lose this file! You will need it to pick up where you left off. If you lose it, you'll have to start from scratch. If you refresh the webpage while making changes, the changes will be lost!

## Local Development

```powershell
npm install
npm run dev
```

## Checks

```powershell
npm run test
npm run build
```

## Deployment

Pushes to `main` run the GitHub Actions workflow in `.github/workflows/deploy-pages.yml`, which tests the app, builds the Vite bundle, and publishes `dist/` to GitHub Pages.

## Data

Use the in-app Import and Export buttons to move full scheduler state as JSON files.
