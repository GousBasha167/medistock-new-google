import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AppNotification,
  DateFormatOption,
  FamilyMember,
  PurchaseTransaction,
  StockAdjustment,
  ThemePreference,
} from '../src/shared/types.ts';
import type {
  MediStockStore,
  StoredMedicineRecord,
  StoredPushSubscription,
  StoredReminderCycleRecord,
  StoredSessionRecord,
  StoredUserRecord,
} from './store.ts';

export type StoreErrorCode = 'NOT_CONFIGURED' | 'SCHEMA_MISSING' | 'QUERY_FAILED';

export class StoreError extends Error {
  status: number;
  code: StoreErrorCode;
  constructor(
    message: string,
    status = 500,
    cause?: unknown,
    code: StoreErrorCode = 'QUERY_FAILED'
  ) {
    super(message, { cause });
    this.name = 'StoreError';
    this.status = status;
    this.code = code;
  }
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(url && key && url.startsWith('http'));
}

function isMissingSchemaError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

let cachedSchemaReady = false;

export async function checkSupabaseSchema(): Promise<{
  configured: boolean;
  schemaReady: boolean;
  reason?: string;
}> {
  if (!isSupabaseConfigured()) {
    cachedSchemaReady = false;
    return {
      configured: false,
      schemaReady: false,
      reason: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured.',
    };
  }

  if (cachedSchemaReady) {
    return { configured: true, schemaReady: true };
  }

  try {
    const sb = getSupabaseClient();
    const { error } = await sb.from('users').select('id').limit(1);
    if (!error) {
      cachedSchemaReady = true;
      return { configured: true, schemaReady: true };
    }
    if (isMissingSchemaError(error)) {
      return {
        configured: true,
        schemaReady: false,
        reason:
          'MediStock database tables were not found in your Supabase project. Run supabase/migrations/001_medistock_schema.sql in your Supabase SQL Editor.',
      };
    }
    return {
      configured: true,
      schemaReady: false,
      reason: error.message || 'Unable to verify Supabase schema.',
    };
  } catch (err) {
    return {
      configured: true,
      schemaReady: false,
      reason: err instanceof Error ? err.message : 'Unable to reach Supabase.',
    };
  }
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new StoreError(
      'Supabase is not configured yet. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment secrets and restart the server.',
      503,
      undefined,
      'NOT_CONFIGURED'
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function throwIfError(error: { message: string; code?: string } | null, context: string): void {
  if (!error) return;
  if (isMissingSchemaError(error)) {
    cachedSchemaReady = false;
    throw new StoreError(
      'MediStock database tables were not found in your Supabase project. Please run supabase/migrations/001_medistock_schema.sql in your Supabase SQL Editor.',
      503,
      error,
      'SCHEMA_MISSING'
    );
  }
  console.error(`Supabase error (${context}):`, error);
  throw new StoreError(
    'Database request failed. Please check your Supabase connection and try again.',
    500,
    error,
    'QUERY_FAILED'
  );
}

function mapUser(row: Record<string, unknown>): StoredUserRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    nameNormalized: String(row.name_normalized),
    passwordHash: String(row.password_hash),
    dateFormat: (row.date_format as DateFormatOption) || 'MMM d, yyyy',
    themePreference: (row.theme_preference as ThemePreference) || 'light',
    notificationsEnabled: Boolean(row.notifications_enabled),
    onboardingCompleted: Boolean(row.onboarding_completed),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMember(row: Record<string, unknown>): FamilyMember {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    relationship: row.relationship ? String(row.relationship) : null,
    archived: Boolean(row.archived),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function extractJoin<T extends Record<string, unknown>>(val: unknown): T | null {
  if (!val) return null;
  if (Array.isArray(val)) return (val[0] as T) ?? null;
  return val as T;
}

function mapMedicine(row: Record<string, unknown>): StoredMedicineRecord {
  const fm = extractJoin<{ name?: string; relationship?: string | null }>(row.family_members);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    familyMemberId: String(row.family_member_id),
    familyMemberName: fm?.name ? String(fm.name) : 'Unknown',
    familyMemberRelationship: fm?.relationship ? String(fm.relationship) : null,
    name: String(row.name),
    initialQuantity: Number(row.initial_quantity),
    baselineQuantity: Number(row.baseline_quantity),
    dailyUsage: Number(row.daily_usage),
    purchaseDate: String(row.purchase_date),
    baselineDate: String(row.baseline_date),
    notes: row.notes ? String(row.notes) : null,
    remindersEnabled: Boolean(row.reminders_enabled),
    archived: Boolean(row.archived),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createSupabaseStore(providedClient?: SupabaseClient): MediStockStore {
  let cachedClient: SupabaseClient | null = providedClient ?? null;
  const client = () => {
    if (!cachedClient) {
      cachedClient = getSupabaseClient();
    }
    return cachedClient;
  };

  return {
    async findUserByNormalizedName(nameNormalized) {
      const { data, error } = await client()
        .from('users')
        .select('*')
        .eq('name_normalized', nameNormalized)
        .maybeSingle();
      throwIfError(error, 'findUserByNormalizedName');
      return data ? mapUser(data) : null;
    },

    async findUserById(userId) {
      const { data, error } = await client()
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      throwIfError(error, 'findUserById');
      return data ? mapUser(data) : null;
    },

    async listAllUsers() {
      const { data, error } = await client()
        .from('users')
        .select('id, notifications_enabled');
      throwIfError(error, 'listAllUsers');
      return (data || []).map((r) => ({
        id: String(r.id),
        notificationsEnabled: Boolean(r.notifications_enabled),
      }));
    },

    async createUser(input) {
      const { data, error } = await client()
        .from('users')
        .insert({
          id: input.id,
          name: input.name,
          name_normalized: input.nameNormalized,
          password_hash: input.passwordHash,
          created_at: input.nowIso,
          updated_at: input.nowIso,
        })
        .select('*')
        .single();
      throwIfError(error, 'createUser');
      return mapUser(data);
    },

    async updateUserPreferences(userId, patch, nowIso) {
      const payload: Record<string, unknown> = { updated_at: nowIso };
      if (patch.dateFormat !== undefined) payload.date_format = patch.dateFormat;
      if (patch.themePreference !== undefined) payload.theme_preference = patch.themePreference;
      if (patch.notificationsEnabled !== undefined) {
        payload.notifications_enabled = patch.notificationsEnabled;
      }
      if (patch.onboardingCompleted !== undefined) {
        payload.onboarding_completed = patch.onboardingCompleted;
      }

      const { data, error } = await client()
        .from('users')
        .update(payload)
        .eq('id', userId)
        .select('*')
        .single();
      throwIfError(error, 'updateUserPreferences');
      return mapUser(data);
    },

    async updateUserPassword(userId, passwordHash, nowIso) {
      const { error } = await client()
        .from('users')
        .update({ password_hash: passwordHash, updated_at: nowIso })
        .eq('id', userId);
      throwIfError(error, 'updateUserPassword');
    },

    async deleteUserAccountCascade(userId) {
      // Explicit ordered cleanup respects RESTRICT foreign keys before deleting user
      const sb = client();
      const steps: Array<{ table: string }> = [
        { table: 'notifications' },
        { table: 'reminder_cycles' },
        { table: 'stock_adjustments' },
        { table: 'purchase_transactions' },
        { table: 'medicines' },
        { table: 'family_members' },
        { table: 'push_subscriptions' },
        { table: 'sessions' },
      ];
      for (const s of steps) {
        const { error } = await sb.from(s.table).delete().eq('user_id', userId);
        throwIfError(error, `deleteUserAccountCascade:${s.table}`);
      }
      const { error } = await sb.from('users').delete().eq('id', userId);
      throwIfError(error, 'deleteUserAccountCascade:users');
    },

    async createSession(input) {
      const { error } = await client().from('sessions').insert({
        id: input.id,
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        created_at: input.createdAt,
      });
      throwIfError(error, 'createSession');
    },

    async findSessionWithUser(tokenHash) {
      const { data, error } = await client()
        .from('sessions')
        .select('id, user_id, token_hash, expires_at, created_at, users(*)')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      throwIfError(error, 'findSessionWithUser');
      if (!data) return null;
      const userObj = extractJoin<Record<string, unknown>>(data.users);
      if (!userObj) return null;
      const session: StoredSessionRecord = {
        id: String(data.id),
        userId: String(data.user_id),
        tokenHash: String(data.token_hash),
        expiresAt: String(data.expires_at),
        createdAt: String(data.created_at),
      };
      return { session, user: mapUser(userObj) };
    },

    async deleteSessionByTokenHash(tokenHash) {
      const { error } = await client().from('sessions').delete().eq('token_hash', tokenHash);
      throwIfError(error, 'deleteSessionByTokenHash');
    },

    async deleteOtherSessions(userId, keepTokenHash) {
      const { error } = await client()
        .from('sessions')
        .delete()
        .eq('user_id', userId)
        .neq('token_hash', keepTokenHash);
      throwIfError(error, 'deleteOtherSessions');
    },

    async listFamilyMembers(userId, includeArchived) {
      let query = client()
        .from('family_members')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (!includeArchived) {
        query = query.eq('archived', false);
      }
      const { data, error } = await query;
      throwIfError(error, 'listFamilyMembers');
      return (data || []).map(mapMember);
    },

    async findFamilyMemberById(userId, memberId) {
      const { data, error } = await client()
        .from('family_members')
        .select('*')
        .eq('id', memberId)
        .eq('user_id', userId)
        .maybeSingle();
      throwIfError(error, 'findFamilyMemberById');
      return data ? mapMember(data) : null;
    },

    async createFamilyMember(input) {
      const { data, error } = await client()
        .from('family_members')
        .insert({
          id: input.id,
          user_id: input.userId,
          name: input.name,
          relationship: input.relationship,
          archived: false,
          created_at: input.nowIso,
          updated_at: input.nowIso,
        })
        .select('*')
        .single();
      throwIfError(error, 'createFamilyMember');
      return mapMember(data);
    },

    async updateFamilyMember(userId, memberId, patch, nowIso) {
      const { data, error } = await client()
        .from('family_members')
        .update({
          name: patch.name,
          relationship: patch.relationship,
          updated_at: nowIso,
        })
        .eq('id', memberId)
        .eq('user_id', userId)
        .select('*')
        .single();
      throwIfError(error, 'updateFamilyMember');
      return mapMember(data);
    },

    async countMemberRecords(userId, memberId) {
      const [medRes, purchaseRes] = await Promise.all([
        client()
          .from('medicines')
          .select('id', { count: 'exact', head: true })
          .eq('family_member_id', memberId)
          .eq('user_id', userId),
        client()
          .from('purchase_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('family_member_id', memberId)
          .eq('user_id', userId),
      ]);
      throwIfError(medRes.error, 'countMemberRecords:medicines');
      throwIfError(purchaseRes.error, 'countMemberRecords:purchases');
      return {
        medicineCount: medRes.count ?? 0,
        purchaseCount: purchaseRes.count ?? 0,
      };
    },

    async archiveFamilyMember(userId, memberId, archiveMedicines, nowIso) {
      const sb = client();
      const { error: mErr } = await sb
        .from('family_members')
        .update({ archived: true, updated_at: nowIso })
        .eq('id', memberId)
        .eq('user_id', userId);
      throwIfError(mErr, 'archiveFamilyMember');

      if (archiveMedicines) {
        const { error: medErr } = await sb
          .from('medicines')
          .update({ archived: true, updated_at: nowIso })
          .eq('family_member_id', memberId)
          .eq('user_id', userId);
        throwIfError(medErr, 'archiveFamilyMember:medicines');

        const { error: rcErr } = await sb
          .from('reminder_cycles')
          .update({ status: 'cancelled', updated_at: nowIso })
          .eq('family_member_id', memberId)
          .eq('user_id', userId)
          .eq('status', 'pending');
        throwIfError(rcErr, 'archiveFamilyMember:reminder_cycles');
      }
    },

    async reassignAndDeleteFamilyMember(userId, memberId, targetMemberId, nowIso) {
      const sb = client();
      const u1 = await sb
        .from('medicines')
        .update({ family_member_id: targetMemberId, updated_at: nowIso })
        .eq('family_member_id', memberId)
        .eq('user_id', userId);
      throwIfError(u1.error, 'reassign:medicines');

      const u2 = await sb
        .from('purchase_transactions')
        .update({ family_member_id: targetMemberId })
        .eq('family_member_id', memberId)
        .eq('user_id', userId);
      throwIfError(u2.error, 'reassign:purchases');

      const u3 = await sb
        .from('reminder_cycles')
        .update({ family_member_id: targetMemberId, updated_at: nowIso })
        .eq('family_member_id', memberId)
        .eq('user_id', userId);
      throwIfError(u3.error, 'reassign:reminder_cycles');

      const u4 = await sb
        .from('notifications')
        .update({ family_member_id: targetMemberId })
        .eq('family_member_id', memberId)
        .eq('user_id', userId);
      throwIfError(u4.error, 'reassign:notifications');

      const del = await sb
        .from('family_members')
        .delete()
        .eq('id', memberId)
        .eq('user_id', userId);
      throwIfError(del.error, 'reassign:delete_member');
    },

    async deleteFamilyMember(userId, memberId) {
      const { error } = await client()
        .from('family_members')
        .delete()
        .eq('id', memberId)
        .eq('user_id', userId);
      throwIfError(error, 'deleteFamilyMember');
    },

    async listMedicines(userId, options) {
      let query = client()
        .from('medicines')
        .select('*, family_members(name, relationship)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!options.includeArchived) {
        query = query.eq('archived', false);
      }
      if (options.familyMemberId) {
        query = query.eq('family_member_id', options.familyMemberId);
      }

      const { data, error } = await query;
      throwIfError(error, 'listMedicines');
      return (data || []).map((row) => mapMedicine(row as Record<string, unknown>));
    },

    async findMedicineById(userId, medicineId) {
      const { data, error } = await client()
        .from('medicines')
        .select('*, family_members(name, relationship)')
        .eq('id', medicineId)
        .eq('user_id', userId)
        .maybeSingle();
      throwIfError(error, 'findMedicineById');
      return data ? mapMedicine(data as Record<string, unknown>) : null;
    },

    async createMedicineWithInitialPurchase(input) {
      const sb = client();
      const { error: medErr } = await sb.from('medicines').insert({
        id: input.medicineId,
        user_id: input.userId,
        family_member_id: input.familyMemberId,
        name: input.name,
        initial_quantity: input.quantityPurchased,
        baseline_quantity: input.quantityPurchased,
        daily_usage: input.dailyUsage,
        purchase_date: input.purchaseDate,
        baseline_date: input.purchaseDate,
        notes: input.notes,
        reminders_enabled: input.remindersEnabled,
        archived: false,
        created_at: input.nowIso,
        updated_at: input.nowIso,
      });
      throwIfError(medErr, 'createMedicineWithInitialPurchase:medicine');

      const { error: pErr } = await sb.from('purchase_transactions').insert({
        id: input.purchaseId,
        user_id: input.userId,
        medicine_id: input.medicineId,
        family_member_id: input.familyMemberId,
        purchase_date: input.purchaseDate,
        quantity_purchased: input.quantityPurchased,
        previous_remaining: 0,
        resulting_stock: input.quantityPurchased,
        notes: input.notes || 'Initial stock entry',
        created_at: input.nowIso,
      });
      if (pErr) {
        await sb.from('medicines').delete().eq('id', input.medicineId).eq('user_id', input.userId);
        throwIfError(pErr, 'createMedicineWithInitialPurchase:purchase');
      }
    },

    async updateMedicine(userId, medicineId, patch, nowIso) {
      const { error } = await client()
        .from('medicines')
        .update({
          name: patch.name,
          family_member_id: patch.familyMemberId,
          baseline_quantity: patch.baselineQuantity,
          baseline_date: patch.baselineDate,
          daily_usage: patch.dailyUsage,
          notes: patch.notes,
          reminders_enabled: patch.remindersEnabled,
          archived: patch.archived,
          updated_at: nowIso,
        })
        .eq('id', medicineId)
        .eq('user_id', userId);
      throwIfError(error, 'updateMedicine');
    },

    async recordPurchase(input) {
      const sb = client();
      const { error: pErr } = await sb.from('purchase_transactions').insert({
        id: input.purchaseId,
        user_id: input.userId,
        medicine_id: input.medicineId,
        family_member_id: input.familyMemberId,
        purchase_date: input.purchaseDate,
        quantity_purchased: input.quantityPurchased,
        previous_remaining: input.previousRemaining,
        resulting_stock: input.resultingStock,
        notes: input.notes,
        created_at: input.nowIso,
      });
      throwIfError(pErr, 'recordPurchase:insert');

      const { error: mErr } = await sb
        .from('medicines')
        .update({
          baseline_quantity: input.resultingStock,
          baseline_date: input.newBaselineDate,
          purchase_date: input.purchaseDate,
          updated_at: input.nowIso,
        })
        .eq('id', input.medicineId)
        .eq('user_id', input.userId);
      throwIfError(mErr, 'recordPurchase:updateMedicine');

      const { error: rcErr } = await sb
        .from('reminder_cycles')
        .update({
          status: 'resolved',
          resolved_at: input.nowIso,
          resolved_purchase_id: input.purchaseId,
          updated_at: input.nowIso,
        })
        .eq('user_id', input.userId)
        .eq('medicine_id', input.medicineId)
        .eq('status', 'pending');
      throwIfError(rcErr, 'recordPurchase:resolveCycle');

      const { error: nErr } = await sb.from('notifications').insert({
        id: input.notificationId,
        user_id: input.userId,
        medicine_id: input.medicineId,
        family_member_id: input.familyMemberId,
        type: 'purchase_confirmed',
        title: 'Purchase Confirmed',
        body: `${input.familyMemberName}: Purchased ${input.quantityPurchased} tablets of ${input.medicineName}. Total stock is now ${input.resultingStock} tablets.`,
        scheduled_for_date: input.purchaseDate,
        push_status: 'in_app_only',
        created_at: input.nowIso,
      });
      throwIfError(nErr, 'recordPurchase:notification');
    },

    async recordStockAdjustment(input) {
      const sb = client();
      const { error: adjErr } = await sb.from('stock_adjustments').insert({
        id: input.adjustmentId,
        user_id: input.userId,
        medicine_id: input.medicineId,
        adjustment_date: input.adjustmentDate,
        previous_quantity: input.previousQuantity,
        new_quantity: input.newQuantity,
        delta: input.delta,
        reason: input.reason,
        created_at: input.nowIso,
      });
      throwIfError(adjErr, 'recordStockAdjustment:insert');

      const { error: mErr } = await sb
        .from('medicines')
        .update({
          baseline_quantity: input.newQuantity,
          baseline_date: input.adjustmentDate,
          updated_at: input.nowIso,
        })
        .eq('id', input.medicineId)
        .eq('user_id', input.userId);
      throwIfError(mErr, 'recordStockAdjustment:updateMedicine');
    },

    async listPurchases(userId, options = {}) {
      let query = client()
        .from('purchase_transactions')
        .select('*, medicines(name), family_members(name)')
        .eq('user_id', userId)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (options.medicineId) query = query.eq('medicine_id', options.medicineId);
      if (options.familyMemberId) query = query.eq('family_member_id', options.familyMemberId);
      if (options.limit) query = query.limit(Math.max(1, Math.min(500, Math.floor(options.limit))));

      const { data, error } = await query;
      throwIfError(error, 'listPurchases');

      return (data || []).map((row) => {
        const med = extractJoin<{ name?: string }>(row.medicines);
        const fm = extractJoin<{ name?: string }>(row.family_members);
        return {
          id: String(row.id),
          userId: String(row.user_id),
          medicineId: String(row.medicine_id),
          medicineName: med?.name ? String(med.name) : 'Unknown',
          familyMemberId: String(row.family_member_id),
          familyMemberName: fm?.name ? String(fm.name) : 'Unknown',
          purchaseDate: String(row.purchase_date),
          quantityPurchased: Number(row.quantity_purchased),
          previousRemaining: Number(row.previous_remaining),
          resultingStock: Number(row.resulting_stock),
          notes: row.notes ? String(row.notes) : null,
          createdAt: String(row.created_at),
        } satisfies PurchaseTransaction;
      });
    },

    async listStockAdjustments(userId, medicineId) {
      const { data, error } = await client()
        .from('stock_adjustments')
        .select('*')
        .eq('user_id', userId)
        .eq('medicine_id', medicineId)
        .order('created_at', { ascending: false });
      throwIfError(error, 'listStockAdjustments');

      return (data || []).map(
        (r) =>
          ({
            id: String(r.id),
            userId: String(r.user_id),
            medicineId: String(r.medicine_id),
            adjustmentDate: String(r.adjustment_date),
            previousQuantity: Number(r.previous_quantity),
            newQuantity: Number(r.new_quantity),
            delta: Number(r.delta),
            reason: r.reason ? String(r.reason) : null,
            createdAt: String(r.created_at),
          }) satisfies StockAdjustment
      );
    },

    async listReminderCycles(userId, status) {
      let query = client()
        .from('reminder_cycles')
        .select(
          '*, medicines(name, baseline_quantity, daily_usage, baseline_date, reminders_enabled, archived), family_members(name)'
        )
        .eq('user_id', userId)
        .order('stock_end_date', { ascending: true })
        .order('updated_at', { ascending: false });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      throwIfError(error, 'listReminderCycles');

      return (data || []).map((r) => {
        const med = extractJoin<{
          name?: string;
          baseline_quantity?: number;
          daily_usage?: number;
          baseline_date?: string;
          reminders_enabled?: boolean;
          archived?: boolean;
        }>(r.medicines);
        const fm = extractJoin<{ name?: string }>(r.family_members);

        return {
          id: String(r.id),
          userId: String(r.user_id),
          medicineId: String(r.medicine_id),
          medicineName: med?.name ? String(med.name) : 'Unknown',
          familyMemberId: String(r.family_member_id),
          familyMemberName: fm?.name ? String(fm.name) : 'Unknown',
          stockEndDate: String(r.stock_end_date),
          firstReminderDate: String(r.first_reminder_date),
          status: r.status as 'pending' | 'resolved' | 'cancelled',
          resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
          resolvedPurchaseId: r.resolved_purchase_id ? String(r.resolved_purchase_id) : null,
          lastNotifiedDate: r.last_notified_date ? String(r.last_notified_date) : null,
          baselineQuantity: Number(med?.baseline_quantity ?? 0),
          dailyUsage: Number(med?.daily_usage ?? 1),
          baselineDate: String(med?.baseline_date ?? r.stock_end_date),
          remindersEnabled: Boolean(med?.reminders_enabled),
          medicineArchived: Boolean(med?.archived),
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        } satisfies StoredReminderCycleRecord;
      });
    },

    async findPendingReminderCycle(userId, medicineId) {
      const { data, error } = await client()
        .from('reminder_cycles')
        .select('id')
        .eq('user_id', userId)
        .eq('medicine_id', medicineId)
        .eq('status', 'pending')
        .maybeSingle();
      throwIfError(error, 'findPendingReminderCycle');
      return data ? { id: String(data.id) } : null;
    },

    async createReminderCycle(input) {
      const { error } = await client().from('reminder_cycles').insert({
        id: input.id,
        user_id: input.userId,
        medicine_id: input.medicineId,
        family_member_id: input.familyMemberId,
        stock_end_date: input.stockEndDate,
        first_reminder_date: input.firstReminderDate,
        status: 'pending',
        created_at: input.nowIso,
        updated_at: input.nowIso,
      });
      throwIfError(error, 'createReminderCycle');
    },

    async updateReminderCycleDates(cycleId, input) {
      const { error } = await client()
        .from('reminder_cycles')
        .update({
          stock_end_date: input.stockEndDate,
          first_reminder_date: input.firstReminderDate,
          family_member_id: input.familyMemberId,
          updated_at: input.nowIso,
        })
        .eq('id', cycleId);
      throwIfError(error, 'updateReminderCycleDates');
    },

    async updateReminderCycleStatus(cycleId, status, nowIso) {
      const { error } = await client()
        .from('reminder_cycles')
        .update({ status, updated_at: nowIso })
        .eq('id', cycleId);
      throwIfError(error, 'updateReminderCycleStatus');
    },

    async markReminderCycleNotified(cycleId, refDate, nowIso) {
      const { error } = await client()
        .from('reminder_cycles')
        .update({ last_notified_date: refDate, updated_at: nowIso })
        .eq('id', cycleId);
      throwIfError(error, 'markReminderCycleNotified');
    },

    async listNotifications(userId, limit = 100) {
      const { data, error } = await client()
        .from('notifications')
        .select('*, medicines(name), family_members(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      throwIfError(error, 'listNotifications');

      return (data || []).map((r) => {
        const med = extractJoin<{ name?: string }>(r.medicines);
        const fm = extractJoin<{ name?: string }>(r.family_members);
        return {
          id: String(r.id),
          userId: String(r.user_id),
          medicineId: r.medicine_id ? String(r.medicine_id) : null,
          medicineName: med?.name ? String(med.name) : null,
          familyMemberId: r.family_member_id ? String(r.family_member_id) : null,
          familyMemberName: fm?.name ? String(fm.name) : null,
          reminderCycleId: r.reminder_cycle_id ? String(r.reminder_cycle_id) : null,
          type: r.type as AppNotification['type'],
          title: String(r.title),
          body: String(r.body),
          scheduledForDate: r.scheduled_for_date ? String(r.scheduled_for_date) : null,
          readAt: r.read_at ? String(r.read_at) : null,
          pushStatus: r.push_status as AppNotification['pushStatus'],
          pushError: r.push_error ? String(r.push_error) : null,
          createdAt: String(r.created_at),
        } satisfies AppNotification;
      });
    },

    async countUnreadNotifications(userId) {
      const { count, error } = await client()
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);
      throwIfError(error, 'countUnreadNotifications');
      return count ?? 0;
    },

    async hasDailyRefillNotification(userId, medicineId, scheduledForDate) {
      const { data, error } = await client()
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('medicine_id', medicineId)
        .eq('scheduled_for_date', scheduledForDate)
        .eq('type', 'refill_reminder')
        .maybeSingle();
      throwIfError(error, 'hasDailyRefillNotification');
      return Boolean(data);
    },

    async createNotification(input) {
      const { error } = await client().from('notifications').insert({
        id: input.id,
        user_id: input.userId,
        medicine_id: input.medicineId ?? null,
        family_member_id: input.familyMemberId ?? null,
        reminder_cycle_id: input.reminderCycleId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        scheduled_for_date: input.scheduledForDate ?? null,
        push_status: input.pushStatus,
        push_error: input.pushError ?? null,
        created_at: input.nowIso,
      });

      if (error) {
        // 23505 = PostgreSQL unique constraint violation (daily notification dedup)
        if (error.code === '23505') {
          return { inserted: false };
        }
        throwIfError(error, 'createNotification');
      }
      return { inserted: true };
    },

    async updateNotificationPushStatus(notificationId, pushStatus, pushError) {
      const { error } = await client()
        .from('notifications')
        .update({ push_status: pushStatus, push_error: pushError })
        .eq('id', notificationId);
      throwIfError(error, 'updateNotificationPushStatus');
    },

    async markNotificationRead(userId, notificationId, nowIso) {
      const { error } = await client()
        .from('notifications')
        .update({ read_at: nowIso })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .is('read_at', null);
      throwIfError(error, 'markNotificationRead');
    },

    async markAllNotificationsRead(userId, nowIso) {
      const { error } = await client()
        .from('notifications')
        .update({ read_at: nowIso })
        .eq('user_id', userId)
        .is('read_at', null);
      throwIfError(error, 'markAllNotificationsRead');
    },

    async listActivePushSubscriptions(userId) {
      const { data, error } = await client()
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true);
      throwIfError(error, 'listActivePushSubscriptions');
      return (data || []).map(
        (r) =>
          ({
            id: String(r.id),
            userId: String(r.user_id),
            endpoint: String(r.endpoint),
            p256dh: String(r.p256dh),
            auth: String(r.auth),
            userAgent: r.user_agent ? String(r.user_agent) : null,
            active: Boolean(r.active),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          }) satisfies StoredPushSubscription
      );
    },

    async countActivePushSubscriptions(userId) {
      const { count, error } = await client()
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('active', true);
      throwIfError(error, 'countActivePushSubscriptions');
      return count ?? 0;
    },

    async upsertPushSubscription(input) {
      const { error } = await client()
        .from('push_subscriptions')
        .upsert(
          {
            id: input.id,
            user_id: input.userId,
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
            user_agent: input.userAgent,
            active: true,
            created_at: input.nowIso,
            updated_at: input.nowIso,
          },
          { onConflict: 'endpoint' }
        );
      throwIfError(error, 'upsertPushSubscription');
    },

    async deactivatePushSubscriptionById(id, nowIso) {
      const { error } = await client()
        .from('push_subscriptions')
        .update({ active: false, updated_at: nowIso })
        .eq('id', id);
      throwIfError(error, 'deactivatePushSubscriptionById');
    },

    async deactivatePushSubscriptions(userId, endpoint, nowIso) {
      let query = client()
        .from('push_subscriptions')
        .update({ active: false, updated_at: nowIso })
        .eq('user_id', userId);
      if (endpoint) {
        query = query.eq('endpoint', endpoint);
      }
      const { error } = await query;
      throwIfError(error, 'deactivatePushSubscriptions');
    },
  };
}
