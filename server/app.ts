import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  clearSessionCookie,
  createAuthMiddleware,
  createRateLimiter,
  createSession,
  hashPassword,
  normalizeUserName,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';
import type { MediStockStore } from './store.ts';
import { checkSupabaseSchema, StoreError } from './supabaseStore.ts';
import {
  getCalendarEvents,
  getDashboardSummary,
  getFamilyMemberById,
  getPurchaseTransactions,
  getReminderCycles,
  getStockAdjustments,
  getUserFamilyMembers,
  getUserMedicineById,
  getUserMedicines,
  getUserNotifications,
} from './queries.ts';
import {
  dispatchWebPushToUser,
  getVapidConfig,
  runReminderScheduler,
  syncMedicineReminderCycle,
} from './reminders.ts';
import {
  calculateRefillResult,
  evaluateMedicineStock,
  getTodayLocalDateStr,
  isValidCalendarDate,
  recalculateAfterUsageChange,
} from '../src/shared/stockEngine.ts';

const dateStringSchema = z
  .string()
  .trim()
  .refine((val) => isValidCalendarDate(val), { message: 'Please enter a valid calendar date.' });

const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(50, 'Name must be 50 characters or fewer.'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters.')
    .max(128, 'Password is too long.'),
});

const loginSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  password: z.string().min(1, 'Password is required.'),
});

const memberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Family member name is required.')
    .max(60, 'Name must be 60 characters or fewer.'),
  relationship: z
    .string()
    .trim()
    .max(40, 'Relationship must be 40 characters or fewer.')
    .optional()
    .nullable(),
});

const createMedicineSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Medicine name is required.')
    .max(100, 'Medicine name must be 100 characters or fewer.'),
  familyMemberId: z.string().uuid('Please select a valid family member.'),
  quantityPurchased: z
    .number('Quantity must be a number.')
    .int('Quantity must be a whole number of tablets.')
    .positive('Quantity must be greater than zero.')
    .max(10000, 'Quantity seems unusually large (max 10,000).'),
  dailyUsage: z
    .number('Daily usage must be a number.')
    .positive('Daily usage must be greater than zero.')
    .max(100, 'Daily usage must be 100 or fewer.'),
  purchaseDate: dateStringSchema,
  notes: z.string().trim().max(500).optional().nullable(),
  remindersEnabled: z.boolean().optional().default(true),
});

const updateMedicineSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  familyMemberId: z.string().uuid().optional(),
  dailyUsage: z.number().positive().max(100).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  remindersEnabled: z.boolean().optional(),
  archived: z.boolean().optional(),
});

const purchaseSchema = z.object({
  purchaseDate: dateStringSchema,
  quantityPurchased: z
    .number('Quantity must be a number.')
    .int('Quantity must be a whole number of tablets.')
    .positive('Purchased quantity must be greater than zero.')
    .max(10000),
  notes: z.string().trim().max(500).optional().nullable(),
});

const adjustStockSchema = z.object({
  newQuantity: z
    .number('Quantity must be a number.')
    .min(0, 'Stock cannot be negative.')
    .max(10000),
  reason: z.string().trim().max(250).optional().nullable(),
});

const preferencesSchema = z.object({
  dateFormat: z.enum(['MMM d, yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']).optional(),
  themePreference: z.enum(['light', 'dark']).optional(),
  notificationsEnabled: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z
    .string()
    .min(6, 'New password must be at least 6 characters.')
    .max(128, 'Password is too long.'),
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url('Invalid push endpoint URL.'),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

function asyncRoute(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
}

export function createApp(store: MediStockStore, options: { skipRateLimit?: boolean } = {}) {
  const app = express();

  // Support cross-origin requests when frontend and backend are hosted separately
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const authRateLimiter = options.skipRateLimit
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : createRateLimiter({ windowMs: 60_000, maxRequests: 25 });

  const requireAuth = createAuthMiddleware(store);

  app.get(
    '/api/health',
    asyncRoute(async (_req, res) => {
      const status = await checkSupabaseSchema();
      res.json({
        ok: true,
        supabaseConfigured: status.configured,
        schemaReady: status.schemaReady,
        ...(status.reason ? { message: status.reason } : {}),
      });
    })
  );

  app.get(
    '/api/setup/migration-sql',
    asyncRoute(async (_req, res) => {
      const status = await checkSupabaseSchema();
      if (status.schemaReady) {
        return res.status(404).json({ error: 'Database schema is already initialized.' });
      }
      const sqlPath = path.resolve(process.cwd(), 'supabase/migrations/001_medistock_schema.sql');
      if (!fs.existsSync(sqlPath)) {
        return res.status(404).json({ error: 'Migration file not found.' });
      }
      const sql = fs.readFileSync(sqlPath, 'utf8');
      res.json({ sql });
    })
  );

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  app.get(
    '/api/auth/check-name',
    asyncRoute(async (req, res) => {
      const rawName = String(req.query.name || '');
      const normalized = normalizeUserName(rawName);
      if (normalized.length < 2) {
        return res.json({ available: false, reason: 'Name must be at least 2 characters.' });
      }
      const existing = await store.findUserByNormalizedName(normalized);
      res.json({ available: !existing });
    })
  );

  app.post(
    '/api/auth/signup',
    authRateLimiter,
    asyncRoute(async (req, res) => {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input.' });
      }

      const displayName = parsed.data.name.trim().replace(/\s+/g, ' ');
      const normalized = normalizeUserName(displayName);

      const existing = await store.findUserByNormalizedName(normalized);
      if (existing) {
        return res.status(409).json({
          error: 'An account with this name already exists. Please choose another name or log in.',
        });
      }

      const userId = crypto.randomUUID();
      const passwordHash = hashPassword(parsed.data.password);
      const nowIso = new Date().toISOString();

      const createdUser = await store.createUser({
        id: userId,
        name: displayName,
        nameNormalized: normalized,
        passwordHash,
        nowIso,
      });

      const session = await createSession(store, userId);
      setSessionCookie(res, session.rawToken, session.expiresAt, req);

      res.status(201).json({
        user: toPublicUser(createdUser),
        token: session.rawToken,
      });
    })
  );

  app.post(
    '/api/auth/login',
    authRateLimiter,
    asyncRoute(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input.' });
      }

      const normalized = normalizeUserName(parsed.data.name);
      const user = await store.findUserByNormalizedName(normalized);

      if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
        return res.status(401).json({ error: 'Incorrect name or password.' });
      }

      const session = await createSession(store, user.id);
      setSessionCookie(res, session.rawToken, session.expiresAt, req);

      res.json({
        user: toPublicUser(user),
        token: session.rawToken,
      });
    })
  );

  app.post(
    '/api/auth/logout',
    requireAuth,
    asyncRoute(async (req, res) => {
      if (req.sessionTokenHash) {
        await store.deleteSessionByTokenHash(req.sessionTokenHash);
      }
      clearSessionCookie(res, req);
      res.json({ ok: true });
    })
  );

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // ===========================================================================
  // ACCOUNT & SETTINGS
  // ===========================================================================

  app.patch(
    '/api/account/preferences',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = preferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid preferences.' });
      }

      const userId = req.user!.id;
      const updated = await store.updateUserPreferences(
        userId,
        parsed.data,
        new Date().toISOString()
      );

      if (parsed.data.notificationsEnabled === true) {
        await runReminderScheduler(store, { userId });
      }

      res.json({ user: toPublicUser(updated) });
    })
  );

  app.post(
    '/api/account/change-password',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password.' });
      }

      const userId = req.user!.id;
      const user = await store.findUserById(userId);
      if (!user || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      const newHash = hashPassword(parsed.data.newPassword);
      await store.updateUserPassword(userId, newHash, new Date().toISOString());

      if (req.sessionTokenHash) {
        await store.deleteOtherSessions(userId, req.sessionTokenHash);
      }

      res.json({ ok: true, message: 'Password updated successfully.' });
    })
  );

  app.get(
    '/api/account/export',
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user!.id;
      const [familyMembers, medicines, purchases] = await Promise.all([
        getUserFamilyMembers(store, userId, { includeArchived: true }),
        getUserMedicines(store, userId, { includeArchived: true }),
        getPurchaseTransactions(store, userId),
      ]);

      res.json({
        exportedAt: new Date().toISOString(),
        account: { id: req.user!.id, name: req.user!.name },
        familyMembers,
        medicines,
        purchases,
      });
    })
  );

  app.delete(
    '/api/account',
    requireAuth,
    asyncRoute(async (req, res) => {
      const schema = z.object({
        password: z.string().min(1, 'Password is required to delete your account.'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Password required.' });
      }

      const userId = req.user!.id;
      const user = await store.findUserById(userId);
      if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
        return res.status(401).json({ error: 'Incorrect password. Account was not deleted.' });
      }

      await store.deleteUserAccountCascade(userId);
      clearSessionCookie(res, req);
      res.json({ ok: true });
    })
  );

  // ===========================================================================
  // DASHBOARD
  // ===========================================================================

  app.get(
    '/api/dashboard',
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user!.id;
      await runReminderScheduler(store, { userId });
      const summary = await getDashboardSummary(store, userId);
      res.json(summary);
    })
  );

  // ===========================================================================
  // FAMILY MEMBERS
  // ===========================================================================

  app.get(
    '/api/family-members',
    requireAuth,
    asyncRoute(async (req, res) => {
      const includeArchived = req.query.includeArchived === 'true';
      const members = await getUserFamilyMembers(store, req.user!.id, { includeArchived });
      res.json({ familyMembers: members });
    })
  );

  app.get(
    '/api/family-members/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user!.id;
      const memberId = String(req.params.id);
      const members = await getUserFamilyMembers(store, userId, { includeArchived: true });
      const member = members.find((m) => m.id === memberId);

      if (!member) {
        return res.status(404).json({ error: 'Family member not found.' });
      }

      const [medicines, recentPurchases] = await Promise.all([
        getUserMedicines(store, userId, { familyMemberId: memberId }),
        getPurchaseTransactions(store, userId, { familyMemberId: memberId, limit: 20 }),
      ]);
      const upcomingPurchases = medicines
        .filter((m) => m.stockStatus !== 'IN_STOCK')
        .sort((a, b) => a.stockEndDate.localeCompare(b.stockEndDate));

      res.json({ member, medicines, upcomingPurchases, recentPurchases });
    })
  );

  app.post(
    '/api/family-members',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = memberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input.' });
      }

      const userId = req.user!.id;
      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const rel = parsed.data.relationship?.trim() || null;

      await store.createFamilyMember({
        id,
        userId,
        name: parsed.data.name,
        relationship: rel,
        nowIso,
      });

      const members = await getUserFamilyMembers(store, userId);
      const created = members.find((m) => m.id === id);
      res.status(201).json({ familyMember: created });
    })
  );

  app.patch(
    '/api/family-members/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = memberSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input.' });
      }

      const userId = req.user!.id;
      const memberId = String(req.params.id);
      const existing = await getFamilyMemberById(store, userId, memberId);
      if (!existing) {
        return res.status(404).json({ error: 'Family member not found.' });
      }

      const name = parsed.data.name ?? existing.name;
      const relationship =
        parsed.data.relationship !== undefined
          ? parsed.data.relationship?.trim() || null
          : existing.relationship;

      await store.updateFamilyMember(userId, memberId, { name, relationship }, new Date().toISOString());

      const members = await getUserFamilyMembers(store, userId, { includeArchived: true });
      res.json({ familyMember: members.find((m) => m.id === memberId) });
    })
  );

  app.delete(
    '/api/family-members/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const schema = z.object({
        mode: z.enum(['archive', 'reassign_and_delete', 'delete_if_empty']).default('delete_if_empty'),
        reassignToMemberId: z.string().uuid().optional(),
        archiveMedicines: z.boolean().optional().default(true),
      });
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid deletion parameters.' });
      }

      const userId = req.user!.id;
      const memberId = String(req.params.id);
      const existing = await getFamilyMemberById(store, userId, memberId);
      if (!existing) {
        return res.status(404).json({ error: 'Family member not found.' });
      }

      const counts = await store.countMemberRecords(userId, memberId);
      const hasRecords = counts.medicineCount > 0 || counts.purchaseCount > 0;
      const nowIso = new Date().toISOString();

      if (parsed.data.mode === 'archive') {
        await store.archiveFamilyMember(userId, memberId, parsed.data.archiveMedicines, nowIso);
        return res.json({ ok: true, action: 'archived' });
      }

      if (parsed.data.mode === 'reassign_and_delete') {
        const targetId = parsed.data.reassignToMemberId;
        if (!targetId || targetId === memberId) {
          return res
            .status(400)
            .json({ error: 'Please select a different family member to reassign records to.' });
        }
        const targetMember = await getFamilyMemberById(store, userId, targetId);
        if (!targetMember || targetMember.archived) {
          return res.status(404).json({ error: 'Target family member not found.' });
        }

        await store.reassignAndDeleteFamilyMember(userId, memberId, targetId, nowIso);
        return res.json({ ok: true, action: 'reassigned_and_deleted' });
      }

      if (hasRecords) {
        return res.status(409).json({
          error:
            'This family member has linked medicines or purchase history. Archive them or reassign their medicines before deleting.',
          requiresAction: true,
          medicineCount: counts.medicineCount,
          purchaseCount: counts.purchaseCount,
        });
      }

      await store.deleteFamilyMember(userId, memberId);
      res.json({ ok: true, action: 'deleted' });
    })
  );

  // ===========================================================================
  // MEDICINES & STOCK LEDGER
  // ===========================================================================

  app.get(
    '/api/medicines',
    requireAuth,
    asyncRoute(async (req, res) => {
      const includeArchived = req.query.includeArchived === 'true';
      const familyMemberId = req.query.familyMemberId ? String(req.query.familyMemberId) : undefined;
      const medicines = await getUserMedicines(store, req.user!.id, {
        includeArchived,
        familyMemberId,
      });
      res.json({ medicines });
    })
  );

  app.get(
    '/api/medicines/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user!.id;
      const medicineId = String(req.params.id);
      const medicine = await getUserMedicineById(store, userId, medicineId);
      if (!medicine) {
        return res.status(404).json({ error: 'Medicine not found.' });
      }

      const [purchases, adjustments, allCycles] = await Promise.all([
        getPurchaseTransactions(store, userId, { medicineId }),
        getStockAdjustments(store, userId, medicineId),
        getReminderCycles(store, userId, 'all'),
      ]);
      const reminderCycles = allCycles.filter((rc) => rc.medicineId === medicineId);

      res.json({ medicine, purchases, adjustments, reminderCycles });
    })
  );

  app.post(
    '/api/medicines',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = createMedicineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || 'Invalid medicine data.' });
      }

      const userId = req.user!.id;
      const member = await getFamilyMemberById(store, userId, parsed.data.familyMemberId);
      if (!member || member.archived) {
        return res
          .status(404)
          .json({ error: 'Selected family member does not belong to your account.' });
      }

      const medicineId = crypto.randomUUID();
      const purchaseId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const notes = parsed.data.notes?.trim() || null;

      await store.createMedicineWithInitialPurchase({
        medicineId,
        purchaseId,
        userId,
        familyMemberId: member.id,
        name: parsed.data.name,
        quantityPurchased: parsed.data.quantityPurchased,
        dailyUsage: parsed.data.dailyUsage,
        purchaseDate: parsed.data.purchaseDate,
        notes,
        remindersEnabled: parsed.data.remindersEnabled,
        nowIso,
      });

      await syncMedicineReminderCycle(store, userId, medicineId);
      await runReminderScheduler(store, { userId });

      const created = await getUserMedicineById(store, userId, medicineId);
      res.status(201).json({ medicine: created });
    })
  );

  app.patch(
    '/api/medicines/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = updateMedicineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || 'Invalid medicine update.' });
      }

      const userId = req.user!.id;
      const medicineId = String(req.params.id);
      const existing = await getUserMedicineById(store, userId, medicineId);
      if (!existing) {
        return res.status(404).json({ error: 'Medicine not found.' });
      }

      let nextMemberId = existing.familyMemberId;
      if (parsed.data.familyMemberId && parsed.data.familyMemberId !== existing.familyMemberId) {
        const targetMember = await getFamilyMemberById(store, userId, parsed.data.familyMemberId);
        if (!targetMember || targetMember.archived) {
          return res.status(404).json({ error: 'Selected family member not found.' });
        }
        nextMemberId = targetMember.id;
      }

      let nextBaselineQty = existing.baselineQuantity;
      let nextBaselineDate = existing.baselineDate;
      let nextDailyUsage = existing.dailyUsage;

      if (parsed.data.dailyUsage !== undefined && parsed.data.dailyUsage !== existing.dailyUsage) {
        const recalc = recalculateAfterUsageChange({
          currentBaselineQuantity: existing.baselineQuantity,
          currentBaselineDate: existing.baselineDate,
          oldDailyUsage: existing.dailyUsage,
          newDailyUsage: parsed.data.dailyUsage,
        });
        nextBaselineQty = recalc.newBaselineQuantity;
        nextBaselineDate = recalc.newBaselineDate;
        nextDailyUsage = parsed.data.dailyUsage;
      }

      const nextName = parsed.data.name ?? existing.name;
      const nextNotes =
        parsed.data.notes !== undefined ? parsed.data.notes?.trim() || null : existing.notes;
      const nextReminders =
        parsed.data.remindersEnabled !== undefined
          ? parsed.data.remindersEnabled
          : existing.remindersEnabled;
      const nextArchived =
        parsed.data.archived !== undefined ? parsed.data.archived : existing.archived;

      await store.updateMedicine(
        userId,
        medicineId,
        {
          name: nextName,
          familyMemberId: nextMemberId,
          baselineQuantity: nextBaselineQty,
          baselineDate: nextBaselineDate,
          dailyUsage: nextDailyUsage,
          notes: nextNotes,
          remindersEnabled: nextReminders,
          archived: nextArchived,
        },
        new Date().toISOString()
      );

      await syncMedicineReminderCycle(store, userId, medicineId);
      await runReminderScheduler(store, { userId });

      const updated = await getUserMedicineById(store, userId, medicineId);
      res.json({ medicine: updated });
    })
  );

  app.post(
    '/api/medicines/:id/purchase',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = purchaseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || 'Invalid purchase details.' });
      }

      const userId = req.user!.id;
      const medicineId = String(req.params.id);
      const existing = await getUserMedicineById(store, userId, medicineId);
      if (!existing || existing.archived) {
        return res.status(404).json({ error: 'Medicine not found or archived.' });
      }

      const refill = calculateRefillResult({
        currentBaselineQuantity: existing.baselineQuantity,
        currentBaselineDate: existing.baselineDate,
        dailyUsage: existing.dailyUsage,
        actualPurchaseDate: parsed.data.purchaseDate,
        quantityPurchased: parsed.data.quantityPurchased,
      });

      const purchaseId = crypto.randomUUID();
      const notificationId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const notes = parsed.data.notes?.trim() || null;

      await store.recordPurchase({
        purchaseId,
        notificationId,
        userId,
        medicineId: existing.id,
        medicineName: existing.name,
        familyMemberId: existing.familyMemberId,
        familyMemberName: existing.familyMemberName,
        purchaseDate: parsed.data.purchaseDate,
        quantityPurchased: parsed.data.quantityPurchased,
        previousRemaining: refill.previousRemaining,
        resultingStock: refill.resultingStock,
        newBaselineDate: refill.newBaselineDate,
        notes,
        nowIso,
      });

      await syncMedicineReminderCycle(store, userId, existing.id);
      await runReminderScheduler(store, { userId });

      const updated = await getUserMedicineById(store, userId, existing.id);
      res.status(201).json({
        medicine: updated,
        purchaseId,
        previousRemaining: refill.previousRemaining,
        resultingStock: refill.resultingStock,
      });
    })
  );

  app.post(
    '/api/medicines/:id/adjust',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = adjustStockSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || 'Invalid stock adjustment.' });
      }

      const userId = req.user!.id;
      const medicineId = String(req.params.id);
      const existing = await getUserMedicineById(store, userId, medicineId);
      if (!existing) {
        return res.status(404).json({ error: 'Medicine not found.' });
      }

      const today = getTodayLocalDateStr();
      const currentEval = evaluateMedicineStock({
        baselineQuantity: existing.baselineQuantity,
        dailyUsage: existing.dailyUsage,
        baselineDate: existing.baselineDate,
        referenceDate: today,
      });

      const previousQty = currentEval.remainingTablets;
      const newQty = parsed.data.newQuantity;
      const delta = Number((newQty - previousQty).toFixed(2));
      const adjustmentId = crypto.randomUUID();
      const nowIso = new Date().toISOString();

      await store.recordStockAdjustment({
        adjustmentId,
        userId,
        medicineId: existing.id,
        adjustmentDate: today,
        previousQuantity: previousQty,
        newQuantity: newQty,
        delta,
        reason: parsed.data.reason?.trim() || null,
        nowIso,
      });

      await syncMedicineReminderCycle(store, userId, existing.id);
      await runReminderScheduler(store, { userId });

      const updated = await getUserMedicineById(store, userId, existing.id);
      res.json({ medicine: updated });
    })
  );

  // ===========================================================================
  // PURCHASE HISTORY & CALENDAR
  // ===========================================================================

  app.get(
    '/api/purchases',
    requireAuth,
    asyncRoute(async (req, res) => {
      const familyMemberId = req.query.familyMemberId ? String(req.query.familyMemberId) : undefined;
      const medicineId = req.query.medicineId ? String(req.query.medicineId) : undefined;
      const purchases = await getPurchaseTransactions(store, req.user!.id, {
        familyMemberId,
        medicineId,
      });
      res.json({ purchases });
    })
  );

  app.get(
    '/api/calendar',
    requireAuth,
    asyncRoute(async (req, res) => {
      const familyMemberId = req.query.familyMemberId ? String(req.query.familyMemberId) : undefined;
      const events = await getCalendarEvents(store, req.user!.id, { familyMemberId });
      res.json({ events });
    })
  );

  // ===========================================================================
  // REMINDERS & NOTIFICATIONS
  // ===========================================================================

  app.get(
    '/api/reminders',
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user!.id;
      await runReminderScheduler(store, { userId });
      const [pending, history] = await Promise.all([
        getReminderCycles(store, userId, 'pending'),
        getReminderCycles(store, userId, 'resolved'),
      ]);
      res.json({ pending, history });
    })
  );

  app.get(
    '/api/notifications',
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user!.id;
      await runReminderScheduler(store, { userId });
      const notifications = await getUserNotifications(store, userId);
      const unreadCount = notifications.filter((n) => !n.readAt).length;
      res.json({ notifications, unreadCount });
    })
  );

  app.post(
    '/api/notifications/:id/read',
    requireAuth,
    asyncRoute(async (req, res) => {
      await store.markNotificationRead(req.user!.id, String(req.params.id), new Date().toISOString());
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/notifications/read-all',
    requireAuth,
    asyncRoute(async (req, res) => {
      await store.markAllNotificationsRead(req.user!.id, new Date().toISOString());
      res.json({ ok: true });
    })
  );

  // ===========================================================================
  // WEB PUSH SUBSCRIPTIONS
  // ===========================================================================

  app.get('/api/push/vapid-public-key', requireAuth, (_req, res) => {
    const vapid = getVapidConfig();
    res.json({ publicKey: vapid.publicKey, configured: vapid.configured });
  });

  app.get(
    '/api/push/status',
    requireAuth,
    asyncRoute(async (req, res) => {
      const activeSubscriptionsCount = await store.countActivePushSubscriptions(req.user!.id);
      const vapid = getVapidConfig();
      res.json({
        activeSubscriptionsCount,
        vapidConfigured: vapid.configured,
      });
    })
  );

  app.post(
    '/api/push/subscribe',
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = pushSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || 'Invalid push subscription.' });
      }

      await store.upsertPushSubscription({
        id: crypto.randomUUID(),
        userId: req.user!.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: req.headers['user-agent'] || null,
        nowIso: new Date().toISOString(),
      });

      res.status(201).json({ ok: true });
    })
  );

  app.post(
    '/api/push/unsubscribe',
    requireAuth,
    asyncRoute(async (req, res) => {
      const endpoint = req.body?.endpoint ? String(req.body.endpoint) : null;
      await store.deactivatePushSubscriptions(req.user!.id, endpoint, new Date().toISOString());
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/push/test',
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user!.id;
      const result = await dispatchWebPushToUser(store, userId, {
        title: 'MediStock — Test Notification',
        body: 'Background refill reminders are active and ready for your family medicines.',
        url: '/?view=reminders',
        tag: 'medistock-test',
      });

      await store.createNotification({
        id: crypto.randomUUID(),
        userId,
        type: 'system',
        title: 'Test Notification',
        body:
          result.status === 'sent'
            ? 'Push notification delivered to your subscribed browser/device.'
            : result.status === 'no_subscription'
              ? 'In-app alert created. Browser push is not subscribed on this device yet.'
              : `In-app alert created, but push delivery failed: ${result.lastError || 'Unknown error'}.`,
        pushStatus: result.status,
        pushError: result.lastError,
        nowIso: new Date().toISOString(),
      });

      res.json({
        status: result.status,
        deliveredCount: result.deliveredCount,
        failedCount: result.failedCount,
        error: result.lastError,
      });
    })
  );

  // Centralized error handler translating StoreError cleanly
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (
      err instanceof StoreError ||
      (err && typeof err === 'object' && ('status' in err || 'code' in err))
    ) {
      const anyErr = err as { status?: number; message?: string; code?: string };
      return res.status(anyErr.status || 500).json({
        error: anyErr.message || 'Database error occurred.',
        code: anyErr.code || 'QUERY_FAILED',
      });
    }
    console.error('Unhandled API error:', err);
    res.status(500).json({
      error:
        err instanceof Error
          ? err.message
          : 'An unexpected server error occurred. Please try again.',
    });
  });

  return app;
}
