import React from 'react';
import { Modal } from '../ui/Modal.tsx';

export type LegalDocType = 'about' | 'privacy' | 'terms' | null;

export const LegalModal: React.FC<{
  docType: LegalDocType;
  onClose: () => void;
}> = ({ docType, onClose }) => {
  if (!docType) return null;

  const title =
    docType === 'about'
      ? 'About MediStock'
      : docType === 'privacy'
        ? 'Privacy Policy'
        : 'Terms of Service';

  return (
    <Modal open={!!docType} onClose={onClose} title={title} maxWidthClass="max-w-lg">
      <div className="space-y-4 text-sm text-[#182230] dark:text-slate-200 leading-relaxed">
        {docType === 'about' && (
          <>
            <p>
              <strong>MediStock</strong> is a family medicine inventory and refill management tool
              built to help individuals and caregivers keep track of tablet quantities, purchase
              history, and timely refill reminders.
            </p>
            <p className="text-[#667085] dark:text-slate-400">
              Disclaimer: All remaining-day estimates and stock-end dates are calculated strictly
              from the quantities and daily usage figures entered by you. MediStock does not provide
              medical advice, diagnosis, prescriptions, or dosage recommendations.
            </p>
          </>
        )}

        {docType === 'privacy' && (
          <>
            <p>
              MediStock stores only the information you explicitly enter to manage your family
              medicine inventory: your account name, securely hashed password, family member labels,
              medicine stock entries, purchase ledger, and optional push notification subscription
              tokens.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[#667085] dark:text-slate-300">
              <li>We do not require your email address, phone number, or government ID.</li>
              <li>Passwords are salted and hashed with cryptographic scrypt and never stored in plaintext.</li>
              <li>Every record is isolated to your authenticated account on the server.</li>
              <li>
                You can export your data or permanently delete your account and all associated
                records at any time from Settings.
              </li>
            </ul>
          </>
        )}

        {docType === 'terms' && (
          <>
            <p>
              By using MediStock, you acknowledge that MediStock is an organizational inventory and
              refill-reminder utility.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[#667085] dark:text-slate-300">
              <li>
                You are responsible for verifying physical tablet counts and following guidance from
                qualified healthcare professionals and pharmacists.
              </li>
              <li>
                Push notification delivery depends on browser/device permissions and network
                connectivity; always verify critical refills directly in the app.
              </li>
              <li>
                You may delete your account and associated records at any time through Settings.
              </li>
            </ul>
          </>
        )}

        <div className="pt-2 border-t border-[#E3EAF3] dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#245DB5] text-white text-sm font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
