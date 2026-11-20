import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Calendar,
  History,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pill,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import { api, ApiError, setUnauthorizedHandler } from './lib/api.ts';
import { usePushNotifications } from './lib/usePushNotifications.ts';
import type {
  AppNotification,
  CalendarEvent,
  DashboardSummary,
  FamilyMemberWithStats,
  Medicine,
  PurchaseTransaction,
  ReminderCycle,
  StockStatus,
  UserProfile,
} from './shared/types.ts';
import { MediStockLogo } from './components/BrandMark.tsx';
import { OnboardingModal } from './components/auth/OnboardingModal.tsx';
import { WelcomeAuthScreen } from './components/auth/WelcomeAuthScreen.tsx';
import { AddEditMedicineModal } from './components/modals/AddEditMedicineModal.tsx';
import { AdjustStockModal } from './components/modals/AdjustStockModal.tsx';
import { DeleteMemberModal } from './components/modals/DeleteMemberModal.tsx';
import { FamilyMemberModal } from './components/modals/FamilyMemberModal.tsx';
import { LegalModal, type LegalDocType } from './components/modals/LegalModal.tsx';
import { MarkPurchasedModal } from './components/modals/MarkPurchasedModal.tsx';
import { NotificationPermissionModal } from './components/modals/NotificationPermissionModal.tsx';
import { OfflineIndicator, PWAInstallButton } from './components/ui/PWAControls.tsx';
import { DashboardSkeleton, ErrorState } from './components/ui/StateViews.tsx';
import { ToastContainer, type ToastMessage } from './components/ui/Toast.tsx';
import { CalendarView } from './components/views/CalendarView.tsx';
import { DashboardView, type AppRoute } from './components/views/DashboardView.tsx';
import { FamilyMembersView } from './components/views/FamilyMembersView.tsx';
import { MedicineDetailView } from './components/views/MedicineDetailView.tsx';
import { MedicinesView } from './components/views/MedicinesView.tsx';
import { MoreMenuView } from './components/views/MoreMenuView.tsx';
import { NotificationsView } from './components/views/NotificationsView.tsx';
import { PurchaseHistoryView } from './components/views/PurchaseHistoryView.tsx';
import { RemindersView } from './components/views/RemindersView.tsx';
import { SettingsView } from './components/views/SettingsView.tsx';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [route, setRoute] = useState<AppRoute>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [medicineStatusFilter, setMedicineStatusFilter] = useState<StockStatus | 'ALL'>('ALL');
  const [globalSearch, setGlobalSearch] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // App data state
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberWithStats[]>([]);
  const [purchases, setPurchases] = useState<PurchaseTransaction[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [reminders, setReminders] = useState<{
    pending: ReminderCycle[];
    history: ReminderCycle[];
  }>({ pending: [], history: [] });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Modals
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [defaultMedMemberId, setDefaultMedMemberId] = useState<string | undefined>(undefined);
  const [purchaseModalMed, setPurchaseModalMed] = useState<Medicine | null>(null);
  const [adjustModalMed, setAdjustModalMed] = useState<Medicine | null>(null);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMemberWithStats | null>(null);
  const [deletingMember, setDeletingMember] = useState<FamilyMemberWithStats | null>(null);
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const pushState = usePushNotifications(!!user);

  const addToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Theme class sync
  useEffect(() => {
    const isDark = user?.themePreference === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  }, [user?.themePreference]);

  // Handle session expiration cleanly
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      addToast('error', 'Your session expired. Please log in again.');
    });
    return () => setUnauthorizedHandler(null);
  }, [addToast]);

  // Check URL deep link (?view=reminders from push notification)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view === 'reminders') setRoute('reminders');
    else if (view === 'calendar') setRoute('calendar');
    else if (view === 'medicines') setRoute('medicines');
    else if (view === 'notifications') setRoute('notifications');
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Restore session on startup
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((res) => {
        if (!cancelled) {
          setUser(res.user);
          if (!res.user.onboardingCompleted) {
            setShowOnboarding(true);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadAllData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const [dashRes, medsRes, membersRes, purchasesRes, calRes, remRes, notifRes] =
        await Promise.all([
          api.getDashboard(),
          api.getMedicines(false),
          api.getFamilyMembers(false),
          api.getPurchases(),
          api.getCalendarEvents(),
          api.getReminders(),
          api.getNotifications(),
        ]);

      setDashboard(dashRes);
      setMedicines(medsRes.medicines);
      setFamilyMembers(membersRes.familyMembers);
      setPurchases(purchasesRes.purchases);
      setCalendarEvents(calRes.events);
      setReminders(remRes);
      setNotifications(notifRes.notifications);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      setDataError(
        err instanceof ApiError
          ? err.message
          : 'We couldn’t connect to MediStock. Check your internet connection and try again.'
      );
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user, loadAllData]);

  const handleAuthenticated = (loggedUser: UserProfile, isNewSignup: boolean) => {
    setUser(loggedUser);
    setRoute('dashboard');
    if (isNewSignup || !loggedUser.onboardingCompleted) {
      setShowOnboarding(true);
    }
  };

  const handleOnboardingComplete = async (openAddMember = false) => {
    setShowOnboarding(false);
    try {
      const res = await api.updatePreferences({ onboardingCompleted: true });
      setUser(res.user);
    } catch {
      // Ignore non-blocking preference flag failure
    }
    if (openAddMember) {
      setEditingMember(null);
      setMemberModalOpen(true);
    }
  };

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    await api.logout();
    setUser(null);
    setDashboard(null);
    setMedicines([]);
    setFamilyMembers([]);
    setPurchases([]);
    setCalendarEvents([]);
    setReminders({ pending: [], history: [] });
    setNotifications([]);
    document.documentElement.classList.remove('dark');
  };

  const navigate = (
    nextRoute: AppRoute,
    options?: { statusFilter?: StockStatus | 'ALL'; memberId?: string }
  ) => {
    setRoute(nextRoute);
    if (options?.statusFilter !== undefined) {
      setMedicineStatusFilter(options.statusFilter);
    } else if (nextRoute === 'medicines') {
      setMedicineStatusFilter('ALL');
    }
    if (nextRoute === 'family') {
      setSelectedMemberId(options?.memberId ?? null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openMedicineDetail = (id: string) => {
    setSelectedMedicineId(id);
    setRoute('medicine_detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRoute('medicines');
  };

  // Splash Screen while verifying session
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <MediStockLogo size="lg" showTagline />
        <div className="mt-6 w-8 h-8 rounded-full border-3 border-[#245DB5]/25 border-t-[#245DB5] animate-spin" />
      </div>
    );
  }

  // Unauthenticated Welcome / Sign Up / Login
  if (!user) {
    return (
      <>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <WelcomeAuthScreen onAuthenticated={handleAuthenticated} />
      </>
    );
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const pendingReminderCount = reminders.pending.length;
  const userInitials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sidebarItems: Array<{
    route: AppRoute;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { route: 'dashboard', label: 'Dashboard', icon: Home },
    { route: 'medicines', label: 'Medicines', icon: Pill },
    { route: 'family', label: 'Family Members', icon: Users },
    { route: 'calendar', label: 'Purchase Calendar', icon: Calendar },
    { route: 'purchases', label: 'Purchase History', icon: History },
    {
      route: 'reminders',
      label: 'Reminders',
      icon: Bell,
      badge: pendingReminderCount,
    },
    {
      route: 'notifications',
      label: 'Notifications',
      icon: LayoutGrid,
      badge: unreadCount,
    },
    { route: 'settings', label: 'Settings', icon: Settings },
  ];

  const isNavActive = (itemRoute: AppRoute) => {
    if (route === 'medicine_detail' && itemRoute === 'medicines') return true;
    return route === itemRoute;
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] dark:bg-slate-950 flex flex-col md:flex-row">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <OfflineIndicator />

      {/* Desktop & Tablet Sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-white dark:bg-slate-900 border-r border-[#E3EAF3] dark:border-slate-800 sticky top-0 h-screen transition-all ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#E3EAF3] dark:border-slate-800">
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => navigate('dashboard')}
              aria-label="MediStock Home"
              className="mx-auto"
            >
              <svg className="w-8 h-8" viewBox="0 0 64 64" fill="none">
                <g transform="translate(32 32) rotate(-45) translate(-32 -32)">
                  <path
                    d="M20 18C20 11.3726 25.3726 6 32 6C38.6274 6 44 11.3726 44 18V32H20V18Z"
                    fill="#245DB5"
                  />
                  <path
                    d="M20 32H44V46C44 52.6274 38.6274 58 32 58C25.3726 58 20 52.6274 20 46V32Z"
                    fill="#16866B"
                  />
                </g>
              </svg>
            </button>
          ) : (
            <button type="button" onClick={() => navigate('dashboard')} className="text-left">
              <MediStockLogo size="sm" />
            </button>
          )}
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
              className="p-1.5 rounded-lg text-[#667085] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            className="mx-auto mt-3 p-2 rounded-lg text-[#667085] hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.route);
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => navigate(item.route)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-300 font-semibold'
                    : 'text-[#667085] dark:text-slate-400 hover:bg-[#F6F8FB] dark:hover:bg-slate-800/60 hover:text-[#182230] dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!sidebarCollapsed && item.badge !== undefined && item.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#C53939] text-white text-[11px] font-bold tabular-nums">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E3EAF3] dark:border-slate-800">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[44px] px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[#667085] dark:text-slate-400 hover:text-[#C53939] hover:bg-[#FDECEC]/50 dark:hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
        {/* Mobile Top Bar (compact <= 56px) */}
        <header className="md:hidden sticky top-0 z-30 h-14 px-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-[#E3EAF3] dark:border-slate-800 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('dashboard')} className="text-left">
            <MediStockLogo size="sm" />
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditingMedicine(null);
                setDefaultMedMemberId(undefined);
                setMedModalOpen(true);
              }}
              aria-label="Add Medicine"
              className="min-h-[40px] px-3 rounded-xl bg-[#245DB5] text-white text-xs font-semibold inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('notifications')}
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative min-w-[42px] min-h-[42px] rounded-xl flex items-center justify-center text-[#182230] dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#C53939] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Desktop Top Bar */}
        <header className="hidden md:flex h-16 px-6 bg-white dark:bg-slate-900 border-b border-[#E3EAF3] dark:border-slate-800 items-center justify-between gap-6 sticky top-0 z-30">
          <form onSubmit={handleGlobalSearchSubmit} className="relative flex-1 max-w-md">
            <Search
              className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search medicines..."
              aria-label="Search medicines"
              className="w-full min-h-[40px] pl-10 pr-4 py-1.5 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-[#F6F8FB] dark:bg-slate-800 text-sm text-[#182230] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#245DB5]/30"
            />
          </form>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton compact />

            <button
              type="button"
              onClick={() => navigate('notifications')}
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative min-w-[42px] min-h-[42px] rounded-xl border border-[#E3EAF3] dark:border-slate-700 flex items-center justify-center text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C53939] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((o) => !o)}
                className="min-h-[42px] pl-1.5 pr-3 py-1 rounded-xl border border-[#E3EAF3] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
              >
                <span className="w-8 h-8 rounded-full bg-[#245DB5] text-white text-xs font-bold flex items-center justify-center">
                  {userInitials}
                </span>
                <span className="text-sm font-semibold text-[#182230] dark:text-white whitespace-nowrap">
                  {user.name}
                </span>
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl shadow-lg py-1.5 z-40">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigate('settings');
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#182230] dark:text-slate-200 hover:bg-[#F6F8FB] dark:hover:bg-slate-800 flex items-center gap-2.5"
                  >
                    <Settings className="w-4 h-4 text-[#667085]" />
                    <span>Settings</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#C53939] hover:bg-[#FDECEC]/50 dark:hover:bg-rose-950/30 flex items-center gap-2.5"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {dataLoading && !dashboard ? (
            <DashboardSkeleton />
          ) : dataError && !dashboard ? (
            <ErrorState message={dataError} onRetry={loadAllData} />
          ) : (
            <>
              {route === 'dashboard' && dashboard && (
                <DashboardView
                  userName={user.name}
                  summary={dashboard}
                  dateFormat={user.dateFormat}
                  onNavigate={navigate}
                  onOpenMedicine={openMedicineDetail}
                  onAddMedicine={() => {
                    setEditingMedicine(null);
                    setDefaultMedMemberId(undefined);
                    setMedModalOpen(true);
                  }}
                  onAddFamilyMember={() => {
                    setEditingMember(null);
                    setMemberModalOpen(true);
                  }}
                  onMarkPurchased={(med) => setPurchaseModalMed(med)}
                />
              )}

              {route === 'medicines' && (
                <MedicinesView
                  key={`${medicineStatusFilter}-${globalSearch}`}
                  medicines={medicines}
                  familyMembers={familyMembers}
                  dateFormat={user.dateFormat}
                  initialSearch={globalSearch}
                  initialStatusFilter={medicineStatusFilter}
                  onAddMedicine={() => {
                    setEditingMedicine(null);
                    setDefaultMedMemberId(undefined);
                    setMedModalOpen(true);
                  }}
                  onOpenMedicine={openMedicineDetail}
                  onMarkPurchased={(med) => setPurchaseModalMed(med)}
                />
              )}

              {route === 'medicine_detail' && selectedMedicineId && (
                <MedicineDetailView
                  medicineId={selectedMedicineId}
                  dateFormat={user.dateFormat}
                  refreshNonce={refreshNonce}
                  onBack={() => navigate('medicines')}
                  onEdit={(med) => {
                    setEditingMedicine(med);
                    setMedModalOpen(true);
                  }}
                  onMarkPurchased={(med) => setPurchaseModalMed(med)}
                  onAdjustStock={(med) => setAdjustModalMed(med)}
                  onArchivedChanged={async (archived) => {
                    addToast(
                      'success',
                      archived ? 'Medicine archived.' : 'Medicine restored to inventory.'
                    );
                    await loadAllData();
                    if (archived) navigate('medicines');
                  }}
                />
              )}

              {route === 'family' && (
                <FamilyMembersView
                  members={familyMembers}
                  dateFormat={user.dateFormat}
                  selectedMemberId={selectedMemberId}
                  refreshNonce={refreshNonce}
                  onSelectMember={(id) => setSelectedMemberId(id)}
                  onAddMember={() => {
                    setEditingMember(null);
                    setMemberModalOpen(true);
                  }}
                  onEditMember={(member) => {
                    setEditingMember(member);
                    setMemberModalOpen(true);
                  }}
                  onDeleteMember={(member) => setDeletingMember(member)}
                  onAddMedicineForMember={(memberId) => {
                    setEditingMedicine(null);
                    setDefaultMedMemberId(memberId);
                    setMedModalOpen(true);
                  }}
                  onOpenMedicine={openMedicineDetail}
                  onMarkPurchased={(med) => setPurchaseModalMed(med)}
                />
              )}

              {route === 'calendar' && (
                <CalendarView
                  events={calendarEvents}
                  familyMembers={familyMembers}
                  dateFormat={user.dateFormat}
                  onOpenMedicine={openMedicineDetail}
                />
              )}

              {route === 'purchases' && (
                <PurchaseHistoryView
                  purchases={purchases}
                  familyMembers={familyMembers}
                  dateFormat={user.dateFormat}
                  onOpenMedicine={openMedicineDetail}
                />
              )}

              {route === 'reminders' && (
                <RemindersView
                  pending={reminders.pending}
                  history={reminders.history}
                  medicines={medicines}
                  dateFormat={user.dateFormat}
                  onOpenMedicine={openMedicineDetail}
                  onMarkPurchased={(med) => setPurchaseModalMed(med)}
                />
              )}

              {route === 'notifications' && (
                <NotificationsView
                  notifications={notifications}
                  dateFormat={user.dateFormat}
                  onMarkRead={async (id) => {
                    await api.markNotificationRead(id);
                    await loadAllData();
                  }}
                  onMarkAllRead={async () => {
                    await api.markAllNotificationsRead();
                    addToast('success', 'All notifications marked as read.');
                    await loadAllData();
                  }}
                  onOpenMedicine={openMedicineDetail}
                />
              )}

              {route === 'settings' && (
                <SettingsView
                  user={user}
                  pushState={pushState}
                  onUserUpdated={(updated) => setUser(updated)}
                  onShowPermissionExplainer={() => setPermissionModalOpen(true)}
                  onOpenLegal={(doc) => setLegalDoc(doc)}
                  onLogout={handleLogout}
                  onAccountDeleted={() => {
                    setUser(null);
                    addToast('info', 'Your account and data have been permanently deleted.');
                  }}
                  onToast={addToast}
                />
              )}

              {route === 'more' && (
                <MoreMenuView
                  userName={user.name}
                  unreadNotifications={unreadCount}
                  onNavigate={(r) => navigate(r)}
                  onLogout={handleLogout}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-[#E3EAF3] dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {[
            { route: 'dashboard' as AppRoute, label: 'Home', icon: Home },
            { route: 'medicines' as AppRoute, label: 'Medicines', icon: Pill },
            { route: 'calendar' as AppRoute, label: 'Calendar', icon: Calendar },
            {
              route: 'reminders' as AppRoute,
              label: 'Reminders',
              icon: Bell,
              badge: pendingReminderCount,
            },
            {
              route: 'more' as AppRoute,
              label: 'More',
              icon: Menu,
              badge: unreadCount,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active =
              route === tab.route ||
              (tab.route === 'medicines' && route === 'medicine_detail') ||
              (tab.route === 'more' &&
                ['family', 'purchases', 'notifications', 'settings'].includes(route));

            return (
              <button
                key={tab.route}
                type="button"
                onClick={() => navigate(tab.route)}
                className={`relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-[#245DB5] dark:text-blue-400 font-semibold'
                    : 'text-[#667085] dark:text-slate-400'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#C53939] text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      <OnboardingModal open={showOnboarding} onComplete={handleOnboardingComplete} />

      <AddEditMedicineModal
        open={medModalOpen}
        onClose={() => setMedModalOpen(false)}
        familyMembers={familyMembers}
        dateFormat={user.dateFormat}
        editingMedicine={editingMedicine}
        defaultFamilyMemberId={defaultMedMemberId}
        onQuickAddMember={() => {
          setEditingMember(null);
          setMemberModalOpen(true);
        }}
        onSaved={async (_med, isNew) => {
          addToast(
            'success',
            isNew ? 'Medicine added and stock schedule calculated.' : 'Medicine updated.'
          );
          await loadAllData();
        }}
      />

      <MarkPurchasedModal
        open={!!purchaseModalMed}
        medicine={purchaseModalMed}
        dateFormat={user.dateFormat}
        onClose={() => setPurchaseModalMed(null)}
        onConfirmed={async (_med, resultingStock) => {
          addToast(
            'success',
            `Purchase recorded successfully. Total stock is now ${resultingStock} tablets.`
          );
          await loadAllData();
        }}
      />

      <AdjustStockModal
        open={!!adjustModalMed}
        medicine={adjustModalMed}
        onClose={() => setAdjustModalMed(null)}
        onAdjusted={async () => {
          addToast('success', 'Stock count updated.');
          await loadAllData();
        }}
      />

      <FamilyMemberModal
        open={memberModalOpen}
        member={editingMember}
        onClose={() => setMemberModalOpen(false)}
        onSaved={async (member, isNew) => {
          addToast(
            'success',
            isNew ? `${member.name} added to your family.` : `${member.name} updated.`
          );
          if (isNew && medModalOpen) {
            setDefaultMedMemberId(member.id);
          }
          await loadAllData();
        }}
      />

      <DeleteMemberModal
        open={!!deletingMember}
        member={deletingMember}
        allMembers={familyMembers}
        onClose={() => setDeletingMember(null)}
        onCompleted={async (action) => {
          addToast(
            'success',
            action === 'archived'
              ? 'Family member archived safely.'
              : action === 'reassigned_and_deleted'
                ? 'Medicines reassigned and family member removed.'
                : 'Family member deleted.'
          );
          setSelectedMemberId(null);
          await loadAllData();
        }}
      />

      <NotificationPermissionModal
        open={permissionModalOpen}
        onClose={() => setPermissionModalOpen(false)}
        onContinue={async () => {
          const result = await pushState.subscribe();
          if (result.ok) {
            addToast('success', 'Background push notifications enabled for this device.');
          } else if (result.reason) {
            addToast('error', result.reason);
          }
        }}
      />

      <LegalModal docType={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
}
