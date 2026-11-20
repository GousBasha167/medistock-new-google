import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Calendar, Info, Plus } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { formatDisplayDate } from '../../lib/dateFormat.ts';
import {
  calculateStockSchedule,
  getTodayLocalDateStr,
  isValidCalendarDate,
} from '../../shared/stockEngine.ts';
import type { DateFormatOption, FamilyMemberWithStats, Medicine } from '../../shared/types.ts';
import { Modal } from '../ui/Modal.tsx';

interface AddEditMedicineModalProps {
  open: boolean;
  onClose: () => void;
  familyMembers: FamilyMemberWithStats[];
  dateFormat: DateFormatOption;
  editingMedicine?: Medicine | null;
  defaultFamilyMemberId?: string;
  onSaved: (medicine: Medicine, isNew: boolean) => void;
  onQuickAddMember: () => void;
}

export const AddEditMedicineModal: React.FC<AddEditMedicineModalProps> = ({
  open,
  onClose,
  familyMembers,
  dateFormat,
  editingMedicine,
  defaultFamilyMemberId,
  onSaved,
  onQuickAddMember,
}) => {
  const isEdit = !!editingMedicine;
  const activeMembers = useMemo(
    () => familyMembers.filter((m) => !m.archived),
    [familyMembers]
  );

  const [name, setName] = useState('');
  const [familyMemberId, setFamilyMemberId] = useState('');
  const [quantityStr, setQuantityStr] = useState('30');
  const [dailyUsageStr, setDailyUsageStr] = useState('1');
  const [purchaseDate, setPurchaseDate] = useState(getTodayLocalDateStr());
  const [notes, setNotes] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingMedicine) {
      setName(editingMedicine.name);
      setFamilyMemberId(editingMedicine.familyMemberId);
      setQuantityStr(String(editingMedicine.remainingTablets));
      setDailyUsageStr(String(editingMedicine.dailyUsage));
      setPurchaseDate(editingMedicine.purchaseDate);
      setNotes(editingMedicine.notes || '');
      setRemindersEnabled(editingMedicine.remindersEnabled);
    } else {
      setName('');
      setFamilyMemberId(defaultFamilyMemberId || activeMembers[0]?.id || '');
      setQuantityStr('30');
      setDailyUsageStr('1');
      setPurchaseDate(getTodayLocalDateStr());
      setNotes('');
      setRemindersEnabled(true);
    }
  }, [open, editingMedicine, defaultFamilyMemberId, activeMembers]);

  // Live calculation preview
  const livePreview = useMemo(() => {
    const qty = isEdit ? editingMedicine!.remainingTablets : Number(quantityStr);
    const usage = Number(dailyUsageStr);
    const baseDate = isEdit ? getTodayLocalDateStr() : purchaseDate;

    if (
      !Number.isFinite(qty) ||
      qty <= 0 ||
      (!isEdit && !Number.isInteger(qty)) ||
      !Number.isFinite(usage) ||
      usage <= 0 ||
      !isValidCalendarDate(baseDate)
    ) {
      return null;
    }

    try {
      return calculateStockSchedule({
        quantity: qty,
        dailyUsage: usage,
        baselineDate: baseDate,
      });
    } catch {
      return null;
    }
  }, [isEdit, editingMedicine, quantityStr, dailyUsageStr, purchaseDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Medicine name is required.');
      return;
    }
    if (!familyMemberId) {
      setError('Please select or create a family member first.');
      return;
    }

    const dailyUsage = Number(dailyUsageStr);
    if (!Number.isFinite(dailyUsage) || dailyUsage <= 0) {
      setError('Daily usage must be greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && editingMedicine) {
        const res = await api.updateMedicine(editingMedicine.id, {
          name: trimmedName,
          familyMemberId,
          dailyUsage,
          notes: notes.trim() || null,
          remindersEnabled,
        });
        onSaved(res.medicine, false);
      } else {
        const qty = Number(quantityStr);
        if (!Number.isInteger(qty) || qty <= 0) {
          setError('Quantity purchased must be a positive whole number.');
          setSubmitting(false);
          return;
        }
        if (!isValidCalendarDate(purchaseDate)) {
          setError('Please choose a valid purchase date.');
          setSubmitting(false);
          return;
        }

        const res = await api.createMedicine({
          name: trimmedName,
          familyMemberId,
          quantityPurchased: qty,
          dailyUsage,
          purchaseDate,
          notes: notes.trim() || null,
          remindersEnabled,
        });
        onSaved(res.medicine, true);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save medicine.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Medicine' : 'Add Medicine'}
      subtitle={
        isEdit
          ? 'Update medicine details, daily usage, or reminder preferences.'
          : 'Enter medicine stock details to track remaining tablets automatically.'
      }
      maxWidthClass="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[#FDECEC] dark:bg-rose-950/50 border border-[#C53939]/30 text-sm text-[#C53939] dark:text-rose-300"
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="med-name"
            className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
          >
            Medicine Name <span className="text-[#C53939]">*</span>
          </label>
          <input
            id="med-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Metformin 500mg"
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30 focus:border-[#245DB5]"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="med-member"
              className="block text-sm font-medium text-[#182230] dark:text-slate-200"
            >
              Family Member <span className="text-[#C53939]">*</span>
            </label>
            <button
              type="button"
              onClick={onQuickAddMember}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#245DB5] dark:text-blue-400 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Family Member</span>
            </button>
          </div>
          {activeMembers.length === 0 ? (
            <div className="p-3.5 rounded-xl bg-[#EAF2FD] dark:bg-blue-950/40 border border-[#245DB5]/20 flex items-center justify-between gap-3">
              <span className="text-sm text-[#183153] dark:text-blue-200">
                Add a family member first to assign this medicine.
              </span>
              <button
                type="button"
                onClick={onQuickAddMember}
                className="px-3 py-2 rounded-lg bg-[#245DB5] text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                + Add Member
              </button>
            </div>
          ) : (
            <select
              id="med-member"
              value={familyMemberId}
              onChange={(e) => setFamilyMemberId(e.target.value)}
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30 focus:border-[#245DB5]"
              required
            >
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.relationship ? ` (${m.relationship})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!isEdit && (
            <div>
              <label
                htmlFor="med-qty"
                className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
              >
                Quantity Purchased (tablets) <span className="text-[#C53939]">*</span>
              </label>
              <input
                id="med-qty"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={quantityStr}
                onChange={(e) => setQuantityStr(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30 focus:border-[#245DB5]"
                required
              />
            </div>
          )}

          <div>
            <label
              htmlFor="med-usage"
              className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
            >
              Tablets Used Per Day <span className="text-[#C53939]">*</span>
            </label>
            <input
              id="med-usage"
              type="number"
              inputMode="decimal"
              min={0.25}
              step="any"
              value={dailyUsageStr}
              onChange={(e) => setDailyUsageStr(e.target.value)}
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30 focus:border-[#245DB5]"
              required
            />
          </div>

          {!isEdit && (
            <div className="sm:col-span-2">
              <label
                htmlFor="med-purchase-date"
                className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
              >
                Purchase Date <span className="text-[#C53939]">*</span>
              </label>
              <div className="relative">
                <Calendar
                  className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="med-purchase-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30 focus:border-[#245DB5]"
                  required
                />
              </div>
            </div>
          )}
        </div>

        {/* Live Calculation Preview */}
        {livePreview && (
          <div className="p-4 rounded-xl bg-[#EAF2FD]/70 dark:bg-slate-800/80 border border-[#245DB5]/20 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#245DB5] dark:text-blue-300">
              <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Estimated Stock Schedule Preview</span>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <p className="text-[11px] text-[#667085] dark:text-slate-400">Duration</p>
                <p className="text-sm font-bold text-[#182230] dark:text-white tabular-nums">
                  {livePreview.remainingDays} {livePreview.remainingDays === 1 ? 'day' : 'days'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#667085] dark:text-slate-400">Stock Ends</p>
                <p className="text-sm font-bold text-[#182230] dark:text-white tabular-nums">
                  {formatDisplayDate(livePreview.stockEndDate, dateFormat)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#667085] dark:text-slate-400">First Reminder</p>
                <p className="text-sm font-bold text-[#16866B] dark:text-emerald-400 tabular-nums">
                  {remindersEnabled
                    ? formatDisplayDate(livePreview.firstReminderDate, dateFormat)
                    : 'Disabled'}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-[#667085] dark:text-slate-400">
              Calculated from the consumption schedule you entered; not a medical dosage recommendation.
            </p>
          </div>
        )}

        <div>
          <label
            htmlFor="med-notes"
            className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
          >
            Notes (optional)
          </label>
          <textarea
            id="med-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Take after breakfast, pharmacy brand name"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30 focus:border-[#245DB5]"
          />
        </div>

        {/* Reminders Toggle */}
        <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-[#F6F8FB] dark:bg-slate-800/50">
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 text-[#245DB5] dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[#182230] dark:text-white">
                Refill Reminders
              </p>
              <p className="text-xs text-[#667085] dark:text-slate-400">
                Starts 3 days before stock ends and repeats daily until purchased.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={remindersEnabled}
            onClick={() => setRemindersEnabled((v) => !v)}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              remindersEnabled ? 'bg-[#16866B]' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                remindersEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E3EAF3] dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-sm font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || activeMembers.length === 0}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] disabled:opacity-60 text-white text-sm font-semibold"
          >
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Medicine'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
