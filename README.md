# Resident Weekend Scheduler

A static, GitHub Pages-ready resident weekend scheduler with a React frontend and a TypeScript optimizer that runs entirely in the browser.

## Web App

The deployed app is available at:

https://that-engineer.github.io/Resident-Weekend-Scheduler/

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
