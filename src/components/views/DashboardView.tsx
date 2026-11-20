import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  CalendarClock,
  ChevronRight,
  Moon,
  Pill,
  Plus,
  ShoppingBag,
  Sun,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  formatDisplayDate,
  formatFullTodayDate,
  formatQuantityUnit,
  getGreetingByTime,
} from '../../lib/dateFormat.ts';
import type {
  DashboardSummary,
  DateFormatOption,
  Medicine,
  StockStatus,
} from '../../shared/types.ts';
import { StatusBadge } from '../ui/StatusBadge.tsx';

export type AppRoute =
  | 'dashboard'
  | 'medicines'
  | 'medicine_detail'
  | 'family'
  | 'calendar'
  | 'purchases'
  | 'reminders'
  | 'notifications'
  | 'settings'
  | 'more';

interface DashboardViewProps {
  userName: string;
  summary: DashboardSummary;
  dateFormat: DateFormatOption;
  onNavigate: (route: AppRoute, options?: { statusFilter?: StockStatus | 'ALL'; memberId?: string }) => void;
  onOpenMedicine: (medicineId: string) => void;
  onAddMedicine: () => void;
  onAddFamilyMember: () => void;
  onMarkPurchased: (medicine: Medicine) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  userName,
  summary,
  dateFormat,
  onNavigate,
  onOpenMedicine,
  onAddMedicine,
  onAddFamilyMember,
  onMarkPurchased,
}) => {
  const greeting = getGreetingByTime();
  const isEvening = new Date().getHours() >= 18;
  const isCompletelyEmpty =
    summary.stats.activeMedicines === 0 && summary.stats.familyMembers === 0;

  return (
    <div className="space-y-6">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#FEF6E6] dark:bg-amber-950/50 text-[#B7791F] dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
            {isEvening ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#182230] dark:text-white">
              {greeting}, {userName}!
            </h1>
            <p className="text-sm text-[#667085] dark:text-slate-400">
              Here&apos;s an overview of your family&apos;s medicine stock · {formatFullTodayDate()}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onAddMedicine}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Medicine</span>
        </button>
      </div>

      {/* 4 Interactive KPI Statistic Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <button
          type="button"
          onClick={() => onNavigate('medicines', { statusFilter: 'ALL' })}
          className="text-left bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-4 hover:border-[#245DB5]/40 transition-colors group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-400 flex items-center justify-center shrink-0">
              <Pill className="w-5 h-5" />
            </div>
            <ChevronRight className="w-4 h-4 text-[#667085] group-hover:text-[#245DB5] transition-colors" />
          </div>
          <p className="mt-3 text-xs font-medium text-[#667085] dark:text-slate-400">
            Active Medicines
          </p>
          <p className="mt-0.5 text-2xl font-display font-bold text-[#182230] dark:text-white tabular-nums">
            {summary.stats.activeMedicines}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('family')}
          className="text-left bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-4 hover:border-[#16866B]/40 transition-colors group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#E6F4F0] dark:bg-emerald-950/60 text-[#16866B] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <ChevronRight className="w-4 h-4 text-[#667085] group-hover:text-[#16866B] transition-colors" />
          </div>
          <p className="mt-3 text-xs font-medium text-[#667085] dark:text-slate-400">
            Family Members
          </p>
          <p className="mt-0.5 text-2xl font-display font-bold text-[#182230] dark:text-white tabular-nums">
            {summary.stats.familyMembers}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('medicines', { statusFilter: 'RUNNING_LOW' })}
          className="text-left bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-4 hover:border-[#B7791F]/40 transition-colors group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#FEF6E6] dark:bg-amber-950/60 text-[#B7791F] dark:text-amber-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <ChevronRight className="w-4 h-4 text-[#667085] group-hover:text-[#B7791F] transition-colors" />
          </div>
          <p className="mt-3 text-xs font-medium text-[#667085] dark:text-slate-400">
            Running Low
          </p>
          <p className="mt-0.5 text-2xl font-display font-bold text-[#182230] dark:text-white tabular-nums">
            {summary.stats.runningLow}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('reminders')}
          className="text-left bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-4 hover:border-[#C53939]/40 transition-colors group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#FDECEC] dark:bg-rose-950/60 text-[#C53939] dark:text-rose-400 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <ChevronRight className="w-4 h-4 text-[#667085] group-hover:text-[#C53939] transition-colors" />
          </div>
          <p className="mt-3 text-xs font-medium text-[#667085] dark:text-slate-400">
            Purchase Due
          </p>
          <p className="mt-0.5 text-2xl font-display font-bold text-[#182230] dark:text-white tabular-nums">
            {summary.stats.purchaseDue}
          </p>
        </button>
      </div>

      {/* Quick Actions Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={onAddMedicine}
          className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 hover:border-[#245DB5]/50 text-sm font-medium text-[#182230] dark:text-slate-100 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4 text-[#245DB5]" />
          <span>Add Medicine</span>
        </button>
        <button
          type="button"
          onClick={onAddFamilyMember}
          className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 hover:border-[#16866B]/50 text-sm font-medium text-[#182230] dark:text-slate-100 flex items-center justify-center gap-2 transition-colors"
        >
          <UserPlus className="w-4 h-4 text-[#16866B]" />
          <span>Add Family Member</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('calendar')}
          className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 hover:border-[#245DB5]/50 text-sm font-medium text-[#182230] dark:text-slate-100 flex items-center justify-center gap-2 transition-colors"
        >
          <Calendar className="w-4 h-4 text-[#245DB5]" />
          <span>View Calendar</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('reminders')}
          className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 hover:border-[#B7791F]/50 text-sm font-medium text-[#182230] dark:text-slate-100 flex items-center justify-center gap-2 transition-colors"
        >
          <Bell className="w-4 h-4 text-[#B7791F]" />
          <span>View Reminders</span>
        </button>
      </div>

      {/* Empty Dashboard Welcome for New Accounts */}
      {isCompletelyEmpty ? (
        <div className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-6 sm:p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-400 flex items-center justify-center mb-4">
            <Pill className="w-7 h-7" />
          </div>
          <h2 className="text-lg sm:text-xl font-display font-bold text-[#182230] dark:text-white">
            Let&apos;s set up your family&apos;s medicine inventory
          </h2>
          <p className="mt-2 text-sm text-[#667085] dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
            Start by adding a family member (like yourself, Amma, Appa, or Grandmother), then add
            their regular medicines. MediStock automatically calculates when each medicine will run
            out and reminds you 3 days ahead.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onAddFamilyMember}
              className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Family Member</span>
            </button>
            <button
              type="button"
              onClick={onAddMedicine}
              className="min-h-[46px] px-5 py-2.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-[#182230] dark:text-white inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Medicine</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Upcoming Purchases + Family Members Overview */}
          <div className="lg:col-span-7 space-y-6">
            <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800">
                <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
                  Upcoming Purchases
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('medicines', { statusFilter: 'ALL' })}
                  className="text-xs font-semibold text-[#245DB5] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {summary.upcomingPurchases.length === 0 ? (
                <div className="p-6 text-center text-sm text-[#667085] dark:text-slate-400">
                  No medicines added yet. Click &ldquo;Add Medicine&rdquo; to begin tracking stock.
                </div>
              ) : (
                <div className="divide-y divide-[#E3EAF3] dark:divide-slate-800">
                  {summary.upcomingPurchases.map((med) => (
                    <div
                      key={med.id}
                      className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F6F8FB]/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenMedicine(med.id)}
                          className="text-sm font-semibold text-[#182230] dark:text-white hover:text-[#245DB5] text-left truncate block"
                        >
                          {med.name}
                        </button>
                        <p className="text-xs text-[#667085] dark:text-slate-400 mt-0.5 tabular-nums">
                          {med.familyMemberName} ·{' '}
                          {med.remainingTablets <= 0
                            ? '0 tablets left'
                            : `${med.daysUntilStockEnd} ${med.daysUntilStockEnd === 1 ? 'day' : 'days'} left (${formatQuantityUnit(med.remainingTablets)})`}{' '}
                          · Ends {formatDisplayDate(med.stockEndDate, dateFormat)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={med.stockStatus} compact />
                        {med.stockStatus !== 'IN_STOCK' && (
                          <button
                            type="button"
                            onClick={() => onMarkPurchased(med)}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#16866B] hover:bg-[#126f58] text-white text-xs font-medium whitespace-nowrap"
                          >
                            Purchased
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenMedicine(med.id)}
                          className="min-h-[34px] px-3 py-1 rounded-lg border border-[#E3EAF3] dark:border-slate-700 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Family Members Overview */}
            <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800">
                <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
                  Family Members Overview
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('family')}
                  className="text-xs font-semibold text-[#245DB5] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Manage</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {summary.familyOverview.length === 0 ? (
                <div className="p-6 text-center text-sm text-[#667085] dark:text-slate-400">
                  No family members added yet.
                </div>
              ) : (
                <div className="divide-y divide-[#E3EAF3] dark:divide-slate-800">
                  {summary.familyOverview.map((member) => {
                    const initials = member.name
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => onNavigate('family', { memberId: member.id })}
                        className="w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F6F8FB]/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-300 font-display font-bold text-sm flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#182230] dark:text-white truncate">
                              {member.name}
                              {member.relationship ? (
                                <span className="font-normal text-[#667085] dark:text-slate-400">
                                  {' '}
                                  · {member.relationship}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-[#667085] dark:text-slate-400 tabular-nums">
                              {member.activeMedicineCount}{' '}
                              {member.activeMedicineCount === 1 ? 'medicine' : 'medicines'} ·{' '}
                              {member.pendingPurchaseCount} pending{' '}
                              {member.pendingPurchaseCount === 1 ? 'purchase' : 'purchases'}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={member.overallStatus} compact />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Recent Purchases */}
          <div className="lg:col-span-5">
            <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800">
                <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
                  Recent Purchases
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('purchases')}
                  className="text-xs font-semibold text-[#245DB5] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {summary.recentPurchases.length === 0 ? (
                <div className="p-8 text-center">
                  <ShoppingBag className="w-8 h-8 text-[#667085]/60 mx-auto mb-2" />
                  <p className="text-sm text-[#667085] dark:text-slate-400">
                    Confirmed medicine purchases will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#E3EAF3] dark:divide-slate-800">
                  {summary.recentPurchases.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOpenMedicine(p.medicineId)}
                      className="w-full text-left px-5 py-3.5 hover:bg-[#F6F8FB]/70 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#182230] dark:text-white truncate">
                          {p.medicineName}
                        </p>
                        <p className="text-xs text-[#667085] dark:text-slate-400 mt-0.5 tabular-nums">
                          {p.familyMemberName} · {formatDisplayDate(p.purchaseDate, dateFormat)}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-[#16866B] dark:text-emerald-400 tabular-nums whitespace-nowrap shrink-0">
                        +{formatQuantityUnit(p.quantityPurchased)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
