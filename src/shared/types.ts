export type StockStatus = 'IN_STOCK' | 'RUNNING_LOW' | 'PURCHASE_DUE' | 'OUT_OF_STOCK';

export type DateFormatOption = 'MMM d, yyyy' | 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd';

export type ThemePreference = 'light' | 'dark';

export interface UserProfile {
  id: string;
  name: string;
  dateFormat: DateFormatOption;
  themePreference: ThemePreference;
  notificationsEnabled: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface FamilyMember {
  id: string;
  userId: string;
  name: string;
  relationship: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyMemberWithStats extends FamilyMember {
  activeMedicineCount: number;
  pendingPurchaseCount: number;
  runningLowCount: number;
  outOfStockCount: number;
  overallStatus: StockStatus;
}

export interface Medicine {
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
  // Computed stock fields
  remainingTablets: number;
  remainingDays: number;
  totalDurationDays: number;
  daysUntilStockEnd: number;
  stockEndDate: string;
  firstReminderDate: string;
  stockStatus: StockStatus;
  progressPercent: number;
  isReminderActive: boolean;
}

export interface PurchaseTransaction {
  id: string;
  userId: string;
  medicineId: string;
  medicineName: string;
  familyMemberId: string;
  familyMemberName: string;
  purchaseDate: string;
  quantityPurchased: number;
  previousRemaining: number;
  resultingStock: number;
  notes: string | null;
  createdAt: string;
}

export interface StockAdjustment {
  id: string;
  userId: string;
  medicineId: string;
  adjustmentDate: string;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
  reason: string | null;
  createdAt: string;
}

export interface ReminderCycle {
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
  remainingTablets: number;
  remainingDays: number;
  daysUntilStockEnd: number;
  stockStatus: StockStatus;
  remindersEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  medicineId: string | null;
  medicineName: string | null;
  familyMemberId: string | null;
  familyMemberName: string | null;
  reminderCycleId: string | null;
  type: 'refill_reminder' | 'purchase_confirmed' | 'system';
  title: string;
  body: string;
  scheduledForDate: string | null;
  readAt: string | null;
  pushStatus: 'in_app_only' | 'sent' | 'failed' | 'no_subscription';
  pushError: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  stats: {
    activeMedicines: number;
    familyMembers: number;
    runningLow: number;
    purchaseDue: number;
    outOfStock: number;
  };
  upcomingPurchases: Medicine[];
  familyOverview: FamilyMemberWithStats[];
  recentPurchases: PurchaseTransaction[];
  unreadNotificationCount: number;
}

export interface CalendarEvent {
  id: string;
  type: 'purchased' | 'to_purchase';
  date: string;
  medicineId: string;
  medicineName: string;
  familyMemberId: string;
  familyMemberName: string;
  quantity?: number;
  remainingTablets?: number;
  notes?: string | null;
}
