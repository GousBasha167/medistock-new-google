import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import type { FamilyMemberWithStats } from '../../shared/types.ts';
import { Modal } from '../ui/Modal.tsx';

interface DeleteMemberModalProps {
  open: boolean;
  member: FamilyMemberWithStats | null;
  allMembers: FamilyMemberWithStats[];
  onClose: () => void;
  onCompleted: (action: string) => void;
}

export const DeleteMemberModal: React.FC<DeleteMemberModalProps> = ({
  open,
  member,
  allMembers,
  onClose,
  onCompleted,
}) => {
  const otherMembers = allMembers.filter((m) => !m.archived && m.id !== member?.id);
  const [mode, setMode] = useState<'archive' | 'reassign_and_delete' | 'delete_if_empty'>('archive');
  const [reassignTo, setReassignTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !member) return;
    setError(null);
    setReassignTo(otherMembers[0]?.id || '');
    setMode(member.activeMedicineCount === 0 ? 'delete_if_empty' : 'archive');
  }, [open, member, otherMembers.length]);

  if (!member) return null;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.deleteFamilyMember(member.id, {
        mode,
        reassignToMemberId: mode === 'reassign_and_delete' ? reassignTo : undefined,
        archiveMedicines: true,
      });
      onCompleted(res.action);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMode('archive');
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to update family member.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Remove or Archive ${member.name}`}
      subtitle="MediStock protects your medicine and purchase records from accidental loss."
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[#FEF6E6] dark:bg-amber-950/50 border border-[#B7791F]/30 text-sm text-[#9A6315] dark:text-amber-300 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2.5">
          {member.activeMedicineCount === 0 && (
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <input
                type="radio"
                name="delete-mode"
                checked={mode === 'delete_if_empty'}
                onChange={() => setMode('delete_if_empty')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold text-[#182230] dark:text-white">
                  Delete Permanently
                </p>
                <p className="text-xs text-[#667085] dark:text-slate-400">
                  Allowed if this member has no medicines or purchase history.
                </p>
              </div>
            </label>
          )}

          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <input
              type="radio"
              name="delete-mode"
              checked={mode === 'archive'}
              onChange={() => setMode('archive')}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-semibold text-[#182230] dark:text-white">
                Archive Member &amp; Associated Medicines
              </p>
              <p className="text-xs text-[#667085] dark:text-slate-400">
                Hides {member.name} from active lists and stops reminders while preserving purchase
                history.
              </p>
            </div>
          </label>

          {otherMembers.length > 0 && (
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <input
                type="radio"
                name="delete-mode"
                checked={mode === 'reassign_and_delete'}
                onChange={() => setMode('reassign_and_delete')}
                className="mt-1"
              />
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-sm font-semibold text-[#182230] dark:text-white">
                    Reassign Records &amp; Delete Member
                  </p>
                  <p className="text-xs text-[#667085] dark:text-slate-400">
                    Transfer all medicines and purchase history to another family member first.
                  </p>
                </div>
                {mode === 'reassign_and_delete' && (
                  <select
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-[#182230] dark:text-white"
                  >
                    {otherMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.relationship ? ` (${m.relationship})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E3EAF3] dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-sm font-medium text-[#182230] dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C53939] hover:bg-[#a92f2f] disabled:opacity-60 text-white text-sm font-semibold"
          >
            {submitting
              ? 'Processing...'
              : mode === 'archive'
                ? 'Archive Member'
                : mode === 'reassign_and_delete'
                  ? 'Reassign & Delete'
                  : 'Delete Member'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
