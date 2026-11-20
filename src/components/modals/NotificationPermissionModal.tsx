import React from 'react';
import { BellRing, ShieldCheck } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';

interface NotificationPermissionModalProps {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
}

export const NotificationPermissionModal: React.FC<NotificationPermissionModalProps> = ({
  open,
  onClose,
  onContinue,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Enable Refill Reminders"
    subtitle="Stay informed before family medicines run out"
    maxWidthClass="max-w-md"
  >
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center py-2">
        <div className="w-14 h-14 rounded-2xl bg-[#EAF2FD] dark:bg-blue-950/60 text-[#245DB5] dark:text-blue-400 flex items-center justify-center mb-3">
          <BellRing className="w-7 h-7" />
        </div>
        <p className="text-sm text-[#182230] dark:text-slate-200 leading-relaxed">
          MediStock requests notification permission solely to alert you when a family
          member&apos;s medicine stock is within 3 days of running out—even if the app is closed.
        </p>
      </div>

      <div className="p-3.5 rounded-xl bg-[#F6F8FB] dark:bg-slate-800/60 border border-[#E3EAF3] dark:border-slate-700 text-xs text-[#667085] dark:text-slate-300 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-[#16866B] shrink-0 mt-0.5" />
        <span>
          We never send promotional alerts or request unrelated device permissions. You can turn off
          notifications anytime in Settings.
        </span>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E3EAF3] dark:border-slate-800">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E3EAF3] dark:border-slate-700 text-sm font-medium text-[#182230] dark:text-slate-200"
        >
          Not Now
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onContinue();
          }}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold"
        >
          Allow Notifications
        </button>
      </div>
    </div>
  </Modal>
);
