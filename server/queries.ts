import type { MediStockStore, StoredMedicineRecord } from './store.ts';
import {
  evaluateMedicineStock,
  getTodayLocalDateStr,
} from '../src/shared/stockEngine.ts';
import type {
  AppNotification,
  CalendarEvent,
  DashboardSummary,
  FamilyMember,
  FamilyMemberWithStats,
  Medicine,
  PurchaseTransaction,
  ReminderCycle,
  StockAdjustment,
  StockStatus,
} from '../src/shared/types.ts';

export function hydrateMedicineRecord(row: StoredMedicineRecord, referenceDate?: string): Medicine {
  const refDate = referenceDate ?? getTodayLocalDateStr();
  const evalResult = evaluateMedicineStock({
    baselineQuantity: Number(row.baselineQuantity),
    dailyUsage: Number(row.dailyUsage),
    baselineDate: row.baselineDate,
    referenceDate: refDate,
  });

  return {
    id: row.id,
    userId: row.userId,
    familyMemberId: row.familyMemberId,
    familyMemberName: row.familyMemberName,
    familyMemberRelationship: row.familyMemberRelationship,
    name: row.name,
    initialQuantity: Number(row.initialQuantity),
    baselineQuantity: Number(row.baselineQuantity),
    dailyUsage: Number(row.dailyUsage),
    purchaseDate: row.purchaseDate,
    baselineDate: row.baselineDate,
    notes: row.notes,
    remindersEnabled: row.remindersEnabled,
    archived: row.archived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    remainingTablets: evalResult.remainingTablets,
    remainingDays: evalResult.remainingDays,
    totalDurationDays: evalResult.totalDurationDays,
    daysUntilStockEnd: evalResult.daysUntilStockEnd,
    stockEndDate: evalResult.stockEndDate,
    firstReminderDate: evalResult.firstReminderDate,
    stockStatus: evalResult.stockStatus,
    progressPercent: evalResult.progressPercent,
    isReminderActive: row.remindersEnabled && evalResult.isReminderWindowOpen,
  };
}

export async function getUserMedicines(
  store: MediStockStore,
  userId: string,
  options: { includeArchived?: boolean; familyMemberId?: string; referenceDate?: string } = {}
): Promise<Medicine[]> {
  const rows = await store.listMedicines(userId, {
    includeArchived: options.includeArchived,
    familyMemberId: options.familyMemberId,
  });
  return rows.map((r) => hydrateMedicineRecord(r, options.referenceDate));
}

export async function getUserMedicineById(
  store: MediStockStore,
  userId: string,
  medicineId: string,
  referenceDate?: string
): Promise<Medicine | null> {
  const row = await store.findMedicineById(userId, medicineId);
  if (!row) return null;
  return hydrateMedicineRecord(row, referenceDate);
}

export async function getUserFamilyMembers(
  store: MediStockStore,
  userId: string,
  options: { includeArchived?: boolean; referenceDate?: string } = {}
): Promise<FamilyMemberWithStats[]> {
  const [members, activeMedicines] = await Promise.all([
    store.listFamilyMembers(userId, Boolean(options.includeArchived)),
    getUserMedicines(store, userId, {
      includeArchived: false,
      referenceDate: options.referenceDate,
    }),
  ]);

  const medsByMember = new Map<string, Medicine[]>();
  for (const med of activeMedicines) {
    const arr = medsByMember.get(med.familyMemberId) || [];
    arr.push(med);
    medsByMember.set(med.familyMemberId, arr);
  }

  return members.map((m) => {
    const meds = medsByMember.get(m.id) || [];
    let pendingPurchaseCount = 0;
    let runningLowCount = 0;
    let outOfStockCount = 0;

    for (const med of meds) {
      if (med.stockStatus === 'OUT_OF_STOCK') {
        outOfStockCount++;
        pendingPurchaseCount++;
      } else if (med.stockStatus === 'PURCHASE_DUE') {
        pendingPurchaseCount++;
      } else if (med.stockStatus === 'RUNNING_LOW') {
        runningLowCount++;
      }
    }

    let overallStatus: StockStatus = 'IN_STOCK';
    if (outOfStockCount > 0) overallStatus = 'OUT_OF_STOCK';
    else if (pendingPurchaseCount > 0) overallStatus = 'PURCHASE_DUE';
    else if (runningLowCount > 0) overallStatus = 'RUNNING_LOW';

    return {
      ...m,
      activeMedicineCount: meds.length,
      pendingPurchaseCount,
      runningLowCount,
      outOfStockCount,
      overallStatus,
    };
  });
}

export async function getFamilyMemberById(
  store: MediStockStore,
  userId: string,
  memberId: string
): Promise<FamilyMember | null> {
  return store.findFamilyMemberById(userId, memberId);
}

export async function getPurchaseTransactions(
  store: MediStockStore,
  userId: string,
  options: { medicineId?: string; familyMemberId?: string; limit?: number } = {}
): Promise<PurchaseTransaction[]> {
  return store.listPurchases(userId, options);
}

export async function getStockAdjustments(
  store: MediStockStore,
  userId: string,
  medicineId: string
): Promise<StockAdjustment[]> {
  return store.listStockAdjustments(userId, medicineId);
}

export async function getCalendarEvents(
  store: MediStockStore,
  userId: string,
  options: { familyMemberId?: string; referenceDate?: string } = {}
): Promise<CalendarEvent[]> {
  const [purchases, medicines] = await Promise.all([
    getPurchaseTransactions(store, userId, {
      familyMemberId: options.familyMemberId,
    }),
    getUserMedicines(store, userId, {
      includeArchived: false,
      familyMemberId: options.familyMemberId,
      referenceDate: options.referenceDate,
    }),
  ]);

  const events: CalendarEvent[] = [];

  for (const p of purchases) {
    events.push({
      id: `purchase_${p.id}`,
      type: 'purchased',
      date: p.purchaseDate,
      medicineId: p.medicineId,
      medicineName: p.medicineName,
      familyMemberId: p.familyMemberId,
      familyMemberName: p.familyMemberName,
      quantity: p.quantityPurchased,
      notes: p.notes,
    });
  }

  for (const m of medicines) {
    events.push({
      id: `topurchase_${m.id}`,
      type: 'to_purchase',
      date: m.stockEndDate,
      medicineId: m.id,
      medicineName: m.name,
      familyMemberId: m.familyMemberId,
      familyMemberName: m.familyMemberName,
      remainingTablets: m.remainingTablets,
    });
  }

  return events;
}

export async function getReminderCycles(
  store: MediStockStore,
  userId: string,
  status: 'pending' | 'resolved' | 'all' = 'all',
  referenceDate?: string
): Promise<ReminderCycle[]> {
  const rows = await store.listReminderCycles(userId, status);
  const refDate = referenceDate ?? getTodayLocalDateStr();

  return rows
    .filter((r) => !(r.status === 'pending' && r.medicineArchived))
    .map((r) => {
      const evaluated = evaluateMedicineStock({
        baselineQuantity: r.baselineQuantity,
        dailyUsage: r.dailyUsage,
        baselineDate: r.baselineDate,
        referenceDate: refDate,
      });

      return {
        id: r.id,
        userId: r.userId,
        medicineId: r.medicineId,
        medicineName: r.medicineName,
        familyMemberId: r.familyMemberId,
        familyMemberName: r.familyMemberName,
        stockEndDate: r.stockEndDate,
        firstReminderDate: r.firstReminderDate,
        status: r.status,
        resolvedAt: r.resolvedAt,
        resolvedPurchaseId: r.resolvedPurchaseId,
        lastNotifiedDate: r.lastNotifiedDate,
        remainingTablets: evaluated.remainingTablets,
        remainingDays: evaluated.remainingDays,
        daysUntilStockEnd: evaluated.daysUntilStockEnd,
        stockStatus: evaluated.stockStatus,
        remindersEnabled: r.remindersEnabled,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });
}

export async function getUserNotifications(
  store: MediStockStore,
  userId: string,
  limit = 100
): Promise<AppNotification[]> {
  return store.listNotifications(userId, limit);
}

export async function getDashboardSummary(
  store: MediStockStore,
  userId: string,
  referenceDate?: string
): Promise<DashboardSummary> {
  const [medicines, familyOverview, recentPurchases, unreadNotificationCount] = await Promise.all([
    getUserMedicines(store, userId, { includeArchived: false, referenceDate }),
    getUserFamilyMembers(store, userId, { includeArchived: false, referenceDate }),
    getPurchaseTransactions(store, userId, { limit: 6 }),
    store.countUnreadNotifications(userId),
  ]);

  let runningLow = 0;
  let purchaseDue = 0;
  let outOfStock = 0;

  for (const m of medicines) {
    if (m.stockStatus === 'RUNNING_LOW') runningLow++;
    else if (m.stockStatus === 'PURCHASE_DUE') purchaseDue++;
    else if (m.stockStatus === 'OUT_OF_STOCK') {
      outOfStock++;
      purchaseDue++;
    }
  }

  const upcomingPurchases = [...medicines]
    .sort((a, b) => a.stockEndDate.localeCompare(b.stockEndDate))
    .slice(0, 6);

  return {
    stats: {
      activeMedicines: medicines.length,
      familyMembers: familyOverview.length,
      runningLow,
      purchaseDue,
      outOfStock,
    },
    upcomingPurchases,
    familyOverview,
    recentPurchases,
    unreadNotificationCount,
  };
}
