import React from 'react';
import {
  Bell,
  ChevronRight,
  History,
  LogOut,
  Settings,
  Users,
} from 'lucide-react';
import type { AppRoute } from './DashboardView.tsx';
import { PWAInstallButton } from '../ui/PWAControls.tsx';

interface MoreMenuViewProps {
  userName: string;
  unreadNotifications: number;
  onNavigate: (route: AppRoute) => void;
  onLogout: () => void;
}

export const MoreMenuView: React.FC<MoreMenuViewProps> = ({
  userName,
  unreadNotifications,
  onNavigate,
  onLogout,
}) => {
  const items: Array<{
    route: AppRoute;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    {
      route: 'family',
      label: 'Family Members',
      subtitle: 'Manage family profiles and assignments',
      icon: Users,
    },
    {
      route: 'purchases',
      label: 'Purchase History',
      subtitle: 'View confirmed purchase ledger',
      icon: History,
    },
    {
      route: 'notifications',
      label: 'Notification Center',
      subtitle: 'Unread refill alerts and confirmations',
      icon: Bell,
      badge: unreadNotifications,
    },
    {
      route: 'settings',
      label: 'Settings',
      subtitle: 'Account, push alerts, theme, and privacy',
      icon: Settings,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-display font-bold text-[#182230] dark:text-white">More</h1>
        <p className="text-sm text-[#667085] dark:text-slate-400">Signed in as {userName}</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-[#E3EAF3] dark:divide-slate-800">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => onNavigate(item.route)}
              className="w-full min-h-[64px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#F6F8FB] dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#182230] dark:text-white">{item.label}</p>
                  <p className="text-xs text-[#667085] dark:text-slate-400">{item.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#C53939] text-white text-xs font-bold tabular-nums">
                    {item.badge}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-[#667085]" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <PWAInstallButton />
        <button
          type="button"
          onClick={onLogout}
          className="w-full min-h-[48px] px-4 py-3 rounded-2xl border border-[#E3EAF3] dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-[#C53939] inline-flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
};
