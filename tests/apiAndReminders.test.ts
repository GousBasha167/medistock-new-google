import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { runReminderScheduler } from '../server/reminders.ts';
import { createSupabaseStore } from '../server/supabaseStore.ts';
import { getTodayLocalDateStr } from '../src/shared/stockEngine.ts';
import { createTestStore } from './testStore.ts';

async function startTestServer() {
  const store = createTestStore();
  const app = createApp(store, { skipRateLimit: true });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { store, server, baseUrl };
}

async function apiCall(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  return { status: res.status, data };
}

describe('MediStock End-to-End API, Auth, Reminders & Data Isolation', () => {
  let store: ReturnType<typeof createTestStore>;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    const started = await startTestServer();
    store = started.store;
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns 503 with clear setup guidance when Supabase credentials are not configured', async () => {
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const sbApp = createApp(createSupabaseStore(), { skipRateLimit: true });
    const sbServer = await new Promise<ReturnType<typeof sbApp.listen>>((resolve) => {
      const s = sbApp.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = sbServer.address() as AddressInfo;
      const url = `http://127.0.0.1:${addr.port}`;
      const health = await apiCall(url, '/api/health');
      expect(health.status).toBe(200);
      expect(health.data.supabaseConfigured).toBe(false);

      const checkName = await apiCall(url, '/api/auth/check-name?name=Karthik');
      expect(checkName.status).toBe(503);
      expect(String(checkName.data.error)).toContain('SUPABASE_URL');
    } finally {
      await new Promise<void>((resolve) => sbServer.close(() => resolve()));
      if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl;
      if (prevKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  });

  it('handles signup, duplicate prevention, password hashing, login, and logout', async () => {
    const signup = await apiCall(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: { name: 'Karthik', password: 'secretpassword' },
    });
    expect(signup.status).toBe(201);
    expect(signup.data.user.name).toBe('Karthik');
    expect(signup.data.token).toBeTruthy();

    // Ensure password is never stored in plaintext
    const storedHash = store._debugGetUserPasswordHash('karthik');
    expect(storedHash).toBeTruthy();
    expect(storedHash).not.toBe('secretpassword');
    expect(storedHash!.includes(':')).toBe(true);

    // Duplicate username rejected (case-insensitive)
    const dup = await apiCall(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: { name: 'karthik', password: 'anotherpassword' },
    });
    expect(dup.status).toBe(409);

    // Wrong password rejected
    const badLogin = await apiCall(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { name: 'Karthik', password: 'wrong' },
    });
    expect(badLogin.status).toBe(401);

    // Correct login works
    const goodLogin = await apiCall(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { name: 'Karthik', password: 'secretpassword' },
    });
    expect(goodLogin.status).toBe(200);
    const token = goodLogin.data.token as string;

    // Logout invalidates session token
    const logout = await apiCall(baseUrl, '/api/auth/logout', { method: 'POST', token });
    expect(logout.status).toBe(200);

    const meAfterLogout = await apiCall(baseUrl, '/api/auth/me', { token });
    expect(meAfterLogout.status).toBe(401);
  });

  it('enforces strict cross-user data isolation', async () => {
    const userA = await apiCall(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: { name: 'UserA', password: 'password123' },
    });
    const userB = await apiCall(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: { name: 'UserB', password: 'password123' },
    });

    const tokenA = userA.data.token as string;
    const tokenB = userB.data.token as string;

    const memberA = await apiCall(baseUrl, '/api/family-members', {
      method: 'POST',
      token: tokenA,
      body: { name: 'Amma', relationship: 'Mother' },
    });
    expect(memberA.status).toBe(201);
    const memberAId = memberA.data.familyMember.id as string;

    const medA = await apiCall(baseUrl, '/api/medicines', {
      method: 'POST',
      token: tokenA,
      body: {
        name: 'Metformin 500mg',
        familyMemberId: memberAId,
        quantityPurchased: 30,
        dailyUsage: 2,
        purchaseDate: getTodayLocalDateStr(),
      },
    });
    expect(medA.status).toBe(201);
    const medAId = medA.data.medicine.id as string;

    const bGetMed = await apiCall(baseUrl, `/api/medicines/${medAId}`, { token: tokenB });
    expect(bGetMed.status).toBe(404);

    const bPurchase = await apiCall(baseUrl, `/api/medicines/${medAId}/purchase`, {
      method: 'POST',
      token: tokenB,
      body: { purchaseDate: getTodayLocalDateStr(), quantityPurchased: 10 },
    });
    expect(bPurchase.status).toBe(404);

    const bMember = await apiCall(baseUrl, `/api/family-members/${memberAId}`, { token: tokenB });
    expect(bMember.status).toBe(404);
  });

  it('triggers reminders 3 days ahead, prevents duplicates, and resolves only the purchased medicine', async () => {
    const signup = await apiCall(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: { name: 'Caregiver', password: 'password123' },
    });
    const token = signup.data.token as string;
    const userId = signup.data.user.id as string;

    const memberRes = await apiCall(baseUrl, '/api/family-members', {
      method: 'POST',
      token,
      body: { name: 'Amma', relationship: 'Mother' },
    });
    const memberId = memberRes.data.familyMember.id as string;

    const med1 = await apiCall(baseUrl, '/api/medicines', {
      method: 'POST',
      token,
      body: {
        name: 'Metformin 500mg',
        familyMemberId: memberId,
        quantityPurchased: 30,
        dailyUsage: 2,
        purchaseDate: '2026-10-28',
        remindersEnabled: true,
      },
    });
    const med2 = await apiCall(baseUrl, '/api/medicines', {
      method: 'POST',
      token,
      body: {
        name: 'Vitamin D',
        familyMemberId: memberId,
        quantityPurchased: 28,
        dailyUsage: 2,
        purchaseDate: '2026-10-28',
        remindersEnabled: true,
      },
    });
    const med3Disabled = await apiCall(baseUrl, '/api/medicines', {
      method: 'POST',
      token,
      body: {
        name: 'Disabled Med',
        familyMemberId: memberId,
        quantityPurchased: 6,
        dailyUsage: 2,
        purchaseDate: '2026-11-06',
        remindersEnabled: false,
      },
    });

    expect(med1.status).toBe(201);
    expect(med2.status).toBe(201);
    expect(med3Disabled.status).toBe(201);

    const run1 = await runReminderScheduler(store, {
      referenceDate: '2026-11-08',
      userId,
      skipWebPush: true,
    });
    expect(run1.createdNotifications).toBe(2);

    const run1Dup = await runReminderScheduler(store, {
      referenceDate: '2026-11-08',
      userId,
      skipWebPush: true,
    });
    expect(run1Dup.createdNotifications).toBe(0);

    const run2 = await runReminderScheduler(store, {
      referenceDate: '2026-11-09',
      userId,
      skipWebPush: true,
    });
    expect(run2.createdNotifications).toBe(2);

    const purchaseMed1 = await apiCall(baseUrl, `/api/medicines/${med1.data.medicine.id}/purchase`, {
      method: 'POST',
      token,
      body: { purchaseDate: '2026-11-09', quantityPurchased: 30, notes: 'Early refill' },
    });
    expect(purchaseMed1.status).toBe(201);
    expect(purchaseMed1.data.previousRemaining).toBe(6);
    expect(purchaseMed1.data.resultingStock).toBe(36);

    expect(store._debugGetPendingReminderMedicineIds(userId)).toEqual([med2.data.medicine.id]);

    const calRes = await apiCall(baseUrl, '/api/calendar', { token });
    expect(calRes.status).toBe(200);
    const eventTypes = new Set(
      (calRes.data.events as Array<{ type: string }>).map((e) => e.type)
    );
    expect(Array.from(eventTypes).every((t) => t === 'purchased' || t === 'to_purchase')).toBe(true);
  });

  it('safely reassigns medicines before deleting a family member and supports account deletion', async () => {
    const signup = await apiCall(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: { name: 'FamilyAdmin', password: 'password123' },
    });
    const token = signup.data.token as string;

    const m1 = await apiCall(baseUrl, '/api/family-members', {
      method: 'POST',
      token,
      body: { name: 'Grandpa' },
    });
    const m2 = await apiCall(baseUrl, '/api/family-members', {
      method: 'POST',
      token,
      body: { name: 'Grandma' },
    });

    await apiCall(baseUrl, '/api/medicines', {
      method: 'POST',
      token,
      body: {
        name: 'Calcium',
        familyMemberId: m1.data.familyMember.id,
        quantityPurchased: 30,
        dailyUsage: 1,
        purchaseDate: getTodayLocalDateStr(),
      },
    });

    const blocked = await apiCall(baseUrl, `/api/family-members/${m1.data.familyMember.id}`, {
      method: 'DELETE',
      token,
      body: { mode: 'delete_if_empty' },
    });
    expect(blocked.status).toBe(409);

    const reassigned = await apiCall(baseUrl, `/api/family-members/${m1.data.familyMember.id}`, {
      method: 'DELETE',
      token,
      body: { mode: 'reassign_and_delete', reassignToMemberId: m2.data.familyMember.id },
    });
    expect(reassigned.status).toBe(200);

    const meds = await apiCall(baseUrl, '/api/medicines', { token });
    expect(meds.data.medicines[0].familyMemberName).toBe('Grandma');

    const delAcc = await apiCall(baseUrl, '/api/account', {
      method: 'DELETE',
      token,
      body: { password: 'password123' },
    });
    expect(delAcc.status).toBe(200);

    const meAfterDelete = await apiCall(baseUrl, '/api/auth/me', { token });
    expect(meAfterDelete.status).toBe(401);
  });
});
