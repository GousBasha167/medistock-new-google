import type {
  MediStockStore,
  StoredMedicineRecord,
  StoredPushSubscription,
  StoredReminderCycleRecord,
  StoredSessionRecord,
  StoredUserRecord,
} from '../server/store.ts';
import type {
  AppNotification,
  FamilyMember,
  PurchaseTransaction,
  StockAdjustment,
} from '../src/shared/types.ts';

/**
 * In-memory test double implementing MediStockStore exclusively for automated Vitest runs
 * when live Supabase credentials are not present in the test environment.
 */
export function createTestStore(): MediStockStore & {
  _debugGetUserPasswordHash(nameNormalized: string): string | undefined;
  _debugGetPendingReminderMedicineIds(userId: string): string[];
} {
  const users = new Map<string, StoredUserRecord>();
  const sessions = new Map<string, StoredSessionRecord>();
  const familyMembers = new Map<string, FamilyMember>();
  const medicines = new Map<string, Omit<StoredMedicineRecord, 'familyMemberName' | 'familyMemberRelationship'>>();
  const purchases: PurchaseTransaction[] = [];
  const adjustments: StockAdjustment[] = [];
  const reminderCycles = new Map<
    string,
    {
      id: string;
      userId: string;
      medicineId: string;
      familyMemberId: string;
      stockEndDate: string;
      firstReminderDate: string;
      status: 'pending' | 'resolved' | 'cancelled';
      resolvedAt: string | null;
      resolvedPurchaseId: string | null;
      lastNotifiedDate: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >();
  const notifications: AppNotification[] = [];
  const pushSubs = new Map<string, StoredPushSubscription>();

  function hydrateMedicine(
    raw: Omit<StoredMedicineRecord, 'familyMemberName' | 'familyMemberRelationship'>
  ): StoredMedicineRecord {
    const fm = familyMembers.get(raw.familyMemberId);
    return {
      ...raw,
      familyMemberName: fm?.name ?? 'Unknown',
      familyMemberRelationship: fm?.relationship ?? null,
    };
  }

  return {
    _debugGetUserPasswordHash(nameNormalized) {
      for (const u of users.values()) {
        if (u.nameNormalized === nameNormalized) return u.passwordHash;
      }
      return undefined;
    },

    _debugGetPendingReminderMedicineIds(userId) {
      return Array.from(reminderCycles.values())
        .filter((rc) => rc.userId === userId && rc.status === 'pending')
        .map((rc) => rc.medicineId);
    },

    async findUserByNormalizedName(nameNormalized) {
      for (const u of users.values()) {
        if (u.nameNormalized === nameNormalized) return { ...u };
      }
      return null;
    },

    async findUserById(userId) {
      const u = users.get(userId);
      return u ? { ...u } : null;
    },

    async listAllUsers() {
      return Array.from(users.values()).map((u) => ({
        id: u.id,
        notificationsEnabled: u.notificationsEnabled,
      }));
    },

    async createUser(input) {
      const record: StoredUserRecord = {
        id: input.id,
        name: input.name,
        nameNormalized: input.nameNormalized,
        passwordHash: input.passwordHash,
        dateFormat: 'MMM d, yyyy',
        themePreference: 'light',
        notificationsEnabled: true,
        onboardingCompleted: false,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      };
      users.set(record.id, record);
      return { ...record };
    },

    async updateUserPreferences(userId, patch, nowIso) {
      const u = users.get(userId);
      if (!u) throw new Error('User not found');
      Object.assign(u, {
        ...(patch.dateFormat !== undefined ? { dateFormat: patch.dateFormat } : {}),
        ...(patch.themePreference !== undefined ? { themePreference: patch.themePreference } : {}),
        ...(patch.notificationsEnabled !== undefined
          ? { notificationsEnabled: patch.notificationsEnabled }
          : {}),
        ...(patch.onboardingCompleted !== undefined
          ? { onboardingCompleted: patch.onboardingCompleted }
          : {}),
        updatedAt: nowIso,
      });
      return { ...u };
    },

    async updateUserPassword(userId, passwordHash, nowIso) {
      const u = users.get(userId);
      if (u) {
        u.passwordHash = passwordHash;
        u.updatedAt = nowIso;
      }
    },

    async deleteUserAccountCascade(userId) {
      users.delete(userId);
      for (const [k, s] of sessions) if (s.userId === userId) sessions.delete(k);
      for (const [k, m] of familyMembers) if (m.userId === userId) familyMembers.delete(k);
      for (const [k, m] of medicines) if (m.userId === userId) medicines.delete(k);
      for (const [k, rc] of reminderCycles) if (rc.userId === userId) reminderCycles.delete(k);
      for (const [k, ps] of pushSubs) if (ps.userId === userId) pushSubs.delete(k);
      for (let i = purchases.length - 1; i >= 0; i--) {
        if (purchases[i].userId === userId) purchases.splice(i, 1);
      }
      for (let i = adjustments.length - 1; i >= 0; i--) {
        if (adjustments[i].userId === userId) adjustments.splice(i, 1);
      }
      for (let i = notifications.length - 1; i >= 0; i--) {
        if (notifications[i].userId === userId) notifications.splice(i, 1);
      }
    },

    async createSession(input) {
      sessions.set(input.tokenHash, { ...input });
    },

    async findSessionWithUser(tokenHash) {
      const session = sessions.get(tokenHash);
      if (!session) return null;
      const user = users.get(session.userId);
      if (!user) return null;
      return { session: { ...session }, user: { ...user } };
    },

    async deleteSessionByTokenHash(tokenHash) {
      sessions.delete(tokenHash);
    },

    async deleteOtherSessions(userId, keepTokenHash) {
      for (const [k, s] of sessions) {
        if (s.userId === userId && k !== keepTokenHash) sessions.delete(k);
      }
    },

    async listFamilyMembers(userId, includeArchived) {
      return Array.from(familyMembers.values())
        .filter((m) => m.userId === userId && (includeArchived || !m.archived))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async findFamilyMemberById(userId, memberId) {
      const m = familyMembers.get(memberId);
      return m && m.userId === userId ? { ...m } : null;
    },

    async createFamilyMember(input) {
      const record: FamilyMember = {
        id: input.id,
        userId: input.userId,
        name: input.name,
        relationship: input.relationship,
        archived: false,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      };
      familyMembers.set(record.id, record);
      return { ...record };
    },

    async updateFamilyMember(userId, memberId, patch, nowIso) {
      const m = familyMembers.get(memberId);
      if (!m || m.userId !== userId) throw new Error('Not found');
      m.name = patch.name;
      m.relationship = patch.relationship;
      m.updatedAt = nowIso;
      return { ...m };
    },

    async countMemberRecords(userId, memberId) {
      const medicineCount = Array.from(medicines.values()).filter(
        (m) => m.userId === userId && m.familyMemberId === memberId
      ).length;
      const purchaseCount = purchases.filter(
        (p) => p.userId === userId && p.familyMemberId === memberId
      ).length;
      return { medicineCount, purchaseCount };
    },

    async archiveFamilyMember(userId, memberId, archiveMedicines, nowIso) {
      const m = familyMembers.get(memberId);
      if (m && m.userId === userId) {
        m.archived = true;
        m.updatedAt = nowIso;
      }
      if (archiveMedicines) {
        for (const med of medicines.values()) {
          if (med.userId === userId && med.familyMemberId === memberId) {
            med.archived = true;
            med.updatedAt = nowIso;
          }
        }
        for (const rc of reminderCycles.values()) {
          if (rc.userId === userId && rc.familyMemberId === memberId && rc.status === 'pending') {
            rc.status = 'cancelled';
            rc.updatedAt = nowIso;
          }
        }
      }
    },

    async reassignAndDeleteFamilyMember(userId, memberId, targetMemberId, nowIso) {
      const target = familyMembers.get(targetMemberId);
      for (const med of medicines.values()) {
        if (med.userId === userId && med.familyMemberId === memberId) {
          med.familyMemberId = targetMemberId;
          med.updatedAt = nowIso;
        }
      }
      for (const p of purchases) {
        if (p.userId === userId && p.familyMemberId === memberId) {
          p.familyMemberId = targetMemberId;
          if (target) p.familyMemberName = target.name;
        }
      }
      for (const rc of reminderCycles.values()) {
        if (rc.userId === userId && rc.familyMemberId === memberId) {
          rc.familyMemberId = targetMemberId;
          rc.updatedAt = nowIso;
        }
      }
      for (const n of notifications) {
        if (n.userId === userId && n.familyMemberId === memberId) {
          n.familyMemberId = targetMemberId;
          if (target) n.familyMemberName = target.name;
        }
      }
      familyMembers.delete(memberId);
    },

    async deleteFamilyMember(userId, memberId) {
      const m = familyMembers.get(memberId);
      if (m && m.userId === userId) familyMembers.delete(memberId);
    },

    async listMedicines(userId, options) {
      return Array.from(medicines.values())
        .filter((m) => {
          if (m.userId !== userId) return false;
          if (!options.includeArchived && m.archived) return false;
          if (options.familyMemberId && m.familyMemberId !== options.familyMemberId) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(hydrateMedicine);
    },

    async findMedicineById(userId, medicineId) {
      const m = medicines.get(medicineId);
      return m && m.userId === userId ? hydrateMedicine(m) : null;
    },

    async createMedicineWithInitialPurchase(input) {
      medicines.set(input.medicineId, {
        id: input.medicineId,
        userId: input.userId,
        familyMemberId: input.familyMemberId,
        name: input.name,
        initialQuantity: input.quantityPurchased,
        baselineQuantity: input.quantityPurchased,
        dailyUsage: input.dailyUsage,
        purchaseDate: input.purchaseDate,
        baselineDate: input.purchaseDate,
        notes: input.notes,
        remindersEnabled: input.remindersEnabled,
        archived: false,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      });
      const fm = familyMembers.get(input.familyMemberId);
      purchases.push({
        id: input.purchaseId,
        userId: input.userId,
        medicineId: input.medicineId,
        medicineName: input.name,
        familyMemberId: input.familyMemberId,
        familyMemberName: fm?.name ?? 'Unknown',
        purchaseDate: input.purchaseDate,
        quantityPurchased: input.quantityPurchased,
        previousRemaining: 0,
        resultingStock: input.quantityPurchased,
        notes: input.notes || 'Initial stock entry',
        createdAt: input.nowIso,
      });
    },

    async updateMedicine(userId, medicineId, patch, nowIso) {
      const m = medicines.get(medicineId);
      if (!m || m.userId !== userId) return;
      Object.assign(m, patch, { updatedAt: nowIso });
    },

    async recordPurchase(input) {
      purchases.push({
        id: input.purchaseId,
        userId: input.userId,
        medicineId: input.medicineId,
        medicineName: input.medicineName,
        familyMemberId: input.familyMemberId,
        familyMemberName: input.familyMemberName,
        purchaseDate: input.purchaseDate,
        quantityPurchased: input.quantityPurchased,
        previousRemaining: input.previousRemaining,
        resultingStock: input.resultingStock,
        notes: input.notes,
        createdAt: input.nowIso,
      });

      const m = medicines.get(input.medicineId);
      if (m && m.userId === input.userId) {
        m.baselineQuantity = input.resultingStock;
        m.baselineDate = input.newBaselineDate;
        m.purchaseDate = input.purchaseDate;
        m.updatedAt = input.nowIso;
      }

      for (const rc of reminderCycles.values()) {
        if (rc.userId === input.userId && rc.medicineId === input.medicineId && rc.status === 'pending') {
          rc.status = 'resolved';
          rc.resolvedAt = input.nowIso;
          rc.resolvedPurchaseId = input.purchaseId;
          rc.updatedAt = input.nowIso;
        }
      }

      notifications.push({
        id: input.notificationId,
        userId: input.userId,
        medicineId: input.medicineId,
        medicineName: input.medicineName,
        familyMemberId: input.familyMemberId,
        familyMemberName: input.familyMemberName,
        reminderCycleId: null,
        type: 'purchase_confirmed',
        title: 'Purchase Confirmed',
        body: `${input.familyMemberName}: Purchased ${input.quantityPurchased} tablets of ${input.medicineName}. Total stock is now ${input.resultingStock} tablets.`,
        scheduledForDate: input.purchaseDate,
        readAt: null,
        pushStatus: 'in_app_only',
        pushError: null,
        createdAt: input.nowIso,
      });
    },

    async recordStockAdjustment(input) {
      adjustments.push({
        id: input.adjustmentId,
        userId: input.userId,
        medicineId: input.medicineId,
        adjustmentDate: input.adjustmentDate,
        previousQuantity: input.previousQuantity,
        newQuantity: input.newQuantity,
        delta: input.delta,
        reason: input.reason,
        createdAt: input.nowIso,
      });
      const m = medicines.get(input.medicineId);
      if (m && m.userId === input.userId) {
        m.baselineQuantity = input.newQuantity;
        m.baselineDate = input.adjustmentDate;
        m.updatedAt = input.nowIso;
      }
    },

    async listPurchases(userId, options = {}) {
      const filtered = purchases
        .filter((p) => {
          if (p.userId !== userId) return false;
          if (options.medicineId && p.medicineId !== options.medicineId) return false;
          if (options.familyMemberId && p.familyMemberId !== options.familyMemberId) return false;
          return true;
        })
        .sort(
          (a, b) =>
            b.purchaseDate.localeCompare(a.purchaseDate) || b.createdAt.localeCompare(a.createdAt)
        );
      return options.limit ? filtered.slice(0, options.limit) : filtered;
    },

    async listStockAdjustments(userId, medicineId) {
      return adjustments
        .filter((a) => a.userId === userId && a.medicineId === medicineId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async listReminderCycles(userId, status) {
      return Array.from(reminderCycles.values())
        .filter((rc) => rc.userId === userId && (status === 'all' || rc.status === status))
        .map((rc) => {
          const med = medicines.get(rc.medicineId);
          const fm = familyMembers.get(rc.familyMemberId);
          return {
            ...rc,
            medicineName: med?.name ?? 'Unknown',
            familyMemberName: fm?.name ?? 'Unknown',
            baselineQuantity: med?.baselineQuantity ?? 0,
            dailyUsage: med?.dailyUsage ?? 1,
            baselineDate: med?.baselineDate ?? rc.stockEndDate,
            remindersEnabled: med?.remindersEnabled ?? true,
            medicineArchived: med?.archived ?? false,
          } satisfies StoredReminderCycleRecord;
        });
    },

    async findPendingReminderCycle(userId, medicineId) {
      for (const rc of reminderCycles.values()) {
        if (rc.userId === userId && rc.medicineId === medicineId && rc.status === 'pending') {
          return { id: rc.id };
        }
      }
      return null;
    },

    async createReminderCycle(input) {
      reminderCycles.set(input.id, {
        ...input,
        status: 'pending',
        resolvedAt: null,
        resolvedPurchaseId: null,
        lastNotifiedDate: null,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      });
    },

    async updateReminderCycleDates(cycleId, input) {
      const rc = reminderCycles.get(cycleId);
      if (rc) {
        rc.stockEndDate = input.stockEndDate;
        rc.firstReminderDate = input.firstReminderDate;
        rc.familyMemberId = input.familyMemberId;
        rc.updatedAt = input.nowIso;
      }
    },

    async updateReminderCycleStatus(cycleId, status, nowIso) {
      const rc = reminderCycles.get(cycleId);
      if (rc) {
        rc.status = status;
        rc.updatedAt = nowIso;
      }
    },

    async markReminderCycleNotified(cycleId, refDate, nowIso) {
      const rc = reminderCycles.get(cycleId);
      if (rc) {
        rc.lastNotifiedDate = refDate;
        rc.updatedAt = nowIso;
      }
    },

    async listNotifications(userId, limit = 100) {
      return notifications
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },

    async countUnreadNotifications(userId) {
      return notifications.filter((n) => n.userId === userId && !n.readAt).length;
    },

    async hasDailyRefillNotification(userId, medicineId, scheduledForDate) {
      return notifications.some(
        (n) =>
          n.userId === userId &&
          n.medicineId === medicineId &&
          n.scheduledForDate === scheduledForDate &&
          n.type === 'refill_reminder'
      );
    },

    async createNotification(input) {
      if (
        input.type === 'refill_reminder' &&
        input.medicineId &&
        input.scheduledForDate &&
        notifications.some(
          (n) =>
            n.userId === input.userId &&
            n.medicineId === input.medicineId &&
            n.scheduledForDate === input.scheduledForDate &&
            n.type === 'refill_reminder'
        )
      ) {
        return { inserted: false };
      }

      const med = input.medicineId ? medicines.get(input.medicineId) : null;
      const fm = input.familyMemberId ? familyMembers.get(input.familyMemberId) : null;
      notifications.push({
        id: input.id,
        userId: input.userId,
        medicineId: input.medicineId ?? null,
        medicineName: med?.name ?? null,
        familyMemberId: input.familyMemberId ?? null,
        familyMemberName: fm?.name ?? null,
        reminderCycleId: input.reminderCycleId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        scheduledForDate: input.scheduledForDate ?? null,
        readAt: null,
        pushStatus: input.pushStatus,
        pushError: input.pushError ?? null,
        createdAt: input.nowIso,
      });
      return { inserted: true };
    },

    async updateNotificationPushStatus(notificationId, pushStatus, pushError) {
      const n = notifications.find((x) => x.id === notificationId);
      if (n) {
        n.pushStatus = pushStatus;
        n.pushError = pushError;
      }
    },

    async markNotificationRead(userId, notificationId, nowIso) {
      const n = notifications.find((x) => x.id === notificationId && x.userId === userId);
      if (n && !n.readAt) n.readAt = nowIso;
    },

    async markAllNotificationsRead(userId, nowIso) {
      for (const n of notifications) {
        if (n.userId === userId && !n.readAt) n.readAt = nowIso;
      }
    },

    async listActivePushSubscriptions(userId) {
      return Array.from(pushSubs.values()).filter((s) => s.userId === userId && s.active);
    },

    async countActivePushSubscriptions(userId) {
      return Array.from(pushSubs.values()).filter((s) => s.userId === userId && s.active).length;
    },

    async upsertPushSubscription(input) {
      pushSubs.set(input.endpoint, {
        ...input,
        active: true,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      });
    },

    async deactivatePushSubscriptionById(id, nowIso) {
      for (const s of pushSubs.values()) {
        if (s.id === id) {
          s.active = false;
          s.updatedAt = nowIso;
        }
      }
    },

    async deactivatePushSubscriptions(userId, endpoint, nowIso) {
      for (const s of pushSubs.values()) {
        if (s.userId === userId && (!endpoint || s.endpoint === endpoint)) {
          s.active = false;
          s.updatedAt = nowIso;
        }
      }
    },
  };
}
