import { Booking, Court, FacilityConfig, MembershipPlan, Notification, User } from "@/types";
import { BookingAnalytics, CourtUtilization } from "@/types";

type Role = User["role"];
type Status = User["status"];

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: Record<string, unknown> | null;
  error?: { code?: string; message?: string; details?: Record<string, unknown> } | null;
};

type ApiSession = {
  accessToken: string;
  refreshToken?: string;
  user: User;
};

export type BackendHealth = {
  status: string;
  storage?: {
    mode?: "memory" | "supabase" | string;
    missingEnv?: string[];
  };
  db?: {
    enabled?: boolean;
    reachable?: boolean;
    missingTables?: string[];
    checkedAt?: string;
    error?: string;
  };
  auth?: {
    mode?: string;
    requireBearer?: boolean;
    supabase?: {
      hasAnonEnv?: boolean;
      hasServiceEnv?: boolean;
    };
  };
  payments?: {
    provider?: string;
  };
  passwordPolicy?: {
    minLength?: number;
  };
};

const SESSION_KEY = "ventra_api_session";
const rawUseBackend = String(import.meta.env.VITE_USE_BACKEND_API || "").trim().toLowerCase();
const USE_BACKEND_API =
  rawUseBackend === "true" ||
  rawUseBackend === "1" ||
  rawUseBackend === "yes" ||
  (rawUseBackend === "" && Boolean(import.meta.env.PROD));
const configuredSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const remoteApiBase = configuredSupabaseUrl ? `${configuredSupabaseUrl}/functions/v1/server/api/v1` : "";

const resolveApiBase = () => {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  // Dev default: rely on Vite proxy (`/api/v1` -> local Supabase edge function).
  if (!import.meta.env.PROD) return "/api/v1";

  // Prod default: talk directly to the deployed Supabase edge function to avoid
  // needing host-level proxy/redirect rules.
  if (remoteApiBase) return remoteApiBase;

  return "/api/v1";
};

const API_BASE = resolveApiBase();

const mapUser = (u: any): User => ({
  id: String(u?.id || ""),
  email: String(u?.email || ""),
  name: String(u?.name || ""),
  role: (u?.role || "player") as Role,
  status: (u?.status || "active") as Status,
  phone: String(u?.phone || ""),
  avatar: String(u?.avatar || ""),
  skillLevel: u?.skillLevel,
  coachProfile: u?.coachProfile,
  coachExpertise: Array.isArray(u?.coachExpertise) ? u.coachExpertise : [],
  coachVerificationStatus: u?.coachVerificationStatus,
  coachVerificationMethod: u?.coachVerificationMethod,
  coachVerificationDocumentName: u?.coachVerificationDocumentName,
  coachVerificationId: u?.coachVerificationId,
  coachVerificationNotes: u?.coachVerificationNotes,
  coachVerificationSubmittedAt: u?.coachVerificationSubmittedAt,
  createdAt: new Date(u?.createdAt || Date.now()),
});

const mapCourt = (c: any): Court => ({
  id: String(c?.id || ""),
  name: String(c?.name || ""),
  courtNumber: String(c?.courtNumber || ""),
  type: c?.type || "indoor",
  surfaceType: c?.surfaceType || "hardcourt",
  hourlyRate: Number(c?.hourlyRate || 0),
  peakHourRate: c?.peakHourRate == null ? undefined : Number(c.peakHourRate),
  status: c?.status || "active",
  imageUrl: c?.imageUrl ? String(c.imageUrl) : undefined,
  operatingHours: {
    start: String(c?.operatingHours?.start || "07:00"),
    end: String(c?.operatingHours?.end || "22:00"),
  },
});

const mapBooking = (b: any): Booking => ({
  id: String(b?.id || ""),
  courtId: String(b?.courtId || ""),
  userId: String(b?.userId || ""),
  type: b?.type || "private",
  date: new Date(b?.date || Date.now()),
  startTime: String(b?.startTime || ""),
  endTime: String(b?.endTime || ""),
  duration: Number(b?.duration || 0),
  status: b?.status || "pending",
  paymentStatus: b?.paymentStatus || "unpaid",
  amount: Number(b?.amount || 0),
  players: Array.isArray(b?.players) ? b.players : [],
  maxPlayers: b?.maxPlayers == null ? undefined : Number(b.maxPlayers),
  coachId: b?.coachId || undefined,
  checkedIn: Boolean(b?.checkedIn),
  checkedInAt: b?.checkedInAt ? new Date(b.checkedInAt) : undefined,
  notes: b?.notes || undefined,
  playerAttendance: b?.attendance || b?.playerAttendance || undefined,
  createdAt: new Date(b?.createdAt || Date.now()),
});

const mapPlan = (p: any): MembershipPlan => ({
  id: String(p?.id || ""),
  name: String(p?.name || ""),
  price: Number(p?.price || 0),
  interval: p?.interval === "year" ? "year" : "month",
  tier: p?.tier || "basic",
  description: String(p?.description || ""),
  features: Array.isArray(p?.features) ? p.features.map((f: unknown) => String(f)) : [],
});

const mapNotification = (n: any): Notification => ({
  id: String(n?.id || ""),
  userId: String(n?.userId || ""),
  type: (n?.type || "admin_alert") as Notification["type"],
  title: String(n?.title || ""),
  message: String(n?.message || ""),
  read: Boolean(n?.read),
  createdAt: new Date(n?.createdAt || Date.now()),
});

const mapConfig = (cfg: any): FacilityConfig => ({
  openingTime: String(cfg?.openingTime || "07:00"),
  closingTime: String(cfg?.closingTime || "22:00"),
  bookingInterval: Number(cfg?.bookingInterval || 60),
  bufferTime: Number(cfg?.bufferTime || 15),
  maxBookingDuration: Number(cfg?.maxBookingDuration || 120),
  advanceBookingDays: Number(cfg?.advanceBookingDays || 7),
  cancellationCutoffHours: Number(cfg?.cancellationCutoffHours || 24),
  peakHours: Array.isArray(cfg?.peakHours)
    ? cfg.peakHours.map((p: any) => ({
        start: String(p?.start || "08:00"),
        end: String(p?.end || "12:00"),
      }))
    : [
        { start: "17:00", end: "21:00" },
        { start: "08:00", end: "12:00" },
      ],
  maintenanceMode: Boolean(cfg?.maintenanceMode),
});

const readSession = (): ApiSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.user) return null;
    return {
      accessToken: String(parsed.accessToken),
      refreshToken: parsed.refreshToken ? String(parsed.refreshToken) : undefined,
      user: mapUser(parsed.user),
    };
  } catch {
    return null;
  }
};

const writeSession = (session: ApiSession | null) => {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    }),
  );
};

const fetchEnvelope = async <T>(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
  allowRemoteFallback = true,
): Promise<ApiEnvelope<T>> => {
  const session = readSession();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.auth !== false && session?.accessToken) {
    headers.authorization = `Bearer ${session.accessToken}`;
    headers["x-user-id"] = session.user.id;
    headers["x-user-role"] = session.user.role;
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body == null ? undefined : JSON.stringify(options.body),
    });
    const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
    if (!response.ok || !payload?.success) {
      if (allowRemoteFallback && remoteApiBase && baseUrl !== remoteApiBase && response.status === 404) {
        return await fetchEnvelope<T>(remoteApiBase, path, options, false);
      }
      const message = payload?.error?.message || `${response.status} ${response.statusText}`.trim() || "Request failed.";
      throw new Error(message);
    }
    return payload;
  } catch (error: any) {
    if (allowRemoteFallback && remoteApiBase && baseUrl !== remoteApiBase) {
      return await fetchEnvelope<T>(remoteApiBase, path, options, false);
    }
    throw error;
  }
};

const requestEnvelope = async <T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<ApiEnvelope<T>> => {
  return await fetchEnvelope(API_BASE, path, options);
};

const request = async <T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> => {
  const payload = await requestEnvelope<T>(path, options);
  return payload.data;
};

const ensureBackendEnabled = () => {
  if (!USE_BACKEND_API) {
    throw new Error("Backend API mode is disabled.");
  }
};

export const backendApi = {
  isEnabled: USE_BACKEND_API,
  getSession: readSession,
  clearSession: () => writeSession(null),
  setSession: (session: {
    accessToken: string;
    refreshToken?: string;
    user: User;
  } | null) => {
    writeSession(
      session
        ? {
            accessToken: String(session.accessToken || ""),
            refreshToken: session.refreshToken ? String(session.refreshToken) : undefined,
            user: session.user,
          }
        : null,
    );
  },

  async signupViaServer(
    email: string,
    password: string,
    role: Role = "player",
    payload: {
      name?: string;
      phone?: string;
      coachProfile?: string;
      coachExpertise?: string[];
      verificationMethod?: "certification" | "license" | "experience" | "other";
      verificationDocumentName?: string;
      verificationId?: string;
      verificationNotes?: string;
      adminCode?: string;
    } = {},
  ) {
    const requestOptions = {
      method: "POST",
      auth: false,
      body: { email, password, role, ...payload },
    } as const;
    const data = await request<any>("/auth/signup", requestOptions);
    if (data?.pending === true) {
      return {
        pending: true,
        message: String(data?.message || "Coach registration submitted and pending admin verification."),
      };
    }
    return {
      pending: false,
      message: String(data?.message || ""),
      emailConfirmationRequired: Boolean(data?.emailConfirmationRequired),
      user: mapUser(data),
    };
  },

  async login(email: string, password: string, expectedRole?: Role) {
    ensureBackendEnabled();
    const data = await request<any>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password, expectedRole },
    });
    const session: ApiSession = {
      accessToken: String(data?.accessToken || ""),
      refreshToken: data?.refreshToken ? String(data.refreshToken) : undefined,
      user: mapUser(data?.user || {}),
    };
    writeSession(session);
    return session.user;
  },

  async signup(
    email: string,
    password: string,
    role: Role = "player",
    payload: {
      name?: string;
      phone?: string;
      coachProfile?: string;
      coachExpertise?: string[];
      verificationMethod?: "certification" | "license" | "experience" | "other";
      verificationDocumentName?: string;
      verificationId?: string;
      verificationNotes?: string;
      adminCode?: string;
    } = {},
  ) {
    ensureBackendEnabled();
    return await backendApi.signupViaServer(email, password, role, payload);
  },

  async logout() {
    if (!USE_BACKEND_API) return;
    try {
      await request("/auth/logout", { method: "POST" });
    } finally {
      writeSession(null);
    }
  },

  async resetPassword(email: string) {
    ensureBackendEnabled();
    return await request<{ sent: boolean; message?: string }>("/auth/reset-password", {
      method: "POST",
      auth: false,
      body: { email },
    });
  },

  async changePassword(currentPassword: string, newPassword: string) {
    ensureBackendEnabled();
    return await request<{ changed: boolean }>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  },

  async getUsers(role: Role) {
    ensureBackendEnabled();
    if (role === "admin" || role === "staff") {
      const data = await request<any[]>("/admin/users?page=1&limit=200");
      return data.map(mapUser);
    }
    const me = await request<any>("/users/me");
    const coaches = await request<any[]>("/coaches");
    const users = [mapUser(me), ...coaches.map(mapUser)];
    const unique = new Map<string, User>();
    for (const user of users) unique.set(user.id, user);
    return Array.from(unique.values());
  },

  async getCourts() {
    ensureBackendEnabled();
    const data = await request<any[]>("/courts");
    return data.map(mapCourt);
  },

  async getBookings() {
    ensureBackendEnabled();
    const data = await request<any[]>("/bookings");
    return data.map(mapBooking);
  },

  async getPlans() {
    ensureBackendEnabled();
    const data = await request<any[]>("/plans");
    return data.map(mapPlan);
  },

  async addCourt(court: Omit<Court, "id">) {
    ensureBackendEnabled();
    const data = await request<any>("/courts", {
      method: "POST",
      body: court,
    });
    return mapCourt(data);
  },

  async updateCourt(id: string, updates: Partial<Court>) {
    ensureBackendEnabled();
    const data = await request<any>(`/courts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: updates,
    });
    return mapCourt(data);
  },

  async deleteCourt(id: string) {
    ensureBackendEnabled();
    await request(`/courts/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async adminUpdateUser(id: string, updates: Partial<User>) {
    ensureBackendEnabled();
    const data = await request<any>(`/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: updates,
    });
    return mapUser(data);
  },

  async adminDeleteUser(id: string) {
    ensureBackendEnabled();
    await request(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async addPlan(plan: Omit<MembershipPlan, "id">) {
    ensureBackendEnabled();
    const data = await request<any>("/plans", {
      method: "POST",
      body: plan,
    });
    return mapPlan(data);
  },

  async updatePlan(id: string, updates: Partial<MembershipPlan>) {
    ensureBackendEnabled();
    const data = await request<any>(`/plans/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: updates,
    });
    return mapPlan(data);
  },

  async deletePlan(id: string) {
    ensureBackendEnabled();
    await request(`/plans/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async updateMe(updates: Partial<User>) {
    ensureBackendEnabled();
    const data = await request<any>("/users/me", {
      method: "PATCH",
      body: updates,
    });
    return mapUser(data);
  },

  async updateCoachProfile(payload: {
    avatar?: string;
    coachProfile?: string;
    coachExpertise?: string[];
  }) {
    ensureBackendEnabled();
    const data = await request<any>("/coach/profile", {
      method: "PATCH",
      body: payload,
    });
    return mapUser(data);
  },

  async submitCoachVerification(payload: {
    method: "certification" | "license" | "experience" | "other";
    documentName: string;
    verificationId?: string;
    notes?: string;
  }) {
    ensureBackendEnabled();
    const data = await request<any>("/coach/verification/submit", {
      method: "POST",
      body: payload,
    });
    return mapUser(data);
  },

  async getCoachVerificationQueue(filters: { status?: "unverified" | "pending" | "verified" | "rejected" } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    const query = params.toString();
    const data = await request<any[]>(`/admin/coaches/verification${query ? `?${query}` : ""}`);
    return Array.isArray(data) ? data.map(mapUser) : [];
  },

  async approveCoachVerification(id: string, notes?: string) {
    ensureBackendEnabled();
    const data = await request<any>(`/admin/coaches/${encodeURIComponent(id)}/verification/approve`, {
      method: "POST",
      body: notes ? { notes } : {},
    });
    return mapUser(data);
  },

  async rejectCoachVerification(id: string, reason?: string) {
    ensureBackendEnabled();
    const data = await request<any>(`/admin/coaches/${encodeURIComponent(id)}/verification/reject`, {
      method: "POST",
      body: reason ? { reason } : {},
    });
    return mapUser(data);
  },

  async getNotifications() {
    ensureBackendEnabled();
    const data = await request<any[]>("/notifications?page=1&limit=200");
    return data.map(mapNotification);
  },

  async getConfig() {
    ensureBackendEnabled();
    const data = await request<any>("/config/facility", { auth: false });
    return mapConfig(data);
  },

  async getHealth() {
    ensureBackendEnabled();
    return await request<BackendHealth>("/health", { auth: false });
  },

  async updateConfig(updates: Partial<FacilityConfig>) {
    ensureBackendEnabled();
    const data = await request<any>("/config/facility", {
      method: "PATCH",
      body: updates,
    });
    return mapConfig(data);
  },

  async createBooking(payload: Omit<Booking, "id" | "createdAt">) {
    ensureBackendEnabled();
    const data = await request<any>("/bookings", {
      method: "POST",
      body: {
        courtId: payload.courtId,
        userId: payload.userId,
        type: payload.type,
        date: payload.date instanceof Date ? payload.date.toISOString().slice(0, 10) : String(payload.date),
        startTime: payload.startTime,
        endTime: payload.endTime,
        duration: payload.duration,
        amount: payload.amount,
        notes: payload.notes,
        coachId: payload.coachId,
      },
    });
    return mapBooking(data);
  },

  async createQuickBooking(payload: {
    fullName: string;
    contactNumber: string;
    courtId: string;
    date: string | Date;
    startTime: string;
    endTime: string;
    duration: number;
    amount: number;
    type?: "open_play" | "private" | "training";
  }) {
    ensureBackendEnabled();
    const dateString = payload.date instanceof Date ? payload.date.toISOString().slice(0, 10) : String(payload.date);
    const data = await request<any>("/bookings/quick", {
      method: "POST",
      auth: false,
      body: {
        fullName: payload.fullName,
        contactNumber: payload.contactNumber,
        courtId: payload.courtId,
        date: dateString,
        startTime: payload.startTime,
        endTime: payload.endTime,
        duration: payload.duration,
        amount: payload.amount,
        type: payload.type || "private",
      },
    });
    return mapBooking(data);
  },

  async cancelBooking(id: string) {
    ensureBackendEnabled();
    const data = await request<any>(`/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" });
    return mapBooking(data);
  },

  async confirmBooking(id: string) {
    ensureBackendEnabled();
    const data = await request<any>(`/bookings/${encodeURIComponent(id)}/approve`, { method: "POST" });
    return mapBooking(data);
  },

  async updateBooking(id: string, updates: Partial<Booking>) {
    ensureBackendEnabled();
    const payload: Record<string, unknown> = { ...updates };
    if (updates.date instanceof Date) payload.date = updates.date.toISOString().slice(0, 10);
    const data = await request<any>(`/bookings/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
    return mapBooking(data);
  },

  async checkInBooking(bookingId: string) {
    ensureBackendEnabled();
    const session = readSession();
    const verify = await request<any>("/check-in/verify", {
      method: "POST",
      body: { bookingId },
    });
    if (!verify?.id) throw new Error("Booking not found.");
    const data = await request<any>("/check-in/confirm", {
      method: "POST",
      body: { bookingId, checkedInBy: session?.user?.id || "" },
    });
    return mapBooking(data);
  },

  async markAllNotificationsAsRead() {
    ensureBackendEnabled();
    await request("/notifications/mark-all-read", { method: "POST" });
  },

  async joinSession(bookingId: string) {
    ensureBackendEnabled();
    const data = await request<any>(`/sessions/${encodeURIComponent(bookingId)}/join`, { method: "POST" });
    return mapBooking(data);
  },

  async markStudentAttendance(bookingId: string, studentId: string, attended: boolean) {
    ensureBackendEnabled();
    const data = await request<any>(`/coach/sessions/${encodeURIComponent(bookingId)}/attendance`, {
      method: "POST",
      body: { playerId: studentId, attended },
    });
    return mapBooking(data);
  },

  async getCoachEligibleStudents(filters: { sport?: string; courtId?: string } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.sport) params.set("sport", filters.sport);
    if (filters.courtId) params.set("courtId", filters.courtId);
    const query = params.toString();
    const data = await request<any[]>(`/coach/sessions/eligible-students${query ? `?${query}` : ""}`);
    return Array.isArray(data)
      ? data.map((item) => ({
          playerId: String(item?.playerId || ""),
          applicationId: String(item?.applicationId || ""),
          sport: String(item?.sport || ""),
          player: mapUser(item?.player || {}),
        }))
      : [];
  },

  async createCoachSession(payload: {
    courtId: string;
    date: Date | string;
    startTime: string;
    endTime: string;
    duration: number;
    maxPlayers: number;
    amount?: number;
    notes?: string;
    sport?: string;
    players?: string[];
    autoEnrollApproved?: boolean;
  }) {
    ensureBackendEnabled();
    const data = await request<any>("/coach/sessions", {
      method: "POST",
      body: {
        courtId: payload.courtId,
        date: payload.date instanceof Date ? payload.date.toISOString().slice(0, 10) : String(payload.date),
        startTime: payload.startTime,
        endTime: payload.endTime,
        duration: payload.duration,
        maxPlayers: payload.maxPlayers,
        amount: payload.amount ?? 0,
        notes: payload.notes,
        sport: payload.sport,
        players: payload.players,
        autoEnrollApproved: payload.autoEnrollApproved,
      },
    });
    return mapBooking(data);
  },

  async deleteCoachSession(id: string) {
    ensureBackendEnabled();
    await request(`/coach/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async createCoachApplication(payload: {
    coachId: string;
    sport: string;
    message?: string;
    preferredSchedule?: string;
  }) {
    ensureBackendEnabled();
    return await request<any>("/coach/applications", {
      method: "POST",
      body: payload,
    });
  },

  async getCoachApplications(filters: { status?: string; sport?: string } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.sport) params.set("sport", filters.sport);
    const query = params.toString();
    const data = await request<any[]>(`/coach/applications${query ? `?${query}` : ""}`);
    return Array.isArray(data) ? data : [];
  },

  async getMyCoachApplications(filters: { status?: string } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    const query = params.toString();
    const data = await request<any[]>(`/coach/applications/me${query ? `?${query}` : ""}`);
    return Array.isArray(data) ? data : [];
  },

  async approveCoachApplication(id: string, reviewNote?: string) {
    ensureBackendEnabled();
    return await request<any>(`/coach/applications/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      body: reviewNote ? { reviewNote } : {},
    });
  },

  async rejectCoachApplication(id: string, reason?: string) {
    ensureBackendEnabled();
    return await request<any>(`/coach/applications/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: reason ? { reason } : {},
    });
  },

  async subscribe(planId: string, paymentMethod = "card") {
    ensureBackendEnabled();
    return await request<any>("/subscriptions", {
      method: "POST",
      body: { planId, paymentMethod },
    });
  },

  async getSubscriptionsMe() {
    ensureBackendEnabled();
    const data = await request<any[]>("/subscriptions/me");
    return Array.isArray(data) ? data : [];
  },

  async createPaymentCheckout(bookingId: string, method: "maya" | "gcash") {
    ensureBackendEnabled();
    return await request<any>("/payments/checkout", {
      method: "POST",
      body: { bookingId, method },
    });
  },

  async getPayments(filters: {
    page?: number;
    limit?: number;
    status?: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
    method?: "maya" | "gcash";
    bookingId?: string;
    userId?: string;
  } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.page != null) params.set("page", String(filters.page));
    if (filters.limit != null) params.set("limit", String(filters.limit));
    if (filters.status) params.set("status", filters.status);
    if (filters.method) params.set("method", filters.method);
    if (filters.bookingId) params.set("bookingId", filters.bookingId);
    if (filters.userId) params.set("userId", filters.userId);
    const query = params.toString();
    return await request<any[]>(`/payments${query ? `?${query}` : ""}`);
  },

  async getPaymentById(id: string) {
    ensureBackendEnabled();
    return await request<any>(`/payments/${encodeURIComponent(id)}`);
  },

  async getBookingReceipt(bookingId: string) {
    ensureBackendEnabled();
    return await request<any>(`/bookings/${encodeURIComponent(bookingId)}/receipt`);
  },

  async retryPayment(id: string) {
    ensureBackendEnabled();
    return await request<any>(`/payments/${encodeURIComponent(id)}/retry`, {
      method: "POST",
      body: {},
    });
  },

  async getAvailableSlots(courtId: string, date: Date, bookingType: "open_play" | "private" | "training" = "private") {
    ensureBackendEnabled();
    const yyyyMmDd = date.toISOString().slice(0, 10);
    const params = new URLSearchParams({
      courtId,
      date: yyyyMmDd,
      bookingType,
    });
    const data = await request<any[]>(`/bookings/available-slots?${params.toString()}`);
    return Array.isArray(data) ? data.map((slot) => String(slot)) : [];
  },

  async getBookingAnalytics(
    startDate: Date,
    endDate: Date,
    filters: { courtId?: string; status?: string; type?: "open_play" | "private" | "training" } = {},
  ): Promise<BookingAnalytics> {
    ensureBackendEnabled();
    const params = new URLSearchParams({
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    });
    if (filters.courtId) params.set("courtId", filters.courtId);
    if (filters.status) params.set("status", filters.status);
    if (filters.type) params.set("type", filters.type);
    const data = await request<any>(`/analytics/bookings?${params.toString()}`);
    const totalBookings = Number(data?.totalBookings || 0);
    const completedBookings = Number(data?.completedBookings || 0);
    const cancelledBookings = Number(data?.cancelledBookings || 0);
    const noShows = Number(data?.noShows || 0);
    const totalRevenue = Number(data?.totalRevenue || 0);
    return {
      totalBookings,
      completedBookings,
      cancelledBookings,
      noShows,
      noShowRate: totalBookings > 0 ? (noShows / totalBookings) * 100 : 0,
      totalRevenue,
      averageBookingValue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
    };
  },

  async getCourtUtilization(courtId: string, startDate: Date, endDate: Date): Promise<CourtUtilization[]> {
    ensureBackendEnabled();
    const params = new URLSearchParams({
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    });
    const data = await request<any>(`/analytics/courts/${encodeURIComponent(courtId)}/utilization?${params.toString()}`);
    const hoursBooked = Number(data?.hoursBooked || 0);
    const hoursAvailable = Number(data?.hoursAvailable || 0);
    const utilizationRate =
      data?.utilizationRate == null
        ? hoursAvailable > 0
          ? (hoursBooked / hoursAvailable) * 100
          : 0
        : Number(data.utilizationRate || 0);
    return [
      {
        courtId,
        date: endDate,
        hoursBooked,
        hoursAvailable,
        utilizationRate,
        revenue: 0,
      },
    ];
  },

  async exportBookingsCsv(filters: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    courtId?: string;
    type?: string;
  }) {
    ensureBackendEnabled();
    const params = new URLSearchParams({ format: "csv" });
    if (filters.startDate) params.set("startDate", filters.startDate.toISOString().slice(0, 10));
    if (filters.endDate) params.set("endDate", filters.endDate.toISOString().slice(0, 10));
    if (filters.status) params.set("status", filters.status);
    if (filters.courtId) params.set("courtId", filters.courtId);
    if (filters.type) params.set("type", filters.type);
    const payload = await request<any>(`/analytics/bookings/export?${params.toString()}`);
    return {
      filename: String(payload?.filename || "bookings_export.csv"),
      csv: String(payload?.data || ""),
    };
  },

  async adminExportData() {
    ensureBackendEnabled();
    const payload = await request<any>("/admin/data/export");
    return {
      filename: String(payload?.filename || `ventra-backup-${new Date().toISOString().slice(0, 10)}.json`),
      data: payload?.data ?? {},
    };
  },

  async adminImportData(data: Record<string, unknown>, overwrite = true) {
    ensureBackendEnabled();
    return await request<any>("/admin/data/import", {
      method: "POST",
      body: { overwrite, data },
    });
  },

  async adminResetData() {
    ensureBackendEnabled();
    return await request<any>("/admin/data/reset", {
      method: "POST",
      body: {},
    });
  },

  async getAuditLogs(filters: {
    action?: string;
    entityType?: string;
    entityId?: string;
    actorId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.action) params.set("action", filters.action);
    if (filters.entityType) params.set("entityType", filters.entityType);
    if (filters.entityId) params.set("entityId", filters.entityId);
    if (filters.actorId) params.set("actorId", filters.actorId);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.page != null) params.set("page", String(filters.page));
    if (filters.limit != null) params.set("limit", String(filters.limit));
    const query = params.toString();
    return await request<any[]>(`/admin/audit-logs${query ? `?${query}` : ""}`);
  },

  async exportAuditLogs(filters: {
    format?: "json" | "csv";
    action?: string;
    entityType?: string;
    entityId?: string;
    actorId?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    params.set("format", filters.format || "json");
    if (filters.action) params.set("action", filters.action);
    if (filters.entityType) params.set("entityType", filters.entityType);
    if (filters.entityId) params.set("entityId", filters.entityId);
    if (filters.actorId) params.set("actorId", filters.actorId);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    return await request<any>(`/admin/audit-logs/export?${params.toString()}`);
  },

  async purgeAuditLogs(beforeDate: string, dryRun = true) {
    ensureBackendEnabled();
    return await request<any>("/admin/audit-logs/purge", {
      method: "POST",
      body: {
        beforeDate,
        dryRun,
      },
    });
  },

  async getPaymentsHealth() {
    ensureBackendEnabled();
    return await request<any>("/admin/payments/health");
  },

  async expireStalePayments(payload: {
    dryRun?: boolean;
    olderThanMinutes?: number;
    referenceNow?: string;
  } = {}) {
    ensureBackendEnabled();
    return await request<any>("/admin/payments/expire-stale", {
      method: "POST",
      body: payload,
    });
  },

  async getUnpaidBookingMonitor(filters: {
    status?: "all" | "overdue" | "at_risk";
    windowMinutes?: number;
    referenceNow?: string;
  } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.windowMinutes != null) params.set("windowMinutes", String(filters.windowMinutes));
    if (filters.referenceNow) params.set("referenceNow", filters.referenceNow);
    const query = params.toString();
    return await request<any[]>(`/admin/bookings/unpaid-monitor${query ? `?${query}` : ""}`);
  },

  async getPaymentReconciliation(filters: {
    issueType?: string;
    page?: number;
    limit?: number;
  } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.issueType) params.set("issueType", filters.issueType);
    if (filters.page != null) params.set("page", String(filters.page));
    if (filters.limit != null) params.set("limit", String(filters.limit));
    const query = params.toString();
    return await request<any[]>(`/admin/payments/reconciliation${query ? `?${query}` : ""}`);
  },

  async exportPaymentReconciliation(filters: {
    format?: "json" | "csv";
    issueType?: string;
  } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    params.set("format", filters.format || "json");
    if (filters.issueType) params.set("issueType", filters.issueType);
    return await request<any>(`/admin/payments/reconciliation/export?${params.toString()}`);
  },

  async resolvePaymentReconciliation(payload: {
    issueType: string;
    bookingId?: string;
    txId?: string;
    dryRun?: boolean;
  }) {
    ensureBackendEnabled();
    return await request<any>("/admin/payments/reconciliation/resolve", {
      method: "POST",
      body: payload,
    });
  },

  async resolvePaymentReconciliationBulk(
    items: Array<{ issueType: string; bookingId?: string; txId?: string; dryRun?: boolean }>,
    dryRun = true,
  ) {
    ensureBackendEnabled();
    const payload = await requestEnvelope<any[]>("/admin/payments/reconciliation/resolve/bulk", {
      method: "POST",
      body: {
        items,
        dryRun,
      },
    });
    const meta = payload.meta || {};
    return {
      items: Array.isArray(payload.data) ? payload.data : [],
      summary: {
        total: Number(meta?.total || items.length),
        successCount: Number(meta?.successCount || 0),
        failureCount: Number(meta?.failureCount || 0),
        dryRunDefault: Boolean(meta?.dryRunDefault),
      },
    };
  },

  async resolvePaymentReconciliationByFilter(payload: {
    issueType: string;
    maxItems?: number;
    dryRun?: boolean;
  }) {
    ensureBackendEnabled();
    const response = await requestEnvelope<any[]>("/admin/payments/reconciliation/resolve/by-filter", {
      method: "POST",
      body: payload,
    });
    const meta = response.meta || {};
    return {
      items: Array.isArray(response.data) ? response.data : [],
      summary: {
        issueType: String(meta?.issueType || payload.issueType || ""),
        requestedMaxItems: Number(meta?.requestedMaxItems || payload.maxItems || 0),
        matched: Number(meta?.matched || 0),
        total: Number(meta?.processed || 0),
        processed: Number(meta?.processed || 0),
        successCount: Number(meta?.successCount || 0),
        failureCount: Number(meta?.failureCount || 0),
        dryRun: Boolean(meta?.dryRun),
      },
    };
  },

  async getBookingHistory(filters: {
    view?: "active" | "past" | "all";
    dateFrom?: string;
    dateTo?: string;
    includeNoShow?: boolean;
    includeCancelled?: boolean;
    page?: number;
    limit?: number;
  } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.view) params.set("view", filters.view);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.includeNoShow != null) params.set("includeNoShow", String(filters.includeNoShow));
    if (filters.includeCancelled != null) params.set("includeCancelled", String(filters.includeCancelled));
    if (filters.page != null) params.set("page", String(filters.page));
    if (filters.limit != null) params.set("limit", String(filters.limit));
    const query = params.toString();
    const data = await request<any[]>(`/bookings/history${query ? `?${query}` : ""}`);
    return Array.isArray(data) ? data.map(mapBooking) : [];
  },

  async getBookingTimeline(id: string, order: "asc" | "desc" = "desc") {
    ensureBackendEnabled();
    return await request<any>(`/bookings/${encodeURIComponent(id)}/timeline?order=${encodeURIComponent(order)}`);
  },

  async transitionBookingStatus(
    id: string,
    payload: {
      status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
      reason?: string;
      expectedUpdatedAt?: string;
    },
  ) {
    ensureBackendEnabled();
    const data = await request<any>(`/bookings/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: payload,
    });
    return mapBooking(data);
  },

  async setBookingPaymentDeadline(
    id: string,
    payload:
      | { clear: true; referenceNow?: string }
      | { ttlMinutes: number; referenceNow?: string }
      | { dueAt: string; referenceNow?: string },
  ) {
    ensureBackendEnabled();
    const data = await request<any>(`/bookings/${encodeURIComponent(id)}/payment-deadline`, {
      method: "POST",
      body: payload,
    });
    return mapBooking(data);
  },

  async createBookingHold(payload: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    ttlMinutes?: number;
  }) {
    ensureBackendEnabled();
    return await request<any>("/bookings/holds", {
      method: "POST",
      body: payload,
    });
  },

  async getMyBookingHolds(filters: { courtId?: string; date?: string } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    if (filters.courtId) params.set("courtId", filters.courtId);
    if (filters.date) params.set("date", filters.date);
    const query = params.toString();
    return await request<any[]>(`/bookings/holds/me${query ? `?${query}` : ""}`);
  },

  async releaseBookingHold(id: string) {
    ensureBackendEnabled();
    return await request<any>(`/bookings/holds/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  async leaveSession(bookingId: string) {
    ensureBackendEnabled();
    const data = await request<any>(`/sessions/${encodeURIComponent(bookingId)}/leave`, {
      method: "POST",
      body: {},
    });
    return mapBooking(data);
  },

  async cancelSubscription(subscriptionId: string) {
    ensureBackendEnabled();
    return await request<any>(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
      method: "POST",
      body: {},
    });
  },

  async getUnreadNotificationsCount() {
    ensureBackendEnabled();
    const data = await request<{ unread?: number }>("/notifications/unread-count");
    return Number(data?.unread || 0);
  },

  async markNotificationAsRead(notificationId: string) {
    ensureBackendEnabled();
    return await request<any>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "POST",
      body: {},
    });
  },

  async exportAttendanceAnalytics(filters: {
    format?: "json" | "csv";
    startDate?: Date;
    endDate?: Date;
    coachId?: string;
    courtId?: string;
    sport?: string;
  } = {}) {
    ensureBackendEnabled();
    const params = new URLSearchParams();
    params.set("format", filters.format || "json");
    if (filters.startDate) params.set("startDate", filters.startDate.toISOString().slice(0, 10));
    if (filters.endDate) params.set("endDate", filters.endDate.toISOString().slice(0, 10));
    if (filters.coachId) params.set("coachId", filters.coachId);
    if (filters.courtId) params.set("courtId", filters.courtId);
    if (filters.sport) params.set("sport", filters.sport);
    return await request<any>(`/analytics/attendance/export?${params.toString()}`);
  },
};
