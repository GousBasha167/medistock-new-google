import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { StockStatus } from '../../shared/types.ts';

interface StatusBadgeProps {
  status: StockStatus;
  compact?: boolean;
}

const STATUS_CONFIG: Record<
  StockStatus,
  { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }
> = {
  IN_STOCK: {
    label: 'In Stock',
    bg: 'bg-[#E6F4F0] dark:bg-emerald-950/60 border border-[#16866B]/20 dark:border-emerald-700/40',
    text: 'text-[#16866B] dark:text-emerald-300',
    icon: CheckCircle2,
  },
  RUNNING_LOW: {
    label: 'Running Low',
    bg: 'bg-[#FEF6E6] dark:bg-amber-950/60 border border-[#B7791F]/25 dark:border-amber-700/40',
    text: 'text-[#9A6315] dark:text-amber-300',
    icon: AlertTriangle,
  },
  PURCHASE_DUE: {
    label: 'Purchase Due',
    bg: 'bg-[#FDECEC] dark:bg-rose-950/60 border border-[#C53939]/25 dark:border-rose-700/40',
    text: 'text-[#C53939] dark:text-rose-300',
    icon: Clock,
  },
  OUT_OF_STOCK: {
    label: 'Out of Stock',
    bg: 'bg-[#FDECEC] dark:bg-rose-950/70 border border-[#C53939]/35 dark:border-rose-700/50',
    text: 'text-[#A62828] dark:text-rose-200',
    icon: AlertCircle,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, compact = false }) => {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium whitespace-nowrap shrink-0 ${cfg.bg} ${cfg.text} ${
        compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
};
