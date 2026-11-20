-- =============================================================================
-- MediStock — Supabase PostgreSQL Schema & Row Level Security Migration
-- Run this SQL once in your Supabase Dashboard -> SQL Editor
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  date_format TEXT NOT NULL DEFAULT 'MMM d, yyyy',
  theme_preference TEXT NOT NULL DEFAULT 'light' CHECK (theme_preference IN ('light', 'dark')),
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.sessions(expires_at);

-- 3. Family Members
CREATE TABLE IF NOT EXISTS public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON public.family_members(user_id, archived);

-- 4. Medicines
CREATE TABLE IF NOT EXISTS public.medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  initial_quantity DOUBLE PRECISION NOT NULL CHECK (initial_quantity >= 0),
  baseline_quantity DOUBLE PRECISION NOT NULL CHECK (baseline_quantity >= 0),
  daily_usage DOUBLE PRECISION NOT NULL CHECK (daily_usage > 0),
  purchase_date TEXT NOT NULL,
  baseline_date TEXT NOT NULL,
  notes TEXT,
  reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medicines_user ON public.medicines(user_id, archived);
CREATE INDEX IF NOT EXISTS idx_medicines_member ON public.medicines(family_member_id, archived);

-- 5. Purchase Transactions (Immutable Stock Ledger)
CREATE TABLE IF NOT EXISTS public.purchase_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE RESTRICT,
  purchase_date TEXT NOT NULL,
  quantity_purchased DOUBLE PRECISION NOT NULL CHECK (quantity_purchased > 0),
  previous_remaining DOUBLE PRECISION NOT NULL DEFAULT 0,
  resulting_stock DOUBLE PRECISION NOT NULL CHECK (resulting_stock >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_user_date ON public.purchase_transactions(user_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_medicine ON public.purchase_transactions(medicine_id, purchase_date DESC);

-- 6. Stock Adjustments
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  adjustment_date TEXT NOT NULL,
  previous_quantity DOUBLE PRECISION NOT NULL,
  new_quantity DOUBLE PRECISION NOT NULL CHECK (new_quantity >= 0),
  delta DOUBLE PRECISION NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adjustments_medicine ON public.stock_adjustments(medicine_id, created_at DESC);

-- 7. Reminder Cycles
CREATE TABLE IF NOT EXISTS public.reminder_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE RESTRICT,
  stock_end_date TEXT NOT NULL,
  first_reminder_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'resolved', 'cancelled')),
  resolved_at TIMESTAMPTZ,
  resolved_purchase_id UUID REFERENCES public.purchase_transactions(id) ON DELETE SET NULL,
  last_notified_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminder_cycles_user_status ON public.reminder_cycles(user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminder_cycles_medicine ON public.reminder_cycles(medicine_id, status);

-- 8. Push Subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id, active);

-- 9. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  medicine_id UUID REFERENCES public.medicines(id) ON DELETE CASCADE,
  family_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  reminder_cycle_id UUID REFERENCES public.reminder_cycles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('refill_reminder', 'purchase_confirmed', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_for_date TEXT,
  read_at TIMESTAMPTZ,
  push_status TEXT NOT NULL DEFAULT 'in_app_only' CHECK (push_status IN ('in_app_only', 'sent', 'failed', 'no_subscription')),
  push_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup_daily
  ON public.notifications(user_id, medicine_id, scheduled_for_date, type)
  WHERE medicine_id IS NOT NULL AND scheduled_for_date IS NOT NULL AND type = 'refill_reminder';

-- =============================================================================
-- Row Level Security (RLS)
-- Locks down direct anonymous/client access to all tables.
-- The MediStock server accesses these tables securely using SUPABASE_SERVICE_ROLE_KEY
-- and enforces strict authenticated user_id isolation on every API request.
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
