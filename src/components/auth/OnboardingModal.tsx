import React, { useState } from 'react';
import { Bell, CalendarCheck2, Calculator, Check, Pill, Users } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';

const STEPS = [
  {
    title: '1. Add your family members',
    description:
      'Create profiles for yourself, parents, grandparents, or anyone whose medicines you help manage.',
    icon: Users,
    accent: 'bg-[#E6F4F0] text-[#16866B] dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  {
    title: '2. Add medicines and daily usage',
    description:
      'Enter the medicine name, quantity purchased, tablets used per day, and purchase date.',
    icon: Pill,
    accent: 'bg-[#EAF2FD] text-[#245DB5] dark:bg-blue-950/60 dark:text-blue-300',
  },
  {
    title: '3. Track stock automatically',
    description:
      'MediStock calculates remaining tablets, estimated remaining days, and the exact stock-end date.',
    icon: Calculator,
    accent: 'bg-[#EAF2FD] text-[#245DB5] dark:bg-blue-950/60 dark:text-blue-300',
  },
  {
    title: '4. Receive refill reminders',
    description:
      'Reminders start 3 days before stock is expected to finish and repeat daily until you confirm a purchase.',
    icon: Bell,
    accent: 'bg-[#FEF6E6] text-[#B7791F] dark:bg-amber-950/60 dark:text-amber-300',
  },
  {
    title: '5. Record purchases',
    description:
      'When you refill early or on time, MediStock preserves remaining tablets and keeps an accurate purchase calendar.',
    icon: CalendarCheck2,
    accent: 'bg-[#E6F4F0] text-[#16866B] dark:bg-emerald-950/60 dark:text-emerald-300',
  },
];

interface OnboardingModalProps {
  open: boolean;
  onComplete: (openAddMember?: boolean) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ open, onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const current = STEPS[stepIndex];
  const Icon = current.icon;
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <Modal
      open={open}
      onClose={() => onComplete(false)}
      title="Welcome to MediStock"
      subtitle={`Step ${stepIndex + 1} of ${STEPS.length}`}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-6">
        <div className="flex flex-col items-center text-center py-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${current.accent}`}>
            <Icon className="w-8 h-8" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-display font-bold text-[#182230] dark:text-white">
            {current.title}
          </h3>
          <p className="mt-2 text-sm text-[#667085] dark:text-slate-300 leading-relaxed max-w-sm">
            {current.description}
          </p>
        </div>

        {/* Step progress indicators */}
        <div className="flex items-center justify-center gap-2" aria-label="Onboarding progress">
          {STEPS.map((s, idx) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setStepIndex(idx)}
              aria-label={`Go to step ${idx + 1}`}
              className={`h-2 rounded-full transition-all ${
                idx === stepIndex
                  ? 'w-7 bg-[#245DB5]'
                  : 'w-2 bg-[#E3EAF3] dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#E3EAF3] dark:border-slate-800">
          <button
            type="button"
            onClick={() => onComplete(false)}
            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-[#667085] hover:text-[#182230] dark:text-slate-400 dark:hover:text-white"
          >
            Skip
          </button>

          {isLast ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onComplete(true)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Add Family Member</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#245DB5] hover:bg-[#1e4e9a] text-white text-sm font-semibold"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
