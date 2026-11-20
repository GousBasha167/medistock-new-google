import React from 'react';
import { Bell, Check, CheckCheck, ShoppingBag, Smartphone } from 'lucide-react';
import { formatTimestamp } from '../../lib/dateFormat.ts';
import type { AppNotification, DateFormatOption } from '../../shared/types.ts';
import { EmptyState } from '../ui/StateViews.tsx';

interface NotificationsViewProps {
  notifications: AppNotification[];
  dateFormat: DateFormatOption;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenMedicine: (medicineId: string) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  dateFormat,
  onMarkRead,
  onMarkAllRead,
  onOpenMedicine,
}) => {
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-[#182230] dark:text-white">
            Notification Center
          </h1>
          <p className="text-sm text-[#667085] dark:text-slate-400">
            In-app refill alerts, purchase confirmations, and push delivery logs.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-[#245DB5] dark:text-blue-400 inline-flex items-center gap-2 self-start"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark All as Read</span>
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-7 h-7" />}
          title="No notifications yet"
          description="Refill alerts and purchase confirmations will appear here when triggered."
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-[#E3EAF3] dark:divide-slate-800">
          {notifications.map((n) => {
            const isUnread = !n.readAt;
            const isPurchase = n.type === 'purchase_confirmed';
            const Icon = isPurchase ? ShoppingBag : n.type === 'system' ? Smartphone : Bell;

            return (
              <div
                key={n.id}
                className={`p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-colors ${
                  isUnread ? 'bg-[#EAF2FD]/45 dark:bg-blue-950/25' : ''
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isPurchase
                        ? 'bg-[#E6F4F0] text-[#16866B] dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-[#FEF6E6] text-[#B7791F] dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[#182230] dark:text-white">{n.title}</p>
                      {isUnread && (
                        <span className="text-[11px] font-semibold text-[#245DB5] dark:text-blue-400">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#182230] dark:text-slate-200 mt-0.5">{n.body}</p>
                    <p className="text-xs text-[#667085] dark:text-slate-400 mt-1 tabular-nums">
                      {formatTimestamp(n.createdAt, dateFormat)}
                      {n.pushStatus === 'sent'
                        ? ' · Push delivered'
                        : n.pushStatus === 'failed'
                          ? ` · Push failed (${n.pushError || 'device error'})`
                          : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 sm:pl-4">
                  {n.medicineId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isUnread) onMarkRead(n.id);
                        onOpenMedicine(n.medicineId!);
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#245DB5] text-white text-xs font-semibold whitespace-nowrap"
                    >
                      Open Medicine
                    </button>
                  )}
                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => onMarkRead(n.id)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E3EAF3] dark:border-slate-700 text-xs font-medium text-[#667085] dark:text-slate-300 hover:text-[#182230] inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark Read</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
