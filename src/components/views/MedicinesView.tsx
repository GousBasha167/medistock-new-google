import React, { useMemo, useState } from 'react';
import { Eye, Pill, Plus, RotateCcw, Search, ShoppingCart } from 'lucide-react';
import { formatDisplayDate, formatQuantityUnit } from '../../lib/dateFormat.ts';
import type {
  DateFormatOption,
  FamilyMemberWithStats,
  Medicine,
  StockStatus,
} from '../../shared/types.ts';
import { EmptyState } from '../ui/StateViews.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';

type SortOption = 'name' | 'remaining' | 'stock_end' | 'family_member';

interface MedicinesViewProps {
  medicines: Medicine[];
  familyMembers: FamilyMemberWithStats[];
  dateFormat: DateFormatOption;
  initialSearch?: string;
  initialStatusFilter?: StockStatus | 'ALL';
  onAddMedicine: () => void;
  onOpenMedicine: (id: string) => void;
  onMarkPurchased: (med: Medicine) => void;
}

export const MedicinesView: React.FC<MedicinesViewProps> = ({
  medicines,
  familyMembers,
  dateFormat,
  initialSearch = '',
  initialStatusFilter = 'ALL',
  onAddMedicine,
  onOpenMedicine,
  onMarkPurchased,
}) => {
  const [search, setSearch] = useState(initialSearch);
  const [memberFilter, setMemberFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StockStatus | 'ALL'>(initialStatusFilter);
  const [sortBy, setSortBy] = useState<SortOption>('stock_end');

  const filteredMedicines = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = medicines.filter((m) => {
      if (memberFilter !== 'ALL' && m.familyMemberId !== memberFilter) return false;
      if (statusFilter !== 'ALL' && m.stockStatus !== statusFilter) return false;
      if (q) {
        const matchesName = m.name.toLowerCase().includes(q);
        const matchesMember = m.familyMemberName.toLowerCase().includes(q);
        if (!matchesName && !matchesMember) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'remaining') return a.remainingTablets - b.remainingTablets;
      if (sortBy === 'family_member') return a.familyMemberName.localeCompare(b.familyMemberName);
      return a.stockEndDate.localeCompare(b.stockEndDate);
    });

    return list;
  }, [medicines, search, memberFilter, statusFilter, sortBy]);

  const hasFilters = search.trim() !== '' || memberFilter !== 'ALL' || statusFilter !== 'ALL';

  const clearFilters = () => {
    setSearch('');
    setMemberFilter('ALL');
    setStatusFilter('ALL');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-[#182230] dark:text-white">
            Medicine Inventory
          </h1>
          <p className="text-sm text-[#667085] dark:text-slate-400">
            Manage medicines, monitor remaining tablets, and track stock-end dates.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddMedicine}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Medicine</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by medicine or family member..."
            aria-label="Search medicines"
            className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-[#F6F8FB] dark:bg-slate-800 text-sm text-[#182230] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex items-center gap-2.5">
          <select
            aria-label="Filter by family member"
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
            aria-label="Filter by stock status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StockStatus | 'ALL')}
            className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-[#182230] dark:text-white"
          >
            <option value="ALL">All Status</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="RUNNING_LOW">Running Low</option>
            <option value="PURCHASE_DUE">Purchase Due</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </select>

          <select
            aria-label="Sort medicines"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-[#182230] dark:text-white"
          >
            <option value="stock_end">Sort: Stock End Date</option>
            <option value="name">Sort: Name</option>
            <option value="remaining">Sort: Remaining Stock</option>
            <option value="family_member">Sort: Family Member</option>
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-xs font-medium text-[#667085] hover:text-[#182230] dark:text-slate-300 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty States */}
      {medicines.length === 0 ? (
        <EmptyState
          icon={<Pill className="w-7 h-7" />}
          title="You haven't added any medicines yet."
          description="Add your first medicine to start tracking your family's stock."
          action={
            <button
              type="button"
              onClick={onAddMedicine}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Medicine</span>
            </button>
          }
        />
      ) : filteredMedicines.length === 0 ? (
        <EmptyState
          icon={<Search className="w-7 h-7" />}
          title="No medicines match your filters"
          description="Try adjusting your search text, family member, or status filter."
          action={
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-sm font-semibold text-[#182230] dark:text-white"
            >
              Clear Filters
            </button>
          }
        />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E3EAF3] dark:border-slate-800 bg-[#F6F8FB] dark:bg-slate-800/60 text-xs font-semibold text-[#667085] dark:text-slate-400">
                    <th className="py-3.5 px-5">Medicine</th>
                    <th className="py-3.5 px-4">Family Member</th>
                    <th className="py-3.5 px-4 text-right">Daily Usage</th>
                    <th className="py-3.5 px-4 text-right">Remaining</th>
                    <th className="py-3.5 px-4">Stock End Date</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3EAF3] dark:divide-slate-800 text-sm">
                  {filteredMedicines.map((med) => (
                    <tr
                      key={med.id}
                      className="hover:bg-[#F6F8FB]/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5 font-semibold text-[#182230] dark:text-white">
                        <button
                          type="button"
                          onClick={() => onOpenMedicine(med.id)}
                          className="hover:text-[#245DB5] text-left"
                        >
                          {med.name}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-[#667085] dark:text-slate-300">
                        {med.familyMemberName}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-[#182230] dark:text-slate-200">
                        {formatQuantityUnit(med.dailyUsage)} / day
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums font-medium text-[#182230] dark:text-white">
                        {formatQuantityUnit(med.remainingTablets)}
                        <span className="block text-xs font-normal text-[#667085] dark:text-slate-400">
                          {med.remainingDays} {med.remainingDays === 1 ? 'day' : 'days'} left
                        </span>
                      </td>
                      <td className="py-3.5 px-4 tabular-nums text-[#182230] dark:text-slate-200">
                        {formatDisplayDate(med.stockEndDate, dateFormat)}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={med.stockStatus} compact />
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onMarkPurchased(med)}
                            title="Mark as Purchased"
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#E6F4F0] dark:bg-emerald-950/60 text-[#16866B] dark:text-emerald-300 hover:bg-[#d3ece5] text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Purchase</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenMedicine(med.id)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E3EAF3] dark:border-slate-700 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden space-y-3">
            {filteredMedicines.map((med) => (
              <div
                key={med.id}
                className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-display font-bold text-[#182230] dark:text-white truncate">
                      {med.name}
                    </h3>
                    <p className="text-xs text-[#667085] dark:text-slate-400 mt-0.5">
                      {med.familyMemberName} · {formatQuantityUnit(med.dailyUsage)}/day
                    </p>
                  </div>
                  <StatusBadge status={med.stockStatus} compact />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E3EAF3] dark:border-slate-800 text-xs">
                  <div>
                    <p className="text-[#667085] dark:text-slate-400">Remaining</p>
                    <p className="font-semibold text-[#182230] dark:text-white tabular-nums mt-0.5">
                      {formatQuantityUnit(med.remainingTablets)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#667085] dark:text-slate-400">Est. Left</p>
                    <p className="font-semibold text-[#182230] dark:text-white tabular-nums mt-0.5">
                      {med.remainingDays} {med.remainingDays === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#667085] dark:text-slate-400">Stock Ends</p>
                    <p className="font-semibold text-[#182230] dark:text-white tabular-nums mt-0.5">
                      {formatDisplayDate(med.stockEndDate, dateFormat)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onMarkPurchased(med)}
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[#E6F4F0] dark:bg-emerald-950/60 text-[#16866B] dark:text-emerald-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Mark Purchased</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenMedicine(med.id)}
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[#245DB5] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <span>View Details</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
