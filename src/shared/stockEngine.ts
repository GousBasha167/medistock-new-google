import type { StockStatus } from './types.ts';

const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCalendarDate(dateStr: string): { year: number; month: number; day: number } {
  const match = DATE_REGEX.exec(dateStr.trim());
  if (!match) {
    throw new Error(`Invalid calendar date format "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid calendar date "${dateStr}".`);
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Non-existent calendar date "${dateStr}".`);
  }

  return { year, month, day };
}

export function isValidCalendarDate(dateStr: string): boolean {
  try {
    parseCalendarDate(dateStr);
    return true;
  } catch {
    return false;
  }
}

export function formatCalendarDateParts(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addCalendarDays(dateStr: string, days: number): string {
  const { year, month, day } = parseCalendarDate(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatCalendarDateParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function diffCalendarDays(fromDateStr: string, toDateStr: string): number {
  const a = parseCalendarDate(fromDateStr);
  const b = parseCalendarDate(toDateStr);
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msB - msA) / 86_400_000);
}

export function getTodayLocalDateStr(now: Date = new Date()): string {
  return formatCalendarDateParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export interface ScheduleInput {
  quantity: number;
  dailyUsage: number;
  baselineDate: string;
}

export interface ScheduleOutput {
  remainingDays: number;
  stockEndDate: string;
  firstReminderDate: string;
}

/**
 * Core MediStock schedule calculation using the inclusive last-use-date convention:
 *   remaining_days = ceil(Q / D)
 *   stock_end_date = P + remaining_days - 1 calendar days
 *   first_reminder_date = max(P, stock_end_date - 3 calendar days)
 */
export function calculateStockSchedule(input: ScheduleInput): ScheduleOutput {
  const { quantity, dailyUsage, baselineDate } = input;
  parseCalendarDate(baselineDate);

  if (!Number.isFinite(dailyUsage) || dailyUsage <= 0) {
    throw new Error('Daily usage must be greater than zero.');
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Quantity cannot be negative.');
  }

  if (quantity === 0) {
    return {
      remainingDays: 0,
      stockEndDate: baselineDate,
      firstReminderDate: baselineDate,
    };
  }

  const remainingDays = Math.ceil(quantity / dailyUsage);
  const stockEndDate = addCalendarDays(baselineDate, remainingDays - 1);
  const threeDaysBefore = addCalendarDays(stockEndDate, -3);
  const firstReminderDate = threeDaysBefore < baselineDate ? baselineDate : threeDaysBefore;

  return {
    remainingDays,
    stockEndDate,
    firstReminderDate,
  };
}

export interface EvaluateStockInput {
  baselineQuantity: number;
  dailyUsage: number;
  baselineDate: string;
  referenceDate?: string;
}

export interface EvaluatedStock {
  remainingTablets: number;
  remainingDays: number;
  totalDurationDays: number;
  daysUntilStockEnd: number;
  stockEndDate: string;
  firstReminderDate: string;
  stockStatus: StockStatus;
  progressPercent: number;
  isReminderWindowOpen: boolean;
}

/**
 * Thresholds:
 * - OUT_OF_STOCK: remainingTablets <= 0
 * - PURCHASE_DUE: remainingTablets > 0 and referenceDate >= firstReminderDate (<= 3 days until stock end)
 * - RUNNING_LOW: remainingTablets > 0 and 4..7 days until stock end
 * - IN_STOCK: > 7 days until stock end
 */
export function evaluateMedicineStock(input: EvaluateStockInput): EvaluatedStock {
  const referenceDate = input.referenceDate ?? getTodayLocalDateStr();
  parseCalendarDate(referenceDate);
  parseCalendarDate(input.baselineDate);

  if (!Number.isFinite(input.dailyUsage) || input.dailyUsage <= 0) {
    throw new Error('Daily usage must be greater than zero.');
  }

  const safeBaselineQty = Math.max(0, input.baselineQuantity);
  const schedule = calculateStockSchedule({
    quantity: safeBaselineQty,
    dailyUsage: input.dailyUsage,
    baselineDate: input.baselineDate,
  });

  const elapsedDays = Math.max(0, diffCalendarDays(input.baselineDate, referenceDate));
  const consumed = elapsedDays * input.dailyUsage;
  const remainingTablets = Math.max(0, Number((safeBaselineQty - consumed).toFixed(2)));
  const remainingDays = remainingTablets <= 0 ? 0 : Math.ceil(remainingTablets / input.dailyUsage);
  const daysUntilStockEnd =
    remainingTablets <= 0 ? 0 : Math.max(0, diffCalendarDays(referenceDate, schedule.stockEndDate));

  let stockStatus: StockStatus;
  if (remainingTablets <= 0) {
    stockStatus = 'OUT_OF_STOCK';
  } else if (referenceDate >= schedule.firstReminderDate || daysUntilStockEnd <= 3) {
    stockStatus = 'PURCHASE_DUE';
  } else if (daysUntilStockEnd <= 7) {
    stockStatus = 'RUNNING_LOW';
  } else {
    stockStatus = 'IN_STOCK';
  }

  const progressPercent =
    safeBaselineQty <= 0
      ? 0
      : Math.min(100, Math.max(0, Math.round((remainingTablets / safeBaselineQty) * 100)));

  const isReminderWindowOpen =
    remainingTablets <= 0 || referenceDate >= schedule.firstReminderDate;

  return {
    remainingTablets,
    remainingDays,
    totalDurationDays: schedule.remainingDays,
    daysUntilStockEnd,
    stockEndDate: schedule.stockEndDate,
    firstReminderDate: schedule.firstReminderDate,
    stockStatus,
    progressPercent,
    isReminderWindowOpen,
  };
}

export interface RefillInput {
  currentBaselineQuantity: number;
  currentBaselineDate: string;
  dailyUsage: number;
  actualPurchaseDate: string;
  quantityPurchased: number;
}

export interface RefillResult {
  previousRemaining: number;
  resultingStock: number;
  newBaselineDate: string;
  schedule: ScheduleOutput;
}

/**
 * Early refill preservation policy:
 * Preserves remaining tablets as of the purchase date and adds newly purchased quantity.
 */
export function calculateRefillResult(input: RefillInput): RefillResult {
  parseCalendarDate(input.actualPurchaseDate);
  if (!Number.isFinite(input.quantityPurchased) || input.quantityPurchased <= 0) {
    throw new Error('Purchased quantity must be greater than zero.');
  }

  const currentEval = evaluateMedicineStock({
    baselineQuantity: input.currentBaselineQuantity,
    dailyUsage: input.dailyUsage,
    baselineDate: input.currentBaselineDate,
    referenceDate: input.actualPurchaseDate,
  });

  const previousRemaining = currentEval.remainingTablets;
  const resultingStock = Number((previousRemaining + input.quantityPurchased).toFixed(2));
  const schedule = calculateStockSchedule({
    quantity: resultingStock,
    dailyUsage: input.dailyUsage,
    baselineDate: input.actualPurchaseDate,
  });

  return {
    previousRemaining,
    resultingStock,
    newBaselineDate: input.actualPurchaseDate,
    schedule,
  };
}

export function recalculateAfterUsageChange(params: {
  currentBaselineQuantity: number;
  currentBaselineDate: string;
  oldDailyUsage: number;
  newDailyUsage: number;
  effectiveDate?: string;
}): {
  newBaselineQuantity: number;
  newBaselineDate: string;
  schedule: ScheduleOutput;
} {
  const effectiveDate = params.effectiveDate ?? getTodayLocalDateStr();
  if (!Number.isFinite(params.newDailyUsage) || params.newDailyUsage <= 0) {
    throw new Error('New daily usage must be greater than zero.');
  }

  const snapshot = evaluateMedicineStock({
    baselineQuantity: params.currentBaselineQuantity,
    dailyUsage: params.oldDailyUsage,
    baselineDate: params.currentBaselineDate,
    referenceDate: effectiveDate,
  });

  const schedule = calculateStockSchedule({
    quantity: snapshot.remainingTablets,
    dailyUsage: params.newDailyUsage,
    baselineDate: effectiveDate,
  });

  return {
    newBaselineQuantity: snapshot.remainingTablets,
    newBaselineDate: effectiveDate,
    schedule,
  };
}
