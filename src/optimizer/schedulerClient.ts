import type { SchedulerPayload, SchedulerResult } from "../types";
import { calculateScheduleMetrics, scheduleWithJs } from "./jsScheduler";

export function warmScheduler(): Promise<void> {
  return Promise.resolve();
}

export function runScheduler(payload: SchedulerPayload): Promise<SchedulerResult> {
  return Promise.resolve(scheduleWithJs(payload));
}

export { calculateScheduleMetrics };
