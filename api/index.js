// server/serverless.ts
import "dotenv/config";

// server/app.ts
import crypto3 from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import { z } from "zod";

// server/auth.ts
import crypto from "node:crypto";
var SESSION_COOKIE_NAME = "medistock_session";
var SESSION_TTL_DAYS = 30;
function normalizeUserName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}
function hashSessionToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
function toPublicUser(record) {
  return {
    id: record.id,
    name: record.name,
    dateFormat: record.dateFormat,
    themePreference: record.themePreference,
    notificationsEnabled: record.notificationsEnabled,
    onboardingCompleted: record.onboardingCompleted,
    createdAt: record.createdAt
  };
}
async function createSession(store2, userId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const now = /* @__PURE__ */ new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 864e5);
  const id = crypto.randomUUID();
  await store2.createSession({
    id,
    userId,
    tokenHash,
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString()
  });
  return { rawToken, expiresAt: expires.toISOString() };
}
function extractSessionToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (cookieToken && typeof cookieToken === "string") {
    return cookieToken;
  }
  return null;
}
function createAuthMiddleware(store2) {
  return async (req, res, next) => {
    try {
      const rawToken = extractSessionToken(req);
      if (!rawToken) {
        return res.status(401).json({ error: "Authentication required. Please log in." });
      }
      const tokenHash = hashSessionToken(rawToken);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const found = await store2.findSessionWithUser(tokenHash);
      if (!found) {
        return res.status(401).json({ error: "Session expired or invalid. Please log in again." });
      }
      if (found.session.expiresAt <= nowIso) {
        await store2.deleteSessionByTokenHash(tokenHash);
        return res.status(401).json({ error: "Your session has expired. Please log in again." });
      }
      req.user = toPublicUser(found.user);
      req.sessionTokenHash = tokenHash;
      next();
    } catch (err) {
      next(err);
    }
  };
}
function setSessionCookie(res, rawToken, expiresAt, req) {
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: isSecure ? "none" : "lax",
    secure: isSecure,
    expires: new Date(expiresAt),
    path: "/"
  });
}
function clearSessionCookie(res, req) {
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isSecure ? "none" : "lax",
    secure: isSecure,
    path: "/"
  });
}
function createRateLimiter(options) {
  const hits = /* @__PURE__ */ new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > cutoff);
    if (timestamps.length >= options.maxRequests) {
      return res.status(429).json({
        error: "Too many attempts. Please wait a moment and try again."
      });
    }
    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

// server/supabaseStore.ts
import { createClient } from "@supabase/supabase-js";
var StoreError = class extends Error {
  constructor(message, status = 500, cause, code = "QUERY_FAILED") {
    super(message, { cause });
    this.name = "StoreError";
    this.status = status;
    this.code = code;
  }
};
function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(url && key && url.startsWith("http"));
}
function isMissingSchemaError(error) {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return error.code === "42P01" || error.code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
}
var cachedSchemaReady = false;
async function checkSupabaseSchema() {
  if (!isSupabaseConfigured()) {
    cachedSchemaReady = false;
    return {
      configured: false,
      schemaReady: false,
      reason: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured."
    };
  }
  if (cachedSchemaReady) {
    return { configured: true, schemaReady: true };
  }
  try {
    const sb = getSupabaseClient();
    const { error } = await sb.from("users").select("id").limit(1);
    if (!error) {
      cachedSchemaReady = true;
      return { configured: true, schemaReady: true };
    }
    if (isMissingSchemaError(error)) {
      return {
        configured: true,
        schemaReady: false,
        reason: "MediStock database tables were not found in your Supabase project. Run supabase/migrations/001_medistock_schema.sql in your Supabase SQL Editor."
      };
    }
    return {
      configured: true,
      schemaReady: false,
      reason: error.message || "Unable to verify Supabase schema."
    };
  } catch (err) {
    return {
      configured: true,
      schemaReady: false,
      reason: err instanceof Error ? err.message : "Unable to reach Supabase."
    };
  }
}
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new StoreError(
      "Supabase is not configured yet. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment secrets and restart the server.",
      503,
      void 0,
      "NOT_CONFIGURED"
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
function throwIfError(error, context) {
  if (!error) return;
  if (isMissingSchemaError(error)) {
    cachedSchemaReady = false;
    throw new StoreError(
      "MediStock database tables were not found in your Supabase project. Please run supabase/migrations/001_medistock_schema.sql in your Supabase SQL Editor.",
      503,
      error,
      "SCHEMA_MISSING"
    );
  }
  console.error(`Supabase error (${context}):`, error);
  throw new StoreError(
    "Database request failed. Please check your Supabase connection and try again.",
    500,
    error,
    "QUERY_FAILED"
  );
}
function mapUser(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    nameNormalized: String(row.name_normalized),
    passwordHash: String(row.password_hash),
    dateFormat: row.date_format || "MMM d, yyyy",
    themePreference: row.theme_preference || "light",
    notificationsEnabled: Boolean(row.notifications_enabled),
    onboardingCompleted: Boolean(row.onboarding_completed),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}
function mapMember(row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    relationship: row.relationship ? String(row.relationship) : null,
    archived: Boolean(row.archived),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}
function extractJoin(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}
function mapMedicine(row) {
  const fm = extractJoin(row.family_members);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    familyMemberId: String(row.family_member_id),
    familyMemberName: fm?.name ? String(fm.name) : "Unknown",
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
    updatedAt: String(row.updated_at)
  };
}
function createSupabaseStore(providedClient) {
  let cachedClient = providedClient ?? null;
  const client = () => {
    if (!cachedClient) {
      cachedClient = getSupabaseClient();
    }
    return cachedClient;
  };
  return {
    async findUserByNormalizedName(nameNormalized) {
      const { data, error } = await client().from("users").select("*").eq("name_normalized", nameNormalized).maybeSingle();
      throwIfError(error, "findUserByNormalizedName");
      return data ? mapUser(data) : null;
    },
    async findUserById(userId) {
      const { data, error } = await client().from("users").select("*").eq("id", userId).maybeSingle();
      throwIfError(error, "findUserById");
      return data ? mapUser(data) : null;
    },
    async listAllUsers() {
      const { data, error } = await client().from("users").select("id, notifications_enabled");
      throwIfError(error, "listAllUsers");
      return (data || []).map((r) => ({
        id: String(r.id),
        notificationsEnabled: Boolean(r.notifications_enabled)
      }));
    },
    async createUser(input) {
      const { data, error } = await client().from("users").insert({
        id: input.id,
        name: input.name,
        name_normalized: input.nameNormalized,
        password_hash: input.passwordHash,
        created_at: input.nowIso,
        updated_at: input.nowIso
      }).select("*").single();
      throwIfError(error, "createUser");
      return mapUser(data);
    },
    async updateUserPreferences(userId, patch, nowIso) {
      const payload = { updated_at: nowIso };
      if (patch.dateFormat !== void 0) payload.date_format = patch.dateFormat;
      if (patch.themePreference !== void 0) payload.theme_preference = patch.themePreference;
      if (patch.notificationsEnabled !== void 0) {
        payload.notifications_enabled = patch.notificationsEnabled;
      }
      if (patch.onboardingCompleted !== void 0) {
        payload.onboarding_completed = patch.onboardingCompleted;
      }
      const { data, error } = await client().from("users").update(payload).eq("id", userId).select("*").single();
      throwIfError(error, "updateUserPreferences");
      return mapUser(data);
    },
    async updateUserPassword(userId, passwordHash, nowIso) {
      const { error } = await client().from("users").update({ password_hash: passwordHash, updated_at: nowIso }).eq("id", userId);
      throwIfError(error, "updateUserPassword");
    },
    async deleteUserAccountCascade(userId) {
      const sb = client();
      const steps = [
        { table: "notifications" },
        { table: "reminder_cycles" },
        { table: "stock_adjustments" },
        { table: "purchase_transactions" },
        { table: "medicines" },
        { table: "family_members" },
        { table: "push_subscriptions" },
        { table: "sessions" }
      ];
      for (const s of steps) {
        const { error: error2 } = await sb.from(s.table).delete().eq("user_id", userId);
        throwIfError(error2, `deleteUserAccountCascade:${s.table}`);
      }
      const { error } = await sb.from("users").delete().eq("id", userId);
      throwIfError(error, "deleteUserAccountCascade:users");
    },
    async createSession(input) {
      const { error } = await client().from("sessions").insert({
        id: input.id,
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        created_at: input.createdAt
      });
      throwIfError(error, "createSession");
    },
    async findSessionWithUser(tokenHash) {
      const { data, error } = await client().from("sessions").select("id, user_id, token_hash, expires_at, created_at, users(*)").eq("token_hash", tokenHash).maybeSingle();
      throwIfError(error, "findSessionWithUser");
      if (!data) return null;
      const userObj = extractJoin(data.users);
      if (!userObj) return null;
      const session = {
        id: String(data.id),
        userId: String(data.user_id),
        tokenHash: String(data.token_hash),
        expiresAt: String(data.expires_at),
        createdAt: String(data.created_at)
      };
      return { session, user: mapUser(userObj) };
    },
    async deleteSessionByTokenHash(tokenHash) {
      const { error } = await client().from("sessions").delete().eq("token_hash", tokenHash);
      throwIfError(error, "deleteSessionByTokenHash");
    },
    async deleteOtherSessions(userId, keepTokenHash) {
      const { error } = await client().from("sessions").delete().eq("user_id", userId).neq("token_hash", keepTokenHash);
      throwIfError(error, "deleteOtherSessions");
    },
    async listFamilyMembers(userId, includeArchived) {
      let query = client().from("family_members").select("*").eq("user_id", userId).order("created_at", { ascending: true });
      if (!includeArchived) {
        query = query.eq("archived", false);
      }
      const { data, error } = await query;
      throwIfError(error, "listFamilyMembers");
      return (data || []).map(mapMember);
    },
    async findFamilyMemberById(userId, memberId) {
      const { data, error } = await client().from("family_members").select("*").eq("id", memberId).eq("user_id", userId).maybeSingle();
      throwIfError(error, "findFamilyMemberById");
      return data ? mapMember(data) : null;
    },
    async createFamilyMember(input) {
      const { data, error } = await client().from("family_members").insert({
        id: input.id,
        user_id: input.userId,
        name: input.name,
        relationship: input.relationship,
        archived: false,
        created_at: input.nowIso,
        updated_at: input.nowIso
      }).select("*").single();
      throwIfError(error, "createFamilyMember");
      return mapMember(data);
    },
    async updateFamilyMember(userId, memberId, patch, nowIso) {
      const { data, error } = await client().from("family_members").update({
        name: patch.name,
        relationship: patch.relationship,
        updated_at: nowIso
      }).eq("id", memberId).eq("user_id", userId).select("*").single();
      throwIfError(error, "updateFamilyMember");
      return mapMember(data);
    },
    async countMemberRecords(userId, memberId) {
      const [medRes, purchaseRes] = await Promise.all([
        client().from("medicines").select("id", { count: "exact", head: true }).eq("family_member_id", memberId).eq("user_id", userId),
        client().from("purchase_transactions").select("id", { count: "exact", head: true }).eq("family_member_id", memberId).eq("user_id", userId)
      ]);
      throwIfError(medRes.error, "countMemberRecords:medicines");
      throwIfError(purchaseRes.error, "countMemberRecords:purchases");
      return {
        medicineCount: medRes.count ?? 0,
        purchaseCount: purchaseRes.count ?? 0
      };
    },
    async archiveFamilyMember(userId, memberId, archiveMedicines, nowIso) {
      const sb = client();
      const { error: mErr } = await sb.from("family_members").update({ archived: true, updated_at: nowIso }).eq("id", memberId).eq("user_id", userId);
      throwIfError(mErr, "archiveFamilyMember");
      if (archiveMedicines) {
        const { error: medErr } = await sb.from("medicines").update({ archived: true, updated_at: nowIso }).eq("family_member_id", memberId).eq("user_id", userId);
        throwIfError(medErr, "archiveFamilyMember:medicines");
        const { error: rcErr } = await sb.from("reminder_cycles").update({ status: "cancelled", updated_at: nowIso }).eq("family_member_id", memberId).eq("user_id", userId).eq("status", "pending");
        throwIfError(rcErr, "archiveFamilyMember:reminder_cycles");
      }
    },
    async reassignAndDeleteFamilyMember(userId, memberId, targetMemberId, nowIso) {
      const sb = client();
      const u1 = await sb.from("medicines").update({ family_member_id: targetMemberId, updated_at: nowIso }).eq("family_member_id", memberId).eq("user_id", userId);
      throwIfError(u1.error, "reassign:medicines");
      const u2 = await sb.from("purchase_transactions").update({ family_member_id: targetMemberId }).eq("family_member_id", memberId).eq("user_id", userId);
      throwIfError(u2.error, "reassign:purchases");
      const u3 = await sb.from("reminder_cycles").update({ family_member_id: targetMemberId, updated_at: nowIso }).eq("family_member_id", memberId).eq("user_id", userId);
      throwIfError(u3.error, "reassign:reminder_cycles");
      const u4 = await sb.from("notifications").update({ family_member_id: targetMemberId }).eq("family_member_id", memberId).eq("user_id", userId);
      throwIfError(u4.error, "reassign:notifications");
      const del = await sb.from("family_members").delete().eq("id", memberId).eq("user_id", userId);
      throwIfError(del.error, "reassign:delete_member");
    },
    async deleteFamilyMember(userId, memberId) {
      const { error } = await client().from("family_members").delete().eq("id", memberId).eq("user_id", userId);
      throwIfError(error, "deleteFamilyMember");
    },
    async listMedicines(userId, options) {
      let query = client().from("medicines").select("*, family_members(name, relationship)").eq("user_id", userId).order("created_at", { ascending: false });
      if (!options.includeArchived) {
        query = query.eq("archived", false);
      }
      if (options.familyMemberId) {
        query = query.eq("family_member_id", options.familyMemberId);
      }
      const { data, error } = await query;
      throwIfError(error, "listMedicines");
      return (data || []).map((row) => mapMedicine(row));
    },
    async findMedicineById(userId, medicineId) {
      const { data, error } = await client().from("medicines").select("*, family_members(name, relationship)").eq("id", medicineId).eq("user_id", userId).maybeSingle();
      throwIfError(error, "findMedicineById");
      return data ? mapMedicine(data) : null;
    },
    async createMedicineWithInitialPurchase(input) {
      const sb = client();
      const { error: medErr } = await sb.from("medicines").insert({
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
        updated_at: input.nowIso
      });
      throwIfError(medErr, "createMedicineWithInitialPurchase:medicine");
      const { error: pErr } = await sb.from("purchase_transactions").insert({
        id: input.purchaseId,
        user_id: input.userId,
        medicine_id: input.medicineId,
        family_member_id: input.familyMemberId,
        purchase_date: input.purchaseDate,
        quantity_purchased: input.quantityPurchased,
        previous_remaining: 0,
        resulting_stock: input.quantityPurchased,
        notes: input.notes || "Initial stock entry",
        created_at: input.nowIso
      });
      if (pErr) {
        await sb.from("medicines").delete().eq("id", input.medicineId).eq("user_id", input.userId);
        throwIfError(pErr, "createMedicineWithInitialPurchase:purchase");
      }
    },
    async updateMedicine(userId, medicineId, patch, nowIso) {
      const { error } = await client().from("medicines").update({
        name: patch.name,
        family_member_id: patch.familyMemberId,
        baseline_quantity: patch.baselineQuantity,
        baseline_date: patch.baselineDate,
        daily_usage: patch.dailyUsage,
        notes: patch.notes,
        reminders_enabled: patch.remindersEnabled,
        archived: patch.archived,
        updated_at: nowIso
      }).eq("id", medicineId).eq("user_id", userId);
      throwIfError(error, "updateMedicine");
    },
    async recordPurchase(input) {
      const sb = client();
      const { error: pErr } = await sb.from("purchase_transactions").insert({
        id: input.purchaseId,
        user_id: input.userId,
        medicine_id: input.medicineId,
        family_member_id: input.familyMemberId,
        purchase_date: input.purchaseDate,
        quantity_purchased: input.quantityPurchased,
        previous_remaining: input.previousRemaining,
        resulting_stock: input.resultingStock,
        notes: input.notes,
        created_at: input.nowIso
      });
      throwIfError(pErr, "recordPurchase:insert");
      const { error: mErr } = await sb.from("medicines").update({
        baseline_quantity: input.resultingStock,
        baseline_date: input.newBaselineDate,
        purchase_date: input.purchaseDate,
        updated_at: input.nowIso
      }).eq("id", input.medicineId).eq("user_id", input.userId);
      throwIfError(mErr, "recordPurchase:updateMedicine");
      const { error: rcErr } = await sb.from("reminder_cycles").update({
        status: "resolved",
        resolved_at: input.nowIso,
        resolved_purchase_id: input.purchaseId,
        updated_at: input.nowIso
      }).eq("user_id", input.userId).eq("medicine_id", input.medicineId).eq("status", "pending");
      throwIfError(rcErr, "recordPurchase:resolveCycle");
      const { error: nErr } = await sb.from("notifications").insert({
        id: input.notificationId,
        user_id: input.userId,
        medicine_id: input.medicineId,
        family_member_id: input.familyMemberId,
        type: "purchase_confirmed",
        title: "Purchase Confirmed",
        body: `${input.familyMemberName}: Purchased ${input.quantityPurchased} tablets of ${input.medicineName}. Total stock is now ${input.resultingStock} tablets.`,
        scheduled_for_date: input.purchaseDate,
        push_status: "in_app_only",
        created_at: input.nowIso
      });
      throwIfError(nErr, "recordPurchase:notification");
    },
    async recordStockAdjustment(input) {
      const sb = client();
      const { error: adjErr } = await sb.from("stock_adjustments").insert({
        id: input.adjustmentId,
        user_id: input.userId,
        medicine_id: input.medicineId,
        adjustment_date: input.adjustmentDate,
        previous_quantity: input.previousQuantity,
        new_quantity: input.newQuantity,
        delta: input.delta,
        reason: input.reason,
        created_at: input.nowIso
      });
      throwIfError(adjErr, "recordStockAdjustment:insert");
      const { error: mErr } = await sb.from("medicines").update({
        baseline_quantity: input.newQuantity,
        baseline_date: input.adjustmentDate,
        updated_at: input.nowIso
      }).eq("id", input.medicineId).eq("user_id", input.userId);
      throwIfError(mErr, "recordStockAdjustment:updateMedicine");
    },
    async listPurchases(userId, options = {}) {
      let query = client().from("purchase_transactions").select("*, medicines(name), family_members(name)").eq("user_id", userId).order("purchase_date", { ascending: false }).order("created_at", { ascending: false });
      if (options.medicineId) query = query.eq("medicine_id", options.medicineId);
      if (options.familyMemberId) query = query.eq("family_member_id", options.familyMemberId);
      if (options.limit) query = query.limit(Math.max(1, Math.min(500, Math.floor(options.limit))));
      const { data, error } = await query;
      throwIfError(error, "listPurchases");
      return (data || []).map((row) => {
        const med = extractJoin(row.medicines);
        const fm = extractJoin(row.family_members);
        return {
          id: String(row.id),
          userId: String(row.user_id),
          medicineId: String(row.medicine_id),
          medicineName: med?.name ? String(med.name) : "Unknown",
          familyMemberId: String(row.family_member_id),
          familyMemberName: fm?.name ? String(fm.name) : "Unknown",
          purchaseDate: String(row.purchase_date),
          quantityPurchased: Number(row.quantity_purchased),
          previousRemaining: Number(row.previous_remaining),
          resultingStock: Number(row.resulting_stock),
          notes: row.notes ? String(row.notes) : null,
          createdAt: String(row.created_at)
        };
      });
    },
    async listStockAdjustments(userId, medicineId) {
      const { data, error } = await client().from("stock_adjustments").select("*").eq("user_id", userId).eq("medicine_id", medicineId).order("created_at", { ascending: false });
      throwIfError(error, "listStockAdjustments");
      return (data || []).map(
        (r) => ({
          id: String(r.id),
          userId: String(r.user_id),
          medicineId: String(r.medicine_id),
          adjustmentDate: String(r.adjustment_date),
          previousQuantity: Number(r.previous_quantity),
          newQuantity: Number(r.new_quantity),
          delta: Number(r.delta),
          reason: r.reason ? String(r.reason) : null,
          createdAt: String(r.created_at)
        })
      );
    },
    async listReminderCycles(userId, status) {
      let query = client().from("reminder_cycles").select(
        "*, medicines(name, baseline_quantity, daily_usage, baseline_date, reminders_enabled, archived), family_members(name)"
      ).eq("user_id", userId).order("stock_end_date", { ascending: true }).order("updated_at", { ascending: false });
      if (status !== "all") {
        query = query.eq("status", status);
      }
      const { data, error } = await query;
      throwIfError(error, "listReminderCycles");
      return (data || []).map((r) => {
        const med = extractJoin(r.medicines);
        const fm = extractJoin(r.family_members);
        return {
          id: String(r.id),
          userId: String(r.user_id),
          medicineId: String(r.medicine_id),
          medicineName: med?.name ? String(med.name) : "Unknown",
          familyMemberId: String(r.family_member_id),
          familyMemberName: fm?.name ? String(fm.name) : "Unknown",
          stockEndDate: String(r.stock_end_date),
          firstReminderDate: String(r.first_reminder_date),
          status: r.status,
          resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
          resolvedPurchaseId: r.resolved_purchase_id ? String(r.resolved_purchase_id) : null,
          lastNotifiedDate: r.last_notified_date ? String(r.last_notified_date) : null,
          baselineQuantity: Number(med?.baseline_quantity ?? 0),
          dailyUsage: Number(med?.daily_usage ?? 1),
          baselineDate: String(med?.baseline_date ?? r.stock_end_date),
          remindersEnabled: Boolean(med?.reminders_enabled),
          medicineArchived: Boolean(med?.archived),
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at)
        };
      });
    },
    async findPendingReminderCycle(userId, medicineId) {
      const { data, error } = await client().from("reminder_cycles").select("id").eq("user_id", userId).eq("medicine_id", medicineId).eq("status", "pending").maybeSingle();
      throwIfError(error, "findPendingReminderCycle");
      return data ? { id: String(data.id) } : null;
    },
    async createReminderCycle(input) {
      const { error } = await client().from("reminder_cycles").insert({
        id: input.id,
        user_id: input.userId,
        medicine_id: input.medicineId,
        family_member_id: input.familyMemberId,
        stock_end_date: input.stockEndDate,
        first_reminder_date: input.firstReminderDate,
        status: "pending",
        created_at: input.nowIso,
        updated_at: input.nowIso
      });
      throwIfError(error, "createReminderCycle");
    },
    async updateReminderCycleDates(cycleId, input) {
      const { error } = await client().from("reminder_cycles").update({
        stock_end_date: input.stockEndDate,
        first_reminder_date: input.firstReminderDate,
        family_member_id: input.familyMemberId,
        updated_at: input.nowIso
      }).eq("id", cycleId);
      throwIfError(error, "updateReminderCycleDates");
    },
    async updateReminderCycleStatus(cycleId, status, nowIso) {
      const { error } = await client().from("reminder_cycles").update({ status, updated_at: nowIso }).eq("id", cycleId);
      throwIfError(error, "updateReminderCycleStatus");
    },
    async markReminderCycleNotified(cycleId, refDate, nowIso) {
      const { error } = await client().from("reminder_cycles").update({ last_notified_date: refDate, updated_at: nowIso }).eq("id", cycleId);
      throwIfError(error, "markReminderCycleNotified");
    },
    async listNotifications(userId, limit = 100) {
      const { data, error } = await client().from("notifications").select("*, medicines(name), family_members(name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      throwIfError(error, "listNotifications");
      return (data || []).map((r) => {
        const med = extractJoin(r.medicines);
        const fm = extractJoin(r.family_members);
        return {
          id: String(r.id),
          userId: String(r.user_id),
          medicineId: r.medicine_id ? String(r.medicine_id) : null,
          medicineName: med?.name ? String(med.name) : null,
          familyMemberId: r.family_member_id ? String(r.family_member_id) : null,
          familyMemberName: fm?.name ? String(fm.name) : null,
          reminderCycleId: r.reminder_cycle_id ? String(r.reminder_cycle_id) : null,
          type: r.type,
          title: String(r.title),
          body: String(r.body),
          scheduledForDate: r.scheduled_for_date ? String(r.scheduled_for_date) : null,
          readAt: r.read_at ? String(r.read_at) : null,
          pushStatus: r.push_status,
          pushError: r.push_error ? String(r.push_error) : null,
          createdAt: String(r.created_at)
        };
      });
    },
    async countUnreadNotifications(userId) {
      const { count, error } = await client().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
      throwIfError(error, "countUnreadNotifications");
      return count ?? 0;
    },
    async hasDailyRefillNotification(userId, medicineId, scheduledForDate) {
      const { data, error } = await client().from("notifications").select("id").eq("user_id", userId).eq("medicine_id", medicineId).eq("scheduled_for_date", scheduledForDate).eq("type", "refill_reminder").maybeSingle();
      throwIfError(error, "hasDailyRefillNotification");
      return Boolean(data);
    },
    async createNotification(input) {
      const { error } = await client().from("notifications").insert({
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
        created_at: input.nowIso
      });
      if (error) {
        if (error.code === "23505") {
          return { inserted: false };
        }
        throwIfError(error, "createNotification");
      }
      return { inserted: true };
    },
    async updateNotificationPushStatus(notificationId, pushStatus, pushError) {
      const { error } = await client().from("notifications").update({ push_status: pushStatus, push_error: pushError }).eq("id", notificationId);
      throwIfError(error, "updateNotificationPushStatus");
    },
    async markNotificationRead(userId, notificationId, nowIso) {
      const { error } = await client().from("notifications").update({ read_at: nowIso }).eq("id", notificationId).eq("user_id", userId).is("read_at", null);
      throwIfError(error, "markNotificationRead");
    },
    async markAllNotificationsRead(userId, nowIso) {
      const { error } = await client().from("notifications").update({ read_at: nowIso }).eq("user_id", userId).is("read_at", null);
      throwIfError(error, "markAllNotificationsRead");
    },
    async listActivePushSubscriptions(userId) {
      const { data, error } = await client().from("push_subscriptions").select("*").eq("user_id", userId).eq("active", true);
      throwIfError(error, "listActivePushSubscriptions");
      return (data || []).map(
        (r) => ({
          id: String(r.id),
          userId: String(r.user_id),
          endpoint: String(r.endpoint),
          p256dh: String(r.p256dh),
          auth: String(r.auth),
          userAgent: r.user_agent ? String(r.user_agent) : null,
          active: Boolean(r.active),
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at)
        })
      );
    },
    async countActivePushSubscriptions(userId) {
      const { count, error } = await client().from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("active", true);
      throwIfError(error, "countActivePushSubscriptions");
      return count ?? 0;
    },
    async upsertPushSubscription(input) {
      const { error } = await client().from("push_subscriptions").upsert(
        {
          id: input.id,
          user_id: input.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          user_agent: input.userAgent,
          active: true,
          created_at: input.nowIso,
          updated_at: input.nowIso
        },
        { onConflict: "endpoint" }
      );
      throwIfError(error, "upsertPushSubscription");
    },
    async deactivatePushSubscriptionById(id, nowIso) {
      const { error } = await client().from("push_subscriptions").update({ active: false, updated_at: nowIso }).eq("id", id);
      throwIfError(error, "deactivatePushSubscriptionById");
    },
    async deactivatePushSubscriptions(userId, endpoint, nowIso) {
      let query = client().from("push_subscriptions").update({ active: false, updated_at: nowIso }).eq("user_id", userId);
      if (endpoint) {
        query = query.eq("endpoint", endpoint);
      }
      const { error } = await query;
      throwIfError(error, "deactivatePushSubscriptions");
    }
  };
}

// src/shared/stockEngine.ts
var DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
function parseCalendarDate(dateStr) {
  const match = DATE_REGEX.exec(dateStr.trim());
  if (!match) {
    throw new Error(`Invalid calendar date format "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid calendar date "${dateStr}".`);
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) {
    throw new Error(`Non-existent calendar date "${dateStr}".`);
  }
  return { year, month, day };
}
function isValidCalendarDate(dateStr) {
  try {
    parseCalendarDate(dateStr);
    return true;
  } catch {
    return false;
  }
}
function formatCalendarDateParts(year, month, day) {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addCalendarDays(dateStr, days) {
  const { year, month, day } = parseCalendarDate(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatCalendarDateParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}
function diffCalendarDays(fromDateStr, toDateStr) {
  const a = parseCalendarDate(fromDateStr);
  const b = parseCalendarDate(toDateStr);
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msB - msA) / 864e5);
}
function getTodayLocalDateStr(now = /* @__PURE__ */ new Date()) {
  return formatCalendarDateParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
function calculateStockSchedule(input) {
  const { quantity, dailyUsage, baselineDate } = input;
  parseCalendarDate(baselineDate);
  if (!Number.isFinite(dailyUsage) || dailyUsage <= 0) {
    throw new Error("Daily usage must be greater than zero.");
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Quantity cannot be negative.");
  }
  if (quantity === 0) {
    return {
      remainingDays: 0,
      stockEndDate: baselineDate,
      firstReminderDate: baselineDate
    };
  }
  const remainingDays = Math.ceil(quantity / dailyUsage);
  const stockEndDate = addCalendarDays(baselineDate, remainingDays - 1);
  const threeDaysBefore = addCalendarDays(stockEndDate, -3);
  const firstReminderDate = threeDaysBefore < baselineDate ? baselineDate : threeDaysBefore;
  return {
    remainingDays,
    stockEndDate,
    firstReminderDate
  };
}
function evaluateMedicineStock(input) {
  const referenceDate = input.referenceDate ?? getTodayLocalDateStr();
  parseCalendarDate(referenceDate);
  parseCalendarDate(input.baselineDate);
  if (!Number.isFinite(input.dailyUsage) || input.dailyUsage <= 0) {
    throw new Error("Daily usage must be greater than zero.");
  }
  const safeBaselineQty = Math.max(0, input.baselineQuantity);
  const schedule = calculateStockSchedule({
    quantity: safeBaselineQty,
    dailyUsage: input.dailyUsage,
    baselineDate: input.baselineDate
  });
  const elapsedDays = Math.max(0, diffCalendarDays(input.baselineDate, referenceDate));
  const consumed = elapsedDays * input.dailyUsage;
  const remainingTablets = Math.max(0, Number((safeBaselineQty - consumed).toFixed(2)));
  const remainingDays = remainingTablets <= 0 ? 0 : Math.ceil(remainingTablets / input.dailyUsage);
  const daysUntilStockEnd = remainingTablets <= 0 ? 0 : Math.max(0, diffCalendarDays(referenceDate, schedule.stockEndDate));
  let stockStatus;
  if (remainingTablets <= 0) {
    stockStatus = "OUT_OF_STOCK";
  } else if (referenceDate >= schedule.firstReminderDate || daysUntilStockEnd <= 3) {
    stockStatus = "PURCHASE_DUE";
  } else if (daysUntilStockEnd <= 7) {
    stockStatus = "RUNNING_LOW";
  } else {
    stockStatus = "IN_STOCK";
  }
  const progressPercent = safeBaselineQty <= 0 ? 0 : Math.min(100, Math.max(0, Math.round(remainingTablets / safeBaselineQty * 100)));
  const isReminderWindowOpen = remainingTablets <= 0 || referenceDate >= schedule.firstReminderDate;
  return {
    remainingTablets,
    remainingDays,
    totalDurationDays: schedule.remainingDays,
    daysUntilStockEnd,
    stockEndDate: schedule.stockEndDate,
    firstReminderDate: schedule.firstReminderDate,
    stockStatus,
    progressPercent,
    isReminderWindowOpen
  };
}
function calculateRefillResult(input) {
  parseCalendarDate(input.actualPurchaseDate);
  if (!Number.isFinite(input.quantityPurchased) || input.quantityPurchased <= 0) {
    throw new Error("Purchased quantity must be greater than zero.");
  }
  const currentEval = evaluateMedicineStock({
    baselineQuantity: input.currentBaselineQuantity,
    dailyUsage: input.dailyUsage,
    baselineDate: input.currentBaselineDate,
    referenceDate: input.actualPurchaseDate
  });
  const previousRemaining = currentEval.remainingTablets;
  const resultingStock = Number((previousRemaining + input.quantityPurchased).toFixed(2));
  const schedule = calculateStockSchedule({
    quantity: resultingStock,
    dailyUsage: input.dailyUsage,
    baselineDate: input.actualPurchaseDate
  });
  return {
    previousRemaining,
    resultingStock,
    newBaselineDate: input.actualPurchaseDate,
    schedule
  };
}
function recalculateAfterUsageChange(params) {
  const effectiveDate = params.effectiveDate ?? getTodayLocalDateStr();
  if (!Number.isFinite(params.newDailyUsage) || params.newDailyUsage <= 0) {
    throw new Error("New daily usage must be greater than zero.");
  }
  const snapshot = evaluateMedicineStock({
    baselineQuantity: params.currentBaselineQuantity,
    dailyUsage: params.oldDailyUsage,
    baselineDate: params.currentBaselineDate,
    referenceDate: effectiveDate
  });
  const schedule = calculateStockSchedule({
    quantity: snapshot.remainingTablets,
    dailyUsage: params.newDailyUsage,
    baselineDate: effectiveDate
  });
  return {
    newBaselineQuantity: snapshot.remainingTablets,
    newBaselineDate: effectiveDate,
    schedule
  };
}

// server/queries.ts
function hydrateMedicineRecord(row, referenceDate) {
  const refDate = referenceDate ?? getTodayLocalDateStr();
  const evalResult = evaluateMedicineStock({
    baselineQuantity: Number(row.baselineQuantity),
    dailyUsage: Number(row.dailyUsage),
    baselineDate: row.baselineDate,
    referenceDate: refDate
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
    isReminderActive: row.remindersEnabled && evalResult.isReminderWindowOpen
  };
}
async function getUserMedicines(store2, userId, options = {}) {
  const rows = await store2.listMedicines(userId, {
    includeArchived: options.includeArchived,
    familyMemberId: options.familyMemberId
  });
  return rows.map((r) => hydrateMedicineRecord(r, options.referenceDate));
}
async function getUserMedicineById(store2, userId, medicineId, referenceDate) {
  const row = await store2.findMedicineById(userId, medicineId);
  if (!row) return null;
  return hydrateMedicineRecord(row, referenceDate);
}
async function getUserFamilyMembers(store2, userId, options = {}) {
  const [members, activeMedicines] = await Promise.all([
    store2.listFamilyMembers(userId, Boolean(options.includeArchived)),
    getUserMedicines(store2, userId, {
      includeArchived: false,
      referenceDate: options.referenceDate
    })
  ]);
  const medsByMember = /* @__PURE__ */ new Map();
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
      if (med.stockStatus === "OUT_OF_STOCK") {
        outOfStockCount++;
        pendingPurchaseCount++;
      } else if (med.stockStatus === "PURCHASE_DUE") {
        pendingPurchaseCount++;
      } else if (med.stockStatus === "RUNNING_LOW") {
        runningLowCount++;
      }
    }
    let overallStatus = "IN_STOCK";
    if (outOfStockCount > 0) overallStatus = "OUT_OF_STOCK";
    else if (pendingPurchaseCount > 0) overallStatus = "PURCHASE_DUE";
    else if (runningLowCount > 0) overallStatus = "RUNNING_LOW";
    return {
      ...m,
      activeMedicineCount: meds.length,
      pendingPurchaseCount,
      runningLowCount,
      outOfStockCount,
      overallStatus
    };
  });
}
async function getFamilyMemberById(store2, userId, memberId) {
  return store2.findFamilyMemberById(userId, memberId);
}
async function getPurchaseTransactions(store2, userId, options = {}) {
  return store2.listPurchases(userId, options);
}
async function getStockAdjustments(store2, userId, medicineId) {
  return store2.listStockAdjustments(userId, medicineId);
}
async function getCalendarEvents(store2, userId, options = {}) {
  const [purchases, medicines] = await Promise.all([
    getPurchaseTransactions(store2, userId, {
      familyMemberId: options.familyMemberId
    }),
    getUserMedicines(store2, userId, {
      includeArchived: false,
      familyMemberId: options.familyMemberId,
      referenceDate: options.referenceDate
    })
  ]);
  const events = [];
  for (const p of purchases) {
    events.push({
      id: `purchase_${p.id}`,
      type: "purchased",
      date: p.purchaseDate,
      medicineId: p.medicineId,
      medicineName: p.medicineName,
      familyMemberId: p.familyMemberId,
      familyMemberName: p.familyMemberName,
      quantity: p.quantityPurchased,
      notes: p.notes
    });
  }
  for (const m of medicines) {
    events.push({
      id: `topurchase_${m.id}`,
      type: "to_purchase",
      date: m.stockEndDate,
      medicineId: m.id,
      medicineName: m.name,
      familyMemberId: m.familyMemberId,
      familyMemberName: m.familyMemberName,
      remainingTablets: m.remainingTablets
    });
  }
  return events;
}
async function getReminderCycles(store2, userId, status = "all", referenceDate) {
  const rows = await store2.listReminderCycles(userId, status);
  const refDate = referenceDate ?? getTodayLocalDateStr();
  return rows.filter((r) => !(r.status === "pending" && r.medicineArchived)).map((r) => {
    const evaluated = evaluateMedicineStock({
      baselineQuantity: r.baselineQuantity,
      dailyUsage: r.dailyUsage,
      baselineDate: r.baselineDate,
      referenceDate: refDate
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
      updatedAt: r.updatedAt
    };
  });
}
async function getUserNotifications(store2, userId, limit = 100) {
  return store2.listNotifications(userId, limit);
}
async function getDashboardSummary(store2, userId, referenceDate) {
  const [medicines, familyOverview, recentPurchases, unreadNotificationCount] = await Promise.all([
    getUserMedicines(store2, userId, { includeArchived: false, referenceDate }),
    getUserFamilyMembers(store2, userId, { includeArchived: false, referenceDate }),
    getPurchaseTransactions(store2, userId, { limit: 6 }),
    store2.countUnreadNotifications(userId)
  ]);
  let runningLow = 0;
  let purchaseDue = 0;
  let outOfStock = 0;
  for (const m of medicines) {
    if (m.stockStatus === "RUNNING_LOW") runningLow++;
    else if (m.stockStatus === "PURCHASE_DUE") purchaseDue++;
    else if (m.stockStatus === "OUT_OF_STOCK") {
      outOfStock++;
      purchaseDue++;
    }
  }
  const upcomingPurchases = [...medicines].sort((a, b) => a.stockEndDate.localeCompare(b.stockEndDate)).slice(0, 6);
  return {
    stats: {
      activeMedicines: medicines.length,
      familyMembers: familyOverview.length,
      runningLow,
      purchaseDue,
      outOfStock
    },
    upcomingPurchases,
    familyOverview,
    recentPurchases,
    unreadNotificationCount
  };
}

// server/reminders.ts
import crypto2 from "node:crypto";
var webpushLib = null;
async function getWebPush() {
  if (!webpushLib) {
    try {
      const mod = await import("web-push");
      webpushLib = mod.default || mod;
    } catch {
      webpushLib = null;
    }
  }
  return webpushLib;
}
var cachedVapid = null;
function getVapidConfig() {
  if (cachedVapid) return cachedVapid;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@medistock.app";
  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPublic && envPrivate) {
    cachedVapid = { publicKey: envPublic, privateKey: envPrivate, subject, configured: true };
    return cachedVapid;
  }
  cachedVapid = {
    publicKey: envPublic || "",
    privateKey: envPrivate || "",
    subject,
    configured: Boolean(envPublic && envPrivate)
  };
  return cachedVapid;
}
async function deliverSingleWebPush(store2, sub, payloadJson) {
  const wp = await getWebPush();
  if (!wp) {
    return { ok: false, error: "Push service not available." };
  }
  const cfg = getVapidConfig();
  if (!cfg.configured) {
    return { ok: false, error: "VAPID keys not configured." };
  }
  try {
    wp.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  } catch {
  }
  const subscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth
    }
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await wp.sendNotification(subscription, payloadJson, { TTL: 86400 });
      return { ok: true };
    } catch (err) {
      const statusCode = err?.statusCode;
      const msg = err?.message || "Push delivery failed";
      if (statusCode === 404 || statusCode === 410) {
        await store2.deactivatePushSubscriptionById(sub.id, (/* @__PURE__ */ new Date()).toISOString());
        return { ok: false, error: `Subscription expired (${statusCode})` };
      }
      if (attempt === 1) {
        return { ok: false, error: msg };
      }
    }
  }
  return { ok: false, error: "Push delivery failed" };
}
async function dispatchWebPushToUser(store2, userId, payload) {
  const subs = await store2.listActivePushSubscriptions(userId);
  if (subs.length === 0) {
    return { status: "no_subscription", deliveredCount: 0, failedCount: 0, lastError: null };
  }
  const payloadJson = JSON.stringify(payload);
  let deliveredCount = 0;
  let failedCount = 0;
  let lastError = null;
  for (const sub of subs) {
    const result = await deliverSingleWebPush(store2, sub, payloadJson);
    if (result.ok) deliveredCount++;
    else {
      failedCount++;
      lastError = result.error ?? "Unknown push error";
    }
  }
  return {
    status: deliveredCount > 0 ? "sent" : "failed",
    deliveredCount,
    failedCount,
    lastError
  };
}
async function syncMedicineReminderCycle(store2, userId, medicineId, referenceDate) {
  const refDate = referenceDate ?? getTodayLocalDateStr();
  const meds = await getUserMedicines(store2, userId, {
    includeArchived: true,
    referenceDate: refDate
  });
  const med = meds.find((m) => m.id === medicineId);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const existingPending = await store2.findPendingReminderCycle(userId, medicineId);
  if (!med || med.archived || !med.remindersEnabled) {
    if (existingPending) {
      await store2.updateReminderCycleStatus(existingPending.id, "cancelled", nowIso);
    }
    return;
  }
  const shouldBePending = med.remainingTablets <= 0 || refDate >= med.firstReminderDate;
  if (shouldBePending) {
    if (existingPending) {
      await store2.updateReminderCycleDates(existingPending.id, {
        stockEndDate: med.stockEndDate,
        firstReminderDate: med.firstReminderDate,
        familyMemberId: med.familyMemberId,
        nowIso
      });
    } else {
      await store2.createReminderCycle({
        id: crypto2.randomUUID(),
        userId,
        medicineId: med.id,
        familyMemberId: med.familyMemberId,
        stockEndDate: med.stockEndDate,
        firstReminderDate: med.firstReminderDate,
        nowIso
      });
    }
  } else if (existingPending) {
    await store2.updateReminderCycleStatus(existingPending.id, "cancelled", nowIso);
  }
}
async function runReminderScheduler(store2, options = {}) {
  const refDate = options.referenceDate ?? getTodayLocalDateStr();
  const userRows = options.userId ? (() => {
    return store2.findUserById(options.userId).then(
      (u) => u ? [{ id: u.id, notificationsEnabled: u.notificationsEnabled }] : []
    );
  })() : store2.listAllUsers();
  const users = await userRows;
  let createdNotifications = 0;
  let pushSent = 0;
  for (const user of users) {
    const meds = await getUserMedicines(store2, user.id, {
      includeArchived: false,
      referenceDate: refDate
    });
    for (const med of meds) {
      await syncMedicineReminderCycle(store2, user.id, med.id, refDate);
    }
    if (!user.notificationsEnabled) {
      continue;
    }
    const dueMeds = meds.filter(
      (m) => m.remindersEnabled && (m.remainingTablets <= 0 || refDate >= m.firstReminderDate)
    );
    if (dueMeds.length === 0) continue;
    const newMedNotifications = [];
    for (const med of dueMeds) {
      const exists = await store2.hasDailyRefillNotification(user.id, med.id, refDate);
      if (exists) continue;
      const cycle = await store2.findPendingReminderCycle(user.id, med.id);
      const statusPhrase = med.remainingTablets <= 0 ? "Out of stock \u2014 purchase needed today." : med.daysUntilStockEnd === 0 ? "Stock ends today." : `${med.daysUntilStockEnd} ${med.daysUntilStockEnd === 1 ? "day" : "days"} remaining (${med.remainingTablets} tablets left).`;
      const body = `${med.familyMemberName}: ${med.name} \u2014 ${statusPhrase}`;
      const notificationId = crypto2.randomUUID();
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const { inserted } = await store2.createNotification({
        id: notificationId,
        userId: user.id,
        medicineId: med.id,
        familyMemberId: med.familyMemberId,
        reminderCycleId: cycle?.id ?? null,
        type: "refill_reminder",
        title: "MediStock \u2014 Medicine Refill Reminder",
        body,
        scheduledForDate: refDate,
        pushStatus: "in_app_only",
        nowIso
      });
      if (!inserted) continue;
      if (cycle) {
        await store2.markReminderCycleNotified(cycle.id, refDate, nowIso);
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
        body
      });
    }
    if (newMedNotifications.length > 0 && !options.skipWebPush) {
      const byMember = /* @__PURE__ */ new Map();
      for (const item of newMedNotifications) {
        const list = byMember.get(item.memberName) || [];
        list.push(item);
        byMember.set(item.memberName, list);
      }
      const summaryParts = [];
      for (const [memberName, items] of byMember.entries()) {
        if (items.length === 1) {
          summaryParts.push(items[0].body);
        } else {
          summaryParts.push(
            `${memberName} has ${items.length} medicines that need attention (${items.map((i) => i.medName).join(", ")}).`
          );
        }
      }
      const pushResult = await dispatchWebPushToUser(store2, user.id, {
        title: "MediStock \u2014 Medicine Refill Reminder",
        body: summaryParts.join(" "),
        url: "/?view=reminders",
        tag: `medistock-refill-${refDate}`
      });
      if (pushResult.status === "sent") pushSent++;
      for (const item of newMedNotifications) {
        await store2.updateNotificationPushStatus(
          item.notificationId,
          pushResult.status,
          pushResult.lastError
        );
      }
    }
  }
  return { createdNotifications, pushSent };
}

// server/app.ts
var dateStringSchema = z.string().trim().refine((val) => isValidCalendarDate(val), { message: "Please enter a valid calendar date." });
var signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(50, "Name must be 50 characters or fewer."),
  password: z.string().min(6, "Password must be at least 6 characters.").max(128, "Password is too long.")
});
var loginSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  password: z.string().min(1, "Password is required.")
});
var memberSchema = z.object({
  name: z.string().trim().min(1, "Family member name is required.").max(60, "Name must be 60 characters or fewer."),
  relationship: z.string().trim().max(40, "Relationship must be 40 characters or fewer.").optional().nullable()
});
var createMedicineSchema = z.object({
  name: z.string().trim().min(1, "Medicine name is required.").max(100, "Medicine name must be 100 characters or fewer."),
  familyMemberId: z.string().uuid("Please select a valid family member."),
  quantityPurchased: z.number("Quantity must be a number.").int("Quantity must be a whole number of tablets.").positive("Quantity must be greater than zero.").max(1e4, "Quantity seems unusually large (max 10,000)."),
  dailyUsage: z.number("Daily usage must be a number.").positive("Daily usage must be greater than zero.").max(100, "Daily usage must be 100 or fewer."),
  purchaseDate: dateStringSchema,
  notes: z.string().trim().max(500).optional().nullable(),
  remindersEnabled: z.boolean().optional().default(true)
});
var updateMedicineSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  familyMemberId: z.string().uuid().optional(),
  dailyUsage: z.number().positive().max(100).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  remindersEnabled: z.boolean().optional(),
  archived: z.boolean().optional()
});
var purchaseSchema = z.object({
  purchaseDate: dateStringSchema,
  quantityPurchased: z.number("Quantity must be a number.").int("Quantity must be a whole number of tablets.").positive("Purchased quantity must be greater than zero.").max(1e4),
  notes: z.string().trim().max(500).optional().nullable()
});
var adjustStockSchema = z.object({
  newQuantity: z.number("Quantity must be a number.").min(0, "Stock cannot be negative.").max(1e4),
  reason: z.string().trim().max(250).optional().nullable()
});
var preferencesSchema = z.object({
  dateFormat: z.enum(["MMM d, yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]).optional(),
  themePreference: z.enum(["light", "dark"]).optional(),
  notificationsEnabled: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional()
});
var changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(6, "New password must be at least 6 characters.").max(128, "Password is too long.")
});
var pushSubscriptionSchema = z.object({
  endpoint: z.string().url("Invalid push endpoint URL."),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});
function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function createApp(store2, options = {}) {
  const app2 = express();
  app2.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });
  app2.use(express.json({ limit: "1mb" }));
  app2.use(cookieParser());
  const authRateLimiter = options.skipRateLimit ? (_req, _res, next) => next() : createRateLimiter({ windowMs: 6e4, maxRequests: 25 });
  const requireAuth = createAuthMiddleware(store2);
  app2.get(
    "/api/health",
    asyncRoute(async (_req, res) => {
      const status = await checkSupabaseSchema();
      res.json({
        ok: true,
        supabaseConfigured: status.configured,
        schemaReady: status.schemaReady,
        ...status.reason ? { message: status.reason } : {}
      });
    })
  );
  app2.get(
    "/api/setup/migration-sql",
    asyncRoute(async (_req, res) => {
      const status = await checkSupabaseSchema();
      if (status.schemaReady) {
        return res.status(404).json({ error: "Database schema is already initialized." });
      }
      const sqlPath = path.resolve(process.cwd(), "supabase/migrations/001_medistock_schema.sql");
      if (!fs.existsSync(sqlPath)) {
        return res.status(404).json({ error: "Migration file not found." });
      }
      const sql = fs.readFileSync(sqlPath, "utf8");
      res.json({ sql });
    })
  );
  app2.get(
    "/api/auth/check-name",
    asyncRoute(async (req, res) => {
      const rawName = String(req.query.name || "");
      const normalized = normalizeUserName(rawName);
      if (normalized.length < 2) {
        return res.json({ available: false, reason: "Name must be at least 2 characters." });
      }
      const existing = await store2.findUserByNormalizedName(normalized);
      res.json({ available: !existing });
    })
  );
  app2.post(
    "/api/auth/signup",
    authRateLimiter,
    asyncRoute(async (req, res) => {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
      }
      const displayName = parsed.data.name.trim().replace(/\s+/g, " ");
      const normalized = normalizeUserName(displayName);
      const existing = await store2.findUserByNormalizedName(normalized);
      if (existing) {
        return res.status(409).json({
          error: "An account with this name already exists. Please choose another name or log in."
        });
      }
      const userId = crypto3.randomUUID();
      const passwordHash = hashPassword(parsed.data.password);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const createdUser = await store2.createUser({
        id: userId,
        name: displayName,
        nameNormalized: normalized,
        passwordHash,
        nowIso
      });
      const session = await createSession(store2, userId);
      setSessionCookie(res, session.rawToken, session.expiresAt, req);
      res.status(201).json({
        user: toPublicUser(createdUser),
        token: session.rawToken
      });
    })
  );
  app2.post(
    "/api/auth/login",
    authRateLimiter,
    asyncRoute(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
      }
      const normalized = normalizeUserName(parsed.data.name);
      const user = await store2.findUserByNormalizedName(normalized);
      if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
        return res.status(401).json({ error: "Incorrect name or password." });
      }
      const session = await createSession(store2, user.id);
      setSessionCookie(res, session.rawToken, session.expiresAt, req);
      res.json({
        user: toPublicUser(user),
        token: session.rawToken
      });
    })
  );
  app2.post(
    "/api/auth/logout",
    requireAuth,
    asyncRoute(async (req, res) => {
      if (req.sessionTokenHash) {
        await store2.deleteSessionByTokenHash(req.sessionTokenHash);
      }
      clearSessionCookie(res, req);
      res.json({ ok: true });
    })
  );
  app2.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });
  app2.patch(
    "/api/account/preferences",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = preferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid preferences." });
      }
      const userId = req.user.id;
      const updated = await store2.updateUserPreferences(
        userId,
        parsed.data,
        (/* @__PURE__ */ new Date()).toISOString()
      );
      if (parsed.data.notificationsEnabled === true) {
        await runReminderScheduler(store2, { userId });
      }
      res.json({ user: toPublicUser(updated) });
    })
  );
  app2.post(
    "/api/account/change-password",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid password." });
      }
      const userId = req.user.id;
      const user = await store2.findUserById(userId);
      if (!user || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
        return res.status(401).json({ error: "Current password is incorrect." });
      }
      const newHash = hashPassword(parsed.data.newPassword);
      await store2.updateUserPassword(userId, newHash, (/* @__PURE__ */ new Date()).toISOString());
      if (req.sessionTokenHash) {
        await store2.deleteOtherSessions(userId, req.sessionTokenHash);
      }
      res.json({ ok: true, message: "Password updated successfully." });
    })
  );
  app2.get(
    "/api/account/export",
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user.id;
      const [familyMembers, medicines, purchases] = await Promise.all([
        getUserFamilyMembers(store2, userId, { includeArchived: true }),
        getUserMedicines(store2, userId, { includeArchived: true }),
        getPurchaseTransactions(store2, userId)
      ]);
      res.json({
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        account: { id: req.user.id, name: req.user.name },
        familyMembers,
        medicines,
        purchases
      });
    })
  );
  app2.delete(
    "/api/account",
    requireAuth,
    asyncRoute(async (req, res) => {
      const schema = z.object({
        password: z.string().min(1, "Password is required to delete your account.")
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Password required." });
      }
      const userId = req.user.id;
      const user = await store2.findUserById(userId);
      if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
        return res.status(401).json({ error: "Incorrect password. Account was not deleted." });
      }
      await store2.deleteUserAccountCascade(userId);
      clearSessionCookie(res, req);
      res.json({ ok: true });
    })
  );
  app2.get(
    "/api/dashboard",
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user.id;
      await runReminderScheduler(store2, { userId });
      const summary = await getDashboardSummary(store2, userId);
      res.json(summary);
    })
  );
  app2.get(
    "/api/family-members",
    requireAuth,
    asyncRoute(async (req, res) => {
      const includeArchived = req.query.includeArchived === "true";
      const members = await getUserFamilyMembers(store2, req.user.id, { includeArchived });
      res.json({ familyMembers: members });
    })
  );
  app2.get(
    "/api/family-members/:id",
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user.id;
      const memberId = String(req.params.id);
      const members = await getUserFamilyMembers(store2, userId, { includeArchived: true });
      const member = members.find((m) => m.id === memberId);
      if (!member) {
        return res.status(404).json({ error: "Family member not found." });
      }
      const [medicines, recentPurchases] = await Promise.all([
        getUserMedicines(store2, userId, { familyMemberId: memberId }),
        getPurchaseTransactions(store2, userId, { familyMemberId: memberId, limit: 20 })
      ]);
      const upcomingPurchases = medicines.filter((m) => m.stockStatus !== "IN_STOCK").sort((a, b) => a.stockEndDate.localeCompare(b.stockEndDate));
      res.json({ member, medicines, upcomingPurchases, recentPurchases });
    })
  );
  app2.post(
    "/api/family-members",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = memberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
      }
      const userId = req.user.id;
      const id = crypto3.randomUUID();
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const rel = parsed.data.relationship?.trim() || null;
      await store2.createFamilyMember({
        id,
        userId,
        name: parsed.data.name,
        relationship: rel,
        nowIso
      });
      const members = await getUserFamilyMembers(store2, userId);
      const created = members.find((m) => m.id === id);
      res.status(201).json({ familyMember: created });
    })
  );
  app2.patch(
    "/api/family-members/:id",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = memberSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
      }
      const userId = req.user.id;
      const memberId = String(req.params.id);
      const existing = await getFamilyMemberById(store2, userId, memberId);
      if (!existing) {
        return res.status(404).json({ error: "Family member not found." });
      }
      const name = parsed.data.name ?? existing.name;
      const relationship = parsed.data.relationship !== void 0 ? parsed.data.relationship?.trim() || null : existing.relationship;
      await store2.updateFamilyMember(userId, memberId, { name, relationship }, (/* @__PURE__ */ new Date()).toISOString());
      const members = await getUserFamilyMembers(store2, userId, { includeArchived: true });
      res.json({ familyMember: members.find((m) => m.id === memberId) });
    })
  );
  app2.delete(
    "/api/family-members/:id",
    requireAuth,
    asyncRoute(async (req, res) => {
      const schema = z.object({
        mode: z.enum(["archive", "reassign_and_delete", "delete_if_empty"]).default("delete_if_empty"),
        reassignToMemberId: z.string().uuid().optional(),
        archiveMedicines: z.boolean().optional().default(true)
      });
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid deletion parameters." });
      }
      const userId = req.user.id;
      const memberId = String(req.params.id);
      const existing = await getFamilyMemberById(store2, userId, memberId);
      if (!existing) {
        return res.status(404).json({ error: "Family member not found." });
      }
      const counts = await store2.countMemberRecords(userId, memberId);
      const hasRecords = counts.medicineCount > 0 || counts.purchaseCount > 0;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      if (parsed.data.mode === "archive") {
        await store2.archiveFamilyMember(userId, memberId, parsed.data.archiveMedicines, nowIso);
        return res.json({ ok: true, action: "archived" });
      }
      if (parsed.data.mode === "reassign_and_delete") {
        const targetId = parsed.data.reassignToMemberId;
        if (!targetId || targetId === memberId) {
          return res.status(400).json({ error: "Please select a different family member to reassign records to." });
        }
        const targetMember = await getFamilyMemberById(store2, userId, targetId);
        if (!targetMember || targetMember.archived) {
          return res.status(404).json({ error: "Target family member not found." });
        }
        await store2.reassignAndDeleteFamilyMember(userId, memberId, targetId, nowIso);
        return res.json({ ok: true, action: "reassigned_and_deleted" });
      }
      if (hasRecords) {
        return res.status(409).json({
          error: "This family member has linked medicines or purchase history. Archive them or reassign their medicines before deleting.",
          requiresAction: true,
          medicineCount: counts.medicineCount,
          purchaseCount: counts.purchaseCount
        });
      }
      await store2.deleteFamilyMember(userId, memberId);
      res.json({ ok: true, action: "deleted" });
    })
  );
  app2.get(
    "/api/medicines",
    requireAuth,
    asyncRoute(async (req, res) => {
      const includeArchived = req.query.includeArchived === "true";
      const familyMemberId = req.query.familyMemberId ? String(req.query.familyMemberId) : void 0;
      const medicines = await getUserMedicines(store2, req.user.id, {
        includeArchived,
        familyMemberId
      });
      res.json({ medicines });
    })
  );
  app2.get(
    "/api/medicines/:id",
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user.id;
      const medicineId = String(req.params.id);
      const medicine = await getUserMedicineById(store2, userId, medicineId);
      if (!medicine) {
        return res.status(404).json({ error: "Medicine not found." });
      }
      const [purchases, adjustments, allCycles] = await Promise.all([
        getPurchaseTransactions(store2, userId, { medicineId }),
        getStockAdjustments(store2, userId, medicineId),
        getReminderCycles(store2, userId, "all")
      ]);
      const reminderCycles = allCycles.filter((rc) => rc.medicineId === medicineId);
      res.json({ medicine, purchases, adjustments, reminderCycles });
    })
  );
  app2.post(
    "/api/medicines",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = createMedicineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid medicine data." });
      }
      const userId = req.user.id;
      const member = await getFamilyMemberById(store2, userId, parsed.data.familyMemberId);
      if (!member || member.archived) {
        return res.status(404).json({ error: "Selected family member does not belong to your account." });
      }
      const medicineId = crypto3.randomUUID();
      const purchaseId = crypto3.randomUUID();
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const notes = parsed.data.notes?.trim() || null;
      await store2.createMedicineWithInitialPurchase({
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
        nowIso
      });
      await syncMedicineReminderCycle(store2, userId, medicineId);
      await runReminderScheduler(store2, { userId });
      const created = await getUserMedicineById(store2, userId, medicineId);
      res.status(201).json({ medicine: created });
    })
  );
  app2.patch(
    "/api/medicines/:id",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = updateMedicineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid medicine update." });
      }
      const userId = req.user.id;
      const medicineId = String(req.params.id);
      const existing = await getUserMedicineById(store2, userId, medicineId);
      if (!existing) {
        return res.status(404).json({ error: "Medicine not found." });
      }
      let nextMemberId = existing.familyMemberId;
      if (parsed.data.familyMemberId && parsed.data.familyMemberId !== existing.familyMemberId) {
        const targetMember = await getFamilyMemberById(store2, userId, parsed.data.familyMemberId);
        if (!targetMember || targetMember.archived) {
          return res.status(404).json({ error: "Selected family member not found." });
        }
        nextMemberId = targetMember.id;
      }
      let nextBaselineQty = existing.baselineQuantity;
      let nextBaselineDate = existing.baselineDate;
      let nextDailyUsage = existing.dailyUsage;
      if (parsed.data.dailyUsage !== void 0 && parsed.data.dailyUsage !== existing.dailyUsage) {
        const recalc = recalculateAfterUsageChange({
          currentBaselineQuantity: existing.baselineQuantity,
          currentBaselineDate: existing.baselineDate,
          oldDailyUsage: existing.dailyUsage,
          newDailyUsage: parsed.data.dailyUsage
        });
        nextBaselineQty = recalc.newBaselineQuantity;
        nextBaselineDate = recalc.newBaselineDate;
        nextDailyUsage = parsed.data.dailyUsage;
      }
      const nextName = parsed.data.name ?? existing.name;
      const nextNotes = parsed.data.notes !== void 0 ? parsed.data.notes?.trim() || null : existing.notes;
      const nextReminders = parsed.data.remindersEnabled !== void 0 ? parsed.data.remindersEnabled : existing.remindersEnabled;
      const nextArchived = parsed.data.archived !== void 0 ? parsed.data.archived : existing.archived;
      await store2.updateMedicine(
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
          archived: nextArchived
        },
        (/* @__PURE__ */ new Date()).toISOString()
      );
      await syncMedicineReminderCycle(store2, userId, medicineId);
      await runReminderScheduler(store2, { userId });
      const updated = await getUserMedicineById(store2, userId, medicineId);
      res.json({ medicine: updated });
    })
  );
  app2.post(
    "/api/medicines/:id/purchase",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = purchaseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid purchase details." });
      }
      const userId = req.user.id;
      const medicineId = String(req.params.id);
      const existing = await getUserMedicineById(store2, userId, medicineId);
      if (!existing || existing.archived) {
        return res.status(404).json({ error: "Medicine not found or archived." });
      }
      const refill = calculateRefillResult({
        currentBaselineQuantity: existing.baselineQuantity,
        currentBaselineDate: existing.baselineDate,
        dailyUsage: existing.dailyUsage,
        actualPurchaseDate: parsed.data.purchaseDate,
        quantityPurchased: parsed.data.quantityPurchased
      });
      const purchaseId = crypto3.randomUUID();
      const notificationId = crypto3.randomUUID();
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const notes = parsed.data.notes?.trim() || null;
      await store2.recordPurchase({
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
        nowIso
      });
      await syncMedicineReminderCycle(store2, userId, existing.id);
      await runReminderScheduler(store2, { userId });
      const updated = await getUserMedicineById(store2, userId, existing.id);
      res.status(201).json({
        medicine: updated,
        purchaseId,
        previousRemaining: refill.previousRemaining,
        resultingStock: refill.resultingStock
      });
    })
  );
  app2.post(
    "/api/medicines/:id/adjust",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = adjustStockSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid stock adjustment." });
      }
      const userId = req.user.id;
      const medicineId = String(req.params.id);
      const existing = await getUserMedicineById(store2, userId, medicineId);
      if (!existing) {
        return res.status(404).json({ error: "Medicine not found." });
      }
      const today = getTodayLocalDateStr();
      const currentEval = evaluateMedicineStock({
        baselineQuantity: existing.baselineQuantity,
        dailyUsage: existing.dailyUsage,
        baselineDate: existing.baselineDate,
        referenceDate: today
      });
      const previousQty = currentEval.remainingTablets;
      const newQty = parsed.data.newQuantity;
      const delta = Number((newQty - previousQty).toFixed(2));
      const adjustmentId = crypto3.randomUUID();
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      await store2.recordStockAdjustment({
        adjustmentId,
        userId,
        medicineId: existing.id,
        adjustmentDate: today,
        previousQuantity: previousQty,
        newQuantity: newQty,
        delta,
        reason: parsed.data.reason?.trim() || null,
        nowIso
      });
      await syncMedicineReminderCycle(store2, userId, existing.id);
      await runReminderScheduler(store2, { userId });
      const updated = await getUserMedicineById(store2, userId, existing.id);
      res.json({ medicine: updated });
    })
  );
  app2.get(
    "/api/purchases",
    requireAuth,
    asyncRoute(async (req, res) => {
      const familyMemberId = req.query.familyMemberId ? String(req.query.familyMemberId) : void 0;
      const medicineId = req.query.medicineId ? String(req.query.medicineId) : void 0;
      const purchases = await getPurchaseTransactions(store2, req.user.id, {
        familyMemberId,
        medicineId
      });
      res.json({ purchases });
    })
  );
  app2.get(
    "/api/calendar",
    requireAuth,
    asyncRoute(async (req, res) => {
      const familyMemberId = req.query.familyMemberId ? String(req.query.familyMemberId) : void 0;
      const events = await getCalendarEvents(store2, req.user.id, { familyMemberId });
      res.json({ events });
    })
  );
  app2.get(
    "/api/reminders",
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user.id;
      await runReminderScheduler(store2, { userId });
      const [pending, history] = await Promise.all([
        getReminderCycles(store2, userId, "pending"),
        getReminderCycles(store2, userId, "resolved")
      ]);
      res.json({ pending, history });
    })
  );
  app2.get(
    "/api/notifications",
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user.id;
      await runReminderScheduler(store2, { userId });
      const notifications = await getUserNotifications(store2, userId);
      const unreadCount = notifications.filter((n) => !n.readAt).length;
      res.json({ notifications, unreadCount });
    })
  );
  app2.post(
    "/api/notifications/:id/read",
    requireAuth,
    asyncRoute(async (req, res) => {
      await store2.markNotificationRead(req.user.id, String(req.params.id), (/* @__PURE__ */ new Date()).toISOString());
      res.json({ ok: true });
    })
  );
  app2.post(
    "/api/notifications/read-all",
    requireAuth,
    asyncRoute(async (req, res) => {
      await store2.markAllNotificationsRead(req.user.id, (/* @__PURE__ */ new Date()).toISOString());
      res.json({ ok: true });
    })
  );
  app2.get("/api/push/vapid-public-key", requireAuth, (_req, res) => {
    const vapid = getVapidConfig();
    res.json({ publicKey: vapid.publicKey, configured: vapid.configured });
  });
  app2.get(
    "/api/push/status",
    requireAuth,
    asyncRoute(async (req, res) => {
      const activeSubscriptionsCount = await store2.countActivePushSubscriptions(req.user.id);
      const vapid = getVapidConfig();
      res.json({
        activeSubscriptionsCount,
        vapidConfigured: vapid.configured
      });
    })
  );
  app2.post(
    "/api/push/subscribe",
    requireAuth,
    asyncRoute(async (req, res) => {
      const parsed = pushSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid push subscription." });
      }
      await store2.upsertPushSubscription({
        id: crypto3.randomUUID(),
        userId: req.user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: req.headers["user-agent"] || null,
        nowIso: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.status(201).json({ ok: true });
    })
  );
  app2.post(
    "/api/push/unsubscribe",
    requireAuth,
    asyncRoute(async (req, res) => {
      const endpoint = req.body?.endpoint ? String(req.body.endpoint) : null;
      await store2.deactivatePushSubscriptions(req.user.id, endpoint, (/* @__PURE__ */ new Date()).toISOString());
      res.json({ ok: true });
    })
  );
  app2.post(
    "/api/push/test",
    requireAuth,
    asyncRoute(async (req, res) => {
      const userId = req.user.id;
      const result = await dispatchWebPushToUser(store2, userId, {
        title: "MediStock \u2014 Test Notification",
        body: "Background refill reminders are active and ready for your family medicines.",
        url: "/?view=reminders",
        tag: "medistock-test"
      });
      await store2.createNotification({
        id: crypto3.randomUUID(),
        userId,
        type: "system",
        title: "Test Notification",
        body: result.status === "sent" ? "Push notification delivered to your subscribed browser/device." : result.status === "no_subscription" ? "In-app alert created. Browser push is not subscribed on this device yet." : `In-app alert created, but push delivery failed: ${result.lastError || "Unknown error"}.`,
        pushStatus: result.status,
        pushError: result.lastError,
        nowIso: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json({
        status: result.status,
        deliveredCount: result.deliveredCount,
        failedCount: result.failedCount,
        error: result.lastError
      });
    })
  );
  app2.use((err, _req, res, _next) => {
    if (err instanceof StoreError || err && typeof err === "object" && ("status" in err || "code" in err)) {
      const anyErr = err;
      return res.status(anyErr.status || 500).json({
        error: anyErr.message || "Database error occurred.",
        code: anyErr.code || "QUERY_FAILED"
      });
    }
    console.error("Unhandled API error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "An unexpected server error occurred. Please try again."
    });
  });
  return app2;
}

// server/serverless.ts
var store = createSupabaseStore();
var app = createApp(store);
function handler(req, res) {
  try {
    const matched = req.headers["x-matched-path"] || req.headers["x-vercel-matched-path"] || req.url;
    if (matched && typeof matched === "string") {
      const urlObj = new URL(matched, "http://localhost");
      const pathname = urlObj.pathname.startsWith("/api") ? urlObj.pathname : `/api${urlObj.pathname}`;
      req.url = pathname + (urlObj.search || "");
    }
    return app(req, res);
  } catch (err) {
    console.error("Serverless error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || "Server error occurred." });
    }
  }
}
export {
  handler as default
};
