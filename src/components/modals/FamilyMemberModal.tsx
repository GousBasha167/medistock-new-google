import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import type { FamilyMemberWithStats } from '../../shared/types.ts';
import { Modal } from '../ui/Modal.tsx';

interface FamilyMemberModalProps {
  open: boolean;
  member?: FamilyMemberWithStats | null;
  onClose: () => void;
  onSaved: (member: FamilyMemberWithStats, isNew: boolean) => void;
}

const RELATIONSHIP_SUGGESTIONS = ['Self', 'Mother', 'Father', 'Grandmother', 'Grandfather', 'Spouse', 'Child'];

export const FamilyMemberModal: React.FC<FamilyMemberModalProps> = ({
  open,
  member,
  onClose,
  onSaved,
}) => {
  const isEdit = !!member;
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(member?.name || '');
    setRelationship(member?.relationship || '');
  }, [open, member]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Family member name is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && member) {
        const res = await api.updateFamilyMember(member.id, {
          name: trimmed,
          relationship: relationship.trim() || null,
        });
        onSaved(res.familyMember, false);
      } else {
        const res = await api.createFamilyMember({
          name: trimmed,
          relationship: relationship.trim() || null,
        });
        onSaved(res.familyMember, true);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save family member.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Family Member' : 'Add Family Member'}
      subtitle="Group medicines cleanly by who takes them."
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
            htmlFor="fm-name"
            className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
          >
            Name <span className="text-[#C53939]">*</span>
          </label>
          <input
            id="fm-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Amma, Appa, Grandmother, Self"
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm"
            required
          />
        </div>

        <div>
          <label
            htmlFor="fm-rel"
            className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1.5"
          >
            Relationship (optional)
          </label>
          <input
            id="fm-rel"
            type="text"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="e.g., Mother, Grandfather"
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#182230] dark:text-white text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RELATIONSHIP_SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRelationship(item)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  relationship === item
                    ? 'bg-[#EAF2FD] border-[#245DB5] text-[#245DB5] dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border-[#E3EAF3] dark:border-slate-700 text-[#667085] dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
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
            type="submit"
            disabled={submitting}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] disabled:opacity-60 text-white text-sm font-semibold"
          >
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Member'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
