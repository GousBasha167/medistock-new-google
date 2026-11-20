import { format } from 'date-fns';
import { parseCalendarDate } from '../shared/stockEngine.ts';
import type { DateFormatOption } from '../shared/types.ts';

export function formatDisplayDate(
  dateStr: string,
  dateFormat: DateFormatOption = 'MMM d, yyyy'
): string {
  try {
    const { year, month, day } = parseCalendarDate(dateStr);
    const localDate = new Date(year, month - 1, day);
    return format(localDate, dateFormat);
  } catch {
    return dateStr;
  }
}

export function formatTimestamp(isoString: string, dateFormat: DateFormatOption = 'MMM d, yyyy'): string {
  try {
    const d = new Date(isoString);
    return `${format(d, dateFormat)} · ${format(d, 'h:mm a')}`;
  } catch {
    return isoString;
  }
}

export function getGreetingByTime(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatFullTodayDate(now: Date = new Date()): string {
  return format(now, 'EEEE, MMMM d, yyyy');
}

export function formatQuantityUnit(qty: number, singular = 'tablet', plural = 'tablets'): string {
  const rounded = Number.isInteger(qty) ? String(qty) : qty.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${qty === 1 ? singular : plural}`;
}
