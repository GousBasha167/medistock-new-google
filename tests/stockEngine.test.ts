import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  calculateRefillResult,
  calculateStockSchedule,
  diffCalendarDays,
  evaluateMedicineStock,
  isValidCalendarDate,
  recalculateAfterUsageChange,
} from '../src/shared/stockEngine.ts';

describe('MediStock Stock Calculation Engine', () => {
  it('calculates 30 tablets at 2 per day starting Oct 28, 2026', () => {
    const schedule = calculateStockSchedule({
      quantity: 30,
      dailyUsage: 2,
      baselineDate: '2026-10-28',
    });

    expect(schedule.remainingDays).toBe(15);
    expect(schedule.stockEndDate).toBe('2026-11-11');
    expect(schedule.firstReminderDate).toBe('2026-11-08');
  });

  it('calculates 20 tablets at 1 per day', () => {
    const schedule = calculateStockSchedule({
      quantity: 20,
      dailyUsage: 1,
      baselineDate: '2026-05-01',
    });

    expect(schedule.remainingDays).toBe(20);
    expect(schedule.stockEndDate).toBe('2026-05-20');
    expect(schedule.firstReminderDate).toBe('2026-05-17');
  });

  it('calculates 5 tablets at 2 per day using ceiling duration', () => {
    const schedule = calculateStockSchedule({
      quantity: 5,
      dailyUsage: 2,
      baselineDate: '2026-06-10',
    });

    expect(schedule.remainingDays).toBe(3);
    expect(schedule.stockEndDate).toBe('2026-06-12');
    // Fewer than 3 days away -> starts immediately on baselineDate
    expect(schedule.firstReminderDate).toBe('2026-06-10');
  });

  it('handles zero stock as OUT_OF_STOCK without negative quantities', () => {
    const evalZero = evaluateMedicineStock({
      baselineQuantity: 0,
      dailyUsage: 2,
      baselineDate: '2026-10-01',
      referenceDate: '2026-10-05',
    });

    expect(evalZero.remainingTablets).toBe(0);
    expect(evalZero.remainingDays).toBe(0);
    expect(evalZero.stockStatus).toBe('OUT_OF_STOCK');

    const evalDepleted = evaluateMedicineStock({
      baselineQuantity: 10,
      dailyUsage: 2,
      baselineDate: '2026-10-01',
      referenceDate: '2026-10-10',
    });

    expect(evalDepleted.remainingTablets).toBe(0);
    expect(evalDepleted.stockStatus).toBe('OUT_OF_STOCK');
  });

  it('rejects invalid daily usage (zero, negative, NaN)', () => {
    expect(() =>
      calculateStockSchedule({ quantity: 30, dailyUsage: 0, baselineDate: '2026-10-28' })
    ).toThrow();
    expect(() =>
      calculateStockSchedule({ quantity: 30, dailyUsage: -2, baselineDate: '2026-10-28' })
    ).toThrow();
    expect(() =>
      calculateStockSchedule({ quantity: 30, dailyUsage: Number.NaN, baselineDate: '2026-10-28' })
    ).toThrow();
  });

  it('handles month boundaries, year boundaries, and leap years accurately', () => {
    // Month boundary
    expect(addCalendarDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(addCalendarDays('2026-04-29', 3)).toBe('2026-05-02');

    // Year boundary
    expect(addCalendarDays('2026-12-30', 4)).toBe('2027-01-03');
    expect(diffCalendarDays('2026-12-31', '2027-01-02')).toBe(2);

    // Leap year (2024 is leap, 2025 is non-leap)
    expect(isValidCalendarDate('2024-02-29')).toBe(true);
    expect(isValidCalendarDate('2025-02-29')).toBe(false);
    expect(addCalendarDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addCalendarDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('preserves remaining stock on early refills', () => {
    // Bought 30 tablets on Oct 28 at 2/day. On Nov 9, 12 days elapsed -> 24 used -> 6 remaining.
    const refill = calculateRefillResult({
      currentBaselineQuantity: 30,
      currentBaselineDate: '2026-10-28',
      dailyUsage: 2,
      actualPurchaseDate: '2026-11-09',
      quantityPurchased: 30,
    });

    expect(refill.previousRemaining).toBe(6);
    expect(refill.resultingStock).toBe(36);
    expect(refill.schedule.remainingDays).toBe(18);
    expect(refill.schedule.stockEndDate).toBe('2026-11-26');
  });

  it('preserves consumed stock when daily usage changes mid-course', () => {
    // Bought 30 on Oct 1 at 2/day. On Oct 6 (5 days later), 20 tablets remain.
    // User changes daily usage to 1/day.
    const recalc = recalculateAfterUsageChange({
      currentBaselineQuantity: 30,
      currentBaselineDate: '2026-10-01',
      oldDailyUsage: 2,
      newDailyUsage: 1,
      effectiveDate: '2026-10-06',
    });

    expect(recalc.newBaselineQuantity).toBe(20);
    expect(recalc.newBaselineDate).toBe('2026-10-06');
    expect(recalc.schedule.remainingDays).toBe(20);
    expect(recalc.schedule.stockEndDate).toBe('2026-10-25');
  });
});
