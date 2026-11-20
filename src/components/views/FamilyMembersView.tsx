import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Edit3,
  Pill,
  Plus,
  ShoppingCart,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { formatDisplayDate, formatQuantityUnit } from '../../lib/dateFormat.ts';
import type {
  DateFormatOption,
  FamilyMemberWithStats,
  Medicine,
  PurchaseTransaction,
} from '../../shared/types.ts';
import { EmptyState, ErrorState } from '../ui/StateViews.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';

interface FamilyMembersViewProps {
  members: FamilyMemberWithStats[];
  dateFormat: DateFormatOption;
  selectedMemberId: string | null;
  refreshNonce: number;
  onSelectMember: (id: string | null) => void;
  onAddMember: () => void;
  onEditMember: (member: FamilyMemberWithStats) => void;
  onDeleteMember: (member: FamilyMemberWithStats) => void;
  onAddMedicineForMember: (memberId: string) => void;
  onOpenMedicine: (medicineId: string) => void;
  onMarkPurchased: (medicine: Medicine) => void;
}

export const FamilyMembersView: React.FC<FamilyMembersViewProps> = ({
  members,
  dateFormat,
  selectedMemberId,
  refreshNonce,
  onSelectMember,
  onAddMember,
  onEditMember,
  onDeleteMember,
  onAddMedicineForMember,
  onOpenMedicine,
  onMarkPurchased,
}) => {
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    member: FamilyMemberWithStats;
    medicines: Medicine[];
    upcomingPurchases: Medicine[];
    recentPurchases: PurchaseTransaction[];
  } | null>(null);

  useEffect(() => {
    if (!selectedMemberId) {
      setDetailData(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    api
      .getFamilyMemberDetails(selectedMemberId)
      .then((res) => {
        if (!cancelled) setDetailData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailError(
            err instanceof ApiError ? err.message : 'Could not load family member details.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMemberId, refreshNonce]);

  if (selectedMemberId) {
    if (detailLoading) {
      return (
        <div className="space-y-4 animate-pulse">
          <div className="h-10 w-36 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-44 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl" />
        </div>
      );
    }
    if (detailError || !detailData) {
      return (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => onSelectMember(null)}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#245DB5]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Family Members</span>
          </button>
          <ErrorState message={detailError || 'Member not found.'} />
        </div>
      );
    }

    const { member, medicines, upcomingPurchases, recentPurchases } = detailData;
    const initials = member.name
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onSelectMember(null)}
            className="min-h-[42px] px-3 py-1.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-[#182230] dark:text-slate-200 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Family Members</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onAddMedicineForMember(member.id)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Medicine</span>
            </button>
            <button
              type="button"
              onClick={() => onEditMember(member)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-[#182230] dark:text-slate-200 inline-flex items-center gap-1.5"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => onDeleteMember(member)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-[#C53939] inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Archive / Remove</span>
            </button>
          </div>
        </div>

        {/* Member Summary Card */}
        <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-300 font-display font-bold text-lg flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-[#182230] dark:text-white">
                {member.name}
              </h1>
              <p className="text-sm text-[#667085] dark:text-slate-400">
                {member.relationship || 'Family Member'} · {member.activeMedicineCount} active{' '}
                {member.activeMedicineCount === 1 ? 'medicine' : 'medicines'} ·{' '}
                {member.pendingPurchaseCount} pending{' '}
                {member.pendingPurchaseCount === 1 ? 'purchase' : 'purchases'}
              </p>
            </div>
          </div>
          <StatusBadge status={member.overallStatus} />
        </section>

        {/* Member Medicines & Upcoming Purchases */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
                Medicines ({medicines.length})
              </h2>
            </div>

            {medicines.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#667085] dark:text-slate-400">
                No medicines assigned to {member.name} yet.
              </div>
            ) : (
              <div className="divide-y divide-[#E3EAF3] dark:divide-slate-800">
                {medicines.map((med) => (
                  <div
                    key={med.id}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => onOpenMedicine(med.id)}
                        className="text-sm font-semibold text-[#182230] dark:text-white hover:text-[#245DB5]"
                      >
                        {med.name}
                      </button>
                      <p className="text-xs text-[#667085] dark:text-slate-400 tabular-nums mt-0.5">
                        {formatQuantityUnit(med.remainingTablets)} left ·{' '}
                        {formatQuantityUnit(med.dailyUsage)}/day · Ends{' '}
                        {formatDisplayDate(med.stockEndDate, dateFormat)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={med.stockStatus} compact />
                      <button
                        type="button"
                        onClick={() => onMarkPurchased(med)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#E6F4F0] dark:bg-emerald-950/60 text-[#16866B] dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Purchase</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="lg:col-span-5 space-y-6">
            <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800">
                <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
                  Upcoming Purchases ({upcomingPurchases.length})
                </h2>
              </div>
              {upcomingPurchases.length === 0 ? (
                <p className="p-5 text-sm text-[#667085] dark:text-slate-400">
                  All medicines for {member.name} are comfortably in stock.
                </p>
              ) : (
                <div className="divide-y divide-[#E3EAF3] dark:divide-slate-800">
                  {upcomingPurchases.map((m) => (
                    <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-2 text-sm">
                      <div>
                        <p className="font-semibold text-[#182230] dark:text-white">{m.name}</p>
                        <p className="text-xs text-[#667085] dark:text-slate-400 tabular-nums">
                          Ends {formatDisplayDate(m.stockEndDate, dateFormat)}
                        </p>
                      </div>
                      <StatusBadge status={m.stockStatus} compact />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800">
                <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
                  Recent Purchases
                </h2>
              </div>
              {recentPurchases.length === 0 ? (
                <p className="p-5 text-sm text-[#667085] dark:text-slate-400">
                  No purchase history recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-[#E3EAF3] dark:divide-slate-800">
                  {recentPurchases.slice(0, 6).map((p) => (
                    <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-2 text-sm">
                      <div>
                        <p className="font-semibold text-[#182230] dark:text-white">
                          {p.medicineName}
                        </p>
                        <p className="text-xs text-[#667085] dark:text-slate-400 tabular-nums">
                          {formatDisplayDate(p.purchaseDate, dateFormat)}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-[#16866B] dark:text-emerald-400 tabular-nums">
                        +{formatQuantityUnit(p.quantityPurchased)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-[#182230] dark:text-white">
            Family Members
          </h1>
          <p className="text-sm text-[#667085] dark:text-slate-400">
            Organize medicines and refill requirements for every loved one in your care.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddMember}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Family Member</span>
        </button>
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="w-7 h-7" />}
          title="No family members added yet"
          description="Add yourself, parents, grandparents, or anyone whose medicine stock you want to track."
          action={
            <button
              type="button"
              onClick={onAddMember}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Family Member</span>
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {members.map((m) => {
            const initials = m.name
              .split(/\s+/)
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={m.id}
                className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-300 font-display font-bold text-base flex items-center justify-center shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-display font-bold text-[#182230] dark:text-white truncate">
                        {m.name}
                      </h2>
                      <p className="text-xs text-[#667085] dark:text-slate-400">
                        {m.relationship || 'Family Member'}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={m.overallStatus} compact />
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#F6F8FB] dark:bg-slate-800/60 text-xs">
                  <div>
                    <p className="text-[#667085] dark:text-slate-400">Active Medicines</p>
                    <p className="text-base font-bold text-[#182230] dark:text-white tabular-nums mt-0.5">
                      {m.activeMedicineCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#667085] dark:text-slate-400">Pending Purchases</p>
                    <p className="text-base font-bold text-[#182230] dark:text-white tabular-nums mt-0.5">
                      {m.pendingPurchaseCount}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onSelectMember(m.id)}
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <Pill className="w-3.5 h-3.5" />
                    <span>View Medicines</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditMember(m)}
                    aria-label={`Edit ${m.name}`}
                    className="min-h-[42px] min-w-[42px] rounded-xl border border-[#E3EAF3] dark:border-slate-700 flex items-center justify-center text-[#667085] hover:text-[#182230] dark:text-slate-300"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteMember(m)}
                    aria-label={`Remove or archive ${m.name}`}
                    className="min-h-[42px] min-w-[42px] rounded-xl border border-[#E3EAF3] dark:border-slate-700 flex items-center justify-center text-[#667085] hover:text-[#C53939] dark:text-slate-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
