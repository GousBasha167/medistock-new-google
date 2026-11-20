import type {
  AppNotification,
  DateFormatOption,
  FamilyMember,
  PurchaseTransaction,
  ReminderCycle,
  StockAdjustment,
  ThemePreference,
  UserProfile,
} from '../src/shared/types.ts';

export interface StoredUserRecord extends UserProfile {
  nameNormalized: string;
  passwordHash: string;
  updatedAt: string;
}

export interface StoredSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface StoredMedicineRecord {
  id: string;
  userId: string;
  familyMemberId: string;
  familyMemberName: string;
  familyMemberRelationship: string | null;
  name: string;
  initialQuantity: number;
  baselineQuantity: number;
  dailyUsage: number;
  purchaseDate: string;
  baselineDate: string;
  notes: string | null;
  remindersEnabled: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredReminderCycleRecord {
  id: string;
  userId: string;
  medicineId: string;
  medicineName: string;
  familyMemberId: string;
  familyMemberName: string;
  stockEndDate: string;
  firstReminderDate: string;
  status: 'pending' | 'resolved' | 'cancelled';
  resolvedAt: string | null;
  resolvedPurchaseId: string | null;
  lastNotifiedDate: string | null;
  baselineQuantity: number;
  dailyUsage: number;
  baselineDate: string;
  remindersEnabled: boolean;
  medicineArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MediStockStore {
  // Users & Sessions
  findUserByNormalizedName(nameNormalized: string): Promise<StoredUserRecord | null>;
  findUserById(userId: string): Promise<StoredUserRecord | null>;
  listAllUsers(): Promise<Array<{ id: string; notificationsEnabled: boolean }>>;
  createUser(input: {
    id: string;
    name: string;
    nameNormalized: string;
    passwordHash: string;
    nowIso: string;
  }): Promise<StoredUserRecord>;
  updateUserPreferences(
    userId: string,
    patch: {
      dateFormat?: DateFormatOption;
      themePreference?: ThemePreference;
      notificationsEnabled?: boolean;
      onboardingCompleted?: boolean;
    },
    nowIso: string
  ): Promise<StoredUserRecord>;
  updateUserPassword(userId: string, passwordHash: string, nowIso: string): Promise<void>;
  deleteUserAccountCascade(userId: string): Promise<void>;

  createSession(input: StoredSessionRecord): Promise<void>;
  findSessionWithUser(
    tokenHash: string
  ): Promise<{ session: StoredSessionRecord; user: StoredUserRecord } | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  deleteOtherSessions(userId: string, keepTokenHash: string): Promise<void>;

  // Family Members
  listFamilyMembers(userId: string, includeArchived: boolean): Promise<FamilyMember[]>;
  findFamilyMemberById(userId: string, memberId: string): Promise<FamilyMember | null>;
  createFamilyMember(input: {
    id: string;
    userId: string;
    name: string;
    relationship: string | null;
    nowIso: string;
  }): Promise<FamilyMember>;
  updateFamilyMember(
    userId: string,
    memberId: string,
    patch: { name: string; relationship: string | null },
    nowIso: string
  ): Promise<FamilyMember>;
  countMemberRecords(
    userId: string,
    memberId: string
  ): Promise<{ medicineCount: number; purchaseCount: number }>;
  archiveFamilyMember(
    userId: string,
    memberId: string,
    archiveMedicines: boolean,
    nowIso: string
  ): Promise<void>;
  reassignAndDeleteFamilyMember(
    userId: string,
    memberId: string,
    targetMemberId: string,
    nowIso: string
  ): Promise<void>;
  deleteFamilyMember(userId: string, memberId: string): Promise<void>;

  // Medicines
  listMedicines(
    userId: string,
    options: { includeArchived?: boolean; familyMemberId?: string }
  ): Promise<StoredMedicineRecord[]>;
  findMedicineById(userId: string, medicineId: string): Promise<StoredMedicineRecord | null>;
  createMedicineWithInitialPurchase(input: {
    medicineId: string;
    purchaseId: string;
    userId: string;
    familyMemberId: string;
    name: string;
    quantityPurchased: number;
    dailyUsage: number;
    purchaseDate: string;
    notes: string | null;
    remindersEnabled: boolean;
    nowIso: string;
  }): Promise<void>;
  updateMedicine(
    userId: string,
    medicineId: string,
    patch: {
      name: string;
      familyMemberId: string;
      baselineQuantity: number;
      baselineDate: string;
      dailyUsage: number;
      notes: string | null;
      remindersEnabled: boolean;
      archived: boolean;
    },
    nowIso: string
  ): Promise<void>;
  recordPurchase(input: {
    purchaseId: string;
    notificationId: string;
    userId: string;
    medicineId: string;
    medicineName: string;
    familyMemberId: string;
    familyMemberName: string;
    purchaseDate: string;
    quantityPurchased: number;
    previousRemaining: number;
    resultingStock: number;
    newBaselineDate: string;
    notes: string | null;
    nowIso: string;
  }): Promise<void>;
  recordStockAdjustment(input: {
    adjustmentId: string;
    userId: string;
    medicineId: string;
    adjustmentDate: string;
    previousQuantity: number;
    newQuantity: number;
    delta: number;
    reason: string | null;
    nowIso: string;
  }): Promise<void>;

  // Purchases & Adjustments
  listPurchases(
    userId: string,
    options?: { medicineId?: string; familyMemberId?: string; limit?: number }
  ): Promise<PurchaseTransaction[]>;
  listStockAdjustments(userId: string, medicineId: string): Promise<StockAdjustment[]>;

  // Reminder Cycles
  listReminderCycles(
    userId: string,
    status: 'pending' | 'resolved' | 'all'
  ): Promise<StoredReminderCycleRecord[]>;
  findPendingReminderCycle(
    userId: string,
    medicineId: string
  ): Promise<{ id: string } | null>;
  createReminderCycle(input: {
    id: string;
    userId: string;
    medicineId: string;
    familyMemberId: string;
    stockEndDate: string;
    firstReminderDate: string;
    nowIso: string;
  }): Promise<void>;
  updateReminderCycleDates(
    cycleId: string,
    input: { stockEndDate: string; firstReminderDate: string; familyMemberId: string; nowIso: string }
  ): Promise<void>;
  updateReminderCycleStatus(
    cycleId: string,
    status: 'cancelled' | 'resolved',
    nowIso: string
  ): Promise<void>;
  markReminderCycleNotified(cycleId: string, refDate: string, nowIso: string): Promise<void>;

  // Notifications
  listNotifications(userId: string, limit?: number): Promise<AppNotification[]>;
  countUnreadNotifications(userId: string): Promise<number>;
  hasDailyRefillNotification(
    userId: string,
    medicineId: string,
    scheduledForDate: string
  ): Promise<boolean>;
  createNotification(input: {
    id: string;
    userId: string;
    medicineId?: string | null;
    familyMemberId?: string | null;
    reminderCycleId?: string | null;
    type: 'refill_reminder' | 'purchase_confirmed' | 'system';
    title: string;
    body: string;
    scheduledForDate?: string | null;
    pushStatus: 'in_app_only' | 'sent' | 'failed' | 'no_subscription';
    pushError?: string | null;
    nowIso: string;
  }): Promise<{ inserted: boolean }>;
  updateNotificationPushStatus(
    notificationId: string,
    pushStatus: 'in_app_only' | 'sent' | 'failed' | 'no_subscription',
    pushError: string | null
  ): Promise<void>;
  markNotificationRead(userId: string, notificationId: string, nowIso: string): Promise<void>;
  markAllNotificationsRead(userId: string, nowIso: string): Promise<void>;

  // Push Subscriptions
  listActivePushSubscriptions(userId: string): Promise<StoredPushSubscription[]>;
  countActivePushSubscriptions(userId: string): Promise<number>;
  upsertPushSubscription(input: {
    id: string;
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
    nowIso: string;
  }): Promise<void>;
  deactivatePushSubscriptionById(id: string, nowIso: string): Promise<void>;
  deactivatePushSubscriptions(userId: string, endpoint: string | null, nowIso: string): Promise<void>;
}

export type HydratedReminderCycle = ReminderCycle;
