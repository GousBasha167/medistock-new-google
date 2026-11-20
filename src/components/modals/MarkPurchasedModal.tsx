import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { formatDisplayDate } from '../../lib/dateFormat.ts';
import {
  calculateRefillResult,
  getTodayLocalDateStr,
  isValidCalendarDate,
} from '../../shared/stockEngine.ts';
import type { DateFormatOption, Medicine } from '../../shared/types.ts';
import { Modal } from '../ui/Modal.tsx';

interface MarkPurchasedModalProps {
  open: boolean;
  medicine: Medicine | null;
  dateFormat: DateFormatOption;
  onClose: () => void;
  onConfirmed: (medicine: Medicine, resultingStock: number) => void;
}

export const MarkPurchasedModal: React.FC<MarkPurchasedModalProps> = ({
  open,
  medicine,
  dateFormat,
  onClose,
  onConfirmed,
}) => {
  const [purchaseDate, setPurchaseDate] = useState(getTodayLocalDateStr());
  const [quantityStr, setQuantityStr] = useState('30');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !medicine) return;
    setError(null);
    setPurchaseDate(getTodayLocalDateStr());
    setQuantityStr(String(Math.max(1, Math.round(medicine.initialQuantity))));
    setNotes('');
  }, [open, medicine]);

  const refillPreview = useMemo(() => {
    if (!medicine) return null;
    const qty = Number(quantityStr);
    if (!Number.isInteger(qty) || qty <= 0 || !isValidCalendarDate(purchaseDate)) {
      return null;
    }
    try {
      return calculateRefillResult({
        currentBaselineQuantity: medicine.baselineQuantity,
        currentBaselineDate: medicine.baselineDate,
        dailyUsage: medicine.dailyUsage,
        actualPurchaseDate: purchaseDate,
        quantityPurchased: qty,
      });
    } catch {
      return null;
    }
  }, [medicine, quantityStr, purchaseDate]);

  if (!medicine) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = Number(quantityStr);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Purchased quantity must be a positive whole number.');
      return;
    }
    if (!isValidCalendarDate(purchaseDate)) {
      setError('Please enter a valid purchase date.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.markPurchased(medicine.id, {
        purchaseDate,
        quantityPurchased: qty,
        notes: notes.trim() || null,
      });
      onConfirmed(res.medicine, res.resultingStock);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record purchase.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as Purchased"
      subtitle={`${medicine.name} · ${medicine.familyMemberName}`}
      maxWidthClass="max-w-md"
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
            htmlFor="purchase-date"
            className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
          >
            Actual Purchase Date <span className="text-[#C53939]">*</span>
          </label>
          <div className="relative">
            <Calendar
              className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm"
              required
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="purchase-qty"
            className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
          >
            Quantity Purchased (tablets) <span className="text-[#C53939]">*</span>
          </label>
          <input
            id="purchase-qty"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantityStr}
            onChange={(e) => setQuantityStr(e.target.value)}
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm font-mono-num"
            required
          />
        </div>

        <div>
          <label
            htmlFor="purchase-notes"
            className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
          >
            Notes (optional)
          </label>
          <input
            id="purchase-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Bought 3 strips from Apollo Pharmacy"
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm"
          />
        </div>

        {refillPreview && (
          <div className="p-3.5 rounded-xl bg-[#E6F4F0]/70 dark:bg-emerald-950/40 border border-[#16866B]/25 text-xs space-y-1.5">
            <p className="font-semibold text-[#16866B] dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Early refill stock preservation</span>
            </p>
            <p className="text-[#182230] dark:text-slate-200 tabular-nums">
              Remaining ({refillPreview.previousRemaining}) + New ({quantityStr}) ={' '}
              <strong>{refillPreview.resultingStock} tablets</strong>
            </p>
            <p className="text-[#667085] dark:text-slate-400 tabular-nums">
              New estimated stock end:{' '}
              <strong>{formatDisplayDate(refillPreview.schedule.stockEndDate, dateFormat)}</strong> (
              {refillPreview.schedule.remainingDays} days)
            </p>
          </div>
        )}

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
            disabled={submitting}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#16866B] hover:bg-[#126f58] disabled:opacity-60 text-white text-sm font-semibold"
          >
            {submitting ? 'Confirming...' : 'Confirm Purchase'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
