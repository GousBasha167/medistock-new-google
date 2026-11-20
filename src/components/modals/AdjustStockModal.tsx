import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import type { Medicine } from '../../shared/types.ts';
import { Modal } from '../ui/Modal.tsx';

interface AdjustStockModalProps {
  open: boolean;
  medicine: Medicine | null;
  onClose: () => void;
  onAdjusted: (medicine: Medicine) => void;
}

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  open,
  medicine,
  onClose,
  onAdjusted,
}) => {
  const [newQuantityStr, setNewQuantityStr] = useState('0');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !medicine) return;
    setError(null);
    setNewQuantityStr(String(medicine.remainingTablets));
    setReason('');
  }, [open, medicine]);

  if (!medicine) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = Number(newQuantityStr);
    if (!Number.isFinite(qty) || qty < 0) {
      setError('Stock quantity must be zero or greater.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.adjustStock(medicine.id, {
        newQuantity: qty,
        reason: reason.trim() || null,
      });
      onAdjusted(res.medicine);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to adjust stock.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust Stock"
      subtitle={`${medicine.name} · Current remaining: ${medicine.remainingTablets} tablets`}
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
            htmlFor="adjust-qty"
            className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
          >
            Actual Remaining Tablets <span className="text-[#C53939]">*</span>
          </label>
          <input
            id="adjust-qty"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={newQuantityStr}
            onChange={(e) => setNewQuantityStr(e.target.value)}
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm font-mono-num"
            required
          />
          <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
            Setting this to 0 marks the medicine as Out of Stock.
          </p>
        </div>

        <div>
          <label
            htmlFor="adjust-reason"
            className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
          >
            Reason (optional)
          </label>
          <input
            id="adjust-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Physical recount, missed doses"
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm"
          />
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
            disabled={submitting}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] disabled:opacity-60 text-white text-sm font-semibold"
          >
            {submitting ? 'Updating...' : 'Update Stock'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
