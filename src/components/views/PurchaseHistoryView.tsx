import React, { useMemo, useState } from 'react';
import { History, RotateCcw, Search } from 'lucide-react';
import { formatDisplayDate, formatQuantityUnit } from '../../lib/dateFormat.ts';
import type {
  DateFormatOption,
  FamilyMemberWithStats,
  PurchaseTransaction,
} from '../../shared/types.ts';
import { EmptyState } from '../ui/StateViews.tsx';

interface PurchaseHistoryViewProps {
  purchases: PurchaseTransaction[];
  familyMembers: FamilyMemberWithStats[];
  dateFormat: DateFormatOption;
  onOpenMedicine: (medicineId: string) => void;
}

export const PurchaseHistoryView: React.FC<PurchaseHistoryViewProps> = ({
  purchases,
  familyMembers,
  dateFormat,
  onOpenMedicine,
}) => {
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter((p) => {
      if (memberFilter !== 'ALL' && p.familyMemberId !== memberFilter) return false;
      if (fromDate && p.purchaseDate < fromDate) return false;
      if (toDate && p.purchaseDate > toDate) return false;
      if (q) {
        const matchMed = p.medicineName.toLowerCase().includes(q);
        const matchMember = p.familyMemberName.toLowerCase().includes(q);
        const matchNotes = (p.notes || '').toLowerCase().includes(q);
        if (!matchMed && !matchMember && !matchNotes) return false;
      }
      return true;
    });
  }, [purchases, search, memberFilter, fromDate, toDate]);

  const hasFilters = search || memberFilter !== 'ALL' || fromDate || toDate;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-[#182230] dark:text-white">
          Purchase History
        </h1>
        <p className="text-sm text-[#667085] dark:text-slate-400">
          Complete immutable record of confirmed medicine purchases and stock additions.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-2">
          <Search
            className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicine, member, or notes..."
            className="w-full min-h-[42px] pl-10 pr-3 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-[#F6F8FB] dark:bg-slate-800 text-sm text-[#182230] dark:text-white"
          />
        </div>

        <select
          aria-label="Filter purchases by family member"
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

        <input
          type="date"
          aria-label="From purchase date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-[#182230] dark:text-white"
        />

        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="To purchase date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-[#182230] dark:text-white"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setMemberFilter('ALL');
                setFromDate('');
                setToDate('');
              }}
              aria-label="Clear filters"
              className="min-h-[42px] min-w-[42px] rounded-xl border border-[#E3EAF3] dark:border-slate-700 flex items-center justify-center text-[#667085] hover:text-[#182230]"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<History className="w-7 h-7" />}
          title={purchases.length === 0 ? 'No purchases recorded yet' : 'No matching purchases'}
          description={
            purchases.length === 0
              ? 'Confirmed medicine purchases will appear in this ledger.'
              : 'Try clearing or widening your date and member filters.'
          }
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-[#E3EAF3] dark:divide-slate-800">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F6F8FB]/70 dark:hover:bg-slate-800/40 transition-colors"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenMedicine(p.medicineId)}
                  className="text-sm font-bold text-[#182230] dark:text-white hover:text-[#245DB5] text-left"
                >
                  {p.medicineName}
                </button>
                <p className="text-xs text-[#667085] dark:text-slate-400 mt-0.5 tabular-nums">
                  {p.familyMemberName} · Purchased {formatDisplayDate(p.purchaseDate, dateFormat)}
                  {p.notes ? ` · ${p.notes}` : ''}
                </p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                <div className="text-left sm:text-right tabular-nums">
                  <p className="text-sm font-bold text-[#16866B] dark:text-emerald-400">
                    +{formatQuantityUnit(p.quantityPurchased)}
                  </p>
                  <p className="text-xs text-[#667085] dark:text-slate-400">
                    Prev {p.previousRemaining} → Total {p.resultingStock}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenMedicine(p.medicineId)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E3EAF3] dark:border-slate-700 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
