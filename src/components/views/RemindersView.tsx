import React, { useMemo, useState } from 'react';
import { Bell, CheckCircle2, ShoppingCart } from 'lucide-react';
import { formatDisplayDate, formatQuantityUnit, formatTimestamp } from '../../lib/dateFormat.ts';
import type { DateFormatOption, Medicine, ReminderCycle } from '../../shared/types.ts';
import { EmptyState } from '../ui/StateViews.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';

interface RemindersViewProps {
  pending: ReminderCycle[];
  history: ReminderCycle[];
  medicines: Medicine[];
  dateFormat: DateFormatOption;
  onOpenMedicine: (medicineId: string) => void;
  onMarkPurchased: (medicine: Medicine) => void;
}

export const RemindersView: React.FC<RemindersViewProps> = ({
  pending,
  history,
  medicines,
  dateFormat,
  onOpenMedicine,
  onMarkPurchased,
}) => {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');

  const medicineMap = useMemo(() => {
    const map = new Map<string, Medicine>();
    for (const m of medicines) map.set(m.id, m);
    return map;
  }, [medicines]);

  const groupedPending = useMemo(() => {
    const groups = new Map<
      string,
      { memberId: string; memberName: string; items: ReminderCycle[] }
    >();

    for (const rc of pending) {
      const existing = groups.get(rc.familyMemberId) || {
        memberId: rc.familyMemberId,
        memberName: rc.familyMemberName,
        items: [],
      };
      existing.items.push(rc);
      groups.set(rc.familyMemberId, existing);
    }

    return Array.from(groups.values());
  }, [pending]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-[#182230] dark:text-white">
            Refill Reminders
          </h1>
          <p className="text-sm text-[#667085] dark:text-slate-400">
            Medicines within 3 days of stock end repeat daily until individually confirmed.
          </p>
        </div>

        {/* Segmented Tabs */}
        <div className="inline-flex items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
              tab === 'pending'
                ? 'bg-[#245DB5] text-white'
                : 'text-[#667085] dark:text-slate-400 hover:text-[#182230] dark:hover:text-white'
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
              tab === 'history'
                ? 'bg-[#245DB5] text-white'
                : 'text-[#667085] dark:text-slate-400 hover:text-[#182230] dark:hover:text-white'
            }`}
          >
            History ({history.length})
          </button>
        </div>
      </div>

      {tab === 'pending' ? (
        groupedPending.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-7 h-7 text-[#16866B]" />}
            title="You're all caught up!"
            description="There are no pending refill reminders right now."
          />
        ) : (
          <div className="space-y-4">
            {groupedPending.map((group) => (
              <section
                key={group.memberId}
                className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden"
              >
                <div className="px-5 py-3.5 bg-[#F6F8FB] dark:bg-slate-800/60 border-b border-[#E3EAF3] dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-display font-bold text-[#182230] dark:text-white">
                    {group.memberName} — {group.items.length}{' '}
                    {group.items.length === 1 ? 'medicine needs' : 'medicines need'} attention
                  </h2>
                </div>

                <div className="divide-y divide-[#E3EAF3] dark:divide-slate-800">
                  {group.items.map((rc) => {
                    const med = medicineMap.get(rc.medicineId);
                    return (
                      <div
                        key={rc.id}
                        className="p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenMedicine(rc.medicineId)}
                              className="text-sm sm:text-base font-bold text-[#182230] dark:text-white hover:text-[#245DB5] text-left"
                            >
                              {rc.medicineName}
                            </button>
                            <StatusBadge status={rc.stockStatus} compact />
                          </div>
                          <p className="text-xs text-[#667085] dark:text-slate-400 mt-1 tabular-nums">
                            {rc.remainingTablets <= 0
                              ? '0 tablets remaining'
                              : `${rc.daysUntilStockEnd} ${rc.daysUntilStockEnd === 1 ? 'day' : 'days'} remaining (${formatQuantityUnit(rc.remainingTablets)})`}{' '}
                            · Stock ends {formatDisplayDate(rc.stockEndDate, dateFormat)}
                            {rc.lastNotifiedDate
                              ? ` · Last reminded ${formatDisplayDate(rc.lastNotifiedDate, dateFormat)}`
                              : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {med && (
                            <button
                              type="button"
                              onClick={() => onMarkPurchased(med)}
                              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#16866B] hover:bg-[#126f58] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>Mark as Purchased</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenMedicine(rc.medicineId)}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )
      ) : history.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-7 h-7" />}
          title="No completed reminder history yet"
          description="When you confirm purchases for medicines that triggered reminders, their resolved records will appear here."
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-[#E3EAF3] dark:divide-slate-800">
          {history.map((rc) => (
            <div
              key={rc.id}
              className="p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <button
                  type="button"
                  onClick={() => onOpenMedicine(rc.medicineId)}
                  className="text-sm font-bold text-[#182230] dark:text-white hover:text-[#245DB5] text-left"
                >
                  {rc.medicineName}
                </button>
                <p className="text-xs text-[#667085] dark:text-slate-400 mt-0.5 tabular-nums">
                  {rc.familyMemberName} · Reminder started{' '}
                  {formatDisplayDate(rc.firstReminderDate, dateFormat)} · Resolved{' '}
                  {rc.resolvedAt ? formatTimestamp(rc.resolvedAt, dateFormat) : '—'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16866B] dark:text-emerald-400 whitespace-nowrap">
                <CheckCircle2 className="w-4 h-4" />
                <span>Purchase Confirmed</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
