import type { ShiftDateRow, TableRow, Weekend } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatDateLabel(value: string): string {
  return parseLocalDate(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getWeekStart(date: Date): Date {
  const day = date.getDay();
  const distanceFromMonday = (day + 6) % 7;
  return addDays(date, -distanceFromMonday);
}

function firstSaturdayOnOrAfter(date: Date): Date {
  const distance = (6 - date.getDay() + 7) % 7;
  return addDays(date, distance);
}

export function generateWeekends(start: string, end: string): Weekend[] {
  if (!start || !end) {
    return [];
  }

  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return [];
  }

  const weekends: Weekend[] = [];
  let saturday = firstSaturdayOnOrAfter(startDate);

  while (saturday.getTime() + DAY_MS <= endDate.getTime()) {
    const sunday = addDays(saturday, 1);
    const weekStart = getWeekStart(saturday);
    const saturdayKey = toDateKey(saturday);
    weekends.push({
      id: saturdayKey,
      saturday: saturdayKey,
      sunday: toDateKey(sunday),
      weekLabel: `Week of ${weekStart.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`,
    });
    saturday = addDays(saturday, 7);
  }

  return weekends;
}

export function generateTableRows(weekends: Weekend[]): TableRow[] {
  return weekends.flatMap((weekend) => {
    const saturdayRow: ShiftDateRow = {
      type: "shift",
      id: `${weekend.id}-24`,
      weekendId: weekend.id,
      date: weekend.saturday,
      shiftKind: "twentyFour",
      label: formatDateLabel(weekend.saturday),
      timeLabel: "24 hr, Sat 5 AM-Sun 5 AM",
    };

    const sundayRow: ShiftDateRow = {
      type: "shift",
      id: `${weekend.id}-12`,
      weekendId: weekend.id,
      date: weekend.sunday,
      shiftKind: "twelve",
      label: formatDateLabel(weekend.sunday),
      timeLabel: "12 hr, Sun 5 AM-5 PM",
    };

    return [
      {
        type: "week" as const,
        id: `${weekend.id}-week`,
        weekendId: weekend.id,
        dates: [weekend.saturday, weekend.sunday],
        label: weekend.weekLabel,
      },
      saturdayRow,
      sundayRow,
    ];
  });
}

export function buildDefaultDateRange(today = new Date()): { start: string; end: string } {
  const start = firstSaturdayOnOrAfter(today);
  return {
    start: toDateKey(start),
    end: toDateKey(addDays(start, 90)),
  };
}
