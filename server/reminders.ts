import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import type webpushType from 'web-push';
import type { MediStockStore, StoredPushSubscription } from './store.ts';
import { getUserMedicines } from './queries.ts';
import { getTodayLocalDateStr } from '../src/shared/stockEngine.ts';

let webpushLib: any = null;
async function getWebPush() {
  if (!webpushLib) {
    try {
      const mod = await import('web-push');
      webpushLib = mod.default || mod;
    } catch {
      webpushLib = null;
    }
  }
  return webpushLib;
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
  configured: boolean;
}

let cachedVapid: VapidConfig | null = null;

export function getVapidConfig(): VapidConfig {
  if (cachedVapid) return cachedVapid;

  const subject = process.env.VAPID_SUBJECT || 'mailto:support@medistock.app';
  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();

  if (envPublic && envPrivate) {
    cachedVapid = { publicKey: envPublic, privateKey: envPrivate, subject, configured: true };
    return cachedVapid;
  }

  cachedVapid = {
    publicKey: envPublic || '',
    privateKey: envPrivate || '',
    subject,
    configured: Boolean(envPublic && envPrivate),
  };
  return cachedVapid;
}

async function deliverSingleWebPush(
  store: MediStockStore,
  sub: StoredPushSubscription,
  payloadJson: string
): Promise<{ ok: boolean; error?: string }> {
  const wp = await getWebPush();
  if (!wp) {
    return { ok: false, error: 'Push service not available.' };
  }

  const cfg = getVapidConfig();
  if (!cfg.configured) {
    return { ok: false, error: 'VAPID keys not configured.' };
  }

  try {
    wp.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  } catch {
    // Ignore setVapidDetails errors
  }

  const subscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await wp.sendNotification(subscription, payloadJson, { TTL: 86400 });
      return { ok: true };
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const msg = (err as Error)?.message || 'Push delivery failed';
      if (statusCode === 404 || statusCode === 410) {
        await store.deactivatePushSubscriptionById(sub.id, new Date().toISOString());
        return { ok: false, error: `Subscription expired (${statusCode})` };
      }
      if (attempt === 1) {
        return { ok: false, error: msg };
      }
    }
  }
  return { ok: false, error: 'Push delivery failed' };
}

export async function dispatchWebPushToUser(
  store: MediStockStore,
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string; medicineId?: string }
): Promise<{
  status: 'sent' | 'failed' | 'no_subscription';
  deliveredCount: number;
  failedCount: number;
  lastError: string | null;
}> {
  const subs = await store.listActivePushSubscriptions(userId);
  if (subs.length === 0) {
    return { status: 'no_subscription', deliveredCount: 0, failedCount: 0, lastError: null };
  }

  const payloadJson = JSON.stringify(payload);
  let deliveredCount = 0;
  let failedCount = 0;
  let lastError: string | null = null;

  for (const sub of subs) {
    const result = await deliverSingleWebPush(store, sub, payloadJson);
    if (result.ok) deliveredCount++;
    else {
      failedCount++;
      lastError = result.error ?? 'Unknown push error';
    }
  }

  return {
    status: deliveredCount > 0 ? 'sent' : 'failed',
    deliveredCount,
    failedCount,
    lastError,
  };
}

/**
 * Syncs open/cancelled reminder cycles for a single medicine without sending notifications.
 */
export async function syncMedicineReminderCycle(
  store: MediStockStore,
  userId: string,
  medicineId: string,
  referenceDate?: string
): Promise<void> {
  const refDate = referenceDate ?? getTodayLocalDateStr();
  const meds = await getUserMedicines(store, userId, {
    includeArchived: true,
    referenceDate: refDate,
  });
  const med = meds.find((m) => m.id === medicineId);
  const nowIso = new Date().toISOString();

  const existingPending = await store.findPendingReminderCycle(userId, medicineId);

  if (!med || med.archived || !med.remindersEnabled) {
    if (existingPending) {
      await store.updateReminderCycleStatus(existingPending.id, 'cancelled', nowIso);
    }
    return;
  }

  const shouldBePending = med.remainingTablets <= 0 || refDate >= med.firstReminderDate;

  if (shouldBePending) {
    if (existingPending) {
      await store.updateReminderCycleDates(existingPending.id, {
        stockEndDate: med.stockEndDate,
        firstReminderDate: med.firstReminderDate,
        familyMemberId: med.familyMemberId,
        nowIso,
      });
    } else {
      await store.createReminderCycle({
        id: crypto.randomUUID(),
        userId,
        medicineId: med.id,
        familyMemberId: med.familyMemberId,
        stockEndDate: med.stockEndDate,
        firstReminderDate: med.firstReminderDate,
        nowIso,
      });
    }
  } else if (existingPending) {
    await store.updateReminderCycleStatus(existingPending.id, 'cancelled', nowIso);
  }
}

/**
 * Evaluates due medicines across users (or a specific user), opens reminder cycles,
 * generates duplicate-proof daily in-app notifications, and sends Web Push alerts.
 */
export async function runReminderScheduler(
  store: MediStockStore,
  options: { referenceDate?: string; userId?: string; skipWebPush?: boolean } = {}
): Promise<{ createdNotifications: number; pushSent: number }> {
  const refDate = options.referenceDate ?? getTodayLocalDateStr();
  const userRows = options.userId
    ? (() => {
        return store.findUserById(options.userId).then((u) =>
          u ? [{ id: u.id, notificationsEnabled: u.notificationsEnabled }] : []
        );
      })()
    : store.listAllUsers();

  const users = await userRows;
  let createdNotifications = 0;
  let pushSent = 0;

  for (const user of users) {
    const meds = await getUserMedicines(store, user.id, {
      includeArchived: false,
      referenceDate: refDate,
    });

    for (const med of meds) {
      await syncMedicineReminderCycle(store, user.id, med.id, refDate);
    }

    if (!user.notificationsEnabled) {
      continue;
    }

    const dueMeds = meds.filter(
      (m) => m.remindersEnabled && (m.remainingTablets <= 0 || refDate >= m.firstReminderDate)
    );

    if (dueMeds.length === 0) continue;

    const newMedNotifications: Array<{
      notificationId: string;
      cycleId: string | null;
      medName: string;
      memberName: string;
      medicineId: string;
      familyMemberId: string;
      remainingDays: number;
      remainingTablets: number;
      body: string;
    }> = [];

    for (const med of dueMeds) {
      const exists = await store.hasDailyRefillNotification(user.id, med.id, refDate);
      if (exists) continue;

      const cycle = await store.findPendingReminderCycle(user.id, med.id);

      const statusPhrase =
        med.remainingTablets <= 0
          ? 'Out of stock — purchase needed today.'
          : med.daysUntilStockEnd === 0
            ? 'Stock ends today.'
            : `${med.daysUntilStockEnd} ${med.daysUntilStockEnd === 1 ? 'day' : 'days'} remaining (${med.remainingTablets} tablets left).`;

      const body = `${med.familyMemberName}: ${med.name} — ${statusPhrase}`;
      const notificationId = crypto.randomUUID();
      const nowIso = new Date().toISOString();

      const { inserted } = await store.createNotification({
        id: notificationId,
        userId: user.id,
        medicineId: med.id,
        familyMemberId: med.familyMemberId,
        reminderCycleId: cycle?.id ?? null,
        type: 'refill_reminder',
        title: 'MediStock — Medicine Refill Reminder',
        body,
        scheduledForDate: refDate,
        pushStatus: 'in_app_only',
        nowIso,
      });

      if (!inserted) continue;

      if (cycle) {
        await store.markReminderCycleNotified(cycle.id, refDate, nowIso);
      }

      createdNotifications++;
      newMedNotifications.push({
        notificationId,
        cycleId: cycle?.id ?? null,
        medName: med.name,
        memberName: med.familyMemberName,
        medicineId: med.id,
        familyMemberId: med.familyMemberId,
        remainingDays: med.daysUntilStockEnd,
        remainingTablets: med.remainingTablets,
        body,
      });
    }

    if (newMedNotifications.length > 0 && !options.skipWebPush) {
      const byMember = new Map<string, typeof newMedNotifications>();
      for (const item of newMedNotifications) {
        const list = byMember.get(item.memberName) || [];
        list.push(item);
        byMember.set(item.memberName, list);
      }

      const summaryParts: string[] = [];
      for (const [memberName, items] of byMember.entries()) {
        if (items.length === 1) {
          summaryParts.push(items[0].body);
        } else {
          summaryParts.push(
            `${memberName} has ${items.length} medicines that need attention (${items.map((i) => i.medName).join(', ')}).`
          );
        }
      }

      const pushResult = await dispatchWebPushToUser(store, user.id, {
        title: 'MediStock — Medicine Refill Reminder',
        body: summaryParts.join(' '),
        url: '/?view=reminders',
        tag: `medistock-refill-${refDate}`,
      });

      if (pushResult.status === 'sent') pushSent++;

      for (const item of newMedNotifications) {
        await store.updateNotificationPushStatus(
          item.notificationId,
          pushResult.status,
          pushResult.lastError
        );
      }
    }
  }

  return { createdNotifications, pushSent };
}
