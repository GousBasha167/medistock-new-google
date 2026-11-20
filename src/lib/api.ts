import type {
  AppNotification,
  CalendarEvent,
  DashboardSummary,
  DateFormatOption,
  FamilyMemberWithStats,
  Medicine,
  PurchaseTransaction,
  ReminderCycle,
  StockAdjustment,
  ThemePreference,
  UserProfile,
} from '../shared/types.ts';

const TOKEN_STORAGE_KEY = 'medistock_auth_token';

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage unavailability
  }
}

let onUnauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorizedHandler = fn;
}

const API_BASE_URL = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(
      'We couldn’t connect to MediStock. Check your internet connection and try again.',
      0
    );
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/signup')) {
      setStoredToken(null);
      if (onUnauthorizedHandler && path !== '/api/auth/me') {
        onUnauthorizedHandler();
      }
    }
    const msg =
      (data as { error?: string } | null)?.error ||
      `Request failed (${res.status}). Please try again.`;
    throw new ApiError(msg, res.status, data);
  }

  return data as T;
}

export const api = {
  health: () =>
    request<{
      ok: boolean;
      supabaseConfigured: boolean;
      schemaReady: boolean;
      message?: string;
    }>('/api/health'),

  getMigrationSql: () => request<{ sql: string }>('/api/setup/migration-sql'),

  checkNameAvailable: (name: string) =>
    request<{ available: boolean; reason?: string }>(
      `/api/auth/check-name?name=${encodeURIComponent(name)}`
    ),

  signup: async (name: string, password: string) => {
    const res = await request<{ user: UserProfile; token: string }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  login: async (name: string, password: string) => {
    const res = await request<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  logout: async () => {
    try {
      await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  me: () => request<{ user: UserProfile }>('/api/auth/me'),

  updatePreferences: (prefs: {
    dateFormat?: DateFormatOption;
    themePreference?: ThemePreference;
    notificationsEnabled?: boolean;
    onboardingCompleted?: boolean;
  }) =>
    request<{ user: UserProfile }>('/api/account/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>('/api/account/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  exportData: () => request<Record<string, unknown>>('/api/account/export'),

  deleteAccount: async (password: string) => {
    const res = await request<{ ok: boolean }>('/api/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    setStoredToken(null);
    return res;
  },

  getDashboard: () => request<DashboardSummary>('/api/dashboard'),

  getFamilyMembers: (includeArchived = false) =>
    request<{ familyMembers: FamilyMemberWithStats[] }>(
      `/api/family-members?includeArchived=${includeArchived}`
    ),

  getFamilyMemberDetails: (id: string) =>
    request<{
      member: FamilyMemberWithStats;
      medicines: Medicine[];
      upcomingPurchases: Medicine[];
      recentPurchases: PurchaseTransaction[];
    }>(`/api/family-members/${id}`),

  createFamilyMember: (payload: { name: string; relationship?: string | null }) =>
    request<{ familyMember: FamilyMemberWithStats }>('/api/family-members', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateFamilyMember: (id: string, payload: { name?: string; relationship?: string | null }) =>
    request<{ familyMember: FamilyMemberWithStats }>(`/api/family-members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteFamilyMember: (
    id: string,
    payload: {
      mode: 'archive' | 'reassign_and_delete' | 'delete_if_empty';
      reassignToMemberId?: string;
      archiveMedicines?: boolean;
    }
  ) =>
    request<{ ok: boolean; action: string }>(`/api/family-members/${id}`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    }),

  getMedicines: (includeArchived = false) =>
    request<{ medicines: Medicine[] }>(`/api/medicines?includeArchived=${includeArchived}`),

  getMedicineDetails: (id: string) =>
    request<{
      medicine: Medicine;
      purchases: PurchaseTransaction[];
      adjustments: StockAdjustment[];
      reminderCycles: ReminderCycle[];
    }>(`/api/medicines/${id}`),

  createMedicine: (payload: {
    name: string;
    familyMemberId: string;
    quantityPurchased: number;
    dailyUsage: number;
    purchaseDate: string;
    notes?: string | null;
    remindersEnabled?: boolean;
  }) =>
    request<{ medicine: Medicine }>('/api/medicines', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMedicine: (
    id: string,
    payload: {
      name?: string;
      familyMemberId?: string;
      dailyUsage?: number;
      notes?: string | null;
      remindersEnabled?: boolean;
      archived?: boolean;
    }
  ) =>
    request<{ medicine: Medicine }>(`/api/medicines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  markPurchased: (
    id: string,
    payload: { purchaseDate: string; quantityPurchased: number; notes?: string | null }
  ) =>
    request<{
      medicine: Medicine;
      purchaseId: string;
      previousRemaining: number;
      resultingStock: number;
    }>(`/api/medicines/${id}/purchase`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adjustStock: (id: string, payload: { newQuantity: number; reason?: string | null }) =>
    request<{ medicine: Medicine }>(`/api/medicines/${id}/adjust`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPurchases: (familyMemberId?: string) =>
    request<{ purchases: PurchaseTransaction[] }>(
      `/api/purchases${familyMemberId ? `?familyMemberId=${encodeURIComponent(familyMemberId)}` : ''}`
    ),

  getCalendarEvents: (familyMemberId?: string) =>
    request<{ events: CalendarEvent[] }>(
      `/api/calendar${familyMemberId ? `?familyMemberId=${encodeURIComponent(familyMemberId)}` : ''}`
    ),

  getReminders: () =>
    request<{ pending: ReminderCycle[]; history: ReminderCycle[] }>('/api/reminders'),

  getNotifications: () =>
    request<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications'),

  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),

  markAllNotificationsRead: () =>
    request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  getVapidPublicKey: () =>
    request<{ publicKey: string; configured: boolean }>('/api/push/vapid-public-key'),

  getPushStatus: () =>
    request<{ activeSubscriptionsCount: number; vapidConfigured: boolean }>('/api/push/status'),

  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: boolean }>('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(sub),
    }),

  unsubscribePush: (endpoint?: string) =>
    request<{ ok: boolean }>('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }),

  sendTestPush: () =>
    request<{
      status: 'sent' | 'failed' | 'no_subscription';
      deliveredCount: number;
      failedCount: number;
      error: string | null;
    }>('/api/push/test', { method: 'POST' }),
};
