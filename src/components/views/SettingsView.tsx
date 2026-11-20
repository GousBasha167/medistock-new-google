import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  Download,
  FileText,
  Info,
  KeyRound,
  LogOut,
  Moon,
  Send,
  Shield,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import type { BrowserPermissionState } from '../../lib/usePushNotifications.ts';
import type { DateFormatOption, ThemePreference, UserProfile } from '../../shared/types.ts';
import { Modal } from '../ui/Modal.tsx';
import { PWAInstallButton } from '../ui/PWAControls.tsx';
import type { LegalDocType } from '../modals/LegalModal.tsx';

interface SettingsViewProps {
  user: UserProfile;
  pushState: {
    isSupported: boolean;
    permission: BrowserPermissionState;
    isSubscribedOnBrowser: boolean;
    serverSubCount: number;
    vapidConfigured: boolean;
    loading: boolean;
    error: string | null;
    subscribe: () => Promise<{ ok: boolean; reason?: string }>;
    unsubscribe: () => Promise<void>;
    refreshStatus: () => Promise<void>;
  };
  onUserUpdated: (user: UserProfile) => void;
  onShowPermissionExplainer: () => void;
  onOpenLegal: (doc: LegalDocType) => void;
  onLogout: () => void;
  onAccountDeleted: () => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  pushState,
  onUserUpdated,
  onShowPermissionExplainer,
  onOpenLegal,
  onLogout,
  onAccountDeleted,
  onToast,
}) => {
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  // Password change modal state
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Account delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const updatePrefs = async (patch: {
    dateFormat?: DateFormatOption;
    themePreference?: ThemePreference;
    notificationsEnabled?: boolean;
  }) => {
    setSavingPrefs(true);
    try {
      const res = await api.updatePreferences(patch);
      onUserUpdated(res.user);
      onToast('success', 'Settings saved.');
    } catch (err) {
      onToast('error', err instanceof ApiError ? err.message : 'Could not update settings.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleTestNotification = async () => {
    setTestingPush(true);
    try {
      const res = await api.sendTestPush();
      await pushState.refreshStatus();
      if (res.status === 'sent') {
        onToast('success', `Test push notification sent to ${res.deliveredCount} device(s).`);
      } else if (res.status === 'no_subscription') {
        onToast(
          'info',
          'In-app alert recorded. Enable browser push below to also test background OS push alerts.'
        );
      } else {
        onToast(
          'error',
          `Push delivery failed: ${res.error || 'Check browser permission and try resubscribing.'}`
        );
      }
    } catch (err) {
      onToast('error', err instanceof ApiError ? err.message : 'Could not send test notification.');
    } finally {
      setTestingPush(false);
    }
  };

  const handleExportData = async () => {
    try {
      const payload = await api.exportData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `medistock-export-${user.name.toLowerCase().replace(/\s+/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onToast('success', 'Your MediStock data has been downloaded.');
    } catch (err) {
      onToast('error', err instanceof ApiError ? err.message : 'Export failed.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    setPwSubmitting(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      onToast('success', 'Password changed successfully.');
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Failed to change password.');
    } finally {
      setPwSubmitting(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm permanent account deletion.');
      return;
    }
    setDeleteSubmitting(true);
    try {
      await api.deleteAccount(deletePassword);
      setDeleteModalOpen(false);
      onAccountDeleted();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete account.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-[#182230] dark:text-white">
          Settings
        </h1>
        <p className="text-sm text-[#667085] dark:text-slate-400">
          Manage your account, background reminder notifications, and app preferences.
        </p>
      </div>

      {/* Account Section */}
      <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800">
          <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
            Account
          </h2>
        </div>

        <div className="divide-y divide-[#E3EAF3] dark:divide-slate-800">
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-[#245DB5]" />
              <div>
                <p className="text-xs text-[#667085] dark:text-slate-400">Account Name</p>
                <p className="text-sm font-bold text-[#182230] dark:text-white">{user.name}</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setPwError(null);
              setPwModalOpen(true);
            }}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#F6F8FB] dark:hover:bg-slate-800/50 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <KeyRound className="w-5 h-5 text-[#245DB5]" />
              <div>
                <p className="text-sm font-semibold text-[#182230] dark:text-white">
                  Change Password
                </p>
                <p className="text-xs text-[#667085] dark:text-slate-400">
                  Update your account password securely
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#245DB5] dark:text-blue-400">Update</span>
          </button>

          <button
            type="button"
            onClick={handleExportData}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#F6F8FB] dark:hover:bg-slate-800/50 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-[#16866B]" />
              <div>
                <p className="text-sm font-semibold text-[#182230] dark:text-white">Export Data</p>
                <p className="text-xs text-[#667085] dark:text-slate-400">
                  Download your family members, medicines, and purchase ledger as JSON
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#16866B] dark:text-emerald-400">
              Download
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setDeletePassword('');
              setDeleteConfirmText('');
              setDeleteModalOpen(true);
            }}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#FDECEC]/40 dark:hover:bg-rose-950/20 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-[#C53939]" />
              <div>
                <p className="text-sm font-semibold text-[#C53939] dark:text-rose-400">
                  Delete Account
                </p>
                <p className="text-xs text-[#667085] dark:text-slate-400">
                  Permanently remove your account, family members, medicines, and purchase history
                </p>
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* Notifications Section */}
      <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800">
          <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
            Notifications &amp; Background Reminders
          </h2>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {user.notificationsEnabled ? (
                <Bell className="w-5 h-5 text-[#245DB5] mt-0.5" />
              ) : (
                <BellOff className="w-5 h-5 text-[#667085] mt-0.5" />
              )}
              <div>
                <p className="text-sm font-semibold text-[#182230] dark:text-white">
                  Enable Refill Reminders
                </p>
                <p className="text-xs text-[#667085] dark:text-slate-400">
                  Automatically generate daily alerts 3 days before stock ends.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={user.notificationsEnabled}
              disabled={savingPrefs}
              onClick={() =>
                updatePrefs({ notificationsEnabled: !user.notificationsEnabled })
              }
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                user.notificationsEnabled ? 'bg-[#16866B]' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                  user.notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="p-4 rounded-xl bg-[#F6F8FB] dark:bg-slate-800/60 border border-[#E3EAF3] dark:border-slate-700 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#667085] dark:text-slate-400">Browser Permission</span>
              <span className="font-semibold text-[#182230] dark:text-white capitalize">
                {pushState.permission}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#667085] dark:text-slate-400">Push Subscription</span>
              <span className="font-semibold text-[#182230] dark:text-white">
                {pushState.isSubscribedOnBrowser
                  ? 'Active on this device'
                  : pushState.serverSubCount > 0
                    ? `Active on ${pushState.serverSubCount} device(s)`
                    : 'Not subscribed on this device'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#667085] dark:text-slate-400">VAPID Push Server</span>
              <span className="font-semibold text-[#182230] dark:text-white">
                {pushState.vapidConfigured ? 'Configured' : 'Unavailable'}
              </span>
            </div>
          </div>

          {pushState.permission === 'denied' && (
            <div className="p-3.5 rounded-xl bg-[#FEF6E6] dark:bg-amber-950/50 border border-[#B7791F]/30 text-xs text-[#9A6315] dark:text-amber-300">
              Notifications are currently blocked by your browser. Click the lock/site-info icon next
              to your browser address bar, set Notifications to <strong>Allow</strong>, and reload
              to enable background alerts.
            </div>
          )}

          {pushState.error && (
            <div className="p-3.5 rounded-xl bg-[#FDECEC] dark:bg-rose-950/40 border border-[#C53939]/30 text-xs text-[#C53939] dark:text-rose-300">
              {pushState.error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {pushState.isSubscribedOnBrowser ? (
              <button
                type="button"
                disabled={pushState.loading}
                onClick={pushState.unsubscribe}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-sm font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {pushState.loading ? 'Updating...' : 'Disable Device Push'}
              </button>
            ) : (
              <button
                type="button"
                disabled={pushState.loading || !pushState.isSupported}
                onClick={onShowPermissionExplainer}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <Bell className="w-4 h-4" />
                <span>Enable Background Push</span>
              </button>
            )}

            <button
              type="button"
              disabled={testingPush}
              onClick={handleTestNotification}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-sm font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
            >
              <Send className="w-4 h-4 text-[#16866B]" />
              <span>{testingPush ? 'Sending...' : 'Send Test Notification'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Application Section */}
      <section className="bg-white dark:bg-slate-900 border border-[#E3EAF3] dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3EAF3] dark:border-slate-800">
          <h2 className="text-base font-display font-bold text-[#182230] dark:text-white">
            Application
          </h2>
        </div>

        <div className="p-5 space-y-5">
          {/* Theme Selection */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#182230] dark:text-white">Appearance</p>
              <p className="text-xs text-[#667085] dark:text-slate-400">
                Choose light or dark mode across all devices.
              </p>
            </div>
            <div className="inline-flex items-center gap-1 p-1 bg-[#F6F8FB] dark:bg-slate-800 rounded-xl border border-[#E3EAF3] dark:border-slate-700 self-start">
              <button
                type="button"
                onClick={() => updatePrefs({ themePreference: 'light' })}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                  user.themePreference === 'light'
                    ? 'bg-white text-[#182230] shadow-sm'
                    : 'text-[#667085] dark:text-slate-400'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => updatePrefs({ themePreference: 'dark' })}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                  user.themePreference === 'dark'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-[#667085] dark:text-slate-400'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>
            </div>
          </div>

          {/* Date Format */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[#E3EAF3] dark:border-slate-800">
            <div>
              <p className="text-sm font-semibold text-[#182230] dark:text-white">Date Format</p>
              <p className="text-xs text-[#667085] dark:text-slate-400">
                Applied consistently to stock-end dates and purchase logs.
              </p>
            </div>
            <select
              aria-label="Date format"
              value={user.dateFormat}
              onChange={(e) => updatePrefs({ dateFormat: e.target.value as DateFormatOption })}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-[#182230] dark:text-white"
            >
              <option value="MMM d, yyyy">Nov 17, 2026</option>
              <option value="dd/MM/yyyy">17/11/2026</option>
              <option value="MM/dd/yyyy">11/17/2026</option>
              <option value="yyyy-MM-dd">2026-11-17</option>
            </select>
          </div>

          <div className="pt-4 border-t border-[#E3EAF3] dark:border-slate-800 flex flex-wrap items-center gap-3">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => onOpenLegal('about')}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-xs font-medium text-[#182230] dark:text-slate-200 inline-flex items-center gap-1.5"
            >
              <Info className="w-4 h-4 text-[#245DB5]" />
              <span>About MediStock</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-xs font-medium text-[#182230] dark:text-slate-200 inline-flex items-center gap-1.5"
            >
              <Shield className="w-4 h-4 text-[#16866B]" />
              <span>Privacy Policy</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenLegal('terms')}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-xs font-medium text-[#182230] dark:text-slate-200 inline-flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-[#667085]" />
              <span>Terms of Service</span>
            </button>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={onLogout}
        className="w-full min-h-[48px] px-5 py-3 rounded-2xl border border-[#E3EAF3] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-[#C53939] inline-flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        <span>Log Out</span>
      </button>

      {/* Change Password Modal */}
      <Modal
        open={pwModalOpen}
        onClose={() => setPwModalOpen(false)}
        title="Change Password"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwError && (
            <div className="p-3 rounded-xl bg-[#FDECEC] text-[#C53939] text-sm">{pwError}</div>
          )}
          <div>
            <label
              htmlFor="curr-pw"
              className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1"
            >
              Current Password
            </label>
            <input
              id="curr-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              required
            />
          </div>
          <div>
            <label
              htmlFor="new-pw"
              className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1"
            >
              New Password (min 6 characters)
            </label>
            <input
              id="new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPwModalOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pwSubmitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#245DB5] text-white text-sm font-semibold"
            >
              {pwSubmitting ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete MediStock Account"
        subtitle="This permanently deletes your profile, family members, medicines, purchases, and reminders."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleDeleteAccount} className="space-y-4">
          {deleteError && (
            <div className="p-3 rounded-xl bg-[#FDECEC] text-[#C53939] text-sm">{deleteError}</div>
          )}
          <div>
            <label
              htmlFor="del-pw"
              className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1"
            >
              Enter your password
            </label>
            <input
              id="del-pw"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              required
            />
          </div>
          <div>
            <label
              htmlFor="del-confirm"
              className="block text-sm font-medium text-[#182230] dark:text-slate-200 mb-1"
            >
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              id="del-confirm"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleteSubmitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C53939] text-white text-sm font-semibold"
            >
              {deleteSubmitting ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
