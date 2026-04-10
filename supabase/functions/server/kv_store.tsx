type EntityPrefix =
  | "user"
  | "court"
  | "booking"
  | "plan"
  | "subscription"
  | "notification"
  | "coachapp"
  | "audit"
  | "booking_hold"
  | "idem"
  | "payment_tx";

let createClientFactory: ((url: string, key: string) => any) | null = null;

const loadCreateClient = async () => {
  if (createClientFactory) return createClientFactory;
  const mod = await import("jsr:@supabase/supabase-js@2.49.8");
  createClientFactory = mod.createClient;
  return createClientFactory;
};

const client = async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }
  const createClient = await loadCreateClient();
  return createClient(url, serviceRoleKey);
};

const entityPrefixes: EntityPrefix[] = [
  "user",
  "court",
  "booking",
  "plan",
  "subscription",
  "notification",
  "coachapp",
  "audit",
  "booking_hold",
  "idem",
  "payment_tx",
];
const optionalRelationalPrefixes: EntityPrefix[] = ["coachapp", "audit", "booking_hold", "idem", "payment_tx"];

const hasSupabaseEnv = () => {
  try {
    return !!Deno.env.get("SUPABASE_URL") && !!(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY"));
  } catch {
    return false;
  }
};
const inMemoryStore = new Map<string, any>();

type StoreMode = "memory" | "supabase";
type StoreInfo = { mode: StoreMode; missingEnv: string[] };
type DbHealth = {
  enabled: boolean;
  reachable: boolean;
  missingTables: string[];
  checkedAt: string;
  error?: string;
};

const missingSupabaseEnv = (): string[] => {
  const missing: string[] = [];
  try {
    if (!Deno.env.get("SUPABASE_URL")) missing.push("SUPABASE_URL");
    if (!(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY"))) {
      missing.push("SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY)");
    }
  } catch {
    // In some runtimes env access can be restricted; treat as missing.
    missing.push("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY)");
  }
  return missing;
};

export const getStoreInfo = (): StoreInfo => {
  const enabled = hasSupabaseEnv();
  return { mode: enabled ? "supabase" : "memory", missingEnv: enabled ? [] : missingSupabaseEnv() };
};

let cachedDbHealth: { atMs: number; value: DbHealth } | null = null;
const DB_HEALTH_TTL_MS = 15_000;

const isMissingTableError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return message.includes("relation") && message.includes("does not exist");
};

const probeTable = async (table: string): Promise<"ok" | "missing"> => {
  const supabase = await client();
  const { error } = await supabase.from(table).select("*").limit(1);
  if (!error) return "ok";
  if (isMissingTableError(new Error(error.message))) return "missing";
  throw new Error(error.message);
};

export const getDbHealth = async (): Promise<DbHealth> => {
  const now = Date.now();
  if (cachedDbHealth && now - cachedDbHealth.atMs < DB_HEALTH_TTL_MS) return cachedDbHealth.value;

  const checkedAt = new Date().toISOString();
  const store = getStoreInfo();
  if (store.mode !== "supabase") {
    const value: DbHealth = {
      enabled: false,
      reachable: false,
      missingTables: [],
      checkedAt,
    };
    cachedDbHealth = { atMs: now, value };
    return value;
  }

  // Tables expected by the backend when running in persistent mode.
  const requiredTables = [
    "kv_store_ce0562bb",
    "app_users",
    "courts",
    "bookings",
    "membership_plans",
    "subscriptions",
    "notifications",
    "coach_applications",
    "audit_logs",
    "booking_holds",
    "idempotency_records",
    "payment_transactions",
  ];

  try {
    const missingTables: string[] = [];
    for (const table of requiredTables) {
      const status = await probeTable(table);
      if (status === "missing") missingTables.push(table);
    }

    const value: DbHealth = {
      enabled: true,
      reachable: true,
      missingTables,
      checkedAt,
    };
    cachedDbHealth = { atMs: now, value };
    return value;
  } catch (error) {
    const value: DbHealth = {
      enabled: true,
      reachable: false,
      missingTables: [],
      checkedAt,
      error: error instanceof Error ? error.message : String(error || ""),
    };
    cachedDbHealth = { atMs: now, value };
    return value;
  }
};

let warnedInMemory = false;
const warnIfInMemory = () => {
  if (warnedInMemory) return;
  const info = getStoreInfo();
  if (info.mode === "memory") {
    console.warn(
      `[server] Storage is running in-memory (non-persistent). Missing env: ${info.missingEnv.join(", ")}`,
    );
    warnedInMemory = true;
  }
};

const isMissingRelationError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return message.includes("relation") && message.includes("does not exist");
};

export const __resetForTests = () => {
  inMemoryStore.clear();
  warnedInMemory = false;
  cachedDbHealth = null;
};

const parseKey = (key: string): { prefix: EntityPrefix | null; id: string | null } => {
  const idx = key.indexOf(":");
  if (idx === -1) return { prefix: null, id: null };
  const rawPrefix = key.slice(0, idx);
  const id = key.slice(idx + 1);
  if (!id) return { prefix: null, id: null };
  if (!entityPrefixes.includes(rawPrefix as EntityPrefix)) return { prefix: null, id: null };
  return { prefix: rawPrefix as EntityPrefix, id };
};

const rowFromUser = (value: any) => ({
  id: value.id,
  email: value.email,
  name: value.name,
  role: value.role,
  status: value.status ?? "active",
  phone: value.phone ?? null,
  avatar: value.avatar ?? null,
  skill_level: value.skillLevel ?? null,
  coach_profile: value.coachProfile ?? null,
  coach_expertise: value.coachExpertise ?? [],
  coach_verification_status: value.coachVerificationStatus ?? null,
  coach_verification_method: value.coachVerificationMethod ?? null,
  coach_verification_document_name: value.coachVerificationDocumentName ?? null,
  coach_verification_id: value.coachVerificationId ?? null,
  coach_verification_notes: value.coachVerificationNotes ?? null,
  coach_verification_submitted_at: value.coachVerificationSubmittedAt ?? null,
  created_at: value.createdAt ?? null,
});

const userFromRow = (row: any) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  status: row.status ?? undefined,
  phone: row.phone ?? undefined,
  avatar: row.avatar ?? undefined,
  skillLevel: row.skill_level ?? undefined,
  coachProfile: row.coach_profile ?? undefined,
  coachExpertise: row.coach_expertise ?? undefined,
  coachVerificationStatus: row.coach_verification_status ?? undefined,
  coachVerificationMethod: row.coach_verification_method ?? undefined,
  coachVerificationDocumentName: row.coach_verification_document_name ?? undefined,
  coachVerificationId: row.coach_verification_id ?? undefined,
  coachVerificationNotes: row.coach_verification_notes ?? undefined,
  coachVerificationSubmittedAt: row.coach_verification_submitted_at ?? undefined,
  createdAt: row.created_at ?? undefined,
});

const rowFromCourt = (value: any) => ({
  id: value.id,
  name: value.name,
  court_number: value.courtNumber,
  type: value.type,
  surface_type: value.surfaceType,
  hourly_rate: value.hourlyRate,
  peak_hour_rate: value.peakHourRate ?? null,
  status: value.status,
  operating_hours: value.operatingHours ?? { start: "07:00", end: "22:00" },
  created_at: value.createdAt ?? new Date().toISOString(),
});

const courtFromRow = (row: any) => ({
  id: row.id,
  name: row.name,
  courtNumber: row.court_number,
  type: row.type,
  surfaceType: row.surface_type,
  hourlyRate: Number(row.hourly_rate || 0),
  peakHourRate: row.peak_hour_rate == null ? undefined : Number(row.peak_hour_rate),
  status: row.status,
  operatingHours: row.operating_hours ?? { start: "07:00", end: "22:00" },
  createdAt: row.created_at ?? undefined,
});

const rowFromBooking = (value: any) => ({
  id: value.id,
  court_id: value.courtId,
  user_id: value.userId,
  type: value.type,
  date: value.date,
  start_time: value.startTime,
  end_time: value.endTime,
  duration: value.duration,
  status: value.status,
  payment_status: value.paymentStatus,
  amount: value.amount ?? 0,
  players: value.players ?? [],
  max_players: value.maxPlayers ?? null,
  coach_id: value.coachId ?? null,
  sport: value.sport ?? null,
  attendance: value.attendance ?? {},
  notes: value.notes ?? null,
  checked_in: value.checkedIn ?? false,
  checked_in_at: value.checkedInAt ?? null,
  rejection_reason: value.rejectionReason ?? null,
  payment_due_at: value.paymentDueAt ?? null,
  receipt_token: value.receiptToken ?? null,
  created_at: value.createdAt ?? null,
  updated_at: value.updatedAt ?? null,
});

const bookingFromRow = (row: any) => ({
  id: row.id,
  courtId: row.court_id,
  userId: row.user_id,
  type: row.type,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  duration: Number(row.duration || 0),
  status: row.status,
  paymentStatus: row.payment_status,
  amount: Number(row.amount || 0),
  players: row.players ?? [],
  maxPlayers: row.max_players ?? undefined,
  coachId: row.coach_id ?? undefined,
  sport: row.sport ?? undefined,
  attendance: row.attendance ?? undefined,
  notes: row.notes ?? undefined,
  checkedIn: !!row.checked_in,
  checkedInAt: row.checked_in_at ?? undefined,
  rejectionReason: row.rejection_reason ?? undefined,
  paymentDueAt: row.payment_due_at ?? undefined,
  receiptToken: row.receipt_token ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
});

const rowFromPlan = (value: any) => ({
  id: value.id,
  name: value.name,
  price: value.price,
  interval: value.interval,
  tier: value.tier,
  description: value.description ?? null,
  features: value.features ?? [],
  created_at: value.createdAt ?? null,
});

const planFromRow = (row: any) => ({
  id: row.id,
  name: row.name,
  price: Number(row.price || 0),
  interval: row.interval,
  tier: row.tier,
  description: row.description ?? undefined,
  features: row.features ?? [],
  createdAt: row.created_at ?? undefined,
});

const rowFromSubscription = (value: any) => ({
  id: value.id,
  user_id: value.userId,
  plan_id: value.planId,
  payment_method: value.paymentMethod ?? "card",
  status: value.status,
  created_at: value.createdAt ?? null,
  cancelled_at: value.cancelledAt ?? null,
});

const subscriptionFromRow = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  planId: row.plan_id,
  paymentMethod: row.payment_method,
  status: row.status,
  createdAt: row.created_at,
  cancelledAt: row.cancelled_at ?? undefined,
});

const rowFromNotification = (value: any) => ({
  id: value.id,
  user_id: value.userId,
  title: value.title,
  message: value.message,
  type: value.type,
  read: !!value.read,
  created_at: value.createdAt ?? null,
});

const notificationFromRow = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  message: row.message,
  type: row.type,
  read: !!row.read,
  createdAt: row.created_at,
});

const rowFromCoachApplication = (value: any) => ({
  id: value.id,
  coach_id: value.coachId,
  player_id: value.playerId,
  sport: value.sport,
  message: value.message ?? null,
  preferred_schedule: value.preferredSchedule ?? null,
  status: value.status,
  review_note: value.reviewNote ?? null,
  created_at: value.createdAt ?? null,
  updated_at: value.updatedAt ?? null,
});

const coachApplicationFromRow = (row: any) => ({
  id: row.id,
  coachId: row.coach_id,
  playerId: row.player_id,
  sport: row.sport,
  message: row.message ?? undefined,
  preferredSchedule: row.preferred_schedule ?? undefined,
  status: row.status,
  reviewNote: row.review_note ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
});

const rowFromAuditLog = (value: any) => ({
  id: value.id,
  action: value.action,
  entity_type: value.entityType,
  entity_id: value.entityId,
  actor_id: value.actorId,
  actor_role: value.actorRole,
  metadata: value.metadata ?? {},
  created_at: value.createdAt ?? null,
});

const auditLogFromRow = (row: any) => ({
  id: row.id,
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  actorId: row.actor_id,
  actorRole: row.actor_role,
  metadata: row.metadata ?? undefined,
  createdAt: row.created_at,
});

const rowFromBookingHold = (value: any) => ({
  id: value.id,
  court_id: value.courtId,
  user_id: value.userId,
  date: value.date,
  start_time: value.startTime,
  end_time: value.endTime,
  created_at: value.createdAt ?? null,
  expires_at: value.expiresAt ?? null,
});

const bookingHoldFromRow = (row: any) => ({
  id: row.id,
  courtId: row.court_id,
  userId: row.user_id,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
});

const rowFromIdempotency = (value: any, id: string) => ({
  id,
  request_hash: value.requestHash,
  response: value.response,
  status: value.status,
  created_at: value.createdAt ?? null,
});

const idempotencyFromRow = (row: any) => ({
  requestHash: row.request_hash,
  response: row.response,
  status: row.status,
  createdAt: row.created_at,
});

const rowFromPaymentTx = (value: any) => ({
  id: value.id,
  booking_id: value.bookingId,
  user_id: value.userId,
  provider: value.provider,
  method: value.method,
  amount: value.amount ?? 0,
  currency: value.currency ?? "PHP",
  status: value.status,
  checkout_url: value.checkoutUrl ?? null,
  provider_reference: value.providerReference ?? null,
  provider_payload: value.providerPayload ?? null,
  created_at: value.createdAt ?? null,
  updated_at: value.updatedAt ?? null,
  paid_at: value.paidAt ?? null,
});

const paymentTxFromRow = (row: any) => ({
  id: row.id,
  bookingId: row.booking_id,
  userId: row.user_id,
  provider: row.provider,
  method: row.method,
  amount: Number(row.amount || 0),
  currency: row.currency,
  status: row.status,
  checkoutUrl: row.checkout_url ?? undefined,
  providerReference: row.provider_reference ?? undefined,
  providerPayload: row.provider_payload ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
  paidAt: row.paid_at ?? undefined,
});

const upsertEntity = async (prefix: EntityPrefix, value: any): Promise<void> => {
  const supabase = await client();
  let table = "";
  let row: any = value;

  if (prefix === "user") {
    table = "app_users";
    row = rowFromUser(value);
  } else if (prefix === "court") {
    table = "courts";
    row = rowFromCourt(value);
  } else if (prefix === "booking") {
    table = "bookings";
    row = rowFromBooking(value);
  } else if (prefix === "plan") {
    table = "membership_plans";
    row = rowFromPlan(value);
  } else if (prefix === "subscription") {
    table = "subscriptions";
    row = rowFromSubscription(value);
  } else if (prefix === "notification") {
    table = "notifications";
    row = rowFromNotification(value);
  } else if (prefix === "coachapp") {
    table = "coach_applications";
    row = rowFromCoachApplication(value);
  } else if (prefix === "audit") {
    table = "audit_logs";
    row = rowFromAuditLog(value);
  } else if (prefix === "booking_hold") {
    table = "booking_holds";
    row = rowFromBookingHold(value);
  } else if (prefix === "idem") {
    table = "idempotency_records";
    row = rowFromIdempotency(value, value.id);
  } else if (prefix === "payment_tx") {
    table = "payment_transactions";
    row = rowFromPaymentTx(value);
  }

  const { error } = await supabase.from(table).upsert(row);
  if (error) throw new Error(error.message);
};

const getEntity = async (prefix: EntityPrefix, id: string): Promise<any> => {
  const supabase = await client();
  let table = "";
  if (prefix === "user") table = "app_users";
  if (prefix === "court") table = "courts";
  if (prefix === "booking") table = "bookings";
  if (prefix === "plan") table = "membership_plans";
  if (prefix === "subscription") table = "subscriptions";
  if (prefix === "notification") table = "notifications";
  if (prefix === "coachapp") table = "coach_applications";
  if (prefix === "audit") table = "audit_logs";
  if (prefix === "booking_hold") table = "booking_holds";
  if (prefix === "idem") table = "idempotency_records";
  if (prefix === "payment_tx") table = "payment_transactions";

  const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  if (prefix === "user") return userFromRow(data);
  if (prefix === "court") return courtFromRow(data);
  if (prefix === "booking") return bookingFromRow(data);
  if (prefix === "plan") return planFromRow(data);
  if (prefix === "subscription") return subscriptionFromRow(data);
  if (prefix === "coachapp") return coachApplicationFromRow(data);
  if (prefix === "audit") return auditLogFromRow(data);
  if (prefix === "booking_hold") return bookingHoldFromRow(data);
  if (prefix === "idem") return idempotencyFromRow(data);
  if (prefix === "payment_tx") return paymentTxFromRow(data);
  return notificationFromRow(data);
};

const deleteEntity = async (prefix: EntityPrefix, id: string): Promise<void> => {
  const supabase = await client();
  let table = "";
  if (prefix === "user") table = "app_users";
  if (prefix === "court") table = "courts";
  if (prefix === "booking") table = "bookings";
  if (prefix === "plan") table = "membership_plans";
  if (prefix === "subscription") table = "subscriptions";
  if (prefix === "notification") table = "notifications";
  if (prefix === "coachapp") table = "coach_applications";
  if (prefix === "audit") table = "audit_logs";
  if (prefix === "booking_hold") table = "booking_holds";
  if (prefix === "idem") table = "idempotency_records";
  if (prefix === "payment_tx") table = "payment_transactions";
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
};

const listEntity = async (prefix: EntityPrefix): Promise<any[]> => {
  const supabase = await client();
  let table = "";
  if (prefix === "user") table = "app_users";
  if (prefix === "court") table = "courts";
  if (prefix === "booking") table = "bookings";
  if (prefix === "plan") table = "membership_plans";
  if (prefix === "subscription") table = "subscriptions";
  if (prefix === "notification") table = "notifications";
  if (prefix === "coachapp") table = "coach_applications";
  if (prefix === "audit") table = "audit_logs";
  if (prefix === "booking_hold") table = "booking_holds";
  if (prefix === "idem") table = "idempotency_records";
  if (prefix === "payment_tx") table = "payment_transactions";

  const { data, error } = await supabase.from(table).select("*");
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  if (prefix === "user") return rows.map(userFromRow);
  if (prefix === "court") return rows.map(courtFromRow);
  if (prefix === "booking") return rows.map(bookingFromRow);
  if (prefix === "plan") return rows.map(planFromRow);
  if (prefix === "subscription") return rows.map(subscriptionFromRow);
  if (prefix === "coachapp") return rows.map(coachApplicationFromRow);
  if (prefix === "audit") return rows.map(auditLogFromRow);
  if (prefix === "booking_hold") return rows.map(bookingHoldFromRow);
  if (prefix === "idem") return rows.map(idempotencyFromRow);
  if (prefix === "payment_tx") return rows.map(paymentTxFromRow);
  return rows.map(notificationFromRow);
};

export const set = async (key: string, value: any): Promise<void> => {
  if (!hasSupabaseEnv()) {
    warnIfInMemory();
    inMemoryStore.set(key, structuredClone(value));
    return;
  }

  const parsed = parseKey(key);
  if (parsed.prefix && parsed.id) {
    try {
      await upsertEntity(parsed.prefix, { ...value, id: parsed.id });
      return;
    } catch (error) {
      if (!(optionalRelationalPrefixes.includes(parsed.prefix) && isMissingRelationError(error))) {
        throw error;
      }
    }
  }

  const supabase = await client();
  const { error } = await supabase.from("kv_store_ce0562bb").upsert({ key, value });
  if (error) throw new Error(error.message);
};

export const get = async (key: string): Promise<any> => {
  if (!hasSupabaseEnv()) {
    warnIfInMemory();
    const value = inMemoryStore.get(key);
    return value === undefined ? null : structuredClone(value);
  }

  const parsed = parseKey(key);
  if (parsed.prefix && parsed.id) {
    try {
      return await getEntity(parsed.prefix, parsed.id);
    } catch (error) {
      if (!(optionalRelationalPrefixes.includes(parsed.prefix) && isMissingRelationError(error))) {
        throw error;
      }
    }
  }

  const supabase = await client();
  const { data, error } = await supabase
    .from("kv_store_ce0562bb")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value;
};

export const del = async (key: string): Promise<void> => {
  if (!hasSupabaseEnv()) {
    warnIfInMemory();
    inMemoryStore.delete(key);
    return;
  }

  const parsed = parseKey(key);
  if (parsed.prefix && parsed.id) {
    try {
      await deleteEntity(parsed.prefix, parsed.id);
      return;
    } catch (error) {
      if (!(optionalRelationalPrefixes.includes(parsed.prefix) && isMissingRelationError(error))) {
        throw error;
      }
    }
  }

  const supabase = await client();
  const { error } = await supabase.from("kv_store_ce0562bb").delete().eq("key", key);
  if (error) throw new Error(error.message);
};

export const mset = async (keys: string[], values: any[]): Promise<void> => {
  if (keys.length !== values.length) {
    throw new Error("keys and values length mismatch");
  }

  if (!hasSupabaseEnv()) {
    warnIfInMemory();
    for (let i = 0; i < keys.length; i += 1) {
      inMemoryStore.set(keys[i], structuredClone(values[i]));
    }
    return;
  }

  const fallbackRows: { key: string; value: any }[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = values[i];
    const parsed = parseKey(key);
    if (parsed.prefix && parsed.id) {
      try {
        await upsertEntity(parsed.prefix, { ...value, id: parsed.id });
      } catch (error) {
        if (!(optionalRelationalPrefixes.includes(parsed.prefix) && isMissingRelationError(error))) {
          throw error;
        }
        fallbackRows.push({ key, value });
      }
    } else {
      fallbackRows.push({ key, value });
    }
  }

  if (fallbackRows.length > 0) {
    const supabase = await client();
    const { error } = await supabase.from("kv_store_ce0562bb").upsert(fallbackRows);
    if (error) throw new Error(error.message);
  }
};

export const mget = async (keys: string[]): Promise<any[]> => {
  if (!hasSupabaseEnv()) {
    warnIfInMemory();
    return keys.map((key) => {
      const value = inMemoryStore.get(key);
      return value === undefined ? null : structuredClone(value);
    });
  }

  const out: any[] = [];
  for (const key of keys) {
    out.push(await get(key));
  }
  return out;
};

export const mdel = async (keys: string[]): Promise<void> => {
  if (!hasSupabaseEnv()) {
    warnIfInMemory();
    for (const key of keys) inMemoryStore.delete(key);
    return;
  }

  for (const key of keys) {
    await del(key);
  }
};

export const getByPrefix = async (prefix: string): Promise<any[]> => {
  if (!hasSupabaseEnv()) {
    warnIfInMemory();
    const out: any[] = [];
    for (const [key, value] of inMemoryStore.entries()) {
      if (key.startsWith(prefix)) out.push(structuredClone(value));
    }
    return out;
  }

  const cleanPrefix = prefix.endsWith(":") ? prefix.slice(0, -1) : prefix;
  if (entityPrefixes.includes(cleanPrefix as EntityPrefix)) {
    const entityPrefix = cleanPrefix as EntityPrefix;
    try {
      return await listEntity(entityPrefix);
    } catch (error) {
      if (!(optionalRelationalPrefixes.includes(entityPrefix) && isMissingRelationError(error))) {
        throw error;
      }
    }
  }

  const supabase = await client();
  const { data, error } = await supabase
    .from("kv_store_ce0562bb")
    .select("key, value")
    .like("key", `${prefix}%`);
  if (error) throw new Error(error.message);
  return data?.map((d: { value: any }) => d.value) ?? [];
};
