import type { AppState, Resident, ShiftDateRow, TableRow } from "../types";
import { formatDateLabel } from "./dateUtils";

const COLORS = {
  page: "#ffffff",
  ink: "#202427",
  muted: "#687076",
  border: "#d9d3ca",
  header: "#f1eee8",
  week: "#263236",
  assigned: "#0f766e",
};

export function filterRowsForImage(rows: TableRow[], start: string, end: string): TableRow[] {
  const filtered: TableRow[] = [];
  let pendingWeek: TableRow | null = null;

  rows.forEach((row) => {
    if (row.type === "week") {
      pendingWeek = row;
      return;
    }
    if (row.date < start || row.date > end) {
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

export function exportScheduleImage(
  state: AppState,
  rows: TableRow[],
  start: string,
  end: string,
): { ok: boolean; message: string } {
  const imageRows = filterRowsForImage(rows, start, end);
  const shiftRows = imageRows.filter((row): row is ShiftDateRow => row.type === "shift");

  if (!state.residents.length) {
    return { ok: false, message: "Add residents before exporting a schedule image." };
  }
  if (!shiftRows.length) {
    return { ok: false, message: "Choose dates that include at least one schedule row." };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { ok: false, message: "This browser cannot create the schedule image." };
  }

  const dateWidth = 270;
  const residentWidth = Math.max(130, Math.min(180, 92 + longestResidentName(state.residents) * 6));
  const headerHeight = 54;
  const titleHeight = 56;
  const weekHeight = 34;
  const shiftHeight = 58;
  const width = dateWidth + state.residents.length * residentWidth;
  const height =
    titleHeight +
    headerHeight +
    imageRows.reduce((sum, row) => sum + (row.type === "week" ? weekHeight : shiftHeight), 0);
  const scale = Math.max(window.devicePixelRatio || 1, 2);

  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(scale, scale);
  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, width, height);

  drawTitle(ctx, start, end, width);
  drawHeader(ctx, state.residents, titleHeight, dateWidth, residentWidth);
  drawRows(ctx, state, imageRows, titleHeight + headerHeight, dateWidth, residentWidth, width);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `weekend-schedule-${start}-to-${end}.png`;
  link.click();

  return {
    ok: true,
    message: `Schedule image exported for ${formatDateLabel(start)} through ${formatDateLabel(end)}.`,
  };
}

function longestResidentName(residents: Resident[]): number {
  return residents.reduce((longest, resident) => Math.max(longest, resident.name.length), 0);
}

function drawTitle(Canvas: CanvasRenderingContext2D, start: string, end: string, width: number) {
  Canvas.fillStyle = COLORS.ink;
  Canvas.font = "700 20px Inter, Segoe UI, sans-serif";
  Canvas.fillText("Resident Weekend Schedule", 16, 25);
  Canvas.fillStyle = COLORS.muted;
  Canvas.font = "600 13px Inter, Segoe UI, sans-serif";
  Canvas.fillText(`${formatDateLabel(start)} through ${formatDateLabel(end)}`, 16, 45);
  Canvas.strokeStyle = COLORS.border;
  Canvas.beginPath();
  Canvas.moveTo(0, 55.5);
  Canvas.lineTo(width, 55.5);
  Canvas.stroke();
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  residents: Resident[],
  y: number,
  dateWidth: number,
  residentWidth: number,
) {
  ctx.fillStyle = COLORS.header;
  ctx.fillRect(0, y, dateWidth + residents.length * residentWidth, 54);
  ctx.strokeStyle = COLORS.border;
  ctx.strokeRect(0.5, y + 0.5, dateWidth - 1, 53);
  ctx.fillStyle = COLORS.ink;
  ctx.font = "800 13px Inter, Segoe UI, sans-serif";
  ctx.fillText("Shift Date", 14, y + 33);

  residents.forEach((resident, index) => {
    const x = dateWidth + index * residentWidth;
    ctx.strokeRect(x + 0.5, y + 0.5, residentWidth - 1, 53);
    drawTruncated(ctx, resident.name, x + 10, y + 33, residentWidth - 20);
  });
}

function drawRows(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  rows: TableRow[],
  startY: number,
  dateWidth: number,
  residentWidth: number,
  width: number,
) {
  let y = startY;

  rows.forEach((row) => {
    if (row.type === "week") {
      ctx.fillStyle = COLORS.week;
      ctx.fillRect(0, y, width, 34);
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 12px Inter, Segoe UI, sans-serif";
      ctx.fillText(row.label, 14, y + 22);
      y += 34;
      return;
    }

    ctx.fillStyle = COLORS.page;
    ctx.fillRect(0, y, width, 58);
    ctx.strokeStyle = COLORS.border;
    ctx.strokeRect(0.5, y + 0.5, dateWidth - 1, 57);
    ctx.fillStyle = COLORS.ink;
    ctx.font = "800 13px Inter, Segoe UI, sans-serif";
    ctx.fillText(row.label, 14, y + 23);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "600 11px Inter, Segoe UI, sans-serif";
    ctx.fillText(row.timeLabel, 14, y + 42);

    state.residents.forEach((resident, index) => {
      const x = dateWidth + index * residentWidth;
      const assignment = state.assignments[row.weekendId];
      const assigned =
        row.shiftKind === "twentyFour"
          ? assignment?.twentyFourResidentId === resident.id
          : assignment?.twelveResidentId === resident.id;
      const manual = row.shiftKind === "twentyFour" ? assignment?.manualTwentyFour : assignment?.manualTwelve;

      ctx.fillStyle = assigned ? COLORS.assigned : COLORS.page;
      ctx.fillRect(x, y, residentWidth, 58);
      ctx.strokeStyle = COLORS.border;
      ctx.strokeRect(x + 0.5, y + 0.5, residentWidth - 1, 57);

      if (assigned) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 16px Inter, Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(row.shiftKind === "twentyFour" ? "24" : "12", x + residentWidth / 2, y + 26);
        if (manual) {
          ctx.font = "800 10px Inter, Segoe UI, sans-serif";
          ctx.fillText("Manual", x + residentWidth / 2, y + 43);
        }
        ctx.textAlign = "left";
      }
    });
    y += 58;
  });
}

function drawTruncated(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }

  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  ctx.fillText(`${truncated}...`, x, y);
}
