import React, { useEffect, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Bell,
  BellOff,
  Edit3,
  History,
  Pill,
  ShoppingCart,
  SlidersHorizontal,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import {
  formatDisplayDate,
  formatQuantityUnit,
  formatTimestamp,
} from '../../lib/dateFormat.ts';
import type {
  DateFormatOption,
  Medicine,
  PurchaseTransaction,
  ReminderCycle,
  StockAdjustment,
} from '../../shared/types.ts';
import { ErrorState } from '../ui/StateViews.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';

interface MedicineDetailViewProps {
  medicineId: string;
  dateFormat: DateFormatOption;
  refreshNonce: number;
  onBack: () => void;
  onEdit: (medicine: Medicine) => void;
  onMarkPurchased: (medicine: Medicine) => void;
  onAdjustStock: (medicine: Medicine) => void;
  onArchivedChanged: (archived: boolean) => void;
}

export const MedicineDetailView: React.FC<MedicineDetailViewProps> = ({
  medicineId,
  dateFormat,
  refreshNonce,
  onBack,
  onEdit,
  onMarkPurchased,
  onAdjustStock,
  onArchivedChanged,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [purchases, setPurchases] = useState<PurchaseTransaction[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [reminderCycles, setReminderCycles] = useState<ReminderCycle[]>([]);
  const [archiving, setArchiving] = useState(false);

  const loadDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMedicineDetails(medicineId);
      setMedicine(data.medicine);
      setPurchases(data.purchases);
      setAdjustments(data.adjustments);
      setReminderCycles(data.reminderCycles);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load medicine details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [medicineId, refreshNonce]);

  const handleToggleArchive = async () => {
    if (!medicine) return;
    setArchiving(true);
    try {
      const nextArchived = !medicine.archived;
      await api.updateMedicine(medicine.id, { archived: nextArchived });
      onArchivedChanged(nextArchived);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update archive status.');
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-40 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        <div className="h-48 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl" />
        <div className="h-48 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl" />
      </div>
    );
  }

  if (error || !medicine) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#245DB5] hover:underline min-h-[40px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Medicines</span>
        </button>
        <ErrorState message={error || 'Medicine not found.'} onRetry={loadDetails} />
      </div>
    );
  }

  const activePendingCycle = reminderCycles.find((rc) => rc.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[42px] px-3 py-1.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-[#182230] dark:text-slate-200 inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(medicine)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-[#182230] dark:text-slate-200 inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Edit3 className="w-4 h-4" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={handleToggleArchive}
            disabled={archiving}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-[#667085] dark:text-slate-300 inline-flex items-center gap-1.5 hover:text-[#C53939]"
          >
            <Archive className="w-4 h-4" />
            <span>{medicine.archived ? 'Restore Medicine' : 'Archive'}</span>
          </button>
        </div>
      </div>

      {/* Primary Overview Card */}
      <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-400 flex items-center justify-center shrink-0">
              <Pill className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold text-[#182230] dark:text-white">
                {medicine.name}
              </h1>
              <p className="text-sm text-[#667085] dark:text-slate-400">
                {medicine.familyMemberName}
                {medicine.familyMemberRelationship
                  ? ` (${medicine.familyMemberRelationship})`
                  : ''}{' '}
                · Latest purchase {formatDisplayDate(medicine.purchaseDate, dateFormat)}
              </p>
            </div>
          </div>
          <StatusBadge status={medicine.stockStatus} />
        </div>

        {/* 3 Core Stock Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl bg-[#F6F8FB] dark:bg-slate-800/60 border border-[#E3EAF3] dark:border-slate-800">
            <p className="text-xs text-[#667085] dark:text-slate-400">Remaining Tablets</p>
            <p className="mt-1 text-2xl font-display font-bold text-[#182230] dark:text-white tabular-nums">
              {medicine.remainingTablets}
            </p>
            <p className="text-xs text-[#667085] dark:text-slate-400 mt-0.5 tabular-nums">
              Est. {medicine.remainingDays} {medicine.remainingDays === 1 ? 'day' : 'days'} left
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#F6F8FB] dark:bg-slate-800/60 border border-[#E3EAF3] dark:border-slate-800">
            <p className="text-xs text-[#667085] dark:text-slate-400">Estimated Stock Ends</p>
            <p className="mt-1 text-xl font-display font-bold text-[#182230] dark:text-white tabular-nums">
              {formatDisplayDate(medicine.stockEndDate, dateFormat)}
            </p>
            <p className="text-xs text-[#667085] dark:text-slate-400 mt-0.5 tabular-nums">
              Inclusive last-use calendar date
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#F6F8FB] dark:bg-slate-800/60 border border-[#E3EAF3] dark:border-slate-800">
            <p className="text-xs text-[#667085] dark:text-slate-400">Daily Usage</p>
            <p className="mt-1 text-2xl font-display font-bold text-[#182230] dark:text-white tabular-nums">
              {medicine.dailyUsage} / day
            </p>
            <p className="text-xs text-[#667085] dark:text-slate-400 mt-0.5 tabular-nums">
              Baseline {formatQuantityUnit(medicine.baselineQuantity)}
            </p>
          </div>
        </div>

        {/* Stock Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-[#667085] dark:text-slate-400">
              Current Stock Level
            </span>
            <span className="font-semibold text-[#182230] dark:text-white tabular-nums">
              {medicine.progressPercent}% remaining
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-[#E3EAF3] dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                medicine.stockStatus === 'IN_STOCK'
                  ? 'bg-[#16866B]'
                  : medicine.stockStatus === 'RUNNING_LOW'
                    ? 'bg-[#B7791F]'
                    : 'bg-[#C53939]'
              }`}
              style={{ width: `${medicine.progressPercent}%` }}
            />
          </div>
          {medicine.notes && (
            <p className="mt-3 text-xs text-[#667085] dark:text-slate-300 bg-[#F6F8FB] dark:bg-slate-800/50 rounded-xl px-3.5 py-2.5">
              <strong>Notes:</strong> {medicine.notes}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#E3EAF3] dark:border-slate-800">
          <button
            type="button"
            onClick={() => onMarkPurchased(medicine)}
            className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[#16866B] hover:bg-[#126f58] text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Mark as Purchased</span>
          </button>
          <button
            type="button"
            onClick={() => onAdjustStock(medicine)}
            className="min-h-[46px] px-4 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-[#182230] dark:text-white inline-flex items-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Adjust Stock</span>
          </button>
        </div>
      </section>

      {/* Reminder Schedule & Purchase History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            {medicine.remindersEnabled ? (
              <Bell className="w-5 h-5 text-[#245DB5]" />
            ) : (
              <BellOff className="w-5 h-5 text-[#667085]" />
            )}
            <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
              Reminder Information
            </h2>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-[#E3EAF3] dark:border-slate-800">
              <span className="text-[#667085] dark:text-slate-400">Reminders</span>
              <span className="font-semibold text-[#182230] dark:text-white">
                {medicine.remindersEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#E3EAF3] dark:border-slate-800">
              <span className="text-[#667085] dark:text-slate-400">Next Scheduled Reminder</span>
              <span className="font-semibold text-[#182230] dark:text-white tabular-nums">
                {medicine.remindersEnabled
                  ? formatDisplayDate(medicine.firstReminderDate, dateFormat)
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-[#667085] dark:text-slate-400">Reminder Status</span>
              <span className="font-semibold text-[#182230] dark:text-white">
                {!medicine.remindersEnabled
                  ? 'Paused'
                  : activePendingCycle
                    ? 'Active — Purchase Needed'
                    : 'Scheduled (3 days before end)'}
              </span>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800 flex items-center gap-2">
            <History className="w-5 h-5 text-[#16866B]" />
            <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
              Purchase History &amp; Stock Ledger
            </h2>
          </div>

          <div className="divide-y divide-[#E3EAF3] dark:divide-slate-800">
            {purchases.map((p) => (
              <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold text-[#182230] dark:text-white tabular-nums">
                    {formatDisplayDate(p.purchaseDate, dateFormat)} · +{formatQuantityUnit(p.quantityPurchased)}
                  </p>
                  <p className="text-xs text-[#667085] dark:text-slate-400 tabular-nums mt-0.5">
                    Prev: {p.previousRemaining} → Total: {p.resultingStock} tablets
                    {p.notes ? ` · ${p.notes}` : ''}
                  </p>
                </div>
                <span className="text-xs font-medium text-[#16866B] dark:text-emerald-400 whitespace-nowrap">
                  Purchased
                </span>
              </div>
            ))}

            {adjustments.map((adj) => (
              <div key={adj.id} className="px-5 py-3.5 flex items-center justify-between gap-3 text-sm bg-[#F6F8FB]/50 dark:bg-slate-800/20">
                <div>
                  <p className="font-medium text-[#182230] dark:text-white tabular-nums">
                    Stock Adjusted ({adj.delta >= 0 ? `+${adj.delta}` : adj.delta} tablets)
                  </p>
                  <p className="text-xs text-[#667085] dark:text-slate-400 tabular-nums mt-0.5">
                    {formatTimestamp(adj.createdAt, dateFormat)} · {adj.previousQuantity} →{' '}
                    {adj.newQuantity}
                    {adj.reason ? ` · ${adj.reason}` : ''}
                  </p>
                </div>
                <span className="text-xs text-[#667085] dark:text-slate-400 whitespace-nowrap">
                  Adjustment
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
