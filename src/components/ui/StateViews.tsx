import React from 'react';

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse" aria-label="Loading dashboard">
    <div className="h-16 bg-slate-200/70 dark:bg-slate-800 rounded-2xl w-full" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-24 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl p-4"
        >
          <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded mb-3" />
          <div className="h-7 w-12 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 h-72 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl" />
      <div className="h-72 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl" />
    </div>
  </div>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl">
    <div className="w-14 h-14 rounded-2xl bg-[#EAF2FD] dark:bg-slate-800 text-[#245DB5] dark:text-blue-400 flex items-center justify-center mb-4">
      {icon}
    </div>
    <h3 className="text-base font-display font-bold text-[#182230] dark:text-white">{title}</h3>
    <p className="text-sm text-[#667085] dark:text-slate-400 mt-1.5 max-w-md">{description}</p>
    {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center text-center py-10 px-6 bg-white dark:bg-slate-900 border border-[#C53939]/30 rounded-2xl">
    <p className="text-sm font-medium text-[#C53939] dark:text-rose-400 max-w-md">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 px-4 py-2 rounded-xl bg-[#245DB5] text-white text-sm font-medium hover:bg-[#1e4e9a] transition-colors min-h-[40px]"
      >
        Try Again
      </button>
    )}
  </div>
);
