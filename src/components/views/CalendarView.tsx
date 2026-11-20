import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react';
import { formatDisplayDate, formatQuantityUnit } from '../../lib/dateFormat.ts';
import { formatCalendarDateParts, getTodayLocalDateStr } from '../../shared/stockEngine.ts';
import type {
  CalendarEvent,
  DateFormatOption,
  FamilyMemberWithStats,
} from '../../shared/types.ts';

interface CalendarViewProps {
  events: CalendarEvent[];
  familyMembers: FamilyMemberWithStats[];
  dateFormat: DateFormatOption;
  onOpenMedicine: (medicineId: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  familyMembers,
  dateFormat,
  onOpenMedicine,
}) => {
  const todayStr = getTodayLocalDateStr();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [memberFilter, setMemberFilter] = useState('ALL');
  const [eventFilter, setEventFilter] = useState<'ALL' | 'purchased' | 'to_purchase'>('ALL');

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (memberFilter !== 'ALL' && ev.familyMemberId !== memberFilter) return false;
      if (eventFilter !== 'ALL' && ev.type !== eventFilter) return false;
      return true;
    });
  }, [events, memberFilter, eventFilter]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filteredEvents) {
      const list = map.get(ev.date) || [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [filteredEvents]);

  const calendarCells = useMemo(() => {
    const firstDayWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ dateStr: string; day: number; inCurrentMonth: boolean }> = [];

    // Leading days from previous month
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const pm = viewMonth === 0 ? 12 : viewMonth;
      const py = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({
        dateStr: formatCalendarDateParts(py, pm, d),
        day: d,
        inCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateStr: formatCalendarDateParts(viewYear, viewMonth + 1, d),
        day: d,
        inCurrentMonth: true,
      });
    }

    // Trailing days to complete 6 rows or 5 rows cleanly
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nm = viewMonth === 11 ? 1 : viewMonth + 2;
      const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({
        dateStr: formatCalendarDateParts(ny, nm, d),
        day: d,
        inCurrentMonth: false,
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setSelectedDate(getTodayLocalDateStr(t));
  };

  const selectedEvents = eventsByDate.get(selectedDate) || [];

  return (
    <div className="space-y-5">
      {/* Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-[#182230] dark:text-white">
            Purchase Calendar
          </h1>
          <p className="text-sm text-[#667085] dark:text-slate-400">
            Track actual medicine purchases and estimated stock-end purchase dates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter calendar by family member"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-[#182230] dark:text-white"
          >
            <option value="ALL">All Family Members</option>
            {familyMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter calendar by event type"
            value={eventFilter}
            onChange={(e) =>
              setEventFilter(e.target.value as 'ALL' | 'purchased' | 'to_purchase')
            }
            className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-[#182230] dark:text-white"
          >
            <option value="ALL">All Events</option>
            <option value="purchased">Purchased</option>
            <option value="to_purchase">To Purchase</option>
          </select>

          <button
            type="button"
            onClick={goToday}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-[#245DB5] dark:text-blue-400"
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar & Selected Date Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={goPrevMonth}
              aria-label="Previous month"
              className="min-w-[42px] min-h-[42px] rounded-xl border border-[#E3EAF3] dark:border-slate-700 flex items-center justify-center text-[#182230] dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-display font-bold text-[#182230] dark:text-white">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </h2>
            <button
              type="button"
              onClick={goNextMonth}
              aria-label="Next month"
              className="min-w-[42px] min-h-[42px] rounded-xl border border-[#E3EAF3] dark:border-slate-700 flex items-center justify-center text-[#182230] dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Weekday Headings */}
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-[#667085] dark:text-slate-400 mb-2">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="py-1.5">
                {wd}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {calendarCells.map((cell) => {
              const dayEvents = eventsByDate.get(cell.dateStr) || [];
              const hasPurchased = dayEvents.some((e) => e.type === 'purchased');
              const hasToPurchase = dayEvents.some((e) => e.type === 'to_purchase');
              const isSelected = cell.dateStr === selectedDate;
              const isToday = cell.dateStr === todayStr;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(cell.dateStr)}
                  className={`min-h-[46px] sm:min-h-[60px] rounded-xl p-1 flex flex-col items-center justify-center transition-colors relative ${
                    isSelected
                      ? 'bg-[#245DB5] text-white font-bold shadow-sm'
                      : isToday
                        ? 'bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-300 font-bold'
                        : cell.inCurrentMonth
                          ? 'hover:bg-[#F6F8FB] dark:hover:bg-slate-800 text-[#182230] dark:text-slate-100'
                          : 'text-[#667085]/45 dark:text-slate-600'
                  }`}
                >
                  <span className="text-xs sm:text-sm tabular-nums">{cell.day}</span>
                  {(hasPurchased || hasToPurchase) && (
                    <div className="flex items-center gap-1 mt-1">
                      {hasPurchased && (
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSelected ? 'bg-emerald-300' : 'bg-[#16866B]'
                          }`}
                          title="Purchased"
                        />
                      )}
                      {hasToPurchase && (
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSelected ? 'bg-amber-300' : 'bg-[#B7791F]'
                          }`}
                          title="To Purchase"
                        />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Strictly Only Two Event Types Legend */}
          <div className="mt-4 pt-3 border-t border-[#E3EAF3] dark:border-slate-800 flex flex-wrap items-center gap-5 text-xs text-[#667085] dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16866B]" />
              <span>Purchased (actual purchase date)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B7791F]" />
              <span>To Purchase (estimated stock-end date)</span>
            </div>
          </div>
        </section>

        {/* Selected Date Events Panel */}
        <section className="lg:col-span-4 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E3EAF3] dark:border-slate-800">
            <CalendarIcon className="w-5 h-5 text-[#245DB5]" />
            <div>
              <p className="text-xs text-[#667085] dark:text-slate-400">Selected Date</p>
              <h3 className="text-base font-display font-bold text-[#182230] dark:text-white">
                {formatDisplayDate(selectedDate, dateFormat)}
              </h3>
            </div>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#667085] dark:text-slate-400">
              No purchases or stock-end dates on this day.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {selectedEvents.map((ev) => {
                const isPurchased = ev.type === 'purchased';
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onOpenMedicine(ev.medicineId)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors flex items-start gap-3 ${
                      isPurchased
                        ? 'bg-[#E6F4F0]/60 dark:bg-emerald-950/40 border-[#16866B]/25 hover:border-[#16866B]/50'
                        : 'bg-[#FEF6E6]/70 dark:bg-amber-950/40 border-[#B7791F]/25 hover:border-[#B7791F]/50'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isPurchased
                          ? 'bg-[#16866B] text-white'
                          : 'bg-[#B7791F] text-white'
                      }`}
                    >
                      {isPurchased ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <ShoppingBag className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-semibold ${
                          isPurchased
                            ? 'text-[#16866B] dark:text-emerald-300'
                            : 'text-[#9A6315] dark:text-amber-300'
                        }`}
                      >
                        {isPurchased ? 'Purchased' : 'To Purchase'}
                      </p>
                      <p className="text-sm font-bold text-[#182230] dark:text-white truncate mt-0.5">
                        {ev.medicineName}
                      </p>
                      <p className="text-xs text-[#667085] dark:text-slate-300 mt-0.5 tabular-nums">
                        {ev.familyMemberName}
                        {isPurchased && ev.quantity
                          ? ` · ${formatQuantityUnit(ev.quantity)}`
                          : !isPurchased && ev.remainingTablets !== undefined
                            ? ` · ${formatQuantityUnit(ev.remainingTablets)} currently left`
                            : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
