import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

type Role = "admin" | "staff" | "coach" | "player";
const ROLE_VALUES: Role[] = ["admin", "staff", "coach", "player"];
type UserStatus = "active" | "pending";
const USER_STATUS_VALUES: UserStatus[] = ["active", "pending"];
type AuthMode = "mock" | "supabase";

let supabaseCreateClientFactory: ((url: string, key: string) => any) | null = null;
let cachedAnonClient: any | null = null;
let cachedServiceClient: any | null = null;

const loadSupabaseCreateClient = async () => {
  if (supabaseCreateClientFactory) return supabaseCreateClientFactory;
  const mod = await import("jsr:@supabase/supabase-js@2.49.8");
  supabaseCreateClientFactory = mod.createClient;
  return supabaseCreateClientFactory;
};

const authMode = (): AuthMode => {
  const raw = String(Deno.env.get("AUTH_MODE") || "").trim().toLowerCase();
  return raw === "supabase" ? "supabase" : "mock";
};

const supabaseUrl = () => String(Deno.env.get("SUPABASE_URL") || "").trim();
const supabaseAnonKey = () => String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
const supabaseServiceRoleKey = () =>
  String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "").trim();
const adminSignupCode = () => String(Deno.env.get("ADMIN_SIGNUP_CODE") || "").trim();

const hasSupabaseAuthEnv = () => {
  try {
    return !!Deno.env.get("SUPABASE_URL") && !!Deno.env.get("SUPABASE_ANON_KEY");
  } catch {
    return false;
  }
};

const hasSupabaseServiceEnv = () => {
  try {
    return !!Deno.env.get("SUPABASE_URL") && !!(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY"));
  } catch {
    return false;
  }
};

const supabaseAnonClient = async () => {
  if (cachedAnonClient) return cachedAnonClient;
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
  const createClient = await loadSupabaseCreateClient();
  cachedAnonClient = createClient(url, key);
  return cachedAnonClient;
};

const supabaseServiceClient = async () => {
  if (cachedServiceClient) return cachedServiceClient;
  const url = supabaseUrl();
  const key = supabaseServiceRoleKey();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  const createClient = await loadSupabaseCreateClient();
  cachedServiceClient = createClient(url, key);
  return cachedServiceClient;
};

type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  phone?: string;
  avatar?: string;
  skillLevel?: string;
  coachProfile?: string;
  coachExpertise?: string[];
  coachVerificationStatus?: "unverified" | "pending" | "verified" | "rejected";
  coachVerificationMethod?: "certification" | "license" | "experience" | "other";
  coachVerificationDocumentName?: string;
  coachVerificationId?: string;
  coachVerificationNotes?: string;
  coachVerificationSubmittedAt?: string;
  createdAt?: string;
};

type ApiCourt = {
  id: string;
  name: string;
  courtNumber: string;
  type: string;
  surfaceType: string;
  hourlyRate: number;
  peakHourRate?: number;
  status: string;
  imageUrl?: string;
  operatingHours: { start: string; end: string };
};

type ApiBooking = {
  id: string;
  courtId: string;
  userId: string;
  type: "open_play" | "private" | "training";
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  paymentStatus: "unpaid" | "paid" | "refunded";
  amount: number;
  players?: string[];
  maxPlayers?: number;
  coachId?: string;
  sport?: string;
  attendance?: Record<string, boolean>;
  notes?: string;
  checkedIn: boolean;
  checkedInAt?: string;
  rejectionReason?: string;
  paymentDueAt?: string;
  receiptToken?: string;
  createdAt: string;
  updatedAt?: string;
};

type ApiNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning";
  read: boolean;
  createdAt: string;
};

type ApiSubscription = {
  id: string;
  userId: string;
  planId: string;
  paymentMethod: string;
  status: "active" | "cancelled" | "expired";
  createdAt: string;
  cancelledAt?: string;
};

type ApiFacilityConfig = {
  openingTime: string;
  closingTime: string;
  bookingInterval: number;
  bufferTime: number;
  maxBookingDuration: number;
  advanceBookingDays: number;
  cancellationCutoffHours: number;
  peakHours: Array<{ start: string; end: string }>;
  maintenanceMode?: boolean;
};

type AdminDataSnapshot = {
  users: ApiUser[];
  courts: ApiCourt[];
  bookings: ApiBooking[];
  memberships: any[];
  subscriptions: ApiSubscription[];
  notifications: ApiNotification[];
  coachApplications: ApiCoachApplication[];
  coachRegistrations: ApiCoachRegistration[];
  config: ApiFacilityConfig;
};

type ApiCoachApplication = {
  id: string;
  coachId: string;
  playerId: string;
  sport: string;
  message?: string;
  preferredSchedule?: string;
  status: "pending" | "approved" | "rejected";
  reviewNote?: string;
  createdAt: string;
  updatedAt?: string;
};

type ApiCoachRegistration = {
  id: string;
  email: string;
  // Legacy: plaintext password (kept for backward compatibility with older stored records).
  password?: string;
  // Preferred: hashed password credential for mock auth mode.
  passwordHash?: string;
  name: string;
  phone?: string;
  coachProfile?: string;
  coachExpertise?: string[];
  verificationMethod: "certification" | "license" | "experience" | "other";
  verificationDocumentName: string;
  verificationId?: string;
  verificationNotes?: string;
  status: "pending" | "approved" | "rejected";
  reviewNote?: string;
  createdAt: string;
  updatedAt?: string;
};

type ApiCoachRegistrationSafe = Omit<ApiCoachRegistration, "password" | "passwordHash">;

type CoachRegistrationDraft = {
  name: string;
  phone?: string;
  coachProfile?: string;
  coachExpertise: string[];
  verificationMethod: ApiCoachRegistration["verificationMethod"] | "";
  verificationDocumentName: string;
  verificationId?: string;
  verificationNotes?: string;
};

type ApiAuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorRole: Role;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

type ApiBookingHold = {
  id: string;
  courtId: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  expiresAt: string;
};

type ApiIdempotencyRecord = {
  requestHash: string;
  response: {
    success: boolean;
    data: unknown;
    meta: Record<string, unknown>;
    error: unknown;
  };
  status: number;
  createdAt: string;
};

type ApiPaymentTransaction = {
  id: string;
  bookingId: string;
  userId: string;
  provider: "mock" | "gateway";
  method: "maya" | "gcash";
  amount: number;
  currency: string;
  status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
  checkoutUrl?: string;
  providerReference?: string;
  providerPayload?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  paidAt?: string;
};

type ApiRateLimitRecord = {
  count: number;
  resetAt: string;
};

const isRole = (value: string): value is Role => ROLE_VALUES.includes(value as Role);
const isUserStatus = (value: string): value is UserStatus => USER_STATUS_VALUES.includes(value as UserStatus);
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const allowPrivilegedSignup = () => {
  try {
    const raw = String(Deno.env.get("AUTH_ALLOW_PRIVILEGED_SIGNUP") || "").trim().toLowerCase();
    return raw === "true" || raw === "1" || raw === "yes";
  } catch {
    return false;
  }
};

export const app = new Hono();

app.use("*", async (c, next) => {
  const incoming = String(c.req.header("x-request-id") || "").trim();
  const requestId = incoming || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  c.header("x-request-id", requestId);
  await next();
});
app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-user-id",
      "x-user-role",
      "x-idempotency-key",
      "x-payment-signature",
      "x-request-id",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "x-request-id"],
    maxAge: 600,
  }),
);

const LEGACY_BASE_ROUTE = "/make-server-ce0562bb";
const API_BASE = "/api/v1";

const nowIso = () => new Date().toISOString();
const id = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const coachRegistrationPublicId = (registrationId: string) => `coach-reg-${registrationId}`;
const coachRegistrationInternalId = (value: string) => {
  const raw = String(value || "").trim();
  return raw.startsWith("coach-reg-") ? raw.slice("coach-reg-".length) : raw;
};
const mapCoachRegistrationToQueueUser = (registration: ApiCoachRegistration): ApiUser => ({
  id: coachRegistrationPublicId(registration.id),
  email: registration.email,
  name: registration.name,
  role: "coach",
  status: registration.status === "pending" ? "pending" : "active",
  phone: registration.phone,
  coachProfile: registration.coachProfile,
  coachExpertise: registration.coachExpertise || [],
  coachVerificationStatus: registration.status === "approved" ? "verified" : registration.status,
  coachVerificationMethod: registration.verificationMethod,
  coachVerificationDocumentName: registration.verificationDocumentName,
  coachVerificationId: registration.verificationId,
  coachVerificationNotes: registration.reviewNote || registration.verificationNotes,
  coachVerificationSubmittedAt: registration.createdAt,
  createdAt: registration.createdAt,
});
const sanitizeCoachRegistration = (registration: ApiCoachRegistration): ApiCoachRegistrationSafe => {
  const { password: _password, passwordHash: _passwordHash, ...safe } = registration;
  return safe;
};
const normalizeCoachRegistrationEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const sortCoachRegistrationsNewest = (items: ApiCoachRegistration[]) =>
  [...items].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
  );
const parseCoachExpertiseInput = (raw: unknown, fallback: string[] = []) =>
  Array.isArray(raw)
    ? raw.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : String(raw || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => item.length > 0)
        .concat(fallback.length > 0 && !raw ? fallback : [])
        .filter((item, index, arr) => arr.indexOf(item) === index);
const parseCoachRegistrationDraft = (
  body: any,
  fallback: Partial<ApiCoachRegistration> = {},
): CoachRegistrationDraft => ({
  name: String(body?.name || fallback.name || "").trim(),
  phone: String(body?.phone || fallback.phone || "").trim() || undefined,
  coachProfile: String(body?.coachProfile || fallback.coachProfile || "").trim() || undefined,
  coachExpertise: parseCoachExpertiseInput(body?.coachExpertise, Array.isArray(fallback.coachExpertise) ? fallback.coachExpertise : []),
  verificationMethod: String(
    body?.verificationMethod || body?.coachVerificationMethod || fallback.verificationMethod || "",
  ).trim() as CoachRegistrationDraft["verificationMethod"],
  verificationDocumentName: String(
    body?.verificationDocumentName || body?.documentName || fallback.verificationDocumentName || "",
  ).trim(),
  verificationId: String(body?.verificationId || fallback.verificationId || "").trim() || undefined,
  verificationNotes: String(body?.verificationNotes || body?.notes || fallback.verificationNotes || "").trim() || undefined,
});
const validateCoachRegistrationDraft = (draft: CoachRegistrationDraft) => {
  if (!draft.name) return "Name is required for coach registration.";
  if (!["certification", "license", "experience", "other"].includes(draft.verificationMethod || "")) {
    return "verificationMethod must be one of certification, license, experience, or other.";
  }
  if (!draft.verificationDocumentName) {
    return "verificationDocumentName is required for coach registration.";
  }
  return null;
};
const getCoachRegistrations = async () => (await kv.getByPrefix("coachreg:")) as ApiCoachRegistration[];
const findLatestCoachRegistrationByEmail = (
  registrations: ApiCoachRegistration[],
  email: string,
  statuses?: ApiCoachRegistration["status"][],
) =>
  sortCoachRegistrationsNewest(
    registrations.filter(
      (item) =>
        item.email.toLowerCase() === normalizeCoachRegistrationEmail(email) &&
        (!statuses || statuses.includes(item.status)),
    ),
  )[0];
const paymentDeadlineMinutes = () => {
  const fallback = 30;
  try {
    const raw = Number(Deno.env.get("BOOKING_PAYMENT_DEADLINE_MINUTES") || fallback);
    return Number.isFinite(raw) ? Math.max(1, raw) : fallback;
  } catch {
    return fallback;
  }
};
const paymentDueAtFromNow = () => new Date(Date.now() + paymentDeadlineMinutes() * 60 * 1000).toISOString();
const paymentProvider = (): "mock" | "gateway" => {
  try {
    const raw = String(Deno.env.get("PAYMENT_PROVIDER") || "mock").trim().toLowerCase();
    if (raw === "gateway") return "gateway";
    // Back-compat with older env docs that used method-like values.
    if (raw === "maya" || raw === "gcash") return "gateway";
    return "mock";
  } catch {
    return "mock";
  }
};
const bearerAuthRequired = () => {
  try {
    const raw = String(Deno.env.get("AUTH_REQUIRE_BEARER") || "").trim().toLowerCase();
    if (raw === "true" || raw === "1" || raw === "yes") return true;
    if (raw === "false" || raw === "0" || raw === "no") return false;
    // Safer default when using Supabase auth mode.
    return authMode() === "supabase";
  } catch {
    return authMode() === "supabase";
  }
};
const paymentApiKey = () => {
  try {
    return String(Deno.env.get("PAYMENT_API_KEY") || "").trim();
  } catch {
    return "";
  }
};
const readPositiveIntEnv = (name: string, fallback: number) => {
  try {
    const raw = Number(Deno.env.get(name) || fallback);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(1, Math.floor(raw));
  } catch {
    return fallback;
  }
};
const rateLimitConfig = (scope: string, fallback: { max: number; windowSeconds: number }) => {
  const prefix = scope.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_");
  return {
    max: readPositiveIntEnv(`RATE_LIMIT_${prefix}_MAX`, fallback.max),
    windowSeconds: readPositiveIntEnv(`RATE_LIMIT_${prefix}_WINDOW_SEC`, fallback.windowSeconds),
  };
};
const roleMatchesExpected = (actual: Role, expected: Role) => {
  if (expected === "admin") return actual === "admin" || actual === "staff";
  return actual === expected;
};
const requestClientKey = (c: any, userId?: string) => {
  if (userId) return `user:${userId}`;
  const forwarded = String(c.req.header("x-forwarded-for") || "").split(",")[0].trim();
  const real = String(c.req.header("x-real-ip") || "").trim();
  const cf = String(c.req.header("cf-connecting-ip") || "").trim();
  const ip = cf || forwarded || real || "unknown";
  return `ip:${ip}`;
};
const enforceRateLimit = async (
  c: any,
  options: { scope: string; key: string; max: number; windowSeconds: number },
) => {
  const storageKey = `ratelimit:${options.scope}:${options.key}`;
  const existing = (await kv.get(storageKey)) as ApiRateLimitRecord | null;
  const now = Date.now();
  const resetAtMs = existing ? new Date(existing.resetAt).getTime() : 0;
  if (existing && !Number.isNaN(resetAtMs) && now < resetAtMs && existing.count >= options.max) {
    const retryAfterSec = Math.max(1, Math.ceil((resetAtMs - now) / 1000));
    return jsonErr(c, 429, "RATE_LIMITED", "Too many requests. Please try again later.", { retryAfterSec });
  }

  const nextResetAtMs =
    existing && !Number.isNaN(resetAtMs) && now < resetAtMs ? resetAtMs : now + options.windowSeconds * 1000;
  const nextCount = existing && !Number.isNaN(resetAtMs) && now < resetAtMs ? existing.count + 1 : 1;
  await kv.set(storageKey, { count: nextCount, resetAt: new Date(nextResetAtMs).toISOString() });
  return null;
};
const paymentCheckoutEndpoint = () => {
  try {
    return String(Deno.env.get("PAYMENT_CHECKOUT_URL") || "").trim();
  } catch {
    return "";
  }
};
const paymentWebhookSecret = () => {
  try {
    return String(Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "").trim();
  } catch {
    return "";
  }
};
const paymentSuccessUrl = (txId: string) => {
  try {
    const fromEnv = String(Deno.env.get("PAYMENT_SUCCESS_URL") || "").trim();
    if (fromEnv) return `${fromEnv}${fromEnv.includes("?") ? "&" : "?"}tx=${encodeURIComponent(txId)}`;
  } catch {
    // no-op
  }
  const base = publicAppBaseUrl();
  return base ? `${base}/payment/success?tx=${encodeURIComponent(txId)}` : null;
};
const paymentCancelUrl = (txId: string) => {
  try {
    const fromEnv = String(Deno.env.get("PAYMENT_CANCEL_URL") || "").trim();
    if (fromEnv) return `${fromEnv}${fromEnv.includes("?") ? "&" : "?"}tx=${encodeURIComponent(txId)}`;
  } catch {
    // no-op
  }
  const base = publicAppBaseUrl();
  return base ? `${base}/payment/cancel?tx=${encodeURIComponent(txId)}` : null;
};
const withPaymentTransactionUpdate = (
  existing: ApiPaymentTransaction,
  patch: Partial<ApiPaymentTransaction>,
): ApiPaymentTransaction => ({
  ...existing,
  ...patch,
  updatedAt: nowIso(),
});
const paymentCanBeInitiatedBy = (booking: ApiBooking, actor: ApiUser, role: Role) => {
  if (role === "admin" || role === "staff") return true;
  if (role === "coach") return booking.userId === actor.id || booking.coachId === actor.id;
  return booking.userId === actor.id;
};
const resolveNextTxStatus = (
  current: ApiPaymentTransaction["status"],
  incoming: ApiPaymentTransaction["status"],
): ApiPaymentTransaction["status"] => {
  // Keep paid transactions terminal to avoid late webhook regressions.
  if (current === "paid" && incoming !== "paid") return "paid";
  return incoming;
};
const bookingReceiptCanBeReadBy = (booking: ApiBooking, actor: ApiUser, role: Role) => {
  if (role === "admin" || role === "staff") return true;
  return booking.userId === actor.id;
};
const normalizeWebhookPaymentStatus = (
  raw: string,
  fallback: ApiPaymentTransaction["status"],
): ApiPaymentTransaction["status"] => {
  const value = raw.trim().toLowerCase();
  if (!value) return fallback;
  if (["paid", "succeeded", "success", "charge.paid", "payment.paid"].includes(value)) return "paid" as const;
  if (["failed", "charge.failed", "payment.failed", "declined"].includes(value)) return "failed" as const;
  if (["expired", "timeout"].includes(value)) return "expired" as const;
  if (["cancelled", "canceled"].includes(value)) return "cancelled" as const;
  return fallback;
};

const requestIdFromContext = (c: any) => {
  const existing = String(c.res?.headers?.get?.("x-request-id") || "").trim();
  if (existing) return String(existing);
  const incoming = String(c.req?.header?.("x-request-id") || "").trim();
  if (incoming) return incoming;
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const okPayload = (data: unknown, meta: Record<string, unknown> = {}) => ({ success: true, data, meta, error: null });
const jsonOk = (c: any, data: any, meta: Record<string, unknown> = {}) => {
  const requestId = requestIdFromContext(c);
  c.header("x-request-id", requestId);
  return c.json(okPayload(data, { requestId, ...meta }));
};

const jsonErr = (
  c: any,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) => {
  const requestId = requestIdFromContext(c);
  c.header("x-request-id", requestId);
  return c.json(
    {
      success: false,
      data: null,
      meta: { requestId },
      error: { code, message, details },
    },
    status,
  );
};

const DEFAULT_FACILITY_CONFIG: ApiFacilityConfig = {
  openingTime: "07:00",
  closingTime: "22:00",
  bookingInterval: 60,
  bufferTime: 15,
  maxBookingDuration: 120,
  advanceBookingDays: 7,
  cancellationCutoffHours: 24,
  peakHours: [
    { start: "17:00", end: "21:00" },
    { start: "08:00", end: "12:00" },
  ],
  maintenanceMode: false,
};

const asNonNegativeInt = (value: unknown, fallback: number) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.floor(raw));
};

const normalizeFacilityConfig = (raw: any): ApiFacilityConfig => {
  const openingTime = isValidTime(String(raw?.openingTime || "")) ? String(raw.openingTime) : DEFAULT_FACILITY_CONFIG.openingTime;
  const closingTime = isValidTime(String(raw?.closingTime || "")) ? String(raw.closingTime) : DEFAULT_FACILITY_CONFIG.closingTime;
  const peakHoursRaw = Array.isArray(raw?.peakHours) ? raw.peakHours : DEFAULT_FACILITY_CONFIG.peakHours;
  const peakHours = peakHoursRaw
    .map((item: any) => ({
      start: String(item?.start || ""),
      end: String(item?.end || ""),
    }))
    .filter((item: { start: string; end: string }) => isValidTime(item.start) && isValidTime(item.end) && toMinutes(item.start) < toMinutes(item.end));

  return {
    openingTime,
    closingTime,
    bookingInterval: Math.max(15, asNonNegativeInt(raw?.bookingInterval, DEFAULT_FACILITY_CONFIG.bookingInterval)),
    bufferTime: asNonNegativeInt(raw?.bufferTime, DEFAULT_FACILITY_CONFIG.bufferTime),
    maxBookingDuration: Math.max(15, asNonNegativeInt(raw?.maxBookingDuration, DEFAULT_FACILITY_CONFIG.maxBookingDuration)),
    advanceBookingDays: asNonNegativeInt(raw?.advanceBookingDays, DEFAULT_FACILITY_CONFIG.advanceBookingDays),
    cancellationCutoffHours: asNonNegativeInt(raw?.cancellationCutoffHours, DEFAULT_FACILITY_CONFIG.cancellationCutoffHours),
    peakHours: peakHours.length > 0 ? peakHours : DEFAULT_FACILITY_CONFIG.peakHours,
    maintenanceMode: Boolean(raw?.maintenanceMode),
  };
};

const validateFacilityConfig = (config: ApiFacilityConfig): string | null => {
  if (!isValidTime(config.openingTime) || !isValidTime(config.closingTime)) {
    return "openingTime and closingTime must be HH:MM.";
  }
  if (toMinutes(config.openingTime) >= toMinutes(config.closingTime)) {
    return "openingTime must be earlier than closingTime.";
  }
  if (!Number.isFinite(config.bookingInterval) || config.bookingInterval < 15) {
    return "bookingInterval must be at least 15 minutes.";
  }
  if (!Number.isFinite(config.maxBookingDuration) || config.maxBookingDuration < 15) {
    return "maxBookingDuration must be at least 15 minutes.";
  }
  if (!Array.isArray(config.peakHours)) {
    return "peakHours must be an array.";
  }
  for (const peak of config.peakHours) {
    if (!isValidTime(peak.start) || !isValidTime(peak.end)) {
      return "Each peakHours item must use HH:MM start/end values.";
    }
    if (toMinutes(peak.start) >= toMinutes(peak.end)) {
      return "Each peakHours range must have start earlier than end.";
    }
  }
  return null;
};

const getFacilityConfig = async (): Promise<ApiFacilityConfig> => {
  const existing = (await kv.get("facility:config")) as ApiFacilityConfig | null;
  if (existing) return normalizeFacilityConfig(existing);
  const seeded = { ...DEFAULT_FACILITY_CONFIG };
  await kv.set("facility:config", seeded);
  return seeded;
};

const deleteByPrefixRecords = async <T extends { id?: string }>(prefix: string, records: T[]) => {
  const keys = records
    .map((record) => String(record?.id || "").trim())
    .filter(Boolean)
    .map((recordId) => `${prefix}:${recordId}`);
  if (keys.length === 0) return 0;
  await kv.mdel(keys);
  return keys.length;
};

const seedUsers = async (): Promise<ApiUser[]> => {
  const existing = await kv.getByPrefix("user:");
  if (existing.length > 0) return existing as ApiUser[];

  const users: ApiUser[] = [
    { id: "admin-1", email: "admin@court.com", name: "Admin User", role: "admin", status: "active", createdAt: nowIso() },
    { id: "staff-1", email: "staff@court.com", name: "Staff Member", role: "staff", status: "active", createdAt: nowIso() },
    { id: "coach-1", email: "coach@court.com", name: "Coach Mike", role: "coach", status: "active", createdAt: nowIso() },
    { id: "player-1", email: "player@court.com", name: "Alex Johnson", role: "player", status: "active", createdAt: nowIso() },
  ];
  await kv.mset(users.map((u) => `user:${u.id}`), users);
  return users;
};

const authCredentialKey = (userId: string) => `authcred:${userId}`;

const defaultPasswordForRole = (role: Role) => {
  if (role === "admin") return "admin";
  if (role === "staff") return "staff";
  if (role === "coach") return "coach";
  return "player";
};

const getUserPasswordCredential = async (user: ApiUser) => {
  const stored = (await kv.get(authCredentialKey(user.id))) as string | null;
  if (typeof stored === "string" && stored.trim().length > 0) return stored;
  return defaultPasswordForRole(user.role);
};

const base64Encode = (bytes: Uint8Array) => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // deno-lint-ignore no-deprecated-deno-api
  return btoa(binary);
};
const base64Decode = (value: string) => {
  // deno-lint-ignore no-deprecated-deno-api
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const PBKDF2_ITERATIONS = 120_000;
const passwordCredentialFormat = (iterations: number, saltB64: string, hashB64: string) =>
  `pbkdf2$sha256$${iterations}$${saltB64}$${hashB64}`;

const hashPassword = async (password: string) => {
  const rawPassword = String(password || "");
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const saltSource = salt as unknown as BufferSource;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rawPassword),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltSource, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256,
  );
  return passwordCredentialFormat(PBKDF2_ITERATIONS, base64Encode(salt), base64Encode(new Uint8Array(bits)));
};

const verifyPasswordCredential = async (password: string, credential: string) => {
  const stored = String(credential || "").trim();
  const supplied = String(password || "");
  if (!stored) return false;
  if (!stored.startsWith("pbkdf2$")) {
    // Legacy plaintext storage compatibility.
    return supplied === stored;
  }
  const parts = stored.split("$");
  if (parts.length !== 5) return false;
  const algo = parts[1];
  const iterations = Number(parts[2]);
  const saltB64 = parts[3];
  const hashB64 = parts[4];
  if (algo !== "sha256") return false;
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  let salt: Uint8Array;
  let expectedHash: Uint8Array;
  try {
    salt = base64Decode(saltB64);
    expectedHash = base64Decode(hashB64);
  } catch {
    return false;
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(supplied),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const saltSource = salt as unknown as BufferSource;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltSource, iterations },
    keyMaterial,
    expectedHash.byteLength * 8,
  );
  const actualHash = new Uint8Array(bits);
  if (actualHash.byteLength !== expectedHash.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.byteLength; i++) diff |= actualHash[i] ^ expectedHash[i];
  return diff === 0;
};

const setUserPasswordCredential = async (userId: string, credential: string) => {
  await kv.set(authCredentialKey(userId), String(credential || "").trim());
};

const setUserPassword = async (userId: string, password: string) => {
  const credential = await hashPassword(password);
  await setUserPasswordCredential(userId, credential);
};

const randomTempPassword = () => {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return `Tmp!${base64Encode(bytes).replaceAll("=", "").replaceAll("+", "A").replaceAll("/", "B")}`;
};

const minimumPasswordLength = () => {
  const fallback = 6;
  try {
    const raw = Number(Deno.env.get("AUTH_PASSWORD_MIN_LENGTH") || fallback);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(1, Math.floor(raw));
  } catch {
    return fallback;
  }
};

const seedCourts = async (): Promise<ApiCourt[]> => {
  const existing = await kv.getByPrefix("court:");
  if (existing.length > 0) return existing as ApiCourt[];

  const courts: ApiCourt[] = [
    {
      id: "c1",
      name: "Downtown Basketball Court A",
      courtNumber: "1",
      type: "indoor",
      surfaceType: "hardcourt",
      hourlyRate: 500,
      peakHourRate: 700,
      status: "active",
      operatingHours: { start: "06:00", end: "22:00" },
    },
    {
      id: "c2",
      name: "Riverside Tennis Court 1",
      courtNumber: "2",
      type: "indoor",
      surfaceType: "synthetic",
      hourlyRate: 500,
      peakHourRate: 700,
      status: "active",
      operatingHours: { start: "06:00", end: "22:00" },
    },
    {
      id: "c3",
      name: "Pickle Ball Court 1",
      courtNumber: "3",
      type: "outdoor",
      surfaceType: "hardcourt",
      hourlyRate: 300,
      peakHourRate: 450,
      status: "active",
      operatingHours: { start: "06:00", end: "18:00" },
    },
  ];
  await kv.mset(courts.map((ct) => `court:${ct.id}`), courts);
  return courts;
};

const seedPlans = async () => {
  const existing = await kv.getByPrefix("plan:");
  if (existing.length > 0) return existing;
  const plans = [
    { id: "m1", name: "Basic", price: 1000, interval: "month", tier: "basic", features: ["Outdoor court access"] },
    { id: "m2", name: "Pro", price: 2500, interval: "month", tier: "premium", features: ["All courts access"] },
  ];
  await kv.mset(plans.map((p) => `plan:${p.id}`), plans);
  return plans;
};

const extractBearerToken = (authorizationHeader: string | undefined) => {
  const raw = String(authorizationHeader || "").trim();
  if (!raw) return "";
  const [scheme, token] = raw.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return "";
  return token.trim();
};

const resolveUserIdFromBearerToken = async (token: string): Promise<string> => {
  if (!token) return "";
  if (token.startsWith("mock-access-")) return token.slice("mock-access-".length);
  if (token.startsWith("mock-refresh-")) return token.slice("mock-refresh-".length);

  if (authMode() !== "supabase") return "";
  if (!hasSupabaseServiceEnv()) return "";

  try {
    const supabase = await supabaseServiceClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return "";
    return String(data?.user?.id || "").trim();
  } catch {
    return "";
  }
};

const authContext = async (
  c: any,
): Promise<{ user: ApiUser | null; role: Role | null; authErrorCode?: string; authErrorMessage?: string }> => {
  await seedUsers();
  const bearerToken = extractBearerToken(c.req.header("authorization"));
  const bearerUserId = await resolveUserIdFromBearerToken(bearerToken);
  const headerUserId = (c.req.header("x-user-id") || "").trim();
  const roleHeader = (c.req.header("x-user-role") || "") as Role;
  const requireBearer = bearerAuthRequired();
  if (requireBearer && !bearerToken) {
    return {
      user: null,
      role: null,
      authErrorCode: "UNAUTHENTICATED",
      authErrorMessage: "Bearer token is required.",
    };
  }
  if (bearerToken && !bearerUserId && authMode() === "supabase") {
    return {
      user: null,
      role: null,
      authErrorCode: "UNAUTHENTICATED",
      authErrorMessage: hasSupabaseServiceEnv()
        ? "Invalid bearer token."
        : "Bearer token verification is not configured (missing SUPABASE_SERVICE_ROLE_KEY).",
    };
  }
  if (bearerUserId && headerUserId && bearerUserId !== headerUserId) {
    return {
      user: null,
      role: null,
      authErrorCode: "UNAUTHENTICATED",
      authErrorMessage: "Bearer token subject does not match x-user-id header.",
    };
  }
  const userId = bearerUserId || headerUserId;
  if (!userId) return { user: null, role: roleHeader || null };
  const user = (await kv.get(`user:${userId}`)) as ApiUser | null;
  if (!user) {
    return {
      user: null,
      role: roleHeader || null,
      authErrorCode: "UNAUTHENTICATED",
      authErrorMessage: "User not found for provided authentication identity.",
    };
  }
  // If bearer token is used, trust persisted user role and ignore header role.
  if (bearerUserId) return { user, role: user.role || null };
  return { user, role: user.role || roleHeader || null };
};

const requireAuth = async (c: any) => {
  const ctx = await authContext(c);
  if (!ctx.user) {
    return {
      err: jsonErr(c, 401, ctx.authErrorCode || "UNAUTHENTICATED", ctx.authErrorMessage || "Authentication required."),
    };
  }
  return { user: ctx.user, role: ctx.role as Role };
};

const requireRole = async (c: any, allowed: Role[]) => {
  const result = await requireAuth(c);
  if ("err" in result) return result;
  if (!allowed.includes(result.role)) {
    return { err: jsonErr(c, 403, "FORBIDDEN", "You do not have access to this resource.") };
  }
  return result;
};

const internalAuthHeaders = (c: any, userId: string, role: Role): Record<string, string> => {
  const headers: Record<string, string> = {
    "x-user-id": userId,
    "x-user-role": role,
  };
  const authorization = String(c.req.header("authorization") || "").trim();
  if (authorization) headers.authorization = authorization;
  const requestId = String(c.req.header("x-request-id") || "").trim();
  if (requestId) headers["x-request-id"] = requestId;
  return headers;
};

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const isValidTime = (time: string) => /^\d{2}:\d{2}$/.test(time);
const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isValidCurrencyAmount = (value: number) =>
  Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
const isValidBookingType = (value: string) => ["open_play", "private", "training"].includes(value);
const USER_SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
const isValidSkillLevel = (value: string) => USER_SKILL_LEVELS.includes(value as (typeof USER_SKILL_LEVELS)[number]);
const PLAN_INTERVALS = ["month", "year"] as const;
const PLAN_TIERS = ["basic", "premium", "elite"] as const;
const SUBSCRIPTION_PAYMENT_METHODS = ["card", "maya", "gcash", "cash"] as const;
const isValidPlanInterval = (value: string) => PLAN_INTERVALS.includes(value as (typeof PLAN_INTERVALS)[number]);
const isValidPlanTier = (value: string) => PLAN_TIERS.includes(value as (typeof PLAN_TIERS)[number]);
const isValidSubscriptionPaymentMethod = (value: string) =>
  SUBSCRIPTION_PAYMENT_METHODS.includes(value as (typeof SUBSCRIPTION_PAYMENT_METHODS)[number]);

const mergeDateTime = (date: string, time: string) => new Date(`${date}T${time}:00`);
const minutesBetween = (start: string, end: string) => toMinutes(end) - toMinutes(start);
const isPastSession = (date: string, endTime: string) => mergeDateTime(date, endTime).getTime() < Date.now();
const canTransitionBookingStatus = (
  from: ApiBooking["status"],
  to: ApiBooking["status"],
) => {
  if (from === to) return true;
  const allowed: Record<ApiBooking["status"], ApiBooking["status"][]> = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["cancelled", "completed", "no_show"],
    cancelled: [],
    completed: [],
    no_show: [],
  };
  return allowed[from].includes(to);
};
const isActiveReservation = (booking: ApiBooking) => booking.status === "pending" || booking.status === "confirmed";
const isPastHistoryReservation = (
  booking: ApiBooking,
  options: { includeNoShow: boolean; includeCancelled: boolean },
) => {
  if (booking.status === "completed") return true;
  if (options.includeNoShow && booking.status === "no_show") return true;
  if (options.includeCancelled && booking.status === "cancelled") return true;
  return false;
};

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  const as = toMinutes(aStart);
  const ae = toMinutes(aEnd);
  const bs = toMinutes(bStart);
  const be = toMinutes(bEnd);
  return as < be && bs < ae;
};
const isHoldExpired = (hold: ApiBookingHold) => new Date(hold.expiresAt).getTime() <= Date.now();
const getActiveBookingHolds = async (courtId?: string, date?: string) => {
  const holds = (await kv.getByPrefix("booking_hold:")) as ApiBookingHold[];
  const expired = holds.filter((hold) => isHoldExpired(hold));
  if (expired.length > 0) {
    await Promise.all(expired.map((hold) => kv.del(`booking_hold:${hold.id}`)));
  }
  let active = holds.filter((hold) => !isHoldExpired(hold));
  if (courtId) active = active.filter((hold) => hold.courtId === courtId);
  if (date) active = active.filter((hold) => hold.date === date);
  return active;
};

const isWithinOperatingHours = (
  startTime: string,
  endTime: string,
  operatingHours: { start: string; end: string },
) => {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const open = toMinutes(operatingHours.start);
  const close = toMinutes(operatingHours.end);
  return start >= open && end <= close && start < end;
};

const isCheckInWindow = (booking: ApiBooking) => {
  const now = new Date();
  const sessionStart = mergeDateTime(booking.date, booking.startTime);
  const openWindow = new Date(sessionStart.getTime() - 30 * 60 * 1000);
  const closeWindow = new Date(sessionStart.getTime() + 15 * 60 * 1000);
  return now >= openWindow && now <= closeWindow;
};

const notify = async (payload: Omit<ApiNotification, "id" | "createdAt" | "read">) => {
  const item: ApiNotification = {
    id: id(),
    userId: payload.userId,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    read: false,
    createdAt: nowIso(),
  };
  await kv.set(`notification:${item.id}`, item);
  return item;
};
const writeAuditLog = async (payload: Omit<ApiAuditLog, "id" | "createdAt">) => {
  const log: ApiAuditLog = {
    id: id(),
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    actorId: payload.actorId,
    actorRole: payload.actorRole,
    metadata: payload.metadata,
    createdAt: nowIso(),
  };
  await kv.set(`audit:${log.id}`, log);
  return log;
};
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const idempotencyStorageKey = (actorId: string, scope: string, idemKey: string) => `idem:${actorId}:${scope}:${idemKey}`;
const getIdempotencyRecord = async (
  actorId: string,
  scope: string,
  idemKey: string,
): Promise<ApiIdempotencyRecord | null> =>
  ((await kv.get(idempotencyStorageKey(actorId, scope, idemKey))) as ApiIdempotencyRecord | null) || null;
const saveIdempotencyRecord = async (
  actorId: string,
  scope: string,
  idemKey: string,
  record: ApiIdempotencyRecord,
) => {
  await kv.set(idempotencyStorageKey(actorId, scope, idemKey), record);
};
const maybeReplayIdempotency = async (
  c: any,
  actorId: string,
  scope: string,
  idemKey: string | undefined,
  requestHash: string,
) => {
  if (!idemKey) return null;
  const existing = await getIdempotencyRecord(actorId, scope, idemKey);
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    return jsonErr(c, 409, "CONFLICT", "Idempotency key was already used with a different request payload.");
  }
  return c.json(existing.response, existing.status);
};

const bookingTimestamp = (booking: ApiBooking) => booking.updatedAt || booking.createdAt;
const withBookingUpdate = (existing: ApiBooking, patch: Partial<ApiBooking>): ApiBooking => ({
  ...existing,
  ...patch,
  updatedAt: nowIso(),
});
const withCoachApplicationUpdate = (
  existing: ApiCoachApplication,
  patch: Partial<ApiCoachApplication>,
): ApiCoachApplication => ({
  ...existing,
  ...patch,
  updatedAt: nowIso(),
});
const bookingCanBeReadBy = (booking: ApiBooking, actor: ApiUser, role: Role) => {
  const isOwner = booking.userId === actor.id;
  const isJoinedPlayer = role === "player" && (booking.players || []).includes(actor.id);
  const isCoachParticipant =
    role === "coach" &&
    (booking.userId === actor.id || booking.coachId === actor.id || (booking.players || []).includes(actor.id));
  const isPrivileged = role === "admin" || role === "staff";
  return isOwner || isJoinedPlayer || isCoachParticipant || isPrivileged;
};
const publicAppBaseUrl = () => {
  try {
    const env = Deno.env.get("PUBLIC_APP_BASE_URL");
    return env ? env.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
};
const buildReceiptUrl = (booking: ApiBooking) => {
  const baseUrl = publicAppBaseUrl();
  if (!baseUrl) return null;
  const params = new URLSearchParams({
    id: booking.id,
    courtId: booking.courtId,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    amount: String(booking.amount || 0),
    status: booking.status,
  });
  return `${baseUrl}/receipt?${params.toString()}`;
};
const buildPublicReceiptUrl = (receiptToken: string) => {
  const baseUrl = publicAppBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/receipt/public/${encodeURIComponent(receiptToken)}`;
};
const detectSportLabel = (courtName: string) => {
  const lower = courtName.toLowerCase();
  if (lower.includes("pickle")) return "Pickle Ball";
  if (lower.includes("tennis")) return "Tennis";
  return "Basketball";
};
const normalizeSport = (value: string) => value.trim().toLowerCase();
const PAYMENT_RECONCILIATION_ISSUE_TYPES = [
  "paid_tx_booking_unpaid",
  "booking_paid_without_paid_tx",
  "confirmed_unpaid_without_tx",
  "orphan_tx_booking_missing",
] as const;
type PaymentReconciliationIssueType = (typeof PAYMENT_RECONCILIATION_ISSUE_TYPES)[number];
const computePaymentReconciliationIssues = async (): Promise<Array<Record<string, unknown>>> => {
  const bookings = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const courts = (await kv.getByPrefix("court:")) as ApiCourt[];
  const transactions = (await kv.getByPrefix("payment_tx:")) as ApiPaymentTransaction[];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const courtMap = new Map(courts.map((ct) => [ct.id, ct]));
  const bookingMap = new Map(bookings.map((b) => [b.id, b]));
  const txByBooking = new Map<string, ApiPaymentTransaction[]>();
  for (const tx of transactions) {
    const bucket = txByBooking.get(tx.bookingId) || [];
    bucket.push(tx);
    txByBooking.set(tx.bookingId, bucket);
  }
  for (const [bookingId, bucket] of txByBooking.entries()) {
    bucket.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    txByBooking.set(bookingId, bucket);
  }

  const issues: Array<Record<string, unknown>> = [];
  for (const booking of bookings) {
    const bookingTxs = txByBooking.get(booking.id) || [];
    const latestTx = bookingTxs[0] || null;
    const paidTx = bookingTxs.find((tx) => tx.status === "paid") || null;
    const player = userMap.get(booking.userId) || null;
    const court = courtMap.get(booking.courtId) || null;

    if (paidTx && booking.paymentStatus !== "paid") {
      issues.push({
        issueType: "paid_tx_booking_unpaid",
        severity: "high",
        bookingId: booking.id,
        txId: paidTx.id,
        message: "Payment transaction is paid but booking paymentStatus is not paid.",
        booking: {
          id: booking.id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          amount: Number(booking.amount || 0),
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
        },
        tx: {
          id: paidTx.id,
          status: paidTx.status,
          provider: paidTx.provider,
          method: paidTx.method,
          amount: paidTx.amount,
          createdAt: paidTx.createdAt,
        },
        player: player ? { id: player.id, name: player.name, email: player.email } : null,
        court: court ? { id: court.id, name: court.name } : null,
        detectedAt: nowIso(),
      });
    }

    if (!paidTx && booking.paymentStatus === "paid") {
      issues.push({
        issueType: "booking_paid_without_paid_tx",
        severity: "medium",
        bookingId: booking.id,
        txId: latestTx?.id || null,
        message: "Booking is marked paid but no paid payment transaction exists.",
        booking: {
          id: booking.id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          amount: Number(booking.amount || 0),
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
        },
        tx: latestTx
          ? {
              id: latestTx.id,
              status: latestTx.status,
              provider: latestTx.provider,
              method: latestTx.method,
              amount: latestTx.amount,
              createdAt: latestTx.createdAt,
            }
          : null,
        player: player ? { id: player.id, name: player.name, email: player.email } : null,
        court: court ? { id: court.id, name: court.name } : null,
        detectedAt: nowIso(),
      });
    }

    if (booking.status === "confirmed" && booking.paymentStatus === "unpaid" && Number(booking.amount || 0) > 0 && bookingTxs.length === 0) {
      issues.push({
        issueType: "confirmed_unpaid_without_tx",
        severity: "medium",
        bookingId: booking.id,
        txId: null,
        message: "Confirmed unpaid booking has no payment transaction.",
        booking: {
          id: booking.id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          amount: Number(booking.amount || 0),
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
        },
        tx: null,
        player: player ? { id: player.id, name: player.name, email: player.email } : null,
        court: court ? { id: court.id, name: court.name } : null,
        detectedAt: nowIso(),
      });
    }
  }

  for (const tx of transactions) {
    const booking = bookingMap.get(tx.bookingId) || null;
    if (!booking) {
      issues.push({
        issueType: "orphan_tx_booking_missing",
        severity: "high",
        bookingId: tx.bookingId,
        txId: tx.id,
        message: "Payment transaction references missing booking.",
        booking: null,
        tx: {
          id: tx.id,
          status: tx.status,
          provider: tx.provider,
          method: tx.method,
          amount: tx.amount,
          createdAt: tx.createdAt,
        },
        player: null,
        court: null,
        detectedAt: nowIso(),
      });
    }
  }
  return issues;
};
const csvEscape = (value: unknown) => {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
};
const toCsv = (headers: string[], rows: Array<Record<string, unknown>>) => {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => csvEscape(row[key])).join(","));
  }
  return lines.join("\n");
};
const queryAuditLogs = async (params: {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
}) => {
  let logs = (await kv.getByPrefix("audit:")) as ApiAuditLog[];
  if (params.action) logs = logs.filter((log) => log.action === params.action);
  if (params.entityType) logs = logs.filter((log) => log.entityType === params.entityType);
  if (params.entityId) logs = logs.filter((log) => log.entityId === params.entityId);
  if (params.actorId) logs = logs.filter((log) => log.actorId === params.actorId);
  if (params.dateFrom) logs = logs.filter((log) => log.createdAt.slice(0, 10) >= params.dateFrom!);
  if (params.dateTo) logs = logs.filter((log) => log.createdAt.slice(0, 10) <= params.dateTo!);
  return logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};
const toReceiptPayload = (
  booking: ApiBooking,
  court: ApiCourt | null,
  player: ApiUser | null,
  options: { publicView?: boolean } = {},
) => ({
  bookingId: booking.id,
  bookingReference: `BK-${booking.date.replaceAll("-", "")}-${booking.id.slice(0, 6).toUpperCase()}`,
  bookingStatus: booking.status,
  paymentStatus: booking.paymentStatus,
  checkIn: {
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    durationMinutes: booking.duration,
    playersCount: (booking.players || []).length || 1,
  },
  paymentSummary: {
    ratePerHour: court?.hourlyRate || 0,
    durationHours: Math.round((Number(booking.duration || 0) / 60) * 100) / 100,
    subtotal: Number(booking.amount || 0),
    reservationFee: 0,
    total: Number(booking.amount || 0),
  },
  court: court
    ? {
        id: court.id,
        name: court.name,
        location: "Downtown Sports Complex",
        sport: booking.sport || detectSportLabel(court.name),
        price: court.hourlyRate,
      }
    : null,
  player: player
    ? options.publicView
      ? { id: player.id, name: player.name }
      : { id: player.id, name: player.name, email: player.email }
    : null,
  qrTargetUrl: buildReceiptUrl(booking),
  receiptToken: booking.receiptToken || null,
  publicReceiptUrl: booking.receiptToken ? buildPublicReceiptUrl(booking.receiptToken) : null,
});

// Legacy compatibility endpoints.
app.get(`${LEGACY_BASE_ROUTE}/health`, (c) => c.json({ status: "ok" }));

// Auth
app.post(`${API_BASE}/auth/login`, async (c) => {
  await seedUsers();
  const loginLimit = rateLimitConfig("auth_login", { max: 10, windowSeconds: 60 });
  const loginRateErr = await enforceRateLimit(c, {
    scope: "auth_login",
    key: requestClientKey(c),
    max: loginLimit.max,
    windowSeconds: loginLimit.windowSeconds,
  });
  if (loginRateErr) return loginRateErr;
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const expectedRoleRaw = String(body?.expectedRole || "").trim().toLowerCase();
  if (!password) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Password is required.");
  }
  if (expectedRoleRaw && !isRole(expectedRoleRaw)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid expectedRole.");
  }
  const expectedRole = (expectedRoleRaw || "") as Role | "";

  if (authMode() === "supabase") {
    if (!hasSupabaseAuthEnv()) {
      return jsonErr(
        c,
        500,
        "MISCONFIGURED",
        "Supabase auth mode requires SUPABASE_URL and SUPABASE_ANON_KEY to be set.",
      );
    }
    const supabase = await supabaseAnonClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.user || !data?.session) {
      await writeAuditLog({
        action: "auth_login_failed",
        entityType: "auth",
        entityId: email || "unknown",
        actorId: "anonymous",
        actorRole: "player",
        metadata: {
          reason: "invalid_credentials",
          provider: "supabase",
          email,
          message: error?.message || "invalid_credentials",
          requestId: requestIdFromContext(c),
        },
      });
      return jsonErr(c, 401, "UNAUTHENTICATED", "Invalid credentials.");
    }

    const authUser = data.user;
    const authUserId = String(authUser.id || "").trim();
    const existing = (await kv.get(`user:${authUserId}`)) as ApiUser | null;
    const nameFromMetadata = String(authUser.user_metadata?.name || "").trim();
    const phoneFromMetadata = String(authUser.user_metadata?.phone || "").trim();
    const metadataRoleRaw = String(authUser.user_metadata?.role || "").trim().toLowerCase();
    const metadataStatusRaw = String(authUser.user_metadata?.status || "").trim().toLowerCase();

    let user: ApiUser;
    if (existing) {
      user = {
        ...existing,
        status: isUserStatus(String((existing as any)?.status || "")) ? (existing as any).status : "active",
      };
    } else {
      const roleFromMetadata = isRole(metadataRoleRaw) ? (metadataRoleRaw as Role) : "player";
      const statusFromMetadata = isUserStatus(metadataStatusRaw) ? (metadataStatusRaw as UserStatus) : "active";
      user = {
        id: authUserId,
        email,
        name: nameFromMetadata || email.split("@")[0] || "User",
        role: roleFromMetadata,
        status: statusFromMetadata,
        phone: phoneFromMetadata || undefined,
        createdAt: nowIso(),
      };
      await kv.set(`user:${user.id}`, user);
    }

    if (expectedRole && !roleMatchesExpected(user.role, expectedRole)) {
      await writeAuditLog({
        action: "auth_login_failed",
        entityType: "auth",
        entityId: user.id,
        actorId: user.id,
        actorRole: user.role,
        metadata: { reason: "role_mismatch", provider: "supabase", expectedRole, requestId: requestIdFromContext(c) },
      });
      return jsonErr(c, 403, "ROLE_MISMATCH", `This account is not a ${expectedRole} account.`);
    }

    if (user.role === "coach" && user.status === "pending") {
      await writeAuditLog({
        action: "auth_login_failed",
        entityType: "auth",
        entityId: user.id,
        actorId: user.id,
        actorRole: user.role,
        metadata: { reason: "coach_pending", provider: "supabase", requestId: requestIdFromContext(c) },
      });
      return jsonErr(c, 403, "COACH_PENDING", "Your coach account is awaiting approval.");
    }

    await writeAuditLog({
      action: "auth_login_succeeded",
      entityType: "auth",
      entityId: user.id,
      actorId: user.id,
      actorRole: user.role,
      metadata: { expectedRole: expectedRole || null, provider: "supabase", requestId: requestIdFromContext(c) },
    });
    return jsonOk(c, {
      accessToken: String(data.session.access_token || ""),
      refreshToken: String(data.session.refresh_token || ""),
      user,
    });
  }
  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const user = users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    if (expectedRole === "coach") {
      const registrations = (await kv.getByPrefix("coachreg:")) as ApiCoachRegistration[];
      const registration = registrations.find((item) => item.email.toLowerCase() === email);
      if (registration?.status === "pending") {
        return jsonErr(
          c,
          403,
          "COACH_APPLICATION_PENDING",
          "Coach registration is pending admin approval.",
        );
      }
      if (registration?.status === "rejected") {
        return jsonErr(
          c,
          403,
          "COACH_APPLICATION_REJECTED",
          "Coach registration was rejected. Please submit a new registration request.",
        );
      }
    }
    await writeAuditLog({
      action: "auth_login_failed",
      entityType: "auth",
      entityId: email || "unknown",
      actorId: "anonymous",
      actorRole: "player",
      metadata: { reason: "invalid_credentials", email, requestId: requestIdFromContext(c) },
    });
    return jsonErr(c, 401, "UNAUTHENTICATED", "Invalid credentials.");
  }
  const expectedCredential = await getUserPasswordCredential(user);
  if (!(await verifyPasswordCredential(password, expectedCredential))) {
    await writeAuditLog({
      action: "auth_login_failed",
      entityType: "auth",
      entityId: user.id,
      actorId: user.id,
      actorRole: user.role,
      metadata: { reason: "invalid_credentials", email, requestId: requestIdFromContext(c) },
    });
    return jsonErr(c, 401, "UNAUTHENTICATED", "Invalid credentials.");
  }
  // One-way upgrade: persist hashed credential for legacy/default plaintext flows.
  if (!String(expectedCredential || "").startsWith("pbkdf2$")) {
    try {
      await setUserPassword(user.id, password);
    } catch {
      // ignore migration issues; login should still succeed
    }
  }
  if (expectedRole && !roleMatchesExpected(user.role, expectedRole)) {
    await writeAuditLog({
      action: "auth_login_failed",
      entityType: "auth",
      entityId: user.id,
      actorId: user.id,
      actorRole: user.role,
      metadata: { reason: "role_mismatch", expectedRole, requestId: requestIdFromContext(c) },
    });
    return jsonErr(c, 403, "ROLE_MISMATCH", `This account is not a ${expectedRole} account.`);
  }
  const normalizedStatus = isUserStatus(String((user as any)?.status || "")) ? (user as any).status : "active";
  if (user.role === "coach" && normalizedStatus === "pending") {
    await writeAuditLog({
      action: "auth_login_failed",
      entityType: "auth",
      entityId: user.id,
      actorId: user.id,
      actorRole: user.role,
      metadata: { reason: "coach_pending", requestId: requestIdFromContext(c) },
    });
    return jsonErr(c, 403, "COACH_PENDING", "Your coach account is awaiting approval.");
  }
  await writeAuditLog({
    action: "auth_login_succeeded",
    entityType: "auth",
    entityId: user.id,
    actorId: user.id,
    actorRole: user.role,
    metadata: { expectedRole: expectedRole || null, requestId: requestIdFromContext(c) },
  });
  return jsonOk(c, {
    accessToken: `mock-access-${user.id}`,
    refreshToken: `mock-refresh-${user.id}`,
    user: { ...user, status: normalizedStatus },
  });
});

app.post(`${API_BASE}/auth/signup`, async (c) => {
  await seedUsers();
  const signupLimit = rateLimitConfig("auth_signup", { max: 5, windowSeconds: 60 });
  const signupRateErr = await enforceRateLimit(c, {
    scope: "auth_signup",
    key: requestClientKey(c),
    max: signupLimit.max,
    windowSeconds: signupLimit.windowSeconds,
  });
  if (signupRateErr) return signupRateErr;
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "").trim();
  const passwordMinLength = minimumPasswordLength();
  const roleRaw = String(body?.role || "player").trim().toLowerCase() || "player";
  if (!email) return jsonErr(c, 400, "VALIDATION_ERROR", "Email is required.");
  if (!password) return jsonErr(c, 400, "VALIDATION_ERROR", "Password is required.");
  if (password.length < passwordMinLength) {
    return jsonErr(c, 400, "VALIDATION_ERROR", `Password must be at least ${passwordMinLength} characters.`);
  }
  if (!isValidEmail(email)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Email must be a valid address.");
  }
  if (!isRole(roleRaw)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid role.");
  }
  const requestedRole = roleRaw as Role;
  const suppliedAdminCode = String(body?.adminCode || "").trim();

  if (requestedRole === "staff" && !allowPrivilegedSignup()) {
    await writeAuditLog({
      action: "auth_signup_failed",
      entityType: "auth",
      entityId: email || "unknown",
      actorId: "anonymous",
      actorRole: "player",
      metadata: { reason: "privileged_role_forbidden", role: requestedRole, email, requestId: requestIdFromContext(c) },
    });
    return jsonErr(c, 403, "FORBIDDEN", "Public signup cannot create staff accounts.");
  }
  if (requestedRole === "admin") {
    const expectedCode = adminSignupCode();
    if (!expectedCode) {
      return jsonErr(c, 403, "FORBIDDEN", "Admin signup is disabled. Please contact the administrator.");
    }
    if (!suppliedAdminCode || suppliedAdminCode !== expectedCode) {
      await writeAuditLog({
        action: "auth_signup_failed",
        entityType: "auth",
        entityId: email || "unknown",
        actorId: "anonymous",
        actorRole: "player",
        metadata: { reason: "invalid_admin_code", email, requestId: requestIdFromContext(c) },
      });
      return jsonErr(c, 403, "FORBIDDEN", "Invalid admin code.");
    }
  }

  const role: Role = requestedRole;
  const status: UserStatus = role === "coach" ? "pending" : "active";
  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  if (users.some((u) => u.email.toLowerCase() === email)) {
    await writeAuditLog({
      action: "auth_signup_failed",
      entityType: "auth",
      entityId: email,
      actorId: "anonymous",
      actorRole: "player",
      metadata: { reason: "email_exists", email, requestedRole, requestId: requestIdFromContext(c) },
    });
    return jsonErr(c, 409, "CONFLICT", "Email already exists.");
  }
  const name = String(body?.name || "").trim() || email.split("@")[0] || "User";
  const phone = String(body?.phone || "").trim();
  const coachDraft = role === "coach" ? parseCoachRegistrationDraft(body) : null;
  if (role === "coach") {
    const draftError = validateCoachRegistrationDraft(coachDraft!);
    if (draftError) return jsonErr(c, 400, "VALIDATION_ERROR", draftError);
  }

  if (authMode() === "supabase") {
    // Prefer service-role createUser for signups in production so the app does not depend on SMTP/email confirmation.
    // Falls back to anon signUp when service env is not provided.
    if (hasSupabaseServiceEnv()) {
      const admin = await supabaseServiceClient();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          phone,
          role,
          status,
        },
      });
      if (error || !data?.user?.id) {
        await writeAuditLog({
          action: "auth_signup_failed",
          entityType: "auth",
          entityId: email,
          actorId: "anonymous",
          actorRole: "player",
          metadata: {
            reason: "provider_error",
            provider: "supabase_admin_create_user",
            email,
            role,
            message: error?.message || "signup_failed",
            requestId: requestIdFromContext(c),
          },
        });
        const message = error?.message || "Signup failed.";
        const isConflict =
          message.toLowerCase().includes("already registered") ||
          message.toLowerCase().includes("already exists") ||
          message.toLowerCase().includes("exists");
        return jsonErr(c, isConflict ? 409 : 400, isConflict ? "CONFLICT" : "VALIDATION_ERROR", message);
      }

      const created: ApiUser = {
        id: String(data.user.id),
        email,
        name,
        role,
        status,
        phone: phone || undefined,
        coachProfile: role === "coach" ? coachDraft!.coachProfile : undefined,
        coachExpertise: role === "coach" ? (coachDraft!.coachExpertise || []) : undefined,
        coachVerificationStatus: role === "coach" ? "pending" : undefined,
        coachVerificationMethod: role === "coach"
          ? (coachDraft!.verificationMethod as ApiUser["coachVerificationMethod"])
          : undefined,
        coachVerificationDocumentName: role === "coach" ? coachDraft!.verificationDocumentName : undefined,
        coachVerificationId: role === "coach" ? coachDraft!.verificationId : undefined,
        coachVerificationNotes: role === "coach" ? coachDraft!.verificationNotes : undefined,
        coachVerificationSubmittedAt: role === "coach" ? nowIso() : undefined,
        createdAt: nowIso(),
      };
      await kv.set(`user:${created.id}`, created);
      await writeAuditLog({
        action: "auth_signup_succeeded",
        entityType: "auth",
        entityId: created.id,
        actorId: created.id,
        actorRole: created.role,
        metadata: {
          provider: "supabase_admin_create_user",
          email,
          roleAssigned: role,
          requestedRole,
          requestId: requestIdFromContext(c),
        },
      });
      if (role === "coach") {
        return jsonOk(c, {
          pending: true,
          role: "coach",
          message: "Your coach account request is under review by the administrator.",
        });
      }
      return jsonOk(c, created);
    }

    if (!hasSupabaseAuthEnv()) {
      return jsonErr(
        c,
        500,
        "MISCONFIGURED",
        "Supabase auth mode requires SUPABASE_URL and SUPABASE_ANON_KEY to be set (or SUPABASE_SERVICE_ROLE_KEY for service-role signups).",
      );
    }

    const supabase = await supabaseAnonClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone,
          role,
          status,
        },
      },
    });
    if (error || !data?.user?.id) {
      await writeAuditLog({
        action: "auth_signup_failed",
        entityType: "auth",
        entityId: email,
        actorId: "anonymous",
        actorRole: "player",
        metadata: {
          reason: "provider_error",
          provider: "supabase",
          email,
          role,
          message: error?.message || "signup_failed",
          requestId: requestIdFromContext(c),
        },
      });
      const message = error?.message || "Signup failed.";
      const isConflict =
        message.toLowerCase().includes("already registered") ||
        message.toLowerCase().includes("already exists") ||
        message.toLowerCase().includes("exists");
      return jsonErr(c, isConflict ? 409 : 400, isConflict ? "CONFLICT" : "VALIDATION_ERROR", message);
    }

    const created: ApiUser = {
      id: String(data.user.id),
      email,
      name,
      role,
      status,
      phone: phone || undefined,
      coachProfile: role === "coach" ? coachDraft!.coachProfile : undefined,
      coachExpertise: role === "coach" ? (coachDraft!.coachExpertise || []) : undefined,
      coachVerificationStatus: role === "coach" ? "pending" : undefined,
      coachVerificationMethod: role === "coach"
        ? (coachDraft!.verificationMethod as ApiUser["coachVerificationMethod"])
        : undefined,
      coachVerificationDocumentName: role === "coach" ? coachDraft!.verificationDocumentName : undefined,
      coachVerificationId: role === "coach" ? coachDraft!.verificationId : undefined,
      coachVerificationNotes: role === "coach" ? coachDraft!.verificationNotes : undefined,
      coachVerificationSubmittedAt: role === "coach" ? nowIso() : undefined,
      createdAt: nowIso(),
    };
    await kv.set(`user:${created.id}`, created);
    await writeAuditLog({
      action: "auth_signup_succeeded",
      entityType: "auth",
      entityId: created.id,
      actorId: created.id,
      actorRole: created.role,
      metadata: { provider: "supabase", email, roleAssigned: role, requestedRole, requestId: requestIdFromContext(c) },
    });
    if (role === "coach") {
      return jsonOk(c, {
        pending: true,
        role: "coach",
        message: "Your coach account request is under review by the administrator.",
      });
    }
    return jsonOk(c, created);
  }
  const newUser: ApiUser = {
    id: id(),
    email,
    name,
    role,
    status,
    phone: phone || undefined,
    coachProfile: role === "coach" ? coachDraft!.coachProfile : undefined,
    coachExpertise: role === "coach" ? (coachDraft!.coachExpertise || []) : undefined,
    coachVerificationStatus: role === "coach" ? "pending" : undefined,
    coachVerificationMethod: role === "coach"
      ? (coachDraft!.verificationMethod as ApiUser["coachVerificationMethod"])
      : undefined,
    coachVerificationDocumentName: role === "coach" ? coachDraft!.verificationDocumentName : undefined,
    coachVerificationId: role === "coach" ? coachDraft!.verificationId : undefined,
    coachVerificationNotes: role === "coach" ? coachDraft!.verificationNotes : undefined,
    coachVerificationSubmittedAt: role === "coach" ? nowIso() : undefined,
    createdAt: nowIso(),
  };
  await kv.set(`user:${newUser.id}`, newUser);
  await setUserPassword(newUser.id, password);
  await writeAuditLog({
    action: "auth_signup_succeeded",
    entityType: "auth",
    entityId: newUser.id,
    actorId: newUser.id,
    actorRole: newUser.role,
    metadata: { email: newUser.email, roleAssigned: role, requestedRole, requestId: requestIdFromContext(c) },
  });
  if (role === "coach") {
    return jsonOk(c, {
      pending: true,
      role: "coach",
      message: "Your coach account request is under review by the administrator.",
    });
  }
  return jsonOk(c, newUser);
});

app.post(`${API_BASE}/auth/reset-password`, async (c) => {
  await seedUsers();
  const resetLimit = rateLimitConfig("auth_reset_password", { max: 6, windowSeconds: 60 });
  const resetRateErr = await enforceRateLimit(c, {
    scope: "auth_reset_password",
    key: requestClientKey(c),
    max: resetLimit.max,
    windowSeconds: resetLimit.windowSeconds,
  });
  if (resetRateErr) return resetRateErr;

  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) return jsonErr(c, 400, "VALIDATION_ERROR", "Email is required.");
  if (!isValidEmail(email)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Email must be a valid address.");
  }

  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const user = users.find((u) => u.email.toLowerCase() === email) || null;
  const registrations = await getCoachRegistrations();
  const latestRegistration = findLatestCoachRegistrationByEmail(registrations, email);
  await writeAuditLog({
    action: "auth_password_reset_requested",
    entityType: "auth",
    entityId: user?.id || email,
    actorId: user?.id || "anonymous",
    actorRole: user?.role || "player",
    metadata: {
      email,
      userExists: Boolean(user),
      coachRegistrationStatus: latestRegistration?.status || null,
      requestId: requestIdFromContext(c),
    },
  });

  if (authMode() === "supabase" && hasSupabaseAuthEnv()) {
    try {
      const supabase = await supabaseAnonClient();
      await supabase.auth.resetPasswordForEmail(email);
    } catch {
      // Ignore provider errors to avoid user enumeration.
    }
  }

  return jsonOk(c, {
    sent: true,
    message:
      user
        ? "If an account with this email exists, reset instructions have been sent."
        : latestRegistration?.status === "pending"
          ? "Coach registration is still pending approval. Password reset becomes available after account approval."
          : "If an account with this email exists, reset instructions have been sent.",
  });
});

app.post(`${API_BASE}/auth/coach-registration-status`, async (c) => {
  const statusLimit = rateLimitConfig("auth_coach_registration_status", { max: 20, windowSeconds: 60 });
  const statusRateErr = await enforceRateLimit(c, {
    scope: "auth_coach_registration_status",
    key: requestClientKey(c),
    max: statusLimit.max,
    windowSeconds: statusLimit.windowSeconds,
  });
  if (statusRateErr) return statusRateErr;

  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) return jsonErr(c, 400, "VALIDATION_ERROR", "Email is required.");
  if (!isValidEmail(email)) return jsonErr(c, 400, "VALIDATION_ERROR", "Email must be a valid address.");

  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const user = users.find((item) => item.email.toLowerCase() === email) || null;
  if (user && user.role === "coach") {
    return jsonOk(c, {
      status: "approved",
      hasAccount: true,
      message: "Coach account is active.",
    });
  }

  const registrations = await getCoachRegistrations();
  const registration = findLatestCoachRegistrationByEmail(registrations, email);

  if (!registration) {
    return jsonOk(c, {
      status: "none",
      hasAccount: false,
      message: "No coach registration found for this email.",
    });
  }

  return jsonOk(c, {
    status: registration.status,
    hasAccount: false,
    canWithdraw: registration.status === "pending",
    reviewNote: registration.reviewNote || null,
    updatedAt: registration.updatedAt || registration.createdAt,
    message:
      registration.status === "pending"
        ? "Coach registration is pending admin approval."
        : registration.status === "rejected"
          ? "Coach registration was rejected."
          : "Coach registration has been approved.",
  });
});

app.post(`${API_BASE}/auth/coach-registration-update`, async (c) => {
  const updateLimit = rateLimitConfig("auth_coach_registration_update", { max: 8, windowSeconds: 60 });
  const updateRateErr = await enforceRateLimit(c, {
    scope: "auth_coach_registration_update",
    key: requestClientKey(c),
    max: updateLimit.max,
    windowSeconds: updateLimit.windowSeconds,
  });
  if (updateRateErr) return updateRateErr;

  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "").trim();
  if (!email) return jsonErr(c, 400, "VALIDATION_ERROR", "Email is required.");
  if (!password) return jsonErr(c, 400, "VALIDATION_ERROR", "Password is required.");
  if (!isValidEmail(email)) return jsonErr(c, 400, "VALIDATION_ERROR", "Email must be a valid address.");

  const registrations = await getCoachRegistrations();
  const pending = findLatestCoachRegistrationByEmail(registrations, email, ["pending"]);
  if (!pending) return jsonErr(c, 404, "NOT_FOUND", "No pending coach registration found for this email.");
  {
    const credential = String(pending.passwordHash || pending.password || "").trim();
    if (!(await verifyPasswordCredential(password, credential))) {
      return jsonErr(c, 401, "UNAUTHENTICATED", "Invalid credentials.");
    }
  }
  const draft = parseCoachRegistrationDraft(body, pending);
  const draftError = validateCoachRegistrationDraft(draft);
  if (draftError) return jsonErr(c, 400, "VALIDATION_ERROR", draftError);

  const passwordHash = pending.passwordHash || (await hashPassword(password));
  const updated: ApiCoachRegistration = {
    ...pending,
    password: undefined,
    passwordHash,
    name: draft.name,
    phone: draft.phone,
    coachProfile: draft.coachProfile,
    coachExpertise: draft.coachExpertise,
    verificationMethod: draft.verificationMethod as ApiCoachRegistration["verificationMethod"],
    verificationDocumentName: draft.verificationDocumentName,
    verificationId: draft.verificationId,
    verificationNotes: draft.verificationNotes,
    updatedAt: nowIso(),
  };
  await kv.set(`coachreg:${updated.id}`, updated);
  await writeAuditLog({
    action: "coach_registration_updated_by_applicant",
    entityType: "coach_registration",
    entityId: updated.id,
    actorId: "anonymous",
    actorRole: "player",
    metadata: { email, requestId: requestIdFromContext(c) },
  });
  return jsonOk(c, sanitizeCoachRegistration(updated));
});

app.post(`${API_BASE}/auth/coach-registration-withdraw`, async (c) => {
  const withdrawLimit = rateLimitConfig("auth_coach_registration_withdraw", { max: 8, windowSeconds: 60 });
  const withdrawRateErr = await enforceRateLimit(c, {
    scope: "auth_coach_registration_withdraw",
    key: requestClientKey(c),
    max: withdrawLimit.max,
    windowSeconds: withdrawLimit.windowSeconds,
  });
  if (withdrawRateErr) return withdrawRateErr;

  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "").trim();
  if (!email) return jsonErr(c, 400, "VALIDATION_ERROR", "Email is required.");
  if (!password) return jsonErr(c, 400, "VALIDATION_ERROR", "Password is required.");
  if (!isValidEmail(email)) return jsonErr(c, 400, "VALIDATION_ERROR", "Email must be a valid address.");

  const registrations = await getCoachRegistrations();
  const pending = findLatestCoachRegistrationByEmail(registrations, email, ["pending"]);
  if (!pending) {
    return jsonErr(c, 404, "NOT_FOUND", "No pending coach registration found for this email.");
  }
  {
    const credential = String(pending.passwordHash || pending.password || "").trim();
    if (!(await verifyPasswordCredential(password, credential))) {
      return jsonErr(c, 401, "UNAUTHENTICATED", "Invalid credentials.");
    }
  }

  await kv.del(`coachreg:${pending.id}`);
  await writeAuditLog({
    action: "coach_registration_withdrawn",
    entityType: "coach_registration",
    entityId: pending.id,
    actorId: "anonymous",
    actorRole: "player",
    metadata: { email, requestId: requestIdFromContext(c) },
  });

  return jsonOk(c, { withdrawn: true });
});

app.post(`${API_BASE}/auth/coach-registration-resubmit`, async (c) => {
  const resubmitLimit = rateLimitConfig("auth_coach_registration_resubmit", { max: 6, windowSeconds: 60 });
  const resubmitRateErr = await enforceRateLimit(c, {
    scope: "auth_coach_registration_resubmit",
    key: requestClientKey(c),
    max: resubmitLimit.max,
    windowSeconds: resubmitLimit.windowSeconds,
  });
  if (resubmitRateErr) return resubmitRateErr;

  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "").trim();
  if (!email) return jsonErr(c, 400, "VALIDATION_ERROR", "Email is required.");
  if (!password) return jsonErr(c, 400, "VALIDATION_ERROR", "Password is required.");
  if (!isValidEmail(email)) return jsonErr(c, 400, "VALIDATION_ERROR", "Email must be a valid address.");

  const registrations = await getCoachRegistrations();
  const rejected = findLatestCoachRegistrationByEmail(registrations, email, ["rejected"]);
  if (!rejected) return jsonErr(c, 404, "NOT_FOUND", "No rejected coach registration found for this email.");
  {
    const credential = String(rejected.passwordHash || rejected.password || "").trim();
    if (!(await verifyPasswordCredential(password, credential))) {
      return jsonErr(c, 401, "UNAUTHENTICATED", "Invalid credentials.");
    }
  }
  const draft = parseCoachRegistrationDraft(body, rejected);
  const draftError = validateCoachRegistrationDraft(draft);
  if (draftError) return jsonErr(c, 400, "VALIDATION_ERROR", draftError);

  const passwordHash = await hashPassword(password);
  const updated: ApiCoachRegistration = {
    ...rejected,
    password: undefined,
    passwordHash,
    name: draft.name,
    phone: draft.phone,
    coachProfile: draft.coachProfile,
    coachExpertise: draft.coachExpertise,
    verificationMethod: draft.verificationMethod as ApiCoachRegistration["verificationMethod"],
    verificationDocumentName: draft.verificationDocumentName,
    verificationId: draft.verificationId,
    verificationNotes: draft.verificationNotes,
    status: "pending",
    reviewNote: undefined,
    updatedAt: nowIso(),
  };
  await kv.set(`coachreg:${updated.id}`, updated);
  await writeAuditLog({
    action: "coach_registration_resubmitted",
    entityType: "coach_registration",
    entityId: updated.id,
    actorId: "anonymous",
    actorRole: "player",
    metadata: { email, requestId: requestIdFromContext(c) },
  });
  return jsonOk(c, sanitizeCoachRegistration(updated));
});

app.post(`${API_BASE}/auth/change-password`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;

  const changeLimit = rateLimitConfig("auth_change_password", { max: 6, windowSeconds: 60 });
  const changeRateErr = await enforceRateLimit(c, {
    scope: "auth_change_password",
    key: requestClientKey(c, result.user.id),
    max: changeLimit.max,
    windowSeconds: changeLimit.windowSeconds,
  });
  if (changeRateErr) return changeRateErr;

  const body = await c.req.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "").trim();
  const passwordMinLength = minimumPasswordLength();
  if (!currentPassword) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "currentPassword is required.");
  }
  if (!newPassword) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "newPassword is required.");
  }
  if (newPassword.length < passwordMinLength) {
    return jsonErr(c, 400, "VALIDATION_ERROR", `newPassword must be at least ${passwordMinLength} characters.`);
  }

  if (authMode() === "supabase") {
    if (!hasSupabaseAuthEnv() || !hasSupabaseServiceEnv()) {
      return jsonErr(
        c,
        500,
        "MISCONFIGURED",
        "Supabase auth mode requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to be set.",
      );
    }

    const supabase = await supabaseAnonClient();
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: String(result.user.email || "").trim().toLowerCase(),
      password: currentPassword,
    });
    if (verifyError) {
      await writeAuditLog({
        action: "auth_change_password_failed",
        entityType: "auth",
        entityId: result.user.id,
        actorId: result.user.id,
        actorRole: result.user.role,
        metadata: { reason: "current_password_mismatch", provider: "supabase", requestId: requestIdFromContext(c) },
      });
      return jsonErr(c, 401, "UNAUTHENTICATED", "Current password is incorrect.");
    }

    const admin = await supabaseServiceClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(result.user.id, { password: newPassword });
    if (updateError) {
      return jsonErr(c, 500, "PROVIDER_ERROR", updateError.message || "Failed to update password.");
    }

    await writeAuditLog({
      action: "auth_change_password_succeeded",
      entityType: "auth",
      entityId: result.user.id,
      actorId: result.user.id,
      actorRole: result.user.role,
      metadata: { provider: "supabase", requestId: requestIdFromContext(c) },
    });

    return jsonOk(c, { changed: true });
  }

  const expectedCredential = await getUserPasswordCredential(result.user);
  if (!(await verifyPasswordCredential(currentPassword, expectedCredential))) {
    await writeAuditLog({
      action: "auth_change_password_failed",
      entityType: "auth",
      entityId: result.user.id,
      actorId: result.user.id,
      actorRole: result.user.role,
      metadata: { reason: "current_password_mismatch", requestId: requestIdFromContext(c) },
    });
    return jsonErr(c, 401, "UNAUTHENTICATED", "Current password is incorrect.");
  }

  await setUserPassword(result.user.id, newPassword);
  await writeAuditLog({
    action: "auth_change_password_succeeded",
    entityType: "auth",
    entityId: result.user.id,
    actorId: result.user.id,
    actorRole: result.user.role,
    metadata: { requestId: requestIdFromContext(c) },
  });

  return jsonOk(c, { changed: true });
});

app.post(`${API_BASE}/auth/logout`, async (c) => {
  await writeAuditLog({
    action: "auth_logout",
    entityType: "auth",
    entityId: "logout",
    actorId: "anonymous",
    actorRole: "player",
    metadata: { requestId: requestIdFromContext(c) },
  });
  return jsonOk(c, { loggedOut: true });
});

// Users / Profile
app.get(`${API_BASE}/users/me`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  return jsonOk(c, result.user);
});

app.patch(`${API_BASE}/users/me`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const updated = {
    ...result.user,
    name: body?.name ?? result.user.name,
    phone: body?.phone ?? result.user.phone,
    avatar: body?.avatar ?? result.user.avatar,
    skillLevel: body?.skillLevel ?? result.user.skillLevel,
  };
  await kv.set(`user:${result.user.id}`, updated);
  return jsonOk(c, updated);
});

app.get(`${API_BASE}/config/facility`, async (c) => {
  const config = await getFacilityConfig();
  return jsonOk(c, config);
});

app.patch(`${API_BASE}/config/facility`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const existing = await getFacilityConfig();
  const merged = normalizeFacilityConfig({
    ...existing,
    ...(body && typeof body === "object" ? body : {}),
  });
  const validationError = validateFacilityConfig(merged);
  if (validationError) return jsonErr(c, 400, "VALIDATION_ERROR", validationError);
  await kv.set("facility:config", merged);
  await writeAuditLog({
    action: "facility_config_updated",
    entityType: "facility_config",
    entityId: "default",
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { keys: Object.keys(body || {}) },
  });
  return jsonOk(c, merged);
});

app.patch(`${API_BASE}/coach/profile`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const expertiseRaw = body?.coachExpertise;
  const coachExpertise = Array.isArray(expertiseRaw)
    ? expertiseRaw.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : result.user.coachExpertise;

  const updated: ApiUser = {
    ...result.user,
    avatar: body?.avatar ?? result.user.avatar,
    coachProfile: body?.coachProfile ?? result.user.coachProfile,
    coachExpertise,
  };
  await kv.set(`user:${result.user.id}`, updated);
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/coach/verification/submit`, async (c) => {
  const result = await requireRole(c, ["player", "coach"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const method = String(body?.method || "").trim() as ApiUser["coachVerificationMethod"];
  const documentName = String(body?.documentName || "").trim();
  const verificationId = String(body?.verificationId || "").trim();

  if (!["certification", "license", "experience", "other"].includes(method || "")) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "method must be one of certification, license, experience, or other.");
  }
  if (!documentName) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "documentName is required.");
  }

  const updated: ApiUser = {
    ...result.user,
    coachVerificationStatus: "pending",
    coachVerificationMethod: method,
    coachVerificationDocumentName: documentName,
    coachVerificationId: verificationId || undefined,
    coachVerificationNotes: String(body?.notes || "").trim() || undefined,
    coachVerificationSubmittedAt: nowIso(),
  };
  await kv.set(`user:${result.user.id}`, updated);
  return jsonOk(c, updated);
});

app.get(`${API_BASE}/admin/coaches/verification`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const status = String(c.req.query("status") || "").trim();
  let coaches = ((await kv.getByPrefix("user:")) as ApiUser[]).filter(
    (u) =>
      u.role === "coach" ||
      Boolean(u.coachVerificationStatus) ||
      Boolean(u.coachVerificationSubmittedAt) ||
      Boolean(u.coachVerificationMethod) ||
      Boolean(u.coachVerificationDocumentName),
  );
  const registrations = (await kv.getByPrefix("coachreg:")) as ApiCoachRegistration[];
  const registrationRows = registrations
    .filter((registration) => registration.status !== "approved")
    .map(mapCoachRegistrationToQueueUser);
  coaches = [...coaches, ...registrationRows];
  if (status) {
    coaches = coaches.filter((cch) => (cch.coachVerificationStatus || "unverified") === status);
  }
  coaches = coaches.sort(
    (a, b) => new Date(b.coachVerificationSubmittedAt || b.createdAt || 0).getTime() - new Date(a.coachVerificationSubmittedAt || a.createdAt || 0).getTime(),
  );
  return jsonOk(c, coaches);
});

app.post(`${API_BASE}/admin/coaches/:id/verification/approve`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const targetId = String(c.req.param("id") || "").trim();
  const registrationId = coachRegistrationInternalId(targetId);
  const registration = (await kv.get(`coachreg:${registrationId}`)) as ApiCoachRegistration | null;
  const body = await c.req.json().catch(() => ({}));
  if (registration) {
    if (registration.status !== "pending") {
      return jsonErr(c, 409, "CONFLICT", "Only pending coach registration can be approved.");
    }
    const users = (await kv.getByPrefix("user:")) as ApiUser[];
    if (users.some((u) => u.email.toLowerCase() === registration.email.toLowerCase())) {
      return jsonErr(c, 409, "CONFLICT", "Email already exists.");
    }

    // In Supabase auth mode, create the auth identity via service role and prompt the coach to set a password via reset email.
    let coachUserId: string = id();
    if (authMode() === "supabase") {
      if (!hasSupabaseServiceEnv()) {
        return jsonErr(
          c,
          500,
          "MISCONFIGURED",
          "Supabase auth coach approval requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        );
      }
      const admin = await supabaseServiceClient();
      const tempPassword = randomTempPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email: registration.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          name: registration.name,
          phone: registration.phone || "",
          role: "coach",
          status: "active",
        },
      });
      if (error || !data?.user?.id) {
        const msg = String(error?.message || "Failed to create auth user.");
        const isConflict =
          msg.toLowerCase().includes("already") ||
          msg.toLowerCase().includes("exists") ||
          msg.toLowerCase().includes("registered");
        return jsonErr(c, isConflict ? 409 : 502, isConflict ? "CONFLICT" : "PROVIDER_ERROR", msg);
      }
      coachUserId = String(data.user.id);
      try {
        await admin.auth.resetPasswordForEmail(registration.email);
      } catch {
        // If SMTP isn't configured, this may fail. The account is still created; admin can trigger reset later.
      }
    }

    const createdCoach: ApiUser = {
      id: coachUserId,
      email: registration.email,
      name: registration.name,
      role: "coach",
      status: "active",
      phone: registration.phone,
      coachProfile: registration.coachProfile,
      coachExpertise: registration.coachExpertise || [],
      coachVerificationStatus: "verified",
      coachVerificationMethod: registration.verificationMethod,
      coachVerificationDocumentName: registration.verificationDocumentName,
      coachVerificationId: registration.verificationId,
      coachVerificationNotes: String(body?.notes || registration.reviewNote || "").trim() || registration.verificationNotes,
      coachVerificationSubmittedAt: registration.createdAt,
      createdAt: nowIso(),
    };
    await kv.set(`user:${createdCoach.id}`, createdCoach);

    if (authMode() !== "supabase") {
      const credential = String(registration.passwordHash || registration.password || "").trim();
      if (!credential) {
        return jsonErr(c, 500, "INTERNAL_ERROR", "Coach registration is missing a password credential.");
      }
      await setUserPasswordCredential(createdCoach.id, credential.startsWith("pbkdf2$") ? credential : await hashPassword(credential));
    }
    await kv.set(`coachreg:${registration.id}`, {
      ...registration,
      password: undefined,
      passwordHash: undefined,
      status: "approved",
      reviewNote: String(body?.notes || registration.reviewNote || "").trim() || registration.reviewNote,
      updatedAt: nowIso(),
    });
    const siblingRegistrations = (await kv.getByPrefix("coachreg:")) as ApiCoachRegistration[];
    const staleSiblings = siblingRegistrations.filter(
      (item) =>
        item.id !== registration.id &&
        item.email.toLowerCase() === registration.email.toLowerCase() &&
        item.status !== "approved",
    );
    if (staleSiblings.length > 0) {
      await kv.mdel(staleSiblings.map((item) => `coachreg:${item.id}`));
    }
    await writeAuditLog({
      action: "coach_registration_approved",
      entityType: "coach_registration",
      entityId: registration.id,
      actorId: result.user.id,
      actorRole: result.role,
      metadata: { createdCoachId: createdCoach.id, email: registration.email, requestId: requestIdFromContext(c) },
    });
    return jsonOk(c, createdCoach);
  }
  const coach = (await kv.get(`user:${targetId}`)) as ApiUser | null;
  if (!coach) return jsonErr(c, 404, "NOT_FOUND", "Coach applicant not found.");
  if (coach.coachVerificationStatus !== "pending") {
    return jsonErr(c, 409, "CONFLICT", "Only pending coach verification can be approved.");
  }
  const updated: ApiUser = {
    ...coach,
    role: "coach",
    status: "active",
    coachVerificationStatus: "verified",
    coachVerificationNotes: String(body?.notes || coach.coachVerificationNotes || "").trim() || undefined,
  };
  await kv.set(`user:${coach.id}`, updated);
  if (authMode() === "supabase" && hasSupabaseServiceEnv()) {
    try {
      const admin = await supabaseServiceClient();
      const before = await admin.auth.admin.getUserById(updated.id);
      const existingMetadata = (before as any)?.data?.user?.user_metadata ?? {};
      await admin.auth.admin.updateUserById(updated.id, {
        user_metadata: {
          ...existingMetadata,
          role: "coach",
          status: "active",
          name: updated.name,
          phone: updated.phone || "",
        },
      });
    } catch {
      // Best-effort only; the app enforces roles/status via app_users/kv store.
    }
  }
  await notify({
    userId: coach.id,
    title: "Coach Verification Approved",
    message: "Your coach verification has been approved.",
    type: "success",
  });
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/admin/coaches/:id/verification/reject`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const targetId = String(c.req.param("id") || "").trim();
  const registrationId = coachRegistrationInternalId(targetId);
  const registration = (await kv.get(`coachreg:${registrationId}`)) as ApiCoachRegistration | null;
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body?.reason || "").trim();
  if (registration) {
    if (registration.status !== "pending") {
      return jsonErr(c, 409, "CONFLICT", "Only pending coach registration can be rejected.");
    }
    const updatedRegistration: ApiCoachRegistration = {
      ...registration,
      status: "rejected",
      reviewNote: reason || registration.reviewNote,
      updatedAt: nowIso(),
    };
    await kv.set(`coachreg:${registration.id}`, updatedRegistration);
    await writeAuditLog({
      action: "coach_registration_rejected",
      entityType: "coach_registration",
      entityId: registration.id,
      actorId: result.user.id,
      actorRole: result.role,
      metadata: { email: registration.email, reason, requestId: requestIdFromContext(c) },
    });
    return jsonOk(c, mapCoachRegistrationToQueueUser(updatedRegistration));
  }
  const coach = (await kv.get(`user:${targetId}`)) as ApiUser | null;
  if (!coach) return jsonErr(c, 404, "NOT_FOUND", "Coach applicant not found.");
  if (coach.coachVerificationStatus !== "pending") {
    return jsonErr(c, 409, "CONFLICT", "Only pending coach verification can be rejected.");
  }
  const updated: ApiUser = {
    ...coach,
    role: coach.role === "admin" || coach.role === "staff" ? coach.role : "player",
    status: "active",
    coachVerificationStatus: "rejected",
    coachVerificationNotes: reason || coach.coachVerificationNotes,
  };
  await kv.set(`user:${coach.id}`, updated);
  await notify({
    userId: coach.id,
    title: "Coach Verification Rejected",
    message: reason ? `Verification was rejected: ${reason}` : "Verification was rejected. Please resubmit.",
    type: "warning",
  });
  return jsonOk(c, updated);
});

app.get(`${API_BASE}/admin/coach-registrations`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;

  const status = String(c.req.query("status") || "").trim().toLowerCase();
  const search = String(c.req.query("search") || "").trim().toLowerCase();
  const pageRaw = Number(c.req.query("page") || 1);
  const limitRaw = Number(c.req.query("limit") || 20);
  if (!Number.isFinite(pageRaw) || pageRaw < 1) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "page must be a positive integer.");
  }
  if (!Number.isFinite(limitRaw) || limitRaw < 1 || limitRaw > 200) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "limit must be between 1 and 200.");
  }
  const page = Math.floor(pageRaw);
  const limit = Math.floor(limitRaw);
  if (status && !["pending", "approved", "rejected"].includes(status)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "status must be one of pending, approved, rejected.");
  }

  const allRegistrations = (await kv.getByPrefix("coachreg:")) as ApiCoachRegistration[];
  const statusCounts = {
    pending: allRegistrations.filter((item) => item.status === "pending").length,
    approved: allRegistrations.filter((item) => item.status === "approved").length,
    rejected: allRegistrations.filter((item) => item.status === "rejected").length,
  };

  let registrations = allRegistrations;
  if (status) registrations = registrations.filter((item) => item.status === status);
  if (search) {
    registrations = registrations.filter((item) => {
      const haystack = `${item.email} ${item.name} ${item.verificationDocumentName} ${item.verificationMethod}`.toLowerCase();
      return haystack.includes(search);
    });
  }
  registrations = registrations.sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
  );
  const totalFiltered = registrations.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const offset = (page - 1) * limit;
  const pageRows = registrations.slice(offset, offset + limit);

  return jsonOk(c, pageRows.map(sanitizeCoachRegistration), {
    pagination: {
      page,
      limit,
      total: totalFiltered,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    counts: {
      all: allRegistrations.length,
      ...statusCounts,
    },
    filters: {
      status: status || null,
      search: search || null,
    },
  });
});

app.get(`${API_BASE}/admin/coach-registrations/summary`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;

  const registrations = (await kv.getByPrefix("coachreg:")) as ApiCoachRegistration[];
  const summary = {
    total: registrations.length,
    pending: registrations.filter((item) => item.status === "pending").length,
    approved: registrations.filter((item) => item.status === "approved").length,
    rejected: registrations.filter((item) => item.status === "rejected").length,
    latestUpdatedAt: registrations
      .map((item) => item.updatedAt || item.createdAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null,
  };
  return jsonOk(c, summary);
});

app.get(`${API_BASE}/admin/coach-registrations/:id`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;

  const registrationId = String(c.req.param("id") || "").trim();
  if (!registrationId) return jsonErr(c, 400, "VALIDATION_ERROR", "registration id is required.");
  const registration = (await kv.get(`coachreg:${registrationId}`)) as ApiCoachRegistration | null;
  if (!registration) return jsonErr(c, 404, "NOT_FOUND", "Coach registration not found.");
  return jsonOk(c, sanitizeCoachRegistration(registration));
});

app.post(`${API_BASE}/admin/coach-registrations/:id/reopen`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;

  const registrationId = String(c.req.param("id") || "").trim();
  if (!registrationId) return jsonErr(c, 400, "VALIDATION_ERROR", "registration id is required.");
  const registration = (await kv.get(`coachreg:${registrationId}`)) as ApiCoachRegistration | null;
  if (!registration) return jsonErr(c, 404, "NOT_FOUND", "Coach registration not found.");
  if (registration.status === "approved") {
    return jsonErr(c, 409, "CONFLICT", "Approved registration cannot be reopened.");
  }

  const body = await c.req.json().catch(() => ({}));
  const note = String(body?.note || "").trim();
  const updated: ApiCoachRegistration = {
    ...registration,
    status: "pending",
    reviewNote: note || undefined,
    updatedAt: nowIso(),
  };
  await kv.set(`coachreg:${registration.id}`, updated);

  await writeAuditLog({
    action: "coach_registration_reopened",
    entityType: "coach_registration",
    entityId: registration.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { email: registration.email, requestId: requestIdFromContext(c) },
  });

  return jsonOk(c, sanitizeCoachRegistration(updated));
});

app.delete(`${API_BASE}/admin/coach-registrations/:id`, async (c) => {
  const result = await requireRole(c, ["admin"]);
  if ("err" in result) return result.err;

  const registrationId = String(c.req.param("id") || "").trim();
  if (!registrationId) return jsonErr(c, 400, "VALIDATION_ERROR", "registration id is required.");
  const registration = (await kv.get(`coachreg:${registrationId}`)) as ApiCoachRegistration | null;
  if (!registration) return jsonErr(c, 404, "NOT_FOUND", "Coach registration not found.");

  await kv.del(`coachreg:${registration.id}`);
  await writeAuditLog({
    action: "coach_registration_deleted",
    entityType: "coach_registration",
    entityId: registration.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { email: registration.email, requestId: requestIdFromContext(c) },
  });

  return jsonOk(c, { deleted: true, id: registration.id });
});

app.get(`${API_BASE}/coaches`, async (c) => {
  await seedUsers();
  const search = String(c.req.query("search") || "").trim().toLowerCase();
  const expertise = String(c.req.query("expertise") || "").trim().toLowerCase();
  const includeUnverified = c.req.query("includeUnverified") === "true";
  let coaches = ((await kv.getByPrefix("user:")) as ApiUser[]).filter((u) => u.role === "coach");
  if (!includeUnverified) {
    coaches = coaches.filter((coach) => (coach.coachVerificationStatus || "unverified") === "verified");
  }
  if (search) {
    coaches = coaches.filter((coach) => {
      const haystack = `${coach.name} ${coach.coachProfile || ""}`.toLowerCase();
      return haystack.includes(search);
    });
  }
  if (expertise) {
    coaches = coaches.filter((coach) =>
      (coach.coachExpertise || []).some((item) => String(item || "").toLowerCase().includes(expertise)),
    );
  }
  const data = coaches.map((coach) => ({
    id: coach.id,
    name: coach.name,
    avatar: coach.avatar || null,
    coachProfile: coach.coachProfile || "",
    coachExpertise: coach.coachExpertise || [],
    coachVerificationStatus: coach.coachVerificationStatus || "unverified",
  }));
  return jsonOk(c, data);
});

// Coach applications and students
app.post(`${API_BASE}/coach/applications`, async (c) => {
  const result = await requireRole(c, ["player"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const coachId = String(body?.coachId || "").trim();
  const sport = String(body?.sport || "").trim();
  const message = String(body?.message || "").trim();
  const preferredSchedule = String(body?.preferredSchedule || "").trim();
  if (!coachId || !sport) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "coachId and sport are required.");
  }
  const coach = (await kv.get(`user:${coachId}`)) as ApiUser | null;
  if (!coach || coach.role !== "coach") return jsonErr(c, 404, "NOT_FOUND", "Coach not found.");
  const existing = (await kv.getByPrefix("coachapp:")) as ApiCoachApplication[];
  const duplicatePending = existing.find(
    (item) =>
      item.coachId === coachId &&
      item.playerId === result.user.id &&
      item.sport.toLowerCase() === sport.toLowerCase() &&
      item.status === "pending",
  );
  if (duplicatePending) {
    return jsonErr(c, 409, "CONFLICT", "You already have a pending application for this coach and sport.");
  }
  const application: ApiCoachApplication = {
    id: id(),
    coachId,
    playerId: result.user.id,
    sport,
    message: message || undefined,
    preferredSchedule: preferredSchedule || undefined,
    status: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await kv.set(`coachapp:${application.id}`, application);
  await notify({
    userId: coachId,
    title: "New Coaching Application",
    message: `${result.user.name} applied for ${sport} coaching.`,
    type: "info",
  });
  return jsonOk(c, application);
});

app.get(`${API_BASE}/coach/applications/me`, async (c) => {
  const result = await requireRole(c, ["player"]);
  if ("err" in result) return result.err;
  const status = String(c.req.query("status") || "").trim();
  let mine = (await kv.getByPrefix("coachapp:")) as ApiCoachApplication[];
  mine = mine.filter((item) => item.playerId === result.user.id);
  if (status) mine = mine.filter((item) => item.status === status);
  mine = mine.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return jsonOk(c, mine);
});

app.get(`${API_BASE}/coach/applications`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const status = String(c.req.query("status") || "").trim();
  const sport = String(c.req.query("sport") || "").trim().toLowerCase();
  let incoming = (await kv.getByPrefix("coachapp:")) as ApiCoachApplication[];
  incoming = incoming.filter((item) => item.coachId === result.user.id);
  if (status) incoming = incoming.filter((item) => item.status === status);
  if (sport) incoming = incoming.filter((item) => item.sport.toLowerCase() === sport);
  incoming = incoming.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return jsonOk(c, incoming);
});

app.post(`${API_BASE}/coach/applications/:id/approve`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`coachapp:${c.req.param("id")}`)) as ApiCoachApplication | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Coach application not found.");
  if (existing.coachId !== result.user.id) return jsonErr(c, 403, "FORBIDDEN", "Cannot manage this application.");
  if (existing.status !== "pending") return jsonErr(c, 409, "CONFLICT", "Only pending applications can be approved.");
  const body = await c.req.json().catch(() => ({}));
  const updated = withCoachApplicationUpdate(existing, {
    status: "approved",
    reviewNote: String(body?.reviewNote || "").trim() || undefined,
  });
  await kv.set(`coachapp:${existing.id}`, updated);
  await writeAuditLog({
    action: "coach_application_approved",
    entityType: "coach_application",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { playerId: existing.playerId, sport: existing.sport },
  });
  await notify({
    userId: existing.playerId,
    title: "Coach Application Approved",
    message: `Your ${existing.sport} coaching application was approved.`,
    type: "success",
  });
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/coach/applications/:id/reject`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`coachapp:${c.req.param("id")}`)) as ApiCoachApplication | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Coach application not found.");
  if (existing.coachId !== result.user.id) return jsonErr(c, 403, "FORBIDDEN", "Cannot manage this application.");
  if (existing.status !== "pending") return jsonErr(c, 409, "CONFLICT", "Only pending applications can be rejected.");
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body?.reason || "").trim();
  const updated = withCoachApplicationUpdate(existing, {
    status: "rejected",
    reviewNote: reason || undefined,
  });
  await kv.set(`coachapp:${existing.id}`, updated);
  await writeAuditLog({
    action: "coach_application_rejected",
    entityType: "coach_application",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { playerId: existing.playerId, sport: existing.sport, reason: reason || null },
  });
  await notify({
    userId: existing.playerId,
    title: "Coach Application Rejected",
    message: reason ? `Application rejected: ${reason}` : `Your ${existing.sport} coaching application was rejected.`,
    type: "warning",
  });
  return jsonOk(c, updated);
});

app.get(`${API_BASE}/coach/students`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const sport = String(c.req.query("sport") || "").trim().toLowerCase();
  let approved = (await kv.getByPrefix("coachapp:")) as ApiCoachApplication[];
  approved = approved.filter((item) => item.coachId === result.user.id && item.status === "approved");
  if (sport) approved = approved.filter((item) => item.sport.toLowerCase() === sport);
  const players = (await kv.getByPrefix("user:")) as ApiUser[];
  const playerById = new Map(players.map((item) => [item.id, item]));
  const data = approved.map((item) => ({
    applicationId: item.id,
    sport: item.sport,
    approvedAt: item.updatedAt || item.createdAt,
    player: (() => {
      const player = playerById.get(item.playerId);
      return player
        ? { id: player.id, name: player.name, email: player.email, avatar: player.avatar || null }
        : { id: item.playerId, name: "Unknown Player", email: "", avatar: null };
    })(),
  }));
  return jsonOk(c, data);
});

app.get(`${API_BASE}/coach/sessions/eligible-students`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const sportParam = String(c.req.query("sport") || "").trim();
  const courtId = String(c.req.query("courtId") || "").trim();
  let sport = sportParam;
  if (!sport && courtId) {
    const court = (await kv.get(`court:${courtId}`)) as ApiCourt | null;
    if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
    sport = detectSportLabel(court.name);
  }
  if (!sport) return jsonErr(c, 400, "VALIDATION_ERROR", "sport or courtId is required.");

  const approvedApps = ((await kv.getByPrefix("coachapp:")) as ApiCoachApplication[]).filter(
    (app) => app.coachId === result.user.id && app.status === "approved" && normalizeSport(app.sport) === normalizeSport(sport),
  );
  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const data = approvedApps.map((app) => {
    const player = userMap.get(app.playerId);
    return {
      playerId: app.playerId,
      applicationId: app.id,
      sport: app.sport,
      player: player
        ? { id: player.id, name: player.name, email: player.email, avatar: player.avatar || null }
        : { id: app.playerId, name: "Unknown Player", email: "", avatar: null },
    };
  });
  return jsonOk(c, data);
});

app.get(`${API_BASE}/admin/users`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const role = c.req.query("role");
  const search = (c.req.query("search") || "").toLowerCase();
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));
  let users = (await kv.getByPrefix("user:")) as ApiUser[];
  if (role) users = users.filter((u) => u.role === role);
  if (search) users = users.filter((u) => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
  const total = users.length;
  const start = (page - 1) * limit;
  const data = users.slice(start, start + limit);
  return jsonOk(c, data, { total, page, limit, totalPages: Math.ceil(total / limit) });
});

app.patch(`${API_BASE}/admin/users/:id`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const target = (await kv.get(`user:${c.req.param("id")}`)) as ApiUser | null;
  if (!target) return jsonErr(c, 404, "NOT_FOUND", "User not found.");
  const body = await c.req.json().catch(() => ({}));
  const patch = body && typeof body === "object" ? body : {};

  const adminAllowedFields = new Set([
    "name",
    "phone",
    "avatar",
    "skillLevel",
    "coachProfile",
    "coachExpertise",
    "role",
  ]);
  const staffAllowedFields = new Set([
    "name",
    "phone",
    "avatar",
    "skillLevel",
    "coachProfile",
    "coachExpertise",
  ]);
  const allowedFields = result.role === "admin" ? adminAllowedFields : staffAllowedFields;
  const invalidFields = Object.keys(patch).filter((key) => !allowedFields.has(key));
  if (invalidFields.length > 0) {
    return jsonErr(
      c,
      400,
      "VALIDATION_ERROR",
      `Unsupported fields: ${invalidFields.join(", ")}.`,
      { invalidFields },
    );
  }
  if (result.role === "staff" && target.role === "admin") {
    return jsonErr(c, 403, "FORBIDDEN", "Staff cannot modify admin accounts.");
  }
  if (patch.role != null) {
    const nextRole = String(patch.role).trim().toLowerCase();
    if (!isRole(nextRole)) {
      return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid role.");
    }
  }
  if (patch.skillLevel != null && patch.skillLevel !== "") {
    const nextSkill = String(patch.skillLevel).trim().toLowerCase();
    if (!isValidSkillLevel(nextSkill)) {
      return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid skillLevel.");
    }
  }
  if (patch.coachExpertise != null && !Array.isArray(patch.coachExpertise)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "coachExpertise must be an array of strings.");
  }
  if (Array.isArray(patch.coachExpertise) && patch.coachExpertise.some((item: unknown) => typeof item !== "string")) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "coachExpertise must be an array of strings.");
  }

  const updates: Partial<ApiUser> = {};
  if (patch.name != null) updates.name = String(patch.name).trim();
  if (patch.phone != null) updates.phone = String(patch.phone).trim();
  if (patch.avatar != null) updates.avatar = String(patch.avatar).trim();
  if (patch.skillLevel != null) {
    const skillLevel = String(patch.skillLevel).trim().toLowerCase();
    updates.skillLevel = skillLevel || undefined;
  }
  if (patch.coachProfile != null) updates.coachProfile = String(patch.coachProfile).trim();
  if (patch.coachExpertise != null) {
    updates.coachExpertise = Array.from(new Set((patch.coachExpertise as unknown[]).map((item) => String(item).trim()).filter(Boolean)));
  }
  if (result.role === "admin" && patch.role != null) {
    updates.role = String(patch.role).trim().toLowerCase() as Role;
  }

  if (Object.keys(updates).length === 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "No valid fields provided for update.");
  }
  const updated = { ...target, ...updates };
  await kv.set(`user:${target.id}`, updated);
  await writeAuditLog({
    action: "admin_user_updated",
    entityType: "user",
    entityId: target.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: {
      requestId: requestIdFromContext(c),
      updatedFields: Object.keys(updates),
      beforeRole: target.role,
      afterRole: updated.role,
    },
  });
  return jsonOk(c, updated);
});

app.delete(`${API_BASE}/admin/users/:id`, async (c) => {
  const result = await requireRole(c, ["admin"]);
  if ("err" in result) return result.err;
  const targetId = String(c.req.param("id") || "").trim();
  if (!targetId) return jsonErr(c, 400, "VALIDATION_ERROR", "User id is required.");
  if (result.user.id === targetId) {
    return jsonErr(c, 409, "CONFLICT", "You cannot delete your own account.");
  }
  const target = (await kv.get(`user:${targetId}`)) as ApiUser | null;
  if (!target) return jsonErr(c, 404, "NOT_FOUND", "User not found.");

  if (target.role === "admin") {
    const users = (await kv.getByPrefix("user:")) as ApiUser[];
    const adminCount = users.filter((user) => user.role === "admin").length;
    if (adminCount <= 1) {
      return jsonErr(c, 409, "CONFLICT", "Cannot delete the last admin account.");
    }
  }

  await kv.mdel([`user:${targetId}`, authCredentialKey(targetId)]);
  await writeAuditLog({
    action: "admin_user_deleted",
    entityType: "user",
    entityId: targetId,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: {
      requestId: requestIdFromContext(c),
      deletedRole: target.role,
      deletedEmail: target.email,
    },
  });
  return jsonOk(c, { deleted: true, id: targetId });
});

// Courts
app.get(`${API_BASE}/courts`, async (c) => jsonOk(c, await seedCourts()));

app.post(`${API_BASE}/courts`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const court: ApiCourt = {
    id: body?.id || id(),
    name: body?.name || "New Court",
    courtNumber: body?.courtNumber || "0",
    type: body?.type || "indoor",
    surfaceType: body?.surfaceType || "hardcourt",
    hourlyRate: Number(body?.hourlyRate || 0),
    peakHourRate: body?.peakHourRate ? Number(body.peakHourRate) : undefined,
    status: body?.status || "active",
    imageUrl: body?.imageUrl ? String(body.imageUrl) : undefined,
    operatingHours: body?.operatingHours || { start: "07:00", end: "22:00" },
  };
  await kv.set(`court:${court.id}`, court);
  return jsonOk(c, court);
});

app.patch(`${API_BASE}/courts/:id`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`court:${c.req.param("id")}`)) as ApiCourt | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  const patch = await c.req.json().catch(() => ({}));
  const updated = { ...existing, ...patch };
  await kv.set(`court:${existing.id}`, updated);
  return jsonOk(c, updated);
});

app.delete(`${API_BASE}/courts/:id`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  await kv.del(`court:${c.req.param("id")}`);
  return jsonOk(c, { deleted: true });
});

// Bookings
app.get(`${API_BASE}/bookings`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const status = c.req.query("status");
  const courtId = c.req.query("courtId");
  const type = c.req.query("type");
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));
  if (type && !isValidBookingType(type)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid booking type.");
  }
  if (dateFrom && !isValidDate(dateFrom)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom must be YYYY-MM-DD.");
  }
  if (dateTo && !isValidDate(dateTo)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "dateTo must be YYYY-MM-DD.");
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom cannot be later than dateTo.");
  }
  let data = all;
  if (result.role === "player") {
    data = all.filter((b) => b.userId === result.user.id || (b.players || []).includes(result.user.id));
  } else if (result.role === "coach") {
    data = all.filter((b) => b.userId === result.user.id || b.coachId === result.user.id || (b.players || []).includes(result.user.id));
  }
  if (status) data = data.filter((b) => b.status === status);
  if (courtId) data = data.filter((b) => b.courtId === courtId);
  if (type) data = data.filter((b) => b.type === type);
  if (dateFrom) data = data.filter((b) => b.date >= dateFrom);
  if (dateTo) data = data.filter((b) => b.date <= dateTo);
  data = data.sort((a, b) => mergeDateTime(b.date, b.startTime).getTime() - mergeDateTime(a.date, a.startTime).getTime());
  const total = data.length;
  const start = (page - 1) * limit;
  return jsonOk(c, data.slice(start, start + limit), {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

app.get(`${API_BASE}/bookings/history`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const view = String(c.req.query("view") || "past").trim().toLowerCase();
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");
  const includeNoShow = String(c.req.query("includeNoShow") || "").toLowerCase() === "true";
  const includeCancelled = String(c.req.query("includeCancelled") || "").toLowerCase() === "true";
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));

  if (!["active", "past", "all"].includes(view)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "view must be active, past, or all.");
  }
  if (dateFrom && !isValidDate(dateFrom)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom must be YYYY-MM-DD.");
  if (dateTo && !isValidDate(dateTo)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateTo must be YYYY-MM-DD.");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom cannot be later than dateTo.");
  }

  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  let scoped = all;
  if (result.role === "player") {
    scoped = all.filter((b) => b.userId === result.user.id || (b.players || []).includes(result.user.id));
  } else if (result.role === "coach") {
    scoped = all.filter((b) => b.userId === result.user.id || b.coachId === result.user.id || (b.players || []).includes(result.user.id));
  }
  if (dateFrom) scoped = scoped.filter((b) => b.date >= dateFrom);
  if (dateTo) scoped = scoped.filter((b) => b.date <= dateTo);

  const active = scoped
    .filter((b) => isActiveReservation(b))
    .sort((a, b) => mergeDateTime(a.date, a.startTime).getTime() - mergeDateTime(b.date, b.startTime).getTime());
  const past = scoped
    .filter((b) => isPastHistoryReservation(b, { includeNoShow, includeCancelled }))
    .sort((a, b) => mergeDateTime(b.date, b.startTime).getTime() - mergeDateTime(a.date, a.startTime).getTime());

  let list: Array<ApiBooking | (ApiBooking & { historyBucket: "active" | "past" })> = [];
  if (view === "active") {
    list = active;
  } else if (view === "past") {
    list = past;
  } else {
    list = [
      ...active.map((booking) => ({ ...booking, historyBucket: "active" as const })),
      ...past.map((booking) => ({ ...booking, historyBucket: "past" as const })),
    ];
  }

  const total = list.length;
  const start = (page - 1) * limit;
  return jsonOk(c, list.slice(start, start + limit), {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    counts: {
      active: active.length,
      past: past.length,
      completed: scoped.filter((b) => b.status === "completed").length,
      noShow: scoped.filter((b) => b.status === "no_show").length,
      cancelled: scoped.filter((b) => b.status === "cancelled").length,
    },
  });
});

app.post(`${API_BASE}/bookings/quick`, async (c) => {
  const bookingLimit = rateLimitConfig("quick_booking_create", { max: 10, windowSeconds: 60 });
  const bookingRateErr = await enforceRateLimit(c, {
    scope: "quick_booking_create",
    key: requestClientKey(c),
    max: bookingLimit.max,
    windowSeconds: bookingLimit.windowSeconds,
  });
  if (bookingRateErr) return bookingRateErr;

  const body = await c.req.json().catch(() => ({}));
  const fullName = String(body?.fullName || "").trim();
  const contactNumber = String(body?.contactNumber || "").trim();
  const courtId = String(body?.courtId || "");
  const date = String(body?.date || "");
  const startTime = String(body?.startTime || "");
  const endTime = String(body?.endTime || "");
  const duration = Number(body?.duration || 0);
  const type = String(body?.type || "private");
  const amount = Number(body?.amount ?? 0);

  if (!fullName) return jsonErr(c, 400, "VALIDATION_ERROR", "fullName is required.");
  if (!contactNumber) return jsonErr(c, 400, "VALIDATION_ERROR", "contactNumber is required.");
  if (!courtId || !date || !startTime || !endTime || !duration) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "courtId, date, startTime, endTime, and duration are required.");
  }
  if (!isValidDate(date) || !isValidTime(startTime) || !isValidTime(endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid date or time format.");
  }
  if (minutesBetween(startTime, endTime) <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "endTime must be later than startTime.");
  }
  if (!isValidBookingType(type)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid booking type.");
  }
  if (duration <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Duration must be a positive number.");
  }
  if (duration !== minutesBetween(startTime, endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Duration must match startTime and endTime.");
  }
  if (!isValidCurrencyAmount(amount)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "amount must be a non-negative number with up to 2 decimal places.");
  }

  const court = (await kv.get(`court:${courtId}`)) as ApiCourt | null;
  if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  if (!isWithinOperatingHours(startTime, endTime, court.operatingHours)) {
    return jsonErr(c, 409, "CONFLICT", "Booking time is outside court operating hours.");
  }

  const activeHolds = await getActiveBookingHolds(courtId, date);
  const holdConflict = activeHolds.find((hold) => overlaps(hold.startTime, hold.endTime, startTime, endTime));
  if (holdConflict) {
    return jsonErr(c, 409, "CONFLICT", "Time slot is temporarily held by another user.");
  }

  const QUICK_LABEL = "Quick Reservation / Senior-Friendly Booking";
  const notes = [QUICK_LABEL, `Full Name: ${fullName}`, `Contact Number: ${contactNumber}`].join("\n");
  const guestUserId = "quick-guest";
  const existingGuest = (await kv.get(`user:${guestUserId}`)) as ApiUser | null;
  if (!existingGuest) {
    await kv.set(`user:${guestUserId}`, {
      id: guestUserId,
      email: "quick-booking@guest.local",
      name: "Quick Reservation",
      role: "player",
      status: "active",
      createdAt: nowIso(),
    } satisfies ApiUser);
  }

  const payload: ApiBooking = {
    id: id(),
    courtId,
    userId: guestUserId,
    type: type as ApiBooking["type"],
    date,
    startTime,
    endTime,
    duration,
    status: "pending",
    paymentStatus: "unpaid",
    amount,
    players: [],
    maxPlayers: 4,
    notes,
    checkedIn: false,
    receiptToken: id(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const conflict = all.find(
    (b) =>
      b.courtId === payload.courtId &&
      b.date === payload.date &&
      b.status !== "cancelled" &&
      overlaps(b.startTime, b.endTime, payload.startTime, payload.endTime),
  );
  if (conflict) return jsonErr(c, 409, "CONFLICT", "Time slot conflict detected.");

  await kv.set(`booking:${payload.id}`, payload);
  return jsonOk(c, okPayload(payload));
});

app.get(`${API_BASE}/bookings/:id`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const booking = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");

  if (!bookingCanBeReadBy(booking, result.user, result.role)) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot access this booking.");
  }

  return jsonOk(c, booking);
});

app.get(`${API_BASE}/bookings/:id/timeline`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const booking = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  if (!bookingCanBeReadBy(booking, result.user, result.role)) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot access this booking timeline.");
  }

  const allAudit = (await kv.getByPrefix("audit:")) as ApiAuditLog[];
  const bookingAudit = allAudit
    .filter((log) => log.entityType === "booking" && log.entityId === booking.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const userMap = new Map(users.map((user) => [user.id, user]));

  const events = [
    {
      id: `created:${booking.id}`,
      action: "booking_created",
      label: "Booking Created",
      createdAt: booking.createdAt,
      actorId: booking.userId,
      actorRole: (userMap.get(booking.userId)?.role || "player") as Role,
      actorName: userMap.get(booking.userId)?.name || "Unknown User",
      details: {
        status: booking.status,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
      },
    },
    ...bookingAudit.map((log) => ({
      id: log.id,
      action: log.action,
      label: log.action
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      createdAt: log.createdAt,
      actorId: log.actorId,
      actorRole: log.actorRole,
      actorName: userMap.get(log.actorId)?.name || "Unknown User",
      details: log.metadata || {},
    })),
  ];

  const order = String(c.req.query("order") || "desc").toLowerCase();
  if (!["asc", "desc"].includes(order)) return jsonErr(c, 400, "VALIDATION_ERROR", "order must be asc or desc.");
  const sorted = [...events].sort((a, b) =>
    order === "asc"
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return jsonOk(c, sorted, { total: sorted.length, bookingId: booking.id, order });
});

app.get(`${API_BASE}/bookings/:id/receipt`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const booking = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  if (!bookingReceiptCanBeReadBy(booking, result.user, result.role)) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot access this receipt.");
  }
  const court = (await kv.get(`court:${booking.courtId}`)) as ApiCourt | null;
  const player = (await kv.get(`user:${booking.userId}`)) as ApiUser | null;
  const receipt = toReceiptPayload(booking, court, player);
  return jsonOk(c, receipt);
});

app.get(`${API_BASE}/public/receipts/:token`, async (c) => {
  const token = String(c.req.param("token") || "").trim();
  if (!token) return jsonErr(c, 400, "VALIDATION_ERROR", "token is required.");
  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const booking = all.find((item) => item.receiptToken === token) || null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Receipt not found.");
  const court = (await kv.get(`court:${booking.courtId}`)) as ApiCourt | null;
  const player = (await kv.get(`user:${booking.userId}`)) as ApiUser | null;
  return jsonOk(c, toReceiptPayload(booking, court, player, { publicView: true }));
});

app.post(`${API_BASE}/bookings`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const bookingLimit = rateLimitConfig("booking_create", { max: 20, windowSeconds: 60 });
  const bookingRateErr = await enforceRateLimit(c, {
    scope: "booking_create",
    key: requestClientKey(c, result.user.id),
    max: bookingLimit.max,
    windowSeconds: bookingLimit.windowSeconds,
  });
  if (bookingRateErr) return bookingRateErr;
  const body = await c.req.json().catch(() => ({}));
  const courtId = String(body?.courtId || "");
  const date = String(body?.date || "");
  const startTime = String(body?.startTime || "");
  const endTime = String(body?.endTime || "");
  const duration = Number(body?.duration || 0);
  const type = String(body?.type || "private");
  const amount = Number(body?.amount ?? 0);
  const coachId = typeof body?.coachId === "string" ? body.coachId.trim() : "";
  const idemKey = String(c.req.header("x-idempotency-key") || "").trim() || undefined;

  if (!courtId || !date || !startTime || !endTime || !duration) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "courtId, date, startTime, endTime, and duration are required.");
  }
  if (!isValidDate(date) || !isValidTime(startTime) || !isValidTime(endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid date or time format.");
  }
  if (minutesBetween(startTime, endTime) <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "endTime must be later than startTime.");
  }
  if (!isValidBookingType(type)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid booking type.");
  }
  if (type === "training" && !coachId) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "coachId is required for training bookings.");
  }
  if (duration <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Duration must be a positive number.");
  }
  if (duration !== minutesBetween(startTime, endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Duration must match startTime and endTime.");
  }
  if (!isValidCurrencyAmount(amount)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "amount must be a non-negative number with up to 2 decimal places.");
  }
  const replay = await maybeReplayIdempotency(
    c,
    result.user.id,
    "POST:/bookings",
    idemKey,
    stableStringify({
      courtId,
      date,
      startTime,
      endTime,
      duration,
      type,
      coachId: coachId || null,
      notes: body?.notes || null,
      amount,
    }),
  );
  if (replay) return replay;

  const court = (await kv.get(`court:${courtId}`)) as ApiCourt | null;
  if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  if (coachId) {
    const coach = (await kv.get(`user:${coachId}`)) as ApiUser | null;
    if (!coach) return jsonErr(c, 404, "NOT_FOUND", "Coach not found.");
    if (coach.role !== "coach") {
      return jsonErr(c, 400, "VALIDATION_ERROR", "coachId must reference a coach account.");
    }
  }
  if (!isWithinOperatingHours(startTime, endTime, court.operatingHours)) {
    return jsonErr(c, 409, "CONFLICT", "Booking time is outside court operating hours.");
  }
  const activeHolds = await getActiveBookingHolds(courtId, date);
  const holdConflict = activeHolds.find(
    (hold) => hold.userId !== result.user.id && overlaps(hold.startTime, hold.endTime, startTime, endTime),
  );
  if (holdConflict) {
    return jsonErr(c, 409, "CONFLICT", "Time slot is temporarily held by another user.");
  }

  const payload: ApiBooking = {
    id: id(),
    courtId,
    userId: result.user.id,
    type: type as ApiBooking["type"],
    date,
    startTime,
    endTime,
    duration,
    status: "pending",
    paymentStatus: "unpaid",
    amount,
    players: [],
    maxPlayers: 4,
    coachId: coachId || undefined,
    notes: body?.notes,
    checkedIn: false,
    receiptToken: id(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const conflict = all.find(
    (b) =>
      b.courtId === payload.courtId &&
      b.date === payload.date &&
      b.status !== "cancelled" &&
      overlaps(b.startTime, b.endTime, payload.startTime, payload.endTime),
  );
  if (conflict) return jsonErr(c, 409, "CONFLICT", "Time slot conflict detected.");

  await kv.set(`booking:${payload.id}`, payload);
  const ownOverlappingHolds = activeHolds.filter(
    (hold) => hold.userId === result.user.id && overlaps(hold.startTime, hold.endTime, startTime, endTime),
  );
  if (ownOverlappingHolds.length > 0) {
    await Promise.all(ownOverlappingHolds.map((hold) => kv.del(`booking_hold:${hold.id}`)));
  }
  await notify({
    userId: result.user.id,
    title: "Booking Submitted",
    message: `Booking request for ${payload.date} at ${payload.startTime} is pending approval.`,
    type: "info",
  });
  const response = okPayload(payload);
  if (idemKey) {
    await saveIdempotencyRecord(result.user.id, "POST:/bookings", idemKey, {
      requestHash: stableStringify({
        courtId,
        date,
        startTime,
        endTime,
        duration,
        type,
        coachId: coachId || null,
        notes: body?.notes || null,
        amount,
      }),
      response,
      status: 200,
      createdAt: nowIso(),
    });
  }
  return c.json(response);
});

app.patch(`${API_BASE}/bookings/:id`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  if (result.role === "player" && existing.userId !== result.user.id) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot update this booking.");
  }
  const body = await c.req.json().catch(() => ({}));
  const expectedUpdatedAt = typeof body?.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : undefined;
  if (expectedUpdatedAt && bookingTimestamp(existing) !== expectedUpdatedAt) {
    return jsonErr(c, 409, "CONFLICT", "Booking was updated by another action. Refresh and try again.");
  }
  const patch = { ...body };
  delete (patch as any).expectedUpdatedAt;
  const blockedWorkflowFields = ["status", "checkedIn", "checkedInAt", "rejectionReason"];
  const blockedIdentityFields = ["id", "userId", "createdAt"];

  const attemptedBlocked = [...blockedWorkflowFields, ...blockedIdentityFields].find((field) => field in patch);
  if (attemptedBlocked) {
    return jsonErr(
      c,
      400,
      "VALIDATION_ERROR",
      `Field "${attemptedBlocked}" cannot be updated via PATCH /bookings/:id. Use dedicated workflow endpoints.`,
    );
  }

  if (result.role === "player") {
    const playerAllowed = new Set(["date", "startTime", "endTime", "duration", "type", "notes"]);
    const invalidField = Object.keys(patch).find((key) => !playerAllowed.has(key));
    if (invalidField) {
      return jsonErr(c, 403, "FORBIDDEN", `Players cannot update field "${invalidField}".`);
    }
  }

  if (result.role === "coach" && existing.userId !== result.user.id && existing.coachId !== result.user.id) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot update this booking.");
  }

  const updated = withBookingUpdate(existing, patch as Partial<ApiBooking>);

  if (!isValidDate(updated.date) || !isValidTime(updated.startTime) || !isValidTime(updated.endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid date or time format.");
  }
  if (minutesBetween(updated.startTime, updated.endTime) <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "endTime must be later than startTime.");
  }
  if (!isValidBookingType(updated.type)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid booking type.");
  }
  if (Number(updated.duration) <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Duration must be positive.");
  }
  if (Number(updated.duration) !== minutesBetween(updated.startTime, updated.endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Duration must match startTime and endTime.");
  }

  const court = (await kv.get(`court:${updated.courtId}`)) as ApiCourt | null;
  if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  if (!isWithinOperatingHours(updated.startTime, updated.endTime, court.operatingHours)) {
    return jsonErr(c, 409, "CONFLICT", "Booking time is outside court operating hours.");
  }

  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const conflict = all.find(
    (b) =>
      b.id !== existing.id &&
      b.courtId === updated.courtId &&
      b.date === updated.date &&
      b.status !== "cancelled" &&
      overlaps(b.startTime, b.endTime, updated.startTime, updated.endTime),
  );
  if (conflict) return jsonErr(c, 409, "CONFLICT", "Time slot conflict detected.");

  await kv.set(`booking:${existing.id}`, updated);
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/bookings/:id/approve`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  if (existing.status !== "pending") {
    return jsonErr(c, 409, "CONFLICT", "Only pending bookings can be approved.");
  }
  const updated = withBookingUpdate(existing, {
    status: "confirmed" as const,
    paymentDueAt: existing.paymentStatus === "paid" ? undefined : paymentDueAtFromNow(),
  });
  await kv.set(`booking:${existing.id}`, updated);
  await writeAuditLog({
    action: "booking_approved",
    entityType: "booking",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { previousStatus: existing.status, newStatus: updated.status },
  });
  await notify({
    userId: existing.userId,
    title: "Booking Approved",
    message: `Your booking for ${existing.date} at ${existing.startTime} has been approved.`,
    type: "success",
  });
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/bookings/:id/reject`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  if (existing.status !== "pending") {
    return jsonErr(c, 409, "CONFLICT", "Only pending bookings can be rejected.");
  }
  const body = await c.req.json().catch(() => ({}));
  const updated = withBookingUpdate(existing, { status: "cancelled" as const, rejectionReason: body?.reason || "" });
  await kv.set(`booking:${existing.id}`, updated);
  await writeAuditLog({
    action: "booking_rejected",
    entityType: "booking",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { previousStatus: existing.status, reason: body?.reason || null },
  });
  await notify({
    userId: existing.userId,
    title: "Booking Rejected",
    message: body?.reason
      ? `Booking request was rejected: ${body.reason}`
      : "Booking request was rejected.",
    type: "warning",
  });
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/bookings/:id/cancel`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  const canCancel = result.role === "admin" || result.role === "staff" || existing.userId === result.user.id;
  if (!canCancel) return jsonErr(c, 403, "FORBIDDEN", "Cannot cancel this booking.");
  if (existing.status === "cancelled" || existing.status === "completed" || existing.status === "no_show") {
    return jsonErr(c, 409, "CONFLICT", `Cannot cancel a ${existing.status} booking.`);
  }
  const updated = withBookingUpdate(existing, { status: "cancelled" as const });
  await kv.set(`booking:${existing.id}`, updated);
  await writeAuditLog({
    action: "booking_cancelled",
    entityType: "booking",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { previousStatus: existing.status },
  });
  await notify({
    userId: existing.userId,
    title: "Booking Cancelled",
    message: `Booking for ${existing.date} at ${existing.startTime} has been cancelled.`,
    type: "warning",
  });
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/bookings/:id/payment`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  const body = await c.req.json().catch(() => ({}));
  const paymentStatus = String(body?.paymentStatus || "").trim() as ApiBooking["paymentStatus"];
  const idemKey = String(c.req.header("x-idempotency-key") || "").trim() || undefined;
  if (!["unpaid", "paid", "refunded"].includes(paymentStatus)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "paymentStatus must be unpaid, paid, or refunded.");
  }
  const replay = await maybeReplayIdempotency(
    c,
    result.user.id,
    `POST:/bookings/${existing.id}/payment`,
    idemKey,
    stableStringify({ paymentStatus }),
  );
  if (replay) return replay;
  if (existing.status === "cancelled" && paymentStatus === "paid") {
    return jsonErr(c, 409, "CONFLICT", "Cancelled bookings cannot be marked as paid.");
  }
  const updated = withBookingUpdate(existing, {
    paymentStatus,
    paymentDueAt:
      paymentStatus === "paid" || existing.status !== "confirmed" ? undefined : existing.paymentDueAt || paymentDueAtFromNow(),
  });
  await kv.set(`booking:${existing.id}`, updated);
  await writeAuditLog({
    action: "booking_payment_updated",
    entityType: "booking",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { previousPaymentStatus: existing.paymentStatus, newPaymentStatus: paymentStatus },
  });
  await notify({
    userId: existing.userId,
    title: "Payment Updated",
    message: `Payment status for booking ${existing.id} is now ${paymentStatus}.`,
    type: paymentStatus === "paid" ? "success" : "info",
  });
  const response = okPayload(updated);
  if (idemKey) {
    await saveIdempotencyRecord(result.user.id, `POST:/bookings/${existing.id}/payment`, idemKey, {
      requestHash: stableStringify({ paymentStatus }),
      response,
      status: 200,
      createdAt: nowIso(),
    });
  }
  return c.json(response);
});

app.post(`${API_BASE}/bookings/:id/payment-deadline`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");

  const body = await c.req.json().catch(() => ({}));
  const idemKey = String(c.req.header("x-idempotency-key") || "").trim() || undefined;
  const clear = body?.clear === true;
  const ttlRaw = body?.ttlMinutes;
  const ttlMinutes = ttlRaw == null ? null : Number(ttlRaw);
  const dueAtRaw = body?.dueAt;
  const dueAt = typeof dueAtRaw === "string" ? dueAtRaw.trim() : "";
  const referenceNow = String(body?.referenceNow || "").trim();
  if (referenceNow && Number.isNaN(new Date(referenceNow).getTime())) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "referenceNow must be a valid ISO datetime.");
  }

  const setByTtl = ttlRaw != null;
  const setByDueAt = !!dueAt;
  const selectedModes = Number(clear) + Number(setByTtl) + Number(setByDueAt);
  if (selectedModes !== 1) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Provide exactly one mode: clear=true, ttlMinutes, or dueAt.");
  }
  if (setByTtl && (!Number.isFinite(ttlMinutes) || (ttlMinutes as number) < 1 || (ttlMinutes as number) > 10080)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "ttlMinutes must be between 1 and 10080.");
  }
  if (setByDueAt && Number.isNaN(new Date(dueAt).getTime())) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "dueAt must be a valid ISO datetime.");
  }

  const nowMs = referenceNow ? new Date(referenceNow).getTime() : Date.now();
  const newDueAt = clear
    ? undefined
    : setByTtl
    ? new Date(nowMs + Math.floor(ttlMinutes as number) * 60 * 1000).toISOString()
    : new Date(dueAt).toISOString();
  if (!clear && new Date(newDueAt as string).getTime() <= nowMs) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Payment deadline must be in the future.");
  }

  if (!clear) {
    if (existing.paymentStatus !== "unpaid") {
      return jsonErr(c, 409, "CONFLICT", "Only unpaid bookings can receive a payment deadline.");
    }
    if (existing.status !== "confirmed") {
      return jsonErr(c, 409, "CONFLICT", "Only confirmed bookings can receive a payment deadline.");
    }
  }

  const requestHash = stableStringify({
    clear,
    ttlMinutes: setByTtl ? Math.floor(ttlMinutes as number) : null,
    dueAt: setByDueAt ? new Date(dueAt).toISOString() : null,
    referenceNow: referenceNow || null,
  });
  const replay = await maybeReplayIdempotency(
    c,
    result.user.id,
    `POST:/bookings/${existing.id}/payment-deadline`,
    idemKey,
    requestHash,
  );
  if (replay) return replay;

  const updated = withBookingUpdate(existing, { paymentDueAt: newDueAt });
  await kv.set(`booking:${existing.id}`, updated);
  await writeAuditLog({
    action: clear ? "booking_payment_deadline_cleared" : "booking_payment_deadline_set",
    entityType: "booking",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: {
      previousPaymentDueAt: existing.paymentDueAt || null,
      newPaymentDueAt: newDueAt || null,
      ttlMinutes: setByTtl ? Math.floor(ttlMinutes as number) : null,
    },
  });
  await notify({
    userId: existing.userId,
    title: clear ? "Payment Deadline Cleared" : "Payment Deadline Updated",
    message: clear
      ? `Payment deadline was cleared for booking ${existing.id}.`
      : `Payment deadline for booking ${existing.id} is ${newDueAt}.`,
    type: clear ? "info" : "warning",
  });

  const response = okPayload(updated);
  if (idemKey) {
    await saveIdempotencyRecord(result.user.id, `POST:/bookings/${existing.id}/payment-deadline`, idemKey, {
      requestHash,
      response,
      status: 200,
      createdAt: nowIso(),
    });
  }
  return c.json(response);
});

app.post(`${API_BASE}/payments/checkout`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const checkoutLimit = rateLimitConfig("payment_checkout", { max: 20, windowSeconds: 60 });
  const checkoutRateErr = await enforceRateLimit(c, {
    scope: "payment_checkout",
    key: requestClientKey(c, result.user.id),
    max: checkoutLimit.max,
    windowSeconds: checkoutLimit.windowSeconds,
  });
  if (checkoutRateErr) return checkoutRateErr;
  const body = await c.req.json().catch(() => ({}));
  const bookingId = String(body?.bookingId || "").trim();
  const method = String(body?.method || "").trim().toLowerCase() as ApiPaymentTransaction["method"];
  const idemKey = String(c.req.header("x-idempotency-key") || "").trim() || undefined;
  if (!bookingId) return jsonErr(c, 400, "VALIDATION_ERROR", "bookingId is required.");
  if (!["maya", "gcash"].includes(method)) return jsonErr(c, 400, "VALIDATION_ERROR", "method must be maya or gcash.");
  const booking = (await kv.get(`booking:${bookingId}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  if (!paymentCanBeInitiatedBy(booking, result.user, result.role)) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot initiate payment for this booking.");
  }
  if (booking.status === "cancelled" || booking.status === "completed" || booking.status === "no_show") {
    return jsonErr(c, 409, "CONFLICT", `Cannot initiate payment for ${booking.status} booking.`);
  }
  if (booking.paymentStatus === "paid") {
    return jsonErr(c, 409, "CONFLICT", "Booking is already paid.");
  }

  const requestHash = stableStringify({ bookingId, method });
  const replay = await maybeReplayIdempotency(
    c,
    result.user.id,
    "POST:/payments/checkout",
    idemKey,
    requestHash,
  );
  if (replay) return replay;

  const tx: ApiPaymentTransaction = {
    id: id(),
    bookingId: booking.id,
    userId: booking.userId,
    provider: paymentProvider(),
    method,
    amount: Number(booking.amount || 0),
    currency: "PHP",
    status: "created",
    createdAt: nowIso(),
  };

  if (tx.provider === "mock") {
    const base = publicAppBaseUrl();
    tx.status = "pending";
    tx.checkoutUrl = base
      ? `${base}/payment/mock?tx=${encodeURIComponent(tx.id)}&bookingId=${encodeURIComponent(booking.id)}`
      : undefined;
    tx.providerReference = `mock-${tx.id}`;
    tx.providerPayload = { provider: "mock", method };
  } else {
    const endpoint = paymentCheckoutEndpoint();
    const apiKey = paymentApiKey();
    if (!endpoint || !apiKey) {
      return jsonErr(c, 500, "INTERNAL_ERROR", "Payment gateway is not configured.");
    }
    const checkoutPayload = {
      amount: tx.amount,
      currency: tx.currency,
      method: tx.method,
      referenceId: tx.id,
      description: `Court booking ${booking.id}`,
      successUrl: paymentSuccessUrl(tx.id),
      cancelUrl: paymentCancelUrl(tx.id),
      metadata: { bookingId: booking.id, userId: booking.userId, txId: tx.id },
    };
    let checkoutResponse: any = null;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(checkoutPayload),
      });
      checkoutResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        return jsonErr(c, 502, "INTERNAL_ERROR", "Failed to create payment checkout session.", {
          providerStatus: res.status,
          providerBody: checkoutResponse,
        });
      }
    } catch (error) {
      return jsonErr(c, 502, "INTERNAL_ERROR", "Failed to reach payment provider.", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    const checkoutUrl =
      checkoutResponse?.checkoutUrl ||
      checkoutResponse?.checkout_url ||
      checkoutResponse?.url ||
      checkoutResponse?.data?.attributes?.checkout_url ||
      checkoutResponse?.data?.checkoutUrl ||
      null;
    if (!checkoutUrl || typeof checkoutUrl !== "string") {
      return jsonErr(c, 502, "INTERNAL_ERROR", "Payment provider response is missing checkout URL.");
    }
    tx.status = "pending";
    tx.checkoutUrl = checkoutUrl;
    tx.providerReference =
      checkoutResponse?.id || checkoutResponse?.reference || checkoutResponse?.data?.id || `gateway-${tx.id}`;
    tx.providerPayload = checkoutResponse;
  }

  await kv.set(`payment_tx:${tx.id}`, tx);
  await writeAuditLog({
    action: "payment_checkout_created",
    entityType: "payment_tx",
    entityId: tx.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { bookingId: booking.id, method, provider: tx.provider, amount: tx.amount },
  });
  await notify({
    userId: booking.userId,
    title: "Payment Initiated",
    message: `Payment checkout created for booking ${booking.id} via ${method.toUpperCase()}.`,
    type: "info",
  });

  const response = okPayload(tx);
  if (idemKey) {
    await saveIdempotencyRecord(result.user.id, "POST:/payments/checkout", idemKey, {
      requestHash,
      response,
      status: 200,
      createdAt: nowIso(),
    });
  }
  return c.json(response);
});

app.get(`${API_BASE}/payments`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));
  const status = String(c.req.query("status") || "").trim().toLowerCase();
  const method = String(c.req.query("method") || "").trim().toLowerCase();
  const bookingId = String(c.req.query("bookingId") || "").trim();
  const userId = String(c.req.query("userId") || "").trim();
  if (status && !["created", "pending", "paid", "failed", "expired", "cancelled"].includes(status)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "status must be created, pending, paid, failed, expired, or cancelled.");
  }
  if (method && !["maya", "gcash"].includes(method)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "method must be maya or gcash.");
  }
  if (userId && !(result.role === "admin" || result.role === "staff")) {
    return jsonErr(c, 403, "FORBIDDEN", "Only admin or staff can filter by userId.");
  }

  let transactions = (await kv.getByPrefix("payment_tx:")) as ApiPaymentTransaction[];
  if (result.role !== "admin" && result.role !== "staff") {
    transactions = transactions.filter((tx) => tx.userId === result.user.id);
  }
  if (userId) transactions = transactions.filter((tx) => tx.userId === userId);
  if (bookingId) transactions = transactions.filter((tx) => tx.bookingId === bookingId);
  if (status) transactions = transactions.filter((tx) => tx.status === status);
  if (method) transactions = transactions.filter((tx) => tx.method === method);
  transactions = transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = transactions.length;
  const start = (page - 1) * limit;
  return jsonOk(c, transactions.slice(start, start + limit), {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

app.get(`${API_BASE}/payments/:id`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const tx = (await kv.get(`payment_tx:${c.req.param("id")}`)) as ApiPaymentTransaction | null;
  if (!tx) return jsonErr(c, 404, "NOT_FOUND", "Payment transaction not found.");
  if (result.role !== "admin" && result.role !== "staff" && tx.userId !== result.user.id) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot access this payment transaction.");
  }
  return jsonOk(c, tx);
});

app.post(`${API_BASE}/payments/:id/retry`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const tx = (await kv.get(`payment_tx:${c.req.param("id")}`)) as ApiPaymentTransaction | null;
  if (!tx) return jsonErr(c, 404, "NOT_FOUND", "Payment transaction not found.");

  const isPrivileged = result.role === "admin" || result.role === "staff";
  if (!isPrivileged && tx.userId !== result.user.id) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot retry this payment transaction.");
  }

  const booking = (await kv.get(`booking:${tx.bookingId}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found for payment transaction.");
  if (!paymentCanBeInitiatedBy(booking, result.user, result.role)) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot initiate payment for this booking.");
  }
  if (booking.status === "cancelled" || booking.status === "completed" || booking.status === "no_show") {
    return jsonErr(c, 409, "CONFLICT", `Cannot initiate payment for ${booking.status} booking.`);
  }
  if (booking.paymentStatus === "paid") {
    return jsonErr(c, 409, "CONFLICT", "Booking is already paid.");
  }
  if (!["failed", "expired", "cancelled"].includes(tx.status)) {
    return jsonErr(c, 409, "CONFLICT", `Cannot retry transaction with status ${tx.status}.`);
  }

  await writeAuditLog({
    action: "payment_retry_requested",
    entityType: "payment_tx",
    entityId: tx.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { bookingId: tx.bookingId, method: tx.method, status: tx.status },
  });

  const replayRes = await app.request(`http://local.test${API_BASE}/payments/checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...internalAuthHeaders(c, result.user.id, result.role),
    },
    body: JSON.stringify({ bookingId: tx.bookingId, method: tx.method }),
  });
  const payload = await replayRes.json().catch(() => ({}));
  return new Response(JSON.stringify(payload), {
    status: replayRes.status,
    headers: { "content-type": "application/json" },
  });
});

app.post(`${API_BASE}/payments/webhook`, async (c) => {
  const webhookLimit = rateLimitConfig("payment_webhook", { max: 120, windowSeconds: 60 });
  const webhookRateErr = await enforceRateLimit(c, {
    scope: "payment_webhook",
    key: requestClientKey(c),
    max: webhookLimit.max,
    windowSeconds: webhookLimit.windowSeconds,
  });
  if (webhookRateErr) return webhookRateErr;
  const body = await c.req.json().catch(() => ({}));
  const expectedSecret = paymentWebhookSecret();
  const signature =
    String(c.req.header("x-payment-signature") || "").trim() ||
    String(c.req.header("x-paymongo-signature") || "").trim();
  if (expectedSecret && signature !== expectedSecret) {
    return jsonErr(c, 401, "UNAUTHENTICATED", "Invalid webhook signature.");
  }
  const webhookEventId =
    String(body?.eventId || "").trim() ||
    String(body?.id || "").trim() ||
    String(body?.data?.id || "").trim();
  if (webhookEventId) {
    const dedupeKey = `idem:webhook:payment:${webhookEventId}`;
    const existing = (await kv.get(dedupeKey)) as { processedAt: string; txId: string; status: string } | null;
    if (existing) {
      return jsonOk(c, { acknowledged: true, txId: existing.txId, status: existing.status, replayed: true });
    }
  }

  const txId =
    String(body?.txId || "").trim() ||
    String(body?.referenceId || "").trim() ||
    String(body?.metadata?.txId || "").trim() ||
    String(body?.data?.attributes?.metadata?.txId || "").trim();
  if (!txId) return jsonErr(c, 400, "VALIDATION_ERROR", "Webhook payload missing txId/referenceId.");

  const tx = (await kv.get(`payment_tx:${txId}`)) as ApiPaymentTransaction | null;
  if (!tx) return jsonErr(c, 404, "NOT_FOUND", "Payment transaction not found.");

  const eventType =
    String(body?.event || "").trim() ||
    String(body?.type || "").trim() ||
    String(body?.status || "").trim() ||
    String(body?.data?.attributes?.status || "").trim();
  const incomingStatus = normalizeWebhookPaymentStatus(eventType, tx.status);

  const booking = (await kv.get(`booking:${tx.bookingId}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found for payment transaction.");

  const nextStatus = resolveNextTxStatus(tx.status, incomingStatus);
  const updatedTx = withPaymentTransactionUpdate(tx, {
    status: nextStatus,
    providerPayload: body,
    paidAt: nextStatus === "paid" ? tx.paidAt || nowIso() : tx.paidAt,
  });
  await kv.set(`payment_tx:${tx.id}`, updatedTx);

  if (nextStatus === "paid" && booking.status !== "cancelled" && booking.paymentStatus !== "paid") {
    const updatedBooking = withBookingUpdate(booking, { paymentStatus: "paid", paymentDueAt: undefined });
    await kv.set(`booking:${booking.id}`, updatedBooking);
    await writeAuditLog({
      action: "payment_webhook_paid",
      entityType: "booking",
      entityId: booking.id,
      actorId: "system:webhook",
      actorRole: "admin",
      metadata: { txId: tx.id, provider: tx.provider, method: tx.method },
    });
    await notify({
      userId: booking.userId,
      title: "Payment Confirmed",
      message: `Payment for booking ${booking.id} has been confirmed.`,
      type: "success",
    });
  } else if (nextStatus === "paid" && booking.status === "cancelled") {
    await writeAuditLog({
      action: "payment_webhook_paid_cancelled_booking",
      entityType: "payment_tx",
      entityId: tx.id,
      actorId: "system:webhook",
      actorRole: "admin",
      metadata: { bookingId: booking.id, bookingStatus: booking.status, provider: tx.provider, method: tx.method },
    });
    await notify({
      userId: booking.userId,
      title: "Payment Received After Cancellation",
      message: `Payment for cancelled booking ${booking.id} was received and is under review.`,
      type: "warning",
    });
  } else if (["failed", "expired", "cancelled"].includes(nextStatus)) {
    await writeAuditLog({
      action: "payment_webhook_failed",
      entityType: "payment_tx",
      entityId: tx.id,
      actorId: "system:webhook",
      actorRole: "admin",
      metadata: { status: nextStatus, bookingId: booking.id },
    });
    await notify({
      userId: booking.userId,
      title: "Payment Not Completed",
      message: `Payment for booking ${booking.id} was marked ${nextStatus}.`,
      type: "warning",
    });
  }

  if (webhookEventId) {
    await kv.set(`idem:webhook:payment:${webhookEventId}`, {
      processedAt: nowIso(),
      txId: tx.id,
      status: nextStatus,
    });
  }

  return jsonOk(c, { acknowledged: true, txId: tx.id, status: nextStatus });
});

app.post(`${API_BASE}/admin/payments/expire-stale`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const dryRun = body?.dryRun !== false;
  const olderThanMinutesRaw = Number(body?.olderThanMinutes ?? 180);
  const referenceNow = String(body?.referenceNow || "").trim();
  if (!Number.isFinite(olderThanMinutesRaw) || olderThanMinutesRaw < 1 || olderThanMinutesRaw > 10080) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "olderThanMinutes must be between 1 and 10080.");
  }
  if (referenceNow && Number.isNaN(new Date(referenceNow).getTime())) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "referenceNow must be a valid ISO datetime.");
  }
  const olderThanMinutes = Math.floor(olderThanMinutesRaw);
  const nowMs = referenceNow ? new Date(referenceNow).getTime() : Date.now();
  const thresholdMs = nowMs - olderThanMinutes * 60 * 1000;

  const transactions = (await kv.getByPrefix("payment_tx:")) as ApiPaymentTransaction[];
  const stale = transactions
    .filter((tx) => ["created", "pending"].includes(tx.status))
    .filter((tx) => {
      const createdAtMs = new Date(tx.createdAt).getTime();
      return Number.isFinite(createdAtMs) && createdAtMs <= thresholdMs;
    });

  if (dryRun) {
    return jsonOk(c, {
      dryRun: true,
      olderThanMinutes,
      matched: stale.length,
      txIds: stale.map((tx) => tx.id),
    });
  }

  let expiredCount = 0;
  for (const tx of stale) {
    const updated = withPaymentTransactionUpdate(tx, { status: "expired" });
    await kv.set(`payment_tx:${tx.id}`, updated);
    expiredCount += 1;
    await writeAuditLog({
      action: "payment_stale_transaction_expired",
      entityType: "payment_tx",
      entityId: tx.id,
      actorId: result.user.id,
      actorRole: result.role,
      metadata: {
        previousStatus: tx.status,
        newStatus: "expired",
        olderThanMinutes,
      },
    });
    const booking = (await kv.get(`booking:${tx.bookingId}`)) as ApiBooking | null;
    if (booking && booking.paymentStatus === "unpaid") {
      await notify({
        userId: booking.userId,
        title: "Payment Session Expired",
        message: `Payment session for booking ${booking.id} expired. Please try checkout again.`,
        type: "warning",
      });
    }
  }

  return jsonOk(c, {
    dryRun: false,
    olderThanMinutes,
    matched: stale.length,
    expired: expiredCount,
    txIds: stale.map((tx) => tx.id),
  });
});

app.get(`${API_BASE}/admin/payments/health`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;

  const daysRaw = Number(c.req.query("days") || 7);
  if (!Number.isFinite(daysRaw) || daysRaw < 1 || daysRaw > 365) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "days must be between 1 and 365.");
  }
  const days = Math.floor(daysRaw);
  const nowMs = Date.now();
  const windowStartMs = nowMs - days * 24 * 60 * 60 * 1000;

  const transactions = (await kv.getByPrefix("payment_tx:")) as ApiPaymentTransaction[];
  const bookings = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const audits = (await kv.getByPrefix("audit:")) as ApiAuditLog[];

  const recentTx = transactions.filter((tx) => {
    const createdAtMs = new Date(tx.createdAt).getTime();
    return Number.isFinite(createdAtMs) && createdAtMs >= windowStartMs;
  });

  const statusCounts = {
    created: recentTx.filter((tx) => tx.status === "created").length,
    pending: recentTx.filter((tx) => tx.status === "pending").length,
    paid: recentTx.filter((tx) => tx.status === "paid").length,
    failed: recentTx.filter((tx) => tx.status === "failed").length,
    expired: recentTx.filter((tx) => tx.status === "expired").length,
    cancelled: recentTx.filter((tx) => tx.status === "cancelled").length,
  };

  const retryCount = audits.filter((log) => {
    if (log.action !== "payment_retry_requested") return false;
    const createdAtMs = new Date(log.createdAt).getTime();
    return Number.isFinite(createdAtMs) && createdAtMs >= windowStartMs;
  }).length;
  const staleExpiredCount = audits.filter((log) => {
    if (log.action !== "payment_stale_transaction_expired") return false;
    const createdAtMs = new Date(log.createdAt).getTime();
    return Number.isFinite(createdAtMs) && createdAtMs >= windowStartMs;
  }).length;

  const txByBooking = new Map<string, ApiPaymentTransaction[]>();
  for (const tx of transactions) {
    const bucket = txByBooking.get(tx.bookingId) || [];
    bucket.push(tx);
    txByBooking.set(tx.bookingId, bucket);
  }
  const mismatch = {
    paidTxBookingUnpaid: 0,
    bookingPaidWithoutPaidTx: 0,
  };
  for (const booking of bookings) {
    const bookingTx = txByBooking.get(booking.id) || [];
    const hasPaidTx = bookingTx.some((tx) => tx.status === "paid");
    if (hasPaidTx && booking.paymentStatus !== "paid") mismatch.paidTxBookingUnpaid += 1;
    if (!hasPaidTx && booking.paymentStatus === "paid") mismatch.bookingPaidWithoutPaidTx += 1;
  }

  const totalRecent = recentTx.length;
  const paidRate = totalRecent === 0 ? 0 : Math.round((statusCounts.paid / totalRecent) * 10000) / 100;
  const failedRate = totalRecent === 0 ? 0 : Math.round((statusCounts.failed / totalRecent) * 10000) / 100;

  return jsonOk(c, {
    window: {
      days,
      from: new Date(windowStartMs).toISOString(),
      to: new Date(nowMs).toISOString(),
    },
    totals: {
      transactions: totalRecent,
      retries: retryCount,
      staleExpired: staleExpiredCount,
    },
    statusCounts,
    rates: {
      paidRate,
      failedRate,
    },
    mismatch,
  });
});

app.get(`${API_BASE}/admin/bookings/unpaid-monitor`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;

  const referenceNow = String(c.req.query("referenceNow") || "").trim();
  if (referenceNow && Number.isNaN(new Date(referenceNow).getTime())) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "referenceNow must be a valid ISO datetime.");
  }
  const statusFilter = String(c.req.query("status") || "all").trim().toLowerCase();
  if (!["all", "overdue", "at_risk"].includes(statusFilter)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "status must be one of: all, overdue, at_risk.");
  }
  const rawWindow = Number(c.req.query("windowMinutes") || 120);
  if (!Number.isFinite(rawWindow) || rawWindow < 1 || rawWindow > 10080) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "windowMinutes must be between 1 and 10080.");
  }
  const windowMinutes = Math.floor(rawWindow);
  const nowMs = referenceNow ? new Date(referenceNow).getTime() : Date.now();
  const windowEndMs = nowMs + windowMinutes * 60 * 1000;

  const bookings = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const courts = (await kv.getByPrefix("court:")) as ApiCourt[];
  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const courtMap = new Map(courts.map((court) => [court.id, court]));
  const userMap = new Map(users.map((user) => [user.id, user]));

  const tracked = bookings
    .filter((booking) => booking.status === "confirmed" && booking.paymentStatus === "unpaid" && !!booking.paymentDueAt)
    .map((booking) => {
      const dueAtMs = new Date(booking.paymentDueAt as string).getTime();
      const paymentDueInMinutes = Math.ceil((dueAtMs - nowMs) / (60 * 1000));
      const urgency = dueAtMs <= nowMs ? "overdue" : dueAtMs <= windowEndMs ? "at_risk" : "upcoming";
      return {
        id: booking.id,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        amount: Number(booking.amount || 0),
        paymentDueAt: booking.paymentDueAt,
        paymentDueInMinutes,
        urgency,
        court: courtMap.has(booking.courtId)
          ? {
              id: booking.courtId,
              name: courtMap.get(booking.courtId)!.name,
            }
          : { id: booking.courtId, name: "Unknown Court" },
        player: userMap.has(booking.userId)
          ? {
              id: booking.userId,
              name: userMap.get(booking.userId)!.name,
              email: userMap.get(booking.userId)!.email,
            }
          : { id: booking.userId, name: "Unknown Player", email: "" },
      };
    })
    .filter((item) => !Number.isNaN(new Date(item.paymentDueAt as string).getTime()));

  const monitored = tracked
    .filter((item) => (statusFilter === "all" ? true : item.urgency === statusFilter))
    .sort((a, b) => new Date(a.paymentDueAt as string).getTime() - new Date(b.paymentDueAt as string).getTime());

  const overdueCount = tracked.filter((item) => item.urgency === "overdue").length;
  const atRiskCount = tracked.filter((item) => item.urgency === "at_risk").length;

  return jsonOk(c, monitored, {
    referenceNow: new Date(nowMs).toISOString(),
    windowMinutes,
    counts: {
      overdue: overdueCount,
      atRisk: atRiskCount,
      returned: monitored.length,
    },
  });
});

app.get(`${API_BASE}/admin/payments/reconciliation`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;

  const issueType = String(c.req.query("issueType") || "").trim().toLowerCase();
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));
  if (issueType && !PAYMENT_RECONCILIATION_ISSUE_TYPES.includes(issueType as PaymentReconciliationIssueType)) {
    return jsonErr(
      c,
      400,
      "VALIDATION_ERROR",
      `issueType must be one of: ${PAYMENT_RECONCILIATION_ISSUE_TYPES.join(", ")}.`,
    );
  }
  const issues = await computePaymentReconciliationIssues();

  let filtered = issues;
  if (issueType) filtered = filtered.filter((issue) => issue.issueType === issueType);
  filtered = filtered.sort(
    (a, b) => new Date(String(b.detectedAt || "")).getTime() - new Date(String(a.detectedAt || "")).getTime(),
  );

  const total = filtered.length;
  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);
  const summary = {
    total,
    byType: {
      paidTxBookingUnpaid: filtered.filter((issue) => issue.issueType === "paid_tx_booking_unpaid").length,
      bookingPaidWithoutPaidTx: filtered.filter((issue) => issue.issueType === "booking_paid_without_paid_tx").length,
      confirmedUnpaidWithoutTx: filtered.filter((issue) => issue.issueType === "confirmed_unpaid_without_tx").length,
      orphanTxBookingMissing: filtered.filter((issue) => issue.issueType === "orphan_tx_booking_missing").length,
    },
  };

  return jsonOk(c, data, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    summary,
  });
});

app.get(`${API_BASE}/admin/payments/reconciliation/export`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const format = String(c.req.query("format") || "json").trim().toLowerCase();
  const issueType = String(c.req.query("issueType") || "").trim().toLowerCase();
  if (!["json", "csv"].includes(format)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "format must be json or csv.");
  }
  if (issueType && !PAYMENT_RECONCILIATION_ISSUE_TYPES.includes(issueType as PaymentReconciliationIssueType)) {
    return jsonErr(
      c,
      400,
      "VALIDATION_ERROR",
      `issueType must be one of: ${PAYMENT_RECONCILIATION_ISSUE_TYPES.join(", ")}.`,
    );
  }

  let issues = await computePaymentReconciliationIssues();
  if (issueType) issues = issues.filter((issue) => issue.issueType === issueType);
  issues = issues.sort(
    (a, b) => new Date(String(b.detectedAt || "")).getTime() - new Date(String(a.detectedAt || "")).getTime(),
  );

  const rows = issues.map((issue) => ({
    issueType: String(issue.issueType || ""),
    severity: String(issue.severity || ""),
    bookingId: String(issue.bookingId || ""),
    txId: String(issue.txId || ""),
    message: String(issue.message || ""),
    detectedAt: String(issue.detectedAt || ""),
  }));
  if (format === "csv") {
    const headers = ["issueType", "severity", "bookingId", "txId", "message", "detectedAt"];
    return jsonOk(c, {
      format: "csv",
      filename: `payment_reconciliation_${nowIso().slice(0, 10)}.csv`,
      contentType: "text/csv",
      data: toCsv(headers, rows),
      count: rows.length,
    });
  }
  return jsonOk(c, {
    format: "json",
    filename: `payment_reconciliation_${nowIso().slice(0, 10)}.json`,
    contentType: "application/json",
    data: rows,
    count: rows.length,
  });
});

app.post(`${API_BASE}/admin/payments/reconciliation/resolve`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const issueType = String(body?.issueType || "").trim().toLowerCase();
  const bookingId = String(body?.bookingId || "").trim();
  const txId = String(body?.txId || "").trim();
  const dryRun = body?.dryRun !== false;
  const knownIssueTypes = [
    "paid_tx_booking_unpaid",
    "booking_paid_without_paid_tx",
    "confirmed_unpaid_without_tx",
    "orphan_tx_booking_missing",
  ];
  if (!knownIssueTypes.includes(issueType)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", `issueType must be one of: ${knownIssueTypes.join(", ")}.`);
  }

  if (issueType === "orphan_tx_booking_missing" && !txId) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "txId is required for orphan_tx_booking_missing.");
  }
  if (issueType !== "orphan_tx_booking_missing" && !bookingId) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "bookingId is required for this issueType.");
  }

  if (issueType === "paid_tx_booking_unpaid") {
    const booking = (await kv.get(`booking:${bookingId}`)) as ApiBooking | null;
    if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
    const txs = ((await kv.getByPrefix("payment_tx:")) as ApiPaymentTransaction[]).filter((tx) => tx.bookingId === bookingId);
    const paidTx = txId ? txs.find((tx) => tx.id === txId && tx.status === "paid") : txs.find((tx) => tx.status === "paid");
    if (!paidTx) return jsonErr(c, 409, "CONFLICT", "No paid transaction found for this booking.");
    if (booking.paymentStatus === "paid") return jsonOk(c, { resolved: false, reason: "already_consistent", dryRun });

    const patch: Partial<ApiBooking> = { paymentStatus: "paid", paymentDueAt: undefined };
    if (dryRun) {
      return jsonOk(c, { resolved: false, dryRun: true, issueType, bookingId, txId: paidTx.id, patch });
    }

    const updated = withBookingUpdate(booking, patch);
    await kv.set(`booking:${booking.id}`, updated);
    await writeAuditLog({
      action: "payment_reconciliation_resolved_paid_tx_booking_unpaid",
      entityType: "booking",
      entityId: booking.id,
      actorId: result.user.id,
      actorRole: result.role,
      metadata: { txId: paidTx.id, previousPaymentStatus: booking.paymentStatus, newPaymentStatus: "paid" },
    });
    await notify({
      userId: booking.userId,
      title: "Payment Reconciled",
      message: `Payment for booking ${booking.id} has been reconciled and marked paid.`,
      type: "success",
    });
    return jsonOk(c, { resolved: true, dryRun: false, issueType, bookingId: booking.id, txId: paidTx.id, booking: updated });
  }

  if (issueType === "booking_paid_without_paid_tx") {
    const booking = (await kv.get(`booking:${bookingId}`)) as ApiBooking | null;
    if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
    const txs = ((await kv.getByPrefix("payment_tx:")) as ApiPaymentTransaction[]).filter((tx) => tx.bookingId === bookingId);
    if (txs.some((tx) => tx.status === "paid")) {
      return jsonErr(c, 409, "CONFLICT", "Booking already has a paid transaction. Use a different issueType.");
    }
    if (booking.paymentStatus !== "paid") return jsonOk(c, { resolved: false, reason: "already_consistent", dryRun });

    const patch: Partial<ApiBooking> = {
      paymentStatus: "unpaid",
      paymentDueAt: booking.status === "confirmed" ? booking.paymentDueAt || paymentDueAtFromNow() : undefined,
    };
    if (dryRun) {
      return jsonOk(c, { resolved: false, dryRun: true, issueType, bookingId, patch });
    }

    const updated = withBookingUpdate(booking, patch);
    await kv.set(`booking:${booking.id}`, updated);
    await writeAuditLog({
      action: "payment_reconciliation_resolved_booking_paid_without_paid_tx",
      entityType: "booking",
      entityId: booking.id,
      actorId: result.user.id,
      actorRole: result.role,
      metadata: { previousPaymentStatus: booking.paymentStatus, newPaymentStatus: "unpaid" },
    });
    await notify({
      userId: booking.userId,
      title: "Payment Reconciled",
      message: `Booking ${booking.id} was set to unpaid after reconciliation checks.`,
      type: "warning",
    });
    return jsonOk(c, { resolved: true, dryRun: false, issueType, bookingId: booking.id, booking: updated });
  }

  if (issueType === "confirmed_unpaid_without_tx") {
    const booking = (await kv.get(`booking:${bookingId}`)) as ApiBooking | null;
    if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
    const txs = ((await kv.getByPrefix("payment_tx:")) as ApiPaymentTransaction[]).filter((tx) => tx.bookingId === bookingId);
    if (txs.length > 0) return jsonErr(c, 409, "CONFLICT", "Booking already has payment transactions.");
    if (!(booking.status === "confirmed" && booking.paymentStatus === "unpaid" && Number(booking.amount || 0) > 0)) {
      return jsonOk(c, { resolved: false, reason: "already_consistent", dryRun });
    }

    const patch: Partial<ApiBooking> = { paymentDueAt: booking.paymentDueAt || paymentDueAtFromNow() };
    if (dryRun) {
      return jsonOk(c, { resolved: false, dryRun: true, issueType, bookingId, patch });
    }

    const updated = withBookingUpdate(booking, patch);
    await kv.set(`booking:${booking.id}`, updated);
    await writeAuditLog({
      action: "payment_reconciliation_resolved_confirmed_unpaid_without_tx",
      entityType: "booking",
      entityId: booking.id,
      actorId: result.user.id,
      actorRole: result.role,
      metadata: { previousPaymentDueAt: booking.paymentDueAt || null, newPaymentDueAt: updated.paymentDueAt || null },
    });
    await notify({
      userId: booking.userId,
      title: "Payment Follow-up Required",
      message: `Payment deadline has been updated for booking ${booking.id}. Please complete payment.`,
      type: "warning",
    });
    return jsonOk(c, { resolved: true, dryRun: false, issueType, bookingId: booking.id, booking: updated });
  }

  const tx = (await kv.get(`payment_tx:${txId}`)) as ApiPaymentTransaction | null;
  if (!tx) return jsonErr(c, 404, "NOT_FOUND", "Payment transaction not found.");
  const booking = (await kv.get(`booking:${tx.bookingId}`)) as ApiBooking | null;
  if (booking) return jsonOk(c, { resolved: false, reason: "already_consistent", dryRun });
  if (tx.status === "paid") {
    return jsonErr(c, 409, "CONFLICT", "Cannot auto-cancel orphan paid transaction. Resolve manually.");
  }
  if (dryRun) {
    return jsonOk(c, {
      resolved: false,
      dryRun: true,
      issueType,
      txId: tx.id,
      patch: { status: "cancelled", providerPayload: { ...(tx.providerPayload || {}), reconciliation: "orphan_tx_booking_missing" } },
    });
  }
  const updated = withPaymentTransactionUpdate(tx, {
    status: "cancelled",
    providerPayload: { ...(tx.providerPayload || {}), reconciliation: "orphan_tx_booking_missing" },
  });
  await kv.set(`payment_tx:${tx.id}`, updated);
  await writeAuditLog({
    action: "payment_reconciliation_resolved_orphan_tx_booking_missing",
    entityType: "payment_tx",
    entityId: tx.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { previousStatus: tx.status, newStatus: updated.status, bookingId: tx.bookingId },
  });
  return jsonOk(c, { resolved: true, dryRun: false, issueType, txId: updated.id, tx: updated });
});

app.post(`${API_BASE}/admin/payments/reconciliation/resolve/bulk`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? body.items : [];
  const dryRunDefault = body?.dryRun !== false;
  if (items.length < 1 || items.length > 100) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "items must contain between 1 and 100 entries.");
  }

  const output: Array<Record<string, unknown>> = [];
  let successCount = 0;
  let failureCount = 0;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const payload = {
      issueType: item?.issueType,
      bookingId: item?.bookingId,
      txId: item?.txId,
      dryRun: item?.dryRun == null ? dryRunDefault : item?.dryRun !== false,
    };
    const res = await app.request(`http://local.test${API_BASE}/admin/payments/reconciliation/resolve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...internalAuthHeaders(c, result.user.id, result.role),
      },
      body: JSON.stringify(payload),
    });
    const parsed = await res.json().catch(() => ({}));
    const ok = !!parsed?.success;
    if (ok) successCount += 1;
    else failureCount += 1;
    output.push({
      index,
      input: payload,
      success: ok,
      status: res.status,
      data: parsed?.data ?? null,
      error: parsed?.error ?? null,
    });
  }

  return jsonOk(c, output, {
    total: items.length,
    successCount,
    failureCount,
    dryRunDefault,
  });
});

app.post(`${API_BASE}/admin/payments/reconciliation/resolve/by-filter`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const issueType = String(body?.issueType || "").trim().toLowerCase();
  const dryRun = body?.dryRun !== false;
  const maxItemsRaw = Number(body?.maxItems ?? 20);
  if (!PAYMENT_RECONCILIATION_ISSUE_TYPES.includes(issueType as PaymentReconciliationIssueType)) {
    return jsonErr(
      c,
      400,
      "VALIDATION_ERROR",
      `issueType must be one of: ${PAYMENT_RECONCILIATION_ISSUE_TYPES.join(", ")}.`,
    );
  }
  if (!Number.isFinite(maxItemsRaw) || maxItemsRaw < 1 || maxItemsRaw > 100) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "maxItems must be between 1 and 100.");
  }
  const maxItems = Math.floor(maxItemsRaw);

  let issues = await computePaymentReconciliationIssues();
  issues = issues.filter((issue) => issue.issueType === issueType);
  issues = issues.sort(
    (a, b) => new Date(String(b.detectedAt || "")).getTime() - new Date(String(a.detectedAt || "")).getTime(),
  );
  const selected = issues.slice(0, maxItems);

  const output: Array<Record<string, unknown>> = [];
  let successCount = 0;
  let failureCount = 0;
  for (let index = 0; index < selected.length; index += 1) {
    const issue = selected[index];
    const payload = {
      issueType,
      bookingId: issue.bookingId || undefined,
      txId: issue.txId || undefined,
      dryRun,
    };
    const res = await app.request(`http://local.test${API_BASE}/admin/payments/reconciliation/resolve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...internalAuthHeaders(c, result.user.id, result.role),
      },
      body: JSON.stringify(payload),
    });
    const parsed = await res.json().catch(() => ({}));
    const ok = !!parsed?.success;
    if (ok) successCount += 1;
    else failureCount += 1;
    output.push({
      index,
      issue,
      success: ok,
      status: res.status,
      data: parsed?.data ?? null,
      error: parsed?.error ?? null,
    });
  }

  return jsonOk(c, output, {
    issueType,
    requestedMaxItems: maxItems,
    matched: issues.length,
    processed: selected.length,
    successCount,
    failureCount,
    dryRun,
  });
});

app.patch(`${API_BASE}/bookings/:id/status`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");

  const body = await c.req.json().catch(() => ({}));
  const nextStatus = String(body?.status || "").trim() as ApiBooking["status"];
  const reason = String(body?.reason || "").trim();
  const expectedUpdatedAt = typeof body?.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : undefined;
  if (expectedUpdatedAt && bookingTimestamp(existing) !== expectedUpdatedAt) {
    return jsonErr(c, 409, "CONFLICT", "Booking was updated by another action. Refresh and try again.");
  }
  if (!["pending", "confirmed", "cancelled", "completed", "no_show"].includes(nextStatus)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "status must be pending, confirmed, cancelled, completed, or no_show.");
  }
  if (!canTransitionBookingStatus(existing.status, nextStatus)) {
    return jsonErr(c, 409, "CONFLICT", `Cannot transition booking from ${existing.status} to ${nextStatus}.`);
  }
  if (nextStatus === "completed" && !isPastSession(existing.date, existing.endTime)) {
    return jsonErr(c, 409, "CONFLICT", "Booking can only be completed after session end time.");
  }
  if (nextStatus === "no_show") {
    if (existing.checkedIn) return jsonErr(c, 409, "CONFLICT", "Checked-in bookings cannot be marked as no-show.");
    if (!isPastSession(existing.date, existing.endTime)) {
      return jsonErr(c, 409, "CONFLICT", "Booking can only be marked no-show after session end time.");
    }
  }
  if (existing.status === nextStatus) return jsonOk(c, existing);

  const statusAction: Record<ApiBooking["status"], string> = {
    pending: "booking_status_set_pending",
    confirmed: "booking_status_set_confirmed",
    cancelled: "booking_status_set_cancelled",
    completed: "booking_status_set_completed",
    no_show: "booking_status_set_no_show",
  };
  const statusTitle: Record<ApiBooking["status"], string> = {
    pending: "Booking Updated",
    confirmed: "Booking Confirmed",
    cancelled: "Booking Cancelled",
    completed: "Booking Completed",
    no_show: "Booking Marked No-Show",
  };
  const statusMessage: Record<ApiBooking["status"], string> = {
    pending: `Booking for ${existing.date} at ${existing.startTime} is now pending.`,
    confirmed: `Your booking for ${existing.date} at ${existing.startTime} has been confirmed.`,
    cancelled: reason
      ? `Your booking for ${existing.date} at ${existing.startTime} was cancelled: ${reason}`
      : `Your booking for ${existing.date} at ${existing.startTime} was cancelled.`,
    completed: `Your booking on ${existing.date} at ${existing.startTime} has been marked completed.`,
    no_show: `Your booking on ${existing.date} at ${existing.startTime} was marked as no-show.`,
  };
  const statusType: Record<ApiBooking["status"], ApiNotification["type"]> = {
    pending: "info",
    confirmed: "success",
    cancelled: "warning",
    completed: "success",
    no_show: "warning",
  };

  const patch: Partial<ApiBooking> = { status: nextStatus };
  if (nextStatus === "cancelled") {
    patch.rejectionReason = reason || existing.rejectionReason || "";
  } else if (existing.rejectionReason) {
    patch.rejectionReason = "";
  }
  if (nextStatus === "confirmed") {
    patch.paymentDueAt = existing.paymentStatus === "paid" ? undefined : paymentDueAtFromNow();
  } else if (nextStatus === "cancelled" || nextStatus === "completed" || nextStatus === "no_show") {
    patch.paymentDueAt = undefined;
  }

  const updated = withBookingUpdate(existing, patch);
  await kv.set(`booking:${existing.id}`, updated);
  await writeAuditLog({
    action: statusAction[nextStatus],
    entityType: "booking",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { previousStatus: existing.status, newStatus: nextStatus, reason: reason || null },
  });
  await notify({
    userId: existing.userId,
    title: statusTitle[nextStatus],
    message: statusMessage[nextStatus],
    type: statusType[nextStatus],
  });
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/bookings/:id/complete`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");

  const canComplete =
    result.role === "admin" ||
    result.role === "staff" ||
    (result.role === "coach" &&
      existing.type === "training" &&
      (existing.userId === result.user.id || existing.coachId === result.user.id));
  if (!canComplete) return jsonErr(c, 403, "FORBIDDEN", "Cannot complete this booking.");
  if (existing.status !== "confirmed") {
    return jsonErr(c, 409, "CONFLICT", "Only confirmed bookings can be completed.");
  }
  if (!isPastSession(existing.date, existing.endTime)) {
    return jsonErr(c, 409, "CONFLICT", "Booking can only be completed after session end time.");
  }

  const updated = withBookingUpdate(existing, { status: "completed" as const });
  await kv.set(`booking:${existing.id}`, updated);
  await writeAuditLog({
    action: "booking_completed",
    entityType: "booking",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { previousStatus: existing.status },
  });
  await notify({
    userId: existing.userId,
    title: "Booking Completed",
    message: `Your booking on ${existing.date} at ${existing.startTime} has been marked completed.`,
    type: "success",
  });
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/bookings/:id/no-show`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  if (existing.status !== "confirmed") {
    return jsonErr(c, 409, "CONFLICT", "Only confirmed bookings can be marked as no-show.");
  }
  if (existing.checkedIn) {
    return jsonErr(c, 409, "CONFLICT", "Checked-in bookings cannot be marked as no-show.");
  }
  if (!isPastSession(existing.date, existing.endTime)) {
    return jsonErr(c, 409, "CONFLICT", "Booking can only be marked no-show after session end time.");
  }

  const updated = withBookingUpdate(existing, { status: "no_show" as const, paymentDueAt: undefined });
  await kv.set(`booking:${existing.id}`, updated);
  await writeAuditLog({
    action: "booking_no_show",
    entityType: "booking",
    entityId: existing.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { previousStatus: existing.status },
  });
  await notify({
    userId: existing.userId,
    title: "Booking Marked No-Show",
    message: `Your booking on ${existing.date} at ${existing.startTime} was marked as no-show.`,
    type: "warning",
  });
  return jsonOk(c, updated);
});

app.get(`${API_BASE}/bookings/available-slots`, async (c) => {
  const courtId = c.req.query("courtId");
  const date = c.req.query("date");
  const bookingType = c.req.query("bookingType") || "private";
  if (!courtId || !date) return jsonErr(c, 400, "VALIDATION_ERROR", "courtId and date are required.");
  if (!isValidDate(date)) return jsonErr(c, 400, "VALIDATION_ERROR", "date must be YYYY-MM-DD.");
  if (!isValidBookingType(bookingType)) return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid bookingType.");
  const facility = await getFacilityConfig();
  const court = (await kv.get(`court:${courtId}`)) as ApiCourt | null;
  if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  const bookings = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const holds = await getActiveBookingHolds(courtId, date);
  const open = toMinutes(court.operatingHours.start);
  const close = toMinutes(court.operatingHours.end);
  const step = Math.max(15, Number(facility.bookingInterval || 60));
  const slots: string[] = [];
  for (let minutes = open; minutes < close; minutes += step) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    const time = `${hh}:${mm}`;
    const slotBookings = bookings.filter(
      (b) => b.courtId === courtId && b.date === date && b.status !== "cancelled" && b.startTime === time,
    );

    let isAvailable = true;
    if (slotBookings.length > 0) {
      const hasExclusive = slotBookings.some((b) => b.type === "private" || b.type === "training");
      if (hasExclusive) {
        isAvailable = false;
      } else if (bookingType === "private" || bookingType === "training") {
        isAvailable = false;
      } else {
        const totalPlayers = slotBookings.reduce((sum, b) => sum + 1 + (b.players?.length || 0), 0);
        if (totalPlayers >= 4) isAvailable = false;
      }
    }
    const slotEndMinutes = minutes + step;
    const slotStart = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const slotEnd = `${String(Math.floor(slotEndMinutes / 60)).padStart(2, "0")}:${String(slotEndMinutes % 60).padStart(
      2,
      "0",
    )}`;
    const held = holds.some((hold) => overlaps(hold.startTime, hold.endTime, slotStart, slotEnd));
    if (held) isAvailable = false;

    if (isAvailable) slots.push(time);
  }
  return jsonOk(c, slots);
});

app.post(`${API_BASE}/bookings/expire-unpaid`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const dryRun = body?.dryRun !== false;
  const referenceNow = String(body?.referenceNow || "").trim();
  if (referenceNow && Number.isNaN(new Date(referenceNow).getTime())) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "referenceNow must be a valid ISO datetime.");
  }
  const nowMs = referenceNow ? new Date(referenceNow).getTime() : Date.now();
  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const overdue = all.filter(
    (booking) =>
      booking.status === "confirmed" &&
      booking.paymentStatus === "unpaid" &&
      !!booking.paymentDueAt &&
      new Date(booking.paymentDueAt).getTime() <= nowMs,
  );

  if (dryRun) {
    return jsonOk(c, {
      dryRun: true,
      matched: overdue.length,
      cancelled: 0,
      bookingIds: overdue.map((booking) => booking.id),
    });
  }

  let cancelled = 0;
  for (const booking of overdue) {
    const updated = withBookingUpdate(booking, {
      status: "cancelled",
      rejectionReason: "Auto-cancelled: payment deadline missed.",
      paymentDueAt: undefined,
    });
    await kv.set(`booking:${booking.id}`, updated);
    cancelled += 1;
    await writeAuditLog({
      action: "booking_auto_cancelled_unpaid",
      entityType: "booking",
      entityId: booking.id,
      actorId: result.user.id,
      actorRole: result.role,
      metadata: {
        previousStatus: booking.status,
        previousPaymentStatus: booking.paymentStatus,
        paymentDueAt: booking.paymentDueAt,
      },
    });
    await notify({
      userId: booking.userId,
      title: "Booking Cancelled",
      message: `Your booking for ${booking.date} at ${booking.startTime} was auto-cancelled due to unpaid balance.`,
      type: "warning",
    });
  }

  return jsonOk(c, {
    dryRun: false,
    matched: overdue.length,
    cancelled,
    bookingIds: overdue.map((booking) => booking.id),
  });
});

app.get(`${API_BASE}/bookings/holds/me`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const courtId = String(c.req.query("courtId") || "").trim();
  const date = String(c.req.query("date") || "").trim();
  if (date && !isValidDate(date)) return jsonErr(c, 400, "VALIDATION_ERROR", "date must be YYYY-MM-DD.");
  const holds = await getActiveBookingHolds(courtId || undefined, date || undefined);
  return jsonOk(
    c,
    holds
      .filter((hold) => hold.userId === result.user.id)
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()),
  );
});

app.post(`${API_BASE}/bookings/holds`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const courtId = String(body?.courtId || "").trim();
  const date = String(body?.date || "").trim();
  const startTime = String(body?.startTime || "").trim();
  const endTime = String(body?.endTime || "").trim();
  const ttlMinutes = Math.min(30, Math.max(1, Number(body?.ttlMinutes || 10)));

  if (!courtId || !date || !startTime || !endTime) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "courtId, date, startTime, and endTime are required.");
  }
  if (!isValidDate(date) || !isValidTime(startTime) || !isValidTime(endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid date or time format.");
  }
  if (minutesBetween(startTime, endTime) <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "endTime must be later than startTime.");
  }
  const court = (await kv.get(`court:${courtId}`)) as ApiCourt | null;
  if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  if (!isWithinOperatingHours(startTime, endTime, court.operatingHours)) {
    return jsonErr(c, 409, "CONFLICT", "Hold time is outside court operating hours.");
  }

  const bookings = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const bookingConflict = bookings.find(
    (booking) =>
      booking.courtId === courtId &&
      booking.date === date &&
      booking.status !== "cancelled" &&
      overlaps(booking.startTime, booking.endTime, startTime, endTime),
  );
  if (bookingConflict) return jsonErr(c, 409, "CONFLICT", "Cannot hold an already-booked time slot.");

  const holds = await getActiveBookingHolds(courtId, date);
  const holdConflict = holds.find(
    (hold) => hold.userId !== result.user.id && overlaps(hold.startTime, hold.endTime, startTime, endTime),
  );
  if (holdConflict) return jsonErr(c, 409, "CONFLICT", "Time slot is already held by another user.");

  const ownOverlapping = holds.find(
    (hold) => hold.userId === result.user.id && overlaps(hold.startTime, hold.endTime, startTime, endTime),
  );
  if (ownOverlapping) return jsonOk(c, ownOverlapping);

  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const hold: ApiBookingHold = {
    id: id(),
    courtId,
    userId: result.user.id,
    date,
    startTime,
    endTime,
    createdAt,
    expiresAt,
  };
  await kv.set(`booking_hold:${hold.id}`, hold);
  return jsonOk(c, hold);
});

app.delete(`${API_BASE}/bookings/holds/:id`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const hold = (await kv.get(`booking_hold:${c.req.param("id")}`)) as ApiBookingHold | null;
  if (!hold) return jsonErr(c, 404, "NOT_FOUND", "Hold not found.");
  const canDelete = hold.userId === result.user.id || result.role === "admin" || result.role === "staff";
  if (!canDelete) return jsonErr(c, 403, "FORBIDDEN", "Cannot release this hold.");
  await kv.del(`booking_hold:${hold.id}`);
  return jsonOk(c, { deleted: true, id: hold.id });
});

// Requests (pending booking queue for admin/staff dashboards)
app.get(`${API_BASE}/requests`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));
  const courtId = c.req.query("courtId");
  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  let pending = all.filter((b) => b.status === "pending");
  if (courtId) pending = pending.filter((b) => b.courtId === courtId);
  pending = pending.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = pending.length;
  const start = (page - 1) * limit;
  return jsonOk(c, pending.slice(start, start + limit), { total, page, limit, totalPages: Math.ceil(total / limit) });
});

app.get(`${API_BASE}/requests/:id`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const booking = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Request not found.");
  if (booking.status !== "pending") return jsonErr(c, 409, "CONFLICT", "Only pending bookings are treated as requests.");
  return jsonOk(c, booking);
});

app.post(`${API_BASE}/requests/:id/approve`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Request not found.");
  if (existing.status !== "pending") {
    return jsonErr(c, 409, "CONFLICT", "Only pending requests can be approved.");
  }
  const updated = withBookingUpdate(existing, {
    status: "confirmed" as const,
    paymentDueAt: existing.paymentStatus === "paid" ? undefined : paymentDueAtFromNow(),
  });
  await kv.set(`booking:${existing.id}`, updated);
  await notify({
    userId: existing.userId,
    title: "Booking Approved",
    message: `Your booking for ${existing.date} at ${existing.startTime} has been approved.`,
    type: "success",
  });
  return jsonOk(c, updated);
});

app.post(`${API_BASE}/requests/:id/reject`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Request not found.");
  if (existing.status !== "pending") {
    return jsonErr(c, 409, "CONFLICT", "Only pending requests can be rejected.");
  }
  const body = await c.req.json().catch(() => ({}));
  const updated = withBookingUpdate(existing, { status: "cancelled" as const, rejectionReason: body?.reason || "" });
  await kv.set(`booking:${existing.id}`, updated);
  await notify({
    userId: existing.userId,
    title: "Booking Rejected",
    message: body?.reason
      ? `Booking request was rejected: ${body.reason}`
      : "Booking request was rejected.",
    type: "warning",
  });
  return jsonOk(c, updated);
});

// Check-in
app.post(`${API_BASE}/check-in/verify`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const booking = (await kv.get(`booking:${body?.bookingId || ""}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  if (booking.checkedIn) {
    return jsonErr(c, 409, "CONFLICT", "Booking is already checked in.");
  }
  if (booking.status !== "confirmed") {
    return jsonErr(c, 409, "CONFLICT", "Only confirmed bookings can be checked in.");
  }
  if (!isCheckInWindow(booking)) {
    return jsonErr(c, 409, "CONFLICT", "Check-in is only allowed from 30 minutes before until 15 minutes after the session start time.");
  }
  const court = await kv.get(`court:${booking.courtId}`);
  const player = await kv.get(`user:${booking.userId}`);
  return jsonOk(c, { booking, court, player });
});

app.post(`${API_BASE}/check-in/confirm`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const booking = (await kv.get(`booking:${body?.bookingId || ""}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Booking not found.");
  if (booking.checkedIn) {
    return jsonErr(c, 409, "CONFLICT", "Booking is already checked in.");
  }
  if (booking.status !== "confirmed") {
    return jsonErr(c, 409, "CONFLICT", "Only confirmed bookings can be checked in.");
  }
  if (!isCheckInWindow(booking)) {
    return jsonErr(c, 409, "CONFLICT", "Check-in is only allowed from 30 minutes before until 15 minutes after the session start time.");
  }
  const updated = withBookingUpdate(booking, { checkedIn: true, checkedInAt: nowIso() });
  await kv.set(`booking:${booking.id}`, updated);
  await notify({
    userId: booking.userId,
    title: "Checked In",
    message: `You are checked in for ${booking.date} at ${booking.startTime}.`,
    type: "success",
  });
  return jsonOk(c, updated);
});

// Coach sessions
app.get(`${API_BASE}/coach/sessions`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");
  if (dateFrom && !isValidDate(dateFrom)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom must be YYYY-MM-DD.");
  if (dateTo && !isValidDate(dateTo)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateTo must be YYYY-MM-DD.");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom cannot be later than dateTo.");
  }
  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  let sessions = all.filter((b) => b.type === "training" && b.userId === result.user.id);
  if (dateFrom) sessions = sessions.filter((b) => b.date >= dateFrom);
  if (dateTo) sessions = sessions.filter((b) => b.date <= dateTo);
  sessions = sessions.sort((a, b) => mergeDateTime(a.date, a.startTime).getTime() - mergeDateTime(b.date, b.startTime).getTime());
  return jsonOk(c, sessions);
});

app.post(`${API_BASE}/coach/sessions`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const courtId = String(body?.courtId || "");
  const date = String(body?.date || nowIso().slice(0, 10));
  const startTime = String(body?.startTime || "10:00");
  const endTime = String(body?.endTime || "11:00");
  const duration = Number(body?.duration || 60);
  const maxPlayers = Number(body?.maxPlayers || 4);
  const amount = Number(body?.amount ?? 0);
  const requestedSport = String(body?.sport || "").trim();
  const autoEnrollApproved = body?.autoEnrollApproved !== false;

  if (!courtId) return jsonErr(c, 400, "VALIDATION_ERROR", "courtId is required.");
  if (!isValidDate(date) || !isValidTime(startTime) || !isValidTime(endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid date or time format.");
  }
  if (minutesBetween(startTime, endTime) <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "endTime must be later than startTime.");
  }
  if (duration <= 0 || maxPlayers <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "duration and maxPlayers must be positive.");
  }
  if (duration !== minutesBetween(startTime, endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Duration must match startTime and endTime.");
  }
  if (!isValidCurrencyAmount(amount)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "amount must be a non-negative number with up to 2 decimal places.");
  }

  const court = (await kv.get(`court:${courtId}`)) as ApiCourt | null;
  if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  if (!isWithinOperatingHours(startTime, endTime, court.operatingHours)) {
    return jsonErr(c, 409, "CONFLICT", "Session time is outside court operating hours.");
  }

  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const conflict = all.find(
    (b) =>
      b.courtId === courtId &&
      b.date === date &&
      b.status !== "cancelled" &&
      overlaps(b.startTime, b.endTime, startTime, endTime),
  );
  if (conflict) return jsonErr(c, 409, "CONFLICT", "Time slot conflict detected.");

  const sessionSport = requestedSport || detectSportLabel(court.name);
  const approvedStudents = ((await kv.getByPrefix("coachapp:")) as ApiCoachApplication[])
    .filter(
      (item) =>
        item.coachId === result.user.id &&
        item.status === "approved" &&
        normalizeSport(item.sport) === normalizeSport(sessionSport),
    )
    .map((item) => item.playerId);
  const requestedPlayers: string[] = Array.isArray(body?.players)
    ? body.players.map((p: unknown) => String(p || "").trim()).filter(Boolean)
    : [];
  const mergedPlayers: string[] = Array.from(
    new Set<string>(autoEnrollApproved ? [...requestedPlayers, ...approvedStudents] : requestedPlayers),
  );
  const players: string[] = mergedPlayers.slice(0, maxPlayers);

  const booking: ApiBooking = {
    id: id(),
    courtId,
    userId: result.user.id,
    type: "training",
    date,
    startTime,
    endTime,
    duration,
    status: "confirmed",
    paymentStatus: "paid",
    amount,
    maxPlayers,
    players,
    sport: sessionSport,
    attendance: {},
    notes: body?.notes || "",
    checkedIn: false,
    receiptToken: id(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await kv.set(`booking:${booking.id}`, booking);
  return jsonOk(c, booking);
});

app.patch(`${API_BASE}/coach/sessions/:id`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Session not found.");
  if (existing.userId !== result.user.id) return jsonErr(c, 403, "FORBIDDEN", "Not your session.");
  const patch = await c.req.json().catch(() => ({}));

  const blockedFields = [
    "id",
    "userId",
    "type",
    "status",
    "paymentStatus",
    "players",
    "attendance",
    "checkedIn",
    "checkedInAt",
    "createdAt",
    "updatedAt",
    "receiptToken",
    "rejectionReason",
    "paymentDueAt",
    "coachId",
  ];
  const attemptedBlocked = blockedFields.find((field) => field in patch);
  if (attemptedBlocked) {
    return jsonErr(
      c,
      400,
      "VALIDATION_ERROR",
      `Field "${attemptedBlocked}" cannot be updated via PATCH /coach/sessions/:id.`,
    );
  }

  const allowedFields = new Set(["courtId", "date", "startTime", "endTime", "duration", "maxPlayers", "sport", "notes", "amount"]);
  const invalidField = Object.keys(patch).find((key) => !allowedFields.has(key));
  if (invalidField) {
    return jsonErr(c, 400, "VALIDATION_ERROR", `Field "${invalidField}" cannot be updated via PATCH /coach/sessions/:id.`);
  }

  const updated = withBookingUpdate(existing, patch as Partial<ApiBooking>);
  if (!isValidDate(updated.date) || !isValidTime(updated.startTime) || !isValidTime(updated.endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Invalid date or time format.");
  }
  if (minutesBetween(updated.startTime, updated.endTime) <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "endTime must be later than startTime.");
  }
  if (Number(updated.duration) <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Duration must be positive.");
  }
  if (Number(updated.duration) !== minutesBetween(updated.startTime, updated.endTime)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Duration must match startTime and endTime.");
  }
  if (!Number.isFinite(Number(updated.maxPlayers ?? 0)) || Number(updated.maxPlayers) <= 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "maxPlayers must be a positive number.");
  }
  if (updated.type !== "training") {
    return jsonErr(c, 409, "CONFLICT", "Coach sessions must remain training type.");
  }
  if ((updated.players || []).length > Number(updated.maxPlayers || 0)) {
    return jsonErr(c, 409, "CONFLICT", "maxPlayers cannot be less than currently enrolled players.");
  }
  if (!isValidCurrencyAmount(Number(updated.amount ?? 0))) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "amount must be a non-negative number with up to 2 decimal places.");
  }
  const court = (await kv.get(`court:${updated.courtId}`)) as ApiCourt | null;
  if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  if (!isWithinOperatingHours(updated.startTime, updated.endTime, court.operatingHours)) {
    return jsonErr(c, 409, "CONFLICT", "Session time is outside court operating hours.");
  }
  const all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const conflict = all.find(
    (b) =>
      b.id !== existing.id &&
      b.courtId === updated.courtId &&
      b.date === updated.date &&
      b.status !== "cancelled" &&
      overlaps(b.startTime, b.endTime, updated.startTime, updated.endTime),
  );
  if (conflict) return jsonErr(c, 409, "CONFLICT", "Time slot conflict detected.");
  await kv.set(`booking:${existing.id}`, updated);
  return jsonOk(c, updated);
});

app.delete(`${API_BASE}/coach/sessions/:id`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Session not found.");
  if (existing.userId !== result.user.id) return jsonErr(c, 403, "FORBIDDEN", "Not your session.");
  await kv.del(`booking:${existing.id}`);
  return jsonOk(c, { deleted: true });
});

app.get(`${API_BASE}/coach/sessions/:id/attendance`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const session = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!session) return jsonErr(c, 404, "NOT_FOUND", "Session not found.");
  if (session.userId !== result.user.id) return jsonErr(c, 403, "FORBIDDEN", "Not your session.");
  if (session.type !== "training") return jsonErr(c, 409, "CONFLICT", "Attendance is available for training sessions only.");

  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const data = (session.players || []).map((playerId) => {
    const player = userMap.get(playerId);
    return {
      playerId,
      attended: session.attendance?.[playerId] ?? false,
      player: player
        ? { id: player.id, name: player.name, email: player.email, avatar: player.avatar || null }
        : { id: playerId, name: "Unknown Player", email: "", avatar: null },
    };
  });
  return jsonOk(c, data);
});

app.post(`${API_BASE}/coach/sessions/:id/attendance`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const session = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!session) return jsonErr(c, 404, "NOT_FOUND", "Session not found.");
  if (session.userId !== result.user.id) return jsonErr(c, 403, "FORBIDDEN", "Not your session.");
  if (session.type !== "training") return jsonErr(c, 409, "CONFLICT", "Attendance is available for training sessions only.");
  const body = await c.req.json().catch(() => ({}));
  const playerId = String(body?.playerId || "").trim();
  const attended = !!body?.attended;
  if (!playerId) return jsonErr(c, 400, "VALIDATION_ERROR", "playerId is required.");
  if (!(session.players || []).includes(playerId)) {
    return jsonErr(c, 409, "CONFLICT", "Player is not enrolled in this session.");
  }
  const updated = withBookingUpdate(session, {
    attendance: {
      ...(session.attendance || {}),
      [playerId]: attended,
    },
  });
  await kv.set(`booking:${session.id}`, updated);
  await writeAuditLog({
    action: "session_attendance_marked",
    entityType: "booking",
    entityId: session.id,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { playerId, attended },
  });
  return jsonOk(c, updated);
});

app.get(`${API_BASE}/coach/reports/attendance`, async (c) => {
  const result = await requireRole(c, ["coach"]);
  if ("err" in result) return result.err;
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");
  const sport = String(c.req.query("sport") || "").trim().toLowerCase();
  if (dateFrom && !isValidDate(dateFrom)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom must be YYYY-MM-DD.");
  if (dateTo && !isValidDate(dateTo)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateTo must be YYYY-MM-DD.");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom cannot be later than dateTo.");
  }

  let sessions = (await kv.getByPrefix("booking:")) as ApiBooking[];
  sessions = sessions.filter((b) => b.type === "training" && b.userId === result.user.id);
  if (dateFrom) sessions = sessions.filter((b) => b.date >= dateFrom);
  if (dateTo) sessions = sessions.filter((b) => b.date <= dateTo);
  if (sport) sessions = sessions.filter((b) => normalizeSport(b.sport || "") === sport);

  const stats = new Map<string, { attendedSessions: number; missedSessions: number; totalSessions: number }>();
  for (const session of sessions) {
    for (const playerId of session.players || []) {
      const current = stats.get(playerId) || { attendedSessions: 0, missedSessions: 0, totalSessions: 0 };
      current.totalSessions += 1;
      if (session.attendance?.[playerId]) {
        current.attendedSessions += 1;
      } else {
        current.missedSessions += 1;
      }
      stats.set(playerId, current);
    }
  }

  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const students = Array.from(stats.entries()).map(([playerId, value]) => {
    const player = userMap.get(playerId);
    return {
      playerId,
      playerName: player?.name || "Unknown Player",
      attendedSessions: value.attendedSessions,
      missedSessions: value.missedSessions,
      totalSessions: value.totalSessions,
      attendanceRate:
        value.totalSessions === 0 ? 0 : Math.round((value.attendedSessions / value.totalSessions) * 10000) / 100,
    };
  });

  return jsonOk(c, {
    summary: {
      totalTrainingSessions: sessions.length,
      uniqueStudents: students.length,
    },
    students,
  });
});

app.post(`${API_BASE}/sessions/:id/join`, async (c) => {
  const result = await requireRole(c, ["player"]);
  if ("err" in result) return result.err;
  const booking = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  const idemKey = String(c.req.header("x-idempotency-key") || "").trim() || undefined;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Session not found.");
  const replay = await maybeReplayIdempotency(
    c,
    result.user.id,
    `POST:/sessions/${c.req.param("id")}/join`,
    idemKey,
    stableStringify({ playerId: result.user.id }),
  );
  if (replay) return replay;
  if (booking.status !== "confirmed") return jsonErr(c, 409, "CONFLICT", "Only confirmed sessions can be joined.");
  if (booking.type !== "training" && booking.type !== "open_play") {
    return jsonErr(c, 409, "CONFLICT", "Only open play or training sessions can be joined.");
  }
  if (isPastSession(booking.date, booking.endTime)) {
    return jsonErr(c, 409, "CONFLICT", "Cannot join a session that has already ended.");
  }
  if (booking.userId === result.user.id) {
    return jsonErr(c, 409, "CONFLICT", "Session owner cannot join as player.");
  }
  if ((booking.players || []).includes(result.user.id)) {
    return jsonErr(c, 409, "CONFLICT", "Player already joined this session.");
  }
  const players = Array.from(new Set([...(booking.players || []), result.user.id]));
  if (players.length > (booking.maxPlayers || 4)) return jsonErr(c, 409, "CONFLICT", "Session is full.");
  const updated = withBookingUpdate(booking, { players });
  await kv.set(`booking:${booking.id}`, updated);
  await notify({
    userId: booking.userId,
    title: "Player Joined Session",
    message: `A player joined your session on ${booking.date} at ${booking.startTime}.`,
    type: "info",
  });
  const response = okPayload(updated);
  if (idemKey) {
    await saveIdempotencyRecord(result.user.id, `POST:/sessions/${c.req.param("id")}/join`, idemKey, {
      requestHash: stableStringify({ playerId: result.user.id }),
      response,
      status: 200,
      createdAt: nowIso(),
    });
  }
  return c.json(response);
});

app.post(`${API_BASE}/sessions/:id/leave`, async (c) => {
  const result = await requireRole(c, ["player"]);
  if ("err" in result) return result.err;
  const booking = (await kv.get(`booking:${c.req.param("id")}`)) as ApiBooking | null;
  if (!booking) return jsonErr(c, 404, "NOT_FOUND", "Session not found.");
  if (booking.type !== "training" && booking.type !== "open_play") {
    return jsonErr(c, 409, "CONFLICT", "Only open play or training sessions can be left.");
  }
  if (isPastSession(booking.date, booking.endTime)) {
    return jsonErr(c, 409, "CONFLICT", "Cannot leave a session that has already ended.");
  }
  if (!(booking.players || []).includes(result.user.id)) {
    return jsonErr(c, 409, "CONFLICT", "Player is not enrolled in this session.");
  }

  const updated = withBookingUpdate(booking, {
    players: (booking.players || []).filter((playerId) => playerId !== result.user.id),
  });
  await kv.set(`booking:${booking.id}`, updated);
  await notify({
    userId: booking.userId,
    title: "Player Left Session",
    message: `A player left your session on ${booking.date} at ${booking.startTime}.`,
    type: "warning",
  });
  return jsonOk(c, updated);
});

// Plans / subscriptions
app.get(`${API_BASE}/plans`, async (c) => jsonOk(c, await seedPlans()));

app.post(`${API_BASE}/plans`, async (c) => {
  const result = await requireRole(c, ["admin"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  if (!name) return jsonErr(c, 400, "VALIDATION_ERROR", "name is required.");
  const price = Number(body?.price);
  if (!isValidCurrencyAmount(price)) return jsonErr(c, 400, "VALIDATION_ERROR", "price must be a valid non-negative currency amount.");
  const interval = String(body?.interval || "").trim().toLowerCase();
  if (!isValidPlanInterval(interval)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", `interval must be one of: ${PLAN_INTERVALS.join(", ")}.`);
  }
  const tier = String(body?.tier || "").trim().toLowerCase();
  if (!isValidPlanTier(tier)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", `tier must be one of: ${PLAN_TIERS.join(", ")}.`);
  }
  const featuresRaw = body?.features;
  if (featuresRaw != null && !Array.isArray(featuresRaw)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "features must be an array of strings.");
  }
  if (Array.isArray(featuresRaw) && featuresRaw.some((item: unknown) => typeof item !== "string")) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "features must be an array of strings.");
  }
  const plan = {
    id: body?.id || id(),
    name,
    price,
    interval,
    tier,
    description: String(body?.description || "").trim(),
    features: Array.from(new Set((Array.isArray(featuresRaw) ? featuresRaw : []).map((item) => String(item).trim()).filter(Boolean))),
  };
  await kv.set(`plan:${plan.id}`, plan);
  await writeAuditLog({
    action: "admin_plan_created",
    entityType: "plan",
    entityId: String(plan.id),
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { requestId: requestIdFromContext(c), name: plan.name, interval: plan.interval, tier: plan.tier },
  });
  return jsonOk(c, plan);
});

app.patch(`${API_BASE}/plans/:id`, async (c) => {
  const result = await requireRole(c, ["admin"]);
  if ("err" in result) return result.err;
  const existing = await kv.get(`plan:${c.req.param("id")}`);
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Plan not found.");
  const patch = await c.req.json().catch(() => ({}));
  const allowedFields = new Set(["name", "price", "interval", "tier", "description", "features"]);
  const invalidFields = Object.keys(patch || {}).filter((key) => !allowedFields.has(key));
  if (invalidFields.length > 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", `Unsupported fields: ${invalidFields.join(", ")}.`, { invalidFields });
  }

  const updates: Record<string, unknown> = {};
  if (patch?.name != null) {
    const name = String(patch.name).trim();
    if (!name) return jsonErr(c, 400, "VALIDATION_ERROR", "name cannot be empty.");
    updates.name = name;
  }
  if (patch?.price != null) {
    const price = Number(patch.price);
    if (!isValidCurrencyAmount(price)) {
      return jsonErr(c, 400, "VALIDATION_ERROR", "price must be a valid non-negative currency amount.");
    }
    updates.price = price;
  }
  if (patch?.interval != null) {
    const interval = String(patch.interval).trim().toLowerCase();
    if (!isValidPlanInterval(interval)) {
      return jsonErr(c, 400, "VALIDATION_ERROR", `interval must be one of: ${PLAN_INTERVALS.join(", ")}.`);
    }
    updates.interval = interval;
  }
  if (patch?.tier != null) {
    const tier = String(patch.tier).trim().toLowerCase();
    if (!isValidPlanTier(tier)) {
      return jsonErr(c, 400, "VALIDATION_ERROR", `tier must be one of: ${PLAN_TIERS.join(", ")}.`);
    }
    updates.tier = tier;
  }
  if (patch?.description != null) updates.description = String(patch.description).trim();
  if (patch?.features != null) {
    if (!Array.isArray(patch.features) || patch.features.some((item: unknown) => typeof item !== "string")) {
      return jsonErr(c, 400, "VALIDATION_ERROR", "features must be an array of strings.");
    }
    updates.features = Array.from(new Set((patch.features as unknown[]).map((item) => String(item).trim()).filter(Boolean)));
  }
  if (Object.keys(updates).length === 0) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "No valid fields provided for update.");
  }
  const updated = { ...existing, ...updates };
  await kv.set(`plan:${c.req.param("id")}`, updated);
  await writeAuditLog({
    action: "admin_plan_updated",
    entityType: "plan",
    entityId: String(c.req.param("id")),
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { requestId: requestIdFromContext(c), updatedFields: Object.keys(updates) },
  });
  return jsonOk(c, updated);
});

app.delete(`${API_BASE}/plans/:id`, async (c) => {
  const result = await requireRole(c, ["admin"]);
  if ("err" in result) return result.err;
  const planId = String(c.req.param("id") || "").trim();
  if (!planId) return jsonErr(c, 400, "VALIDATION_ERROR", "Plan id is required.");
  const existing = await kv.get(`plan:${planId}`);
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Plan not found.");
  const activeSubs = (await kv.getByPrefix("subscription:")) as ApiSubscription[];
  const hasActiveSubscriptions = activeSubs.some((sub) => sub.planId === planId && sub.status === "active");
  if (hasActiveSubscriptions) {
    return jsonErr(c, 409, "CONFLICT", "Cannot delete plan with active subscriptions.");
  }
  await kv.del(`plan:${planId}`);
  await writeAuditLog({
    action: "admin_plan_deleted",
    entityType: "plan",
    entityId: planId,
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { requestId: requestIdFromContext(c) },
  });
  return jsonOk(c, { deleted: true });
});

app.post(`${API_BASE}/subscriptions`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const planId = String(body?.planId || "");
  if (!planId) return jsonErr(c, 400, "VALIDATION_ERROR", "planId is required.");
  const paymentMethod = String(body?.paymentMethod || "card").trim().toLowerCase();
  if (!isValidSubscriptionPaymentMethod(paymentMethod)) {
    return jsonErr(
      c,
      400,
      "VALIDATION_ERROR",
      `paymentMethod must be one of: ${SUBSCRIPTION_PAYMENT_METHODS.join(", ")}.`,
    );
  }
  const plan = await kv.get(`plan:${planId}`);
  if (!plan) return jsonErr(c, 404, "NOT_FOUND", "Plan not found.");

  const activeSubs = (await kv.getByPrefix("subscription:")) as ApiSubscription[];
  const alreadyActive = activeSubs.some((s) => s.userId === result.user.id && s.status === "active");
  if (alreadyActive) return jsonErr(c, 409, "CONFLICT", "User already has an active subscription.");

  const sub: ApiSubscription = {
    id: id(),
    userId: result.user.id,
    planId,
    paymentMethod,
    status: "active",
    createdAt: nowIso(),
  };
  await kv.set(`subscription:${sub.id}`, sub);
  return jsonOk(c, sub);
});

app.get(`${API_BASE}/subscriptions/me`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const all = (await kv.getByPrefix("subscription:")) as ApiSubscription[];
  const mine = all.filter((s) => s.userId === result.user.id);
  const active = mine.find((s) => s.status === "active") || null;
  return jsonOk(c, { active, history: mine });
});

app.post(`${API_BASE}/subscriptions/:id/cancel`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`subscription:${c.req.param("id")}`)) as ApiSubscription | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Subscription not found.");
  const canCancel = existing.userId === result.user.id || result.role === "admin" || result.role === "staff";
  if (!canCancel) return jsonErr(c, 403, "FORBIDDEN", "Cannot cancel this subscription.");
  if (existing.status !== "active") return jsonErr(c, 409, "CONFLICT", "Subscription is not active.");
  const updated: ApiSubscription = { ...existing, status: "cancelled", cancelledAt: nowIso() };
  await kv.set(`subscription:${existing.id}`, updated);
  return jsonOk(c, updated);
});

// Notifications
app.get(`${API_BASE}/notifications`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const all = (await kv.getByPrefix("notification:")) as ApiNotification[];
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));
  const mine = all
    .filter((n) => n.userId === result.user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = mine.length;
  const unread = mine.filter((n) => !n.read).length;
  const start = (page - 1) * limit;
  return jsonOk(c, mine.slice(start, start + limit), {
    total,
    unread,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

app.get(`${API_BASE}/notifications/unread-count`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const all = (await kv.getByPrefix("notification:")) as ApiNotification[];
  const unread = all.filter((n) => n.userId === result.user.id && !n.read).length;
  return jsonOk(c, { unread });
});

app.post(`${API_BASE}/notifications/mark-all-read`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const all = await kv.getByPrefix("notification:");
  const mine = all.filter((n: any) => n.userId === result.user.id);
  await Promise.all(mine.map((n: any) => kv.set(`notification:${n.id}`, { ...n, read: true })));
  return jsonOk(c, { updated: mine.length });
});

app.post(`${API_BASE}/notifications/:id/read`, async (c) => {
  const result = await requireAuth(c);
  if ("err" in result) return result.err;
  const existing = (await kv.get(`notification:${c.req.param("id")}`)) as ApiNotification | null;
  if (!existing) return jsonErr(c, 404, "NOT_FOUND", "Notification not found.");
  if (existing.userId !== result.user.id) {
    return jsonErr(c, 403, "FORBIDDEN", "Cannot modify this notification.");
  }
  const updated = { ...existing, read: true };
  await kv.set(`notification:${existing.id}`, updated);
  return jsonOk(c, updated);
});

// Analytics
app.get(`${API_BASE}/analytics/bookings`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const courtId = String(c.req.query("courtId") || "").trim();
  const status = String(c.req.query("status") || "").trim();
  const type = String(c.req.query("type") || "").trim();
  if (startDate && !isValidDate(startDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "startDate must be YYYY-MM-DD.");
  if (endDate && !isValidDate(endDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "endDate must be YYYY-MM-DD.");
  if (startDate && endDate && startDate > endDate) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "startDate cannot be later than endDate.");
  }
  if (status && !["pending", "confirmed", "cancelled", "completed", "no_show"].includes(status)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "status must be pending, confirmed, cancelled, completed, or no_show.");
  }
  if (type && !["open_play", "private", "training"].includes(type)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "type must be open_play, private, or training.");
  }
  if (courtId) {
    const court = (await kv.get(`court:${courtId}`)) as ApiCourt | null;
    if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  }
  let all = (await kv.getByPrefix("booking:")) as ApiBooking[];
  if (startDate) all = all.filter((b) => b.date >= startDate);
  if (endDate) all = all.filter((b) => b.date <= endDate);
  if (courtId) all = all.filter((b) => b.courtId === courtId);
  if (status) all = all.filter((b) => b.status === status);
  if (type) all = all.filter((b) => b.type === type);
  const totalBookings = all.length;
  const completedBookings = all.filter((b) => b.status === "completed").length;
  const cancelledBookings = all.filter((b) => b.status === "cancelled").length;
  const noShows = all.filter((b) => b.status === "no_show").length;
  const totalRevenue = all.filter((b) => b.status !== "cancelled").reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const noShowRate = totalBookings > 0 ? (noShows / totalBookings) * 100 : 0;
  const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;
  return jsonOk(c, {
    totalBookings,
    completedBookings,
    cancelledBookings,
    noShows,
    noShowRate,
    totalRevenue,
    averageBookingValue,
  });
});

app.get(`${API_BASE}/analytics/courts/:courtId/utilization`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const courtId = c.req.param("courtId");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  if (startDate && !isValidDate(startDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "startDate must be YYYY-MM-DD.");
  if (endDate && !isValidDate(endDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "endDate must be YYYY-MM-DD.");
  if (startDate && endDate && startDate > endDate) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "startDate cannot be later than endDate.");
  }
  const court = (await kv.get(`court:${courtId}`)) as ApiCourt | null;
  if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");
  let bookings = (await kv.getByPrefix("booking:")) as ApiBooking[];
  if (startDate) bookings = bookings.filter((b) => b.date >= startDate);
  if (endDate) bookings = bookings.filter((b) => b.date <= endDate);
  const courtBookings = bookings.filter((b) => b.courtId === courtId && b.status !== "cancelled");
  const bookedMinutes = courtBookings.reduce((sum, b) => sum + Number(b.duration || 0), 0);
  const openMinutes = Math.max(0, toMinutes(court.operatingHours.end) - toMinutes(court.operatingHours.start));
  let daysCount = 1;
  if (startDate && endDate) {
    const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
    const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      daysCount = Math.max(1, Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1);
    }
  } else {
    const activeDates = new Set(courtBookings.map((b) => b.date));
    daysCount = Math.max(1, activeDates.size);
  }
  const totalAvailableMinutes = openMinutes * daysCount;
  const utilizationRate = totalAvailableMinutes > 0 ? (bookedMinutes / totalAvailableMinutes) * 100 : 0;
  return jsonOk(c, {
    courtId,
    sessions: courtBookings.length,
    hoursBooked: Math.round((bookedMinutes / 60) * 100) / 100,
    hoursAvailable: Math.round((totalAvailableMinutes / 60) * 100) / 100,
    utilizationRate,
  });
});

app.get(`${API_BASE}/analytics/attendance/overview`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const sport = String(c.req.query("sport") || "").trim().toLowerCase();
  const coachId = String(c.req.query("coachId") || "").trim();
  const courtId = String(c.req.query("courtId") || "").trim();
  if (startDate && !isValidDate(startDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "startDate must be YYYY-MM-DD.");
  if (endDate && !isValidDate(endDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "endDate must be YYYY-MM-DD.");
  if (startDate && endDate && startDate > endDate) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "startDate cannot be later than endDate.");
  }

  let sessions = (await kv.getByPrefix("booking:")) as ApiBooking[];
  sessions = sessions.filter((b) => b.type === "training");
  if (startDate) sessions = sessions.filter((b) => b.date >= startDate);
  if (endDate) sessions = sessions.filter((b) => b.date <= endDate);
  if (sport) sessions = sessions.filter((b) => normalizeSport(b.sport || "") === sport);
  if (coachId) sessions = sessions.filter((b) => b.userId === coachId);
  if (courtId) sessions = sessions.filter((b) => b.courtId === courtId);

  const coachSummary = new Map<string, { sessions: number; enrolled: number; attended: number }>();
  let totalEnrolledSlots = 0;
  let totalAttended = 0;

  for (const session of sessions) {
    const enrolled = (session.players || []).length;
    const attended = (session.players || []).reduce((sum, playerId) => sum + (session.attendance?.[playerId] ? 1 : 0), 0);
    totalEnrolledSlots += enrolled;
    totalAttended += attended;

    const current = coachSummary.get(session.userId) || { sessions: 0, enrolled: 0, attended: 0 };
    current.sessions += 1;
    current.enrolled += enrolled;
    current.attended += attended;
    coachSummary.set(session.userId, current);
  }

  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const coaches = Array.from(coachSummary.entries()).map(([id, value]) => ({
    coachId: id,
    coachName: userMap.get(id)?.name || "Unknown Coach",
    sessions: value.sessions,
    enrolledSlots: value.enrolled,
    attendedCount: value.attended,
    attendanceRate: value.enrolled === 0 ? 0 : Math.round((value.attended / value.enrolled) * 10000) / 100,
  }));

  return jsonOk(c, {
    summary: {
      sessions: sessions.length,
      enrolledSlots: totalEnrolledSlots,
      attendedCount: totalAttended,
      attendanceRate: totalEnrolledSlots === 0 ? 0 : Math.round((totalAttended / totalEnrolledSlots) * 10000) / 100,
    },
    coaches,
  });
});

app.get(`${API_BASE}/analytics/coaches/:coachId/attendance`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const coachId = c.req.param("coachId");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const sport = String(c.req.query("sport") || "").trim().toLowerCase();
  if (startDate && !isValidDate(startDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "startDate must be YYYY-MM-DD.");
  if (endDate && !isValidDate(endDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "endDate must be YYYY-MM-DD.");
  if (startDate && endDate && startDate > endDate) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "startDate cannot be later than endDate.");
  }
  const coach = (await kv.get(`user:${coachId}`)) as ApiUser | null;
  if (!coach || coach.role !== "coach") return jsonErr(c, 404, "NOT_FOUND", "Coach not found.");

  let sessions = (await kv.getByPrefix("booking:")) as ApiBooking[];
  sessions = sessions.filter((b) => b.type === "training" && b.userId === coachId);
  if (startDate) sessions = sessions.filter((b) => b.date >= startDate);
  if (endDate) sessions = sessions.filter((b) => b.date <= endDate);
  if (sport) sessions = sessions.filter((b) => normalizeSport(b.sport || "") === sport);

  const details = sessions.map((session) => {
    const enrolled = (session.players || []).length;
    const attended = (session.players || []).reduce((sum, playerId) => sum + (session.attendance?.[playerId] ? 1 : 0), 0);
    return {
      sessionId: session.id,
      courtId: session.courtId,
      date: session.date,
      sport: session.sport || "",
      enrolled,
      attended,
      attendanceRate: enrolled === 0 ? 0 : Math.round((attended / enrolled) * 10000) / 100,
    };
  });

  const enrolledTotal = details.reduce((sum, row) => sum + row.enrolled, 0);
  const attendedTotal = details.reduce((sum, row) => sum + row.attended, 0);
  return jsonOk(c, {
    coach: { id: coach.id, name: coach.name },
    summary: {
      sessions: details.length,
      enrolledSlots: enrolledTotal,
      attendedCount: attendedTotal,
      attendanceRate: enrolledTotal === 0 ? 0 : Math.round((attendedTotal / enrolledTotal) * 10000) / 100,
    },
    sessions: details,
  });
});

app.get(`${API_BASE}/analytics/courts/:courtId/attendance`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const courtId = c.req.param("courtId");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const sport = String(c.req.query("sport") || "").trim().toLowerCase();
  if (startDate && !isValidDate(startDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "startDate must be YYYY-MM-DD.");
  if (endDate && !isValidDate(endDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "endDate must be YYYY-MM-DD.");
  if (startDate && endDate && startDate > endDate) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "startDate cannot be later than endDate.");
  }

  const court = (await kv.get(`court:${courtId}`)) as ApiCourt | null;
  if (!court) return jsonErr(c, 404, "NOT_FOUND", "Court not found.");

  let sessions = (await kv.getByPrefix("booking:")) as ApiBooking[];
  sessions = sessions.filter((b) => b.type === "training" && b.courtId === courtId);
  if (startDate) sessions = sessions.filter((b) => b.date >= startDate);
  if (endDate) sessions = sessions.filter((b) => b.date <= endDate);
  if (sport) sessions = sessions.filter((b) => normalizeSport(b.sport || "") === sport);

  const byDate = new Map<string, { sessions: number; enrolledSlots: number; attendedCount: number }>();
  let enrolledTotal = 0;
  let attendedTotal = 0;

  for (const session of sessions) {
    const enrolled = (session.players || []).length;
    const attended = (session.players || []).reduce((sum, playerId) => sum + (session.attendance?.[playerId] ? 1 : 0), 0);
    enrolledTotal += enrolled;
    attendedTotal += attended;

    const current = byDate.get(session.date) || { sessions: 0, enrolledSlots: 0, attendedCount: 0 };
    current.sessions += 1;
    current.enrolledSlots += enrolled;
    current.attendedCount += attended;
    byDate.set(session.date, current);
  }

  const trend = Array.from(byDate.entries())
    .map(([date, value]) => ({
      date,
      sessions: value.sessions,
      enrolledSlots: value.enrolledSlots,
      attendedCount: value.attendedCount,
      attendanceRate: value.enrolledSlots === 0 ? 0 : Math.round((value.attendedCount / value.enrolledSlots) * 10000) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return jsonOk(c, {
    court: { id: court.id, name: court.name },
    summary: {
      sessions: sessions.length,
      enrolledSlots: enrolledTotal,
      attendedCount: attendedTotal,
      attendanceRate: enrolledTotal === 0 ? 0 : Math.round((attendedTotal / enrolledTotal) * 10000) / 100,
    },
    trend,
  });
});

app.get(`${API_BASE}/analytics/bookings/export`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const format = String(c.req.query("format") || "json").toLowerCase();
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const status = String(c.req.query("status") || "").trim();
  const courtId = String(c.req.query("courtId") || "").trim();
  const type = String(c.req.query("type") || "").trim();
  if (!["json", "csv"].includes(format)) return jsonErr(c, 400, "VALIDATION_ERROR", "format must be json or csv.");
  if (startDate && !isValidDate(startDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "startDate must be YYYY-MM-DD.");
  if (endDate && !isValidDate(endDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "endDate must be YYYY-MM-DD.");
  if (startDate && endDate && startDate > endDate) return jsonErr(c, 400, "VALIDATION_ERROR", "startDate cannot be later than endDate.");
  if (status && !["pending", "confirmed", "cancelled", "completed", "no_show"].includes(status)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "status must be pending, confirmed, cancelled, completed, or no_show.");
  }
  if (type && !["open_play", "private", "training"].includes(type)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "type must be open_play, private, or training.");
  }

  let bookings = (await kv.getByPrefix("booking:")) as ApiBooking[];
  if (startDate) bookings = bookings.filter((b) => b.date >= startDate);
  if (endDate) bookings = bookings.filter((b) => b.date <= endDate);
  if (status) bookings = bookings.filter((b) => b.status === status);
  if (courtId) bookings = bookings.filter((b) => b.courtId === courtId);
  if (type) bookings = bookings.filter((b) => b.type === type);

  const rows = bookings
    .sort((a, b) => mergeDateTime(a.date, a.startTime).getTime() - mergeDateTime(b.date, b.startTime).getTime())
    .map((b) => ({
      bookingId: b.id,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      courtId: b.courtId,
      userId: b.userId,
      coachId: b.coachId || "",
      type: b.type,
      status: b.status,
      paymentStatus: b.paymentStatus,
      amount: Number(b.amount || 0),
      playersCount: (b.players || []).length,
      checkedIn: b.checkedIn ? "yes" : "no",
      createdAt: b.createdAt,
    }));

  if (format === "csv") {
    const headers = [
      "bookingId",
      "date",
      "startTime",
      "endTime",
      "courtId",
      "userId",
      "coachId",
      "type",
      "status",
      "paymentStatus",
      "amount",
      "playersCount",
      "checkedIn",
      "createdAt",
    ];
    return jsonOk(c, {
      format: "csv",
      filename: `bookings_export_${nowIso().slice(0, 10)}.csv`,
      contentType: "text/csv",
      data: toCsv(headers, rows),
      count: rows.length,
    });
  }

  return jsonOk(c, {
    format: "json",
    filename: `bookings_export_${nowIso().slice(0, 10)}.json`,
    contentType: "application/json",
    data: rows,
    count: rows.length,
  });
});

app.get(`${API_BASE}/analytics/attendance/export`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const format = String(c.req.query("format") || "json").toLowerCase();
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const coachId = String(c.req.query("coachId") || "").trim();
  const courtId = String(c.req.query("courtId") || "").trim();
  const sport = String(c.req.query("sport") || "").trim().toLowerCase();
  if (!["json", "csv"].includes(format)) return jsonErr(c, 400, "VALIDATION_ERROR", "format must be json or csv.");
  if (startDate && !isValidDate(startDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "startDate must be YYYY-MM-DD.");
  if (endDate && !isValidDate(endDate)) return jsonErr(c, 400, "VALIDATION_ERROR", "endDate must be YYYY-MM-DD.");
  if (startDate && endDate && startDate > endDate) return jsonErr(c, 400, "VALIDATION_ERROR", "startDate cannot be later than endDate.");

  let sessions = (await kv.getByPrefix("booking:")) as ApiBooking[];
  sessions = sessions.filter((b) => b.type === "training");
  if (startDate) sessions = sessions.filter((b) => b.date >= startDate);
  if (endDate) sessions = sessions.filter((b) => b.date <= endDate);
  if (coachId) sessions = sessions.filter((b) => b.userId === coachId);
  if (courtId) sessions = sessions.filter((b) => b.courtId === courtId);
  if (sport) sessions = sessions.filter((b) => normalizeSport(b.sport || "") === sport);

  const rows: Array<Record<string, unknown>> = [];
  for (const session of sessions) {
    for (const playerId of session.players || []) {
      rows.push({
        sessionId: session.id,
        date: session.date,
        courtId: session.courtId,
        coachId: session.userId,
        playerId,
        sport: session.sport || "",
        attended: session.attendance?.[playerId] ? "yes" : "no",
        startTime: session.startTime,
        endTime: session.endTime,
      });
    }
  }

  if (format === "csv") {
    const headers = ["sessionId", "date", "courtId", "coachId", "playerId", "sport", "attended", "startTime", "endTime"];
    return jsonOk(c, {
      format: "csv",
      filename: `attendance_export_${nowIso().slice(0, 10)}.csv`,
      contentType: "text/csv",
      data: toCsv(headers, rows),
      count: rows.length,
    });
  }

  return jsonOk(c, {
    format: "json",
    filename: `attendance_export_${nowIso().slice(0, 10)}.json`,
    contentType: "application/json",
    data: rows,
    count: rows.length,
  });
});

app.get(`${API_BASE}/admin/audit-logs`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const action = String(c.req.query("action") || "").trim();
  const entityType = String(c.req.query("entityType") || "").trim();
  const entityId = String(c.req.query("entityId") || "").trim();
  const actorId = String(c.req.query("actorId") || "").trim();
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));
  if (dateFrom && !isValidDate(dateFrom)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom must be YYYY-MM-DD.");
  if (dateTo && !isValidDate(dateTo)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateTo must be YYYY-MM-DD.");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom cannot be later than dateTo.");
  }

  const logs = await queryAuditLogs({
    action: action || undefined,
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    actorId: actorId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const total = logs.length;
  const start = (page - 1) * limit;
  return jsonOk(c, logs.slice(start, start + limit), {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

app.get(`${API_BASE}/admin/audit-logs/export`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  const format = String(c.req.query("format") || "json").toLowerCase();
  const action = String(c.req.query("action") || "").trim();
  const entityType = String(c.req.query("entityType") || "").trim();
  const entityId = String(c.req.query("entityId") || "").trim();
  const actorId = String(c.req.query("actorId") || "").trim();
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");
  if (!["json", "csv"].includes(format)) return jsonErr(c, 400, "VALIDATION_ERROR", "format must be json or csv.");
  if (dateFrom && !isValidDate(dateFrom)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom must be YYYY-MM-DD.");
  if (dateTo && !isValidDate(dateTo)) return jsonErr(c, 400, "VALIDATION_ERROR", "dateTo must be YYYY-MM-DD.");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "dateFrom cannot be later than dateTo.");
  }
  const logs = await queryAuditLogs({
    action: action || undefined,
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    actorId: actorId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const rows = logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    actorId: log.actorId,
    actorRole: log.actorRole,
    metadata: JSON.stringify(log.metadata || {}),
  }));
  if (format === "csv") {
    const headers = ["id", "createdAt", "action", "entityType", "entityId", "actorId", "actorRole", "metadata"];
    return jsonOk(c, {
      format: "csv",
      filename: `audit_logs_${nowIso().slice(0, 10)}.csv`,
      contentType: "text/csv",
      data: toCsv(headers, rows),
      count: rows.length,
    });
  }
  return jsonOk(c, {
    format: "json",
    filename: `audit_logs_${nowIso().slice(0, 10)}.json`,
    contentType: "application/json",
    data: rows,
    count: rows.length,
  });
});

app.get(`${API_BASE}/admin/data/export`, async (c) => {
  const result = await requireRole(c, ["admin", "staff"]);
  if ("err" in result) return result.err;
  await seedUsers();
  await seedCourts();
  await seedPlans();
  const config = await getFacilityConfig();
  const snapshot: AdminDataSnapshot = {
    users: (await kv.getByPrefix("user:")) as ApiUser[],
    courts: (await kv.getByPrefix("court:")) as ApiCourt[],
    bookings: (await kv.getByPrefix("booking:")) as ApiBooking[],
    memberships: (await kv.getByPrefix("plan:")) as any[],
    subscriptions: (await kv.getByPrefix("subscription:")) as ApiSubscription[],
    notifications: (await kv.getByPrefix("notification:")) as ApiNotification[],
    coachApplications: (await kv.getByPrefix("coachapp:")) as ApiCoachApplication[],
    coachRegistrations: (await kv.getByPrefix("coachreg:")) as ApiCoachRegistration[],
    config,
  };
  return jsonOk(c, {
    filename: `ventra-backup-${nowIso().slice(0, 10)}.json`,
    generatedAt: nowIso(),
    data: snapshot,
  });
});

app.post(`${API_BASE}/admin/data/import`, async (c) => {
  const result = await requireRole(c, ["admin"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const overwrite = body?.overwrite !== false;
  const data = (body?.data || {}) as Partial<AdminDataSnapshot>;
  if (!overwrite) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "Only overwrite=true is currently supported.");
  }
  if (!data || typeof data !== "object") {
    return jsonErr(c, 400, "VALIDATION_ERROR", "data payload is required.");
  }

  const users = Array.isArray(data.users) ? (data.users as ApiUser[]) : [];
  const courts = Array.isArray(data.courts) ? (data.courts as ApiCourt[]) : [];
  const bookings = Array.isArray(data.bookings) ? (data.bookings as ApiBooking[]) : [];
  const memberships = Array.isArray(data.memberships) ? data.memberships : [];
  const subscriptions = Array.isArray(data.subscriptions) ? (data.subscriptions as ApiSubscription[]) : [];
  const notifications = Array.isArray(data.notifications) ? (data.notifications as ApiNotification[]) : [];
  const coachApplications = Array.isArray(data.coachApplications)
    ? (data.coachApplications as ApiCoachApplication[])
    : [];
  const coachRegistrations = Array.isArray(data.coachRegistrations)
    ? (data.coachRegistrations as ApiCoachRegistration[])
    : [];
  const config = normalizeFacilityConfig(data.config || DEFAULT_FACILITY_CONFIG);
  const configValidation = validateFacilityConfig(config);
  if (configValidation) return jsonErr(c, 400, "VALIDATION_ERROR", configValidation);

  const existingUsers = (await kv.getByPrefix("user:")) as ApiUser[];
  const existingCourts = (await kv.getByPrefix("court:")) as ApiCourt[];
  const existingBookings = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const existingMemberships = (await kv.getByPrefix("plan:")) as any[];
  const existingSubscriptions = (await kv.getByPrefix("subscription:")) as ApiSubscription[];
  const existingNotifications = (await kv.getByPrefix("notification:")) as ApiNotification[];
  const existingCoachApplications = (await kv.getByPrefix("coachapp:")) as ApiCoachApplication[];
  const existingCoachRegistrations = (await kv.getByPrefix("coachreg:")) as ApiCoachRegistration[];
  const existingAudits = (await kv.getByPrefix("audit:")) as ApiAuditLog[];
  const existingHolds = (await kv.getByPrefix("booking_hold:")) as ApiBookingHold[];
  const existingPaymentTx = (await kv.getByPrefix("payment_tx:")) as ApiPaymentTransaction[];

  await deleteByPrefixRecords("user", existingUsers);
  await deleteByPrefixRecords("court", existingCourts);
  await deleteByPrefixRecords("booking", existingBookings);
  await deleteByPrefixRecords("plan", existingMemberships);
  await deleteByPrefixRecords("subscription", existingSubscriptions);
  await deleteByPrefixRecords("notification", existingNotifications);
  await deleteByPrefixRecords("coachapp", existingCoachApplications);
  await deleteByPrefixRecords("coachreg", existingCoachRegistrations);
  await deleteByPrefixRecords("audit", existingAudits);
  await deleteByPrefixRecords("booking_hold", existingHolds);
  await deleteByPrefixRecords("payment_tx", existingPaymentTx);

  if (users.length) await kv.mset(users.map((u) => `user:${u.id}`), users);
  if (courts.length) await kv.mset(courts.map((ct) => `court:${ct.id}`), courts);
  if (bookings.length) await kv.mset(bookings.map((b) => `booking:${b.id}`), bookings);
  if (memberships.length) await kv.mset(memberships.map((p: any) => `plan:${p.id}`), memberships);
  if (subscriptions.length) await kv.mset(subscriptions.map((s) => `subscription:${s.id}`), subscriptions);
  if (notifications.length) await kv.mset(notifications.map((n) => `notification:${n.id}`), notifications);
  if (coachApplications.length) {
    await kv.mset(
      coachApplications.map((app) => `coachapp:${app.id}`),
      coachApplications,
    );
  }
  if (coachRegistrations.length) {
    await kv.mset(
      coachRegistrations.map((registration) => `coachreg:${registration.id}`),
      coachRegistrations,
    );
  }
  await kv.set("facility:config", config);

  await writeAuditLog({
    action: "admin_data_imported",
    entityType: "system_data",
    entityId: "snapshot",
    actorId: result.user.id,
    actorRole: result.role,
    metadata: {
      users: users.length,
      courts: courts.length,
      bookings: bookings.length,
      memberships: memberships.length,
      subscriptions: subscriptions.length,
      notifications: notifications.length,
      coachApplications: coachApplications.length,
      coachRegistrations: coachRegistrations.length,
    },
  });

  return jsonOk(c, {
    imported: {
      users: users.length,
      courts: courts.length,
      bookings: bookings.length,
      memberships: memberships.length,
      subscriptions: subscriptions.length,
      notifications: notifications.length,
      coachApplications: coachApplications.length,
      coachRegistrations: coachRegistrations.length,
    },
  });
});

app.post(`${API_BASE}/admin/data/reset`, async (c) => {
  const result = await requireRole(c, ["admin"]);
  if ("err" in result) return result.err;

  const users = (await kv.getByPrefix("user:")) as ApiUser[];
  const courts = (await kv.getByPrefix("court:")) as ApiCourt[];
  const bookings = (await kv.getByPrefix("booking:")) as ApiBooking[];
  const plans = (await kv.getByPrefix("plan:")) as any[];
  const subscriptions = (await kv.getByPrefix("subscription:")) as ApiSubscription[];
  const notifications = (await kv.getByPrefix("notification:")) as ApiNotification[];
  const coachApplications = (await kv.getByPrefix("coachapp:")) as ApiCoachApplication[];
  const coachRegistrations = (await kv.getByPrefix("coachreg:")) as ApiCoachRegistration[];
  const audits = (await kv.getByPrefix("audit:")) as ApiAuditLog[];
  const holds = (await kv.getByPrefix("booking_hold:")) as ApiBookingHold[];
  const paymentTx = (await kv.getByPrefix("payment_tx:")) as ApiPaymentTransaction[];

  const deleted = {
    users: await deleteByPrefixRecords("user", users),
    courts: await deleteByPrefixRecords("court", courts),
    bookings: await deleteByPrefixRecords("booking", bookings),
    plans: await deleteByPrefixRecords("plan", plans),
    subscriptions: await deleteByPrefixRecords("subscription", subscriptions),
    notifications: await deleteByPrefixRecords("notification", notifications),
    coachApplications: await deleteByPrefixRecords("coachapp", coachApplications),
    coachRegistrations: await deleteByPrefixRecords("coachreg", coachRegistrations),
    audits: await deleteByPrefixRecords("audit", audits),
    bookingHolds: await deleteByPrefixRecords("booking_hold", holds),
    paymentTransactions: await deleteByPrefixRecords("payment_tx", paymentTx),
  };
  await kv.del("facility:config");

  await seedUsers();
  await seedCourts();
  await seedPlans();
  await kv.set("facility:config", { ...DEFAULT_FACILITY_CONFIG });

  await writeAuditLog({
    action: "admin_data_reset",
    entityType: "system_data",
    entityId: "reset",
    actorId: result.user.id,
    actorRole: result.role,
    metadata: { deleted },
  });

  return jsonOk(c, { reset: true, deleted });
});

app.post(`${API_BASE}/admin/audit-logs/purge`, async (c) => {
  const result = await requireRole(c, ["admin"]);
  if ("err" in result) return result.err;
  const body = await c.req.json().catch(() => ({}));
  const beforeDate = String(body?.beforeDate || "").trim();
  const dryRun = body?.dryRun !== false;
  if (!beforeDate || !isValidDate(beforeDate)) {
    return jsonErr(c, 400, "VALIDATION_ERROR", "beforeDate (YYYY-MM-DD) is required.");
  }
  const logs = (await kv.getByPrefix("audit:")) as ApiAuditLog[];
  const targets = logs.filter((log) => log.createdAt.slice(0, 10) < beforeDate);
  if (!dryRun) {
    await Promise.all(targets.map((log) => kv.del(`audit:${log.id}`)));
    await writeAuditLog({
      action: "audit_logs_purged",
      entityType: "audit",
      entityId: beforeDate,
      actorId: result.user.id,
      actorRole: result.role,
      metadata: { deleted: targets.length },
    });
  }
  return jsonOk(c, { dryRun, beforeDate, matched: targets.length, deleted: dryRun ? 0 : targets.length });
});

app.get(`${API_BASE}/health`, async (c) =>
  jsonOk(c, {
    status: "ok",
    storage: kv.getStoreInfo(),
    db: await kv.getDbHealth(),
    auth: {
      mode: authMode(),
      requireBearer: bearerAuthRequired(),
      supabase: {
        hasAnonEnv: hasSupabaseAuthEnv(),
        hasServiceEnv: hasSupabaseServiceEnv(),
      },
    },
    payments: {
      provider: paymentProvider(),
    },
    passwordPolicy: {
      minLength: minimumPasswordLength(),
    },
  }),
);

app.notFound((c) => jsonErr(c, 404, "NOT_FOUND", "Route not found."));

app.onError((err, c) => {
  console.error("Unhandled API error", {
    requestId: requestIdFromContext(c),
    method: c.req.method,
    path: c.req.path,
    error: err instanceof Error ? err.message : String(err),
  });
  return jsonErr(c, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
});

if (import.meta.main) {
  Deno.serve(app.fetch);
}
