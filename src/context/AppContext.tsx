import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Court,
  Booking,
  FacilityConfig,
  MembershipPlan,
  Notification,
  BookingAnalytics,
  CourtUtilization,
  BookingType,
} from '@/types';
import { addDays, format, isSameDay, parseISO } from 'date-fns';
import { supabase } from './supabase';
import { backendApi, type BackendHealth } from './backendApi';
import { PASSWORD_MIN_LENGTH } from '@/config/authPolicy';
import { getAuthCallbackUrl, getEmailLinkCallbackUrl } from '@/utils/authRedirect';

export interface UserSubscription {
  id: string;
  user_id: string;
  membership_id: string;
  status: string;
  start_date: string;
  end_date: string;
  amount_paid: number;
  created_at?: string;
}

export type SystemSetupStatus = {
  checked: boolean;
  backendEnabled: boolean;
  storageMode: 'memory' | 'supabase' | 'unknown';
  dbEnabled: boolean;
  dbReachable: boolean;
  dbError?: string;
  missingTables: string[];
  needsCourts: boolean;
  needsPlans: boolean;
  setupRequired: boolean;
  ready: boolean;
};

type SignupPayload = {
  name?: string;
  phone?: string;
  coachProfile?: string;
  coachExpertise?: string[];
  verificationMethod?: 'certification' | 'license' | 'experience' | 'other';
  verificationDocumentName?: string;
  verificationId?: string;
  verificationNotes?: string;
  adminCode?: string;
};

type LocalCoachRegistration = {
  id: string;
  email: string;
  password: string;
  name: string;
  phone?: string;
  coachProfile?: string;
  coachExpertise?: string[];
  verificationMethod: 'certification' | 'license' | 'experience' | 'other';
  verificationDocumentName: string;
  verificationId?: string;
  verificationNotes?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

interface AppContextType {
  bootstrapped: boolean;
  systemSetup: SystemSetupStatus;
  currentUser: User | null;
  users: User[];
  courts: Court[];
  bookings: Booking[];
  config: FacilityConfig;
  memberships: MembershipPlan[];
  userSubscription: UserSubscription | null;
  subscriptionHistory: UserSubscription[];
  notifications: Notification[];
  unreadNotificationCount: number;
  login: (email: string, password: string, expectedRole?: User['role']) => Promise<{ success: boolean; message?: string }>;
  signup: (email: string, password: string, role?: string, payload?: SignupPayload) => Promise<{ success: boolean; message?: string }>;
  signInWithProvider: (
    provider: 'google' | 'facebook',
    role?: string,
    flow?: 'signin' | 'signup'
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  addCourt: (court: Omit<Court, 'id'>) => Promise<void>;
  updateCourt: (id: string, court: Partial<Court>) => Promise<void>;
  deleteCourt: (id: string) => Promise<void>;
  createBooking: (booking: Omit<Booking, 'id' | 'createdAt'>) => Promise<string>;
  cancelBooking: (id: string, reason?: string) => Promise<void>;
  confirmBooking: (id: string) => Promise<void>;
  updateBooking: (id: string, updates: Partial<Booking>) => Promise<void>;
  checkInBooking: (id: string) => Promise<void>;
  getAvailableSlots: (courtId: string, date: Date, bookingType?: BookingType) => Promise<string[]>;
  markStudentAttendance: (bookingId: string, studentId: string, attended: boolean) => Promise<void>;
  getCoachEligibleStudents: (filters?: { sport?: string; courtId?: string }) => Promise<User[]>;
  createCoachSession: (payload: {
    courtId: string;
    date: Date;
    startTime: string;
    endTime: string;
    duration: number;
    maxPlayers: number;
    notes?: string;
    amount?: number;
    sport?: string;
  }) => Promise<string>;
  deleteCoachSession: (id: string) => Promise<void>;
  getBookingAnalytics: (startDate: Date, endDate: Date) => Promise<BookingAnalytics>;
  getCourtUtilization: (courtId: string, startDate: Date, endDate: Date) => Promise<CourtUtilization[]>;
  updateConfig: (config: Partial<FacilityConfig>) => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  updateCoachProfile: (updates: { avatar?: string; coachProfile?: string; coachExpertise?: string[] }) => Promise<void>;
  submitCoachVerification: (payload: {
    method: 'certification' | 'license' | 'experience' | 'other';
    documentName: string;
    verificationId?: string;
    notes?: string;
  }) => Promise<void>;
  getCoachVerificationQueue: (filters?: { status?: 'unverified' | 'pending' | 'verified' | 'rejected' }) => Promise<User[]>;
  approveCoachVerification: (coachId: string, notes?: string) => Promise<void>;
  rejectCoachVerification: (coachId: string, reason?: string) => Promise<void>;
  adminUpdateUser: (id: string, updates: Partial<User>) => Promise<void>;
  adminDeleteUser: (id: string) => Promise<void>;
  addMembership: (membership: Omit<MembershipPlan, 'id'>) => Promise<void>;
  updateMembership: (id: string, updates: Partial<MembershipPlan>) => Promise<void>;
  deleteMembership: (id: string) => Promise<void>;
  subscribe: (planId: string) => Promise<void>;
  cancelSubscription: (subscriptionId: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
  joinSession: (bookingId: string) => Promise<void>;
  leaveSession: (bookingId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Client storage keys and helpers
const STORAGE_KEYS = {
  USERS: 'ventra_users',
  COURTS: 'ventra_courts',
  BOOKINGS: 'ventra_bookings',
  MEMBERSHIPS: 'ventra_memberships',
  CONFIG: 'ventra_config',
  SUBSCRIPTIONS: 'ventra_subscriptions',
  NOTIFICATIONS: 'ventra_notifications',
  AUTH: 'ventra_auth', // Stores email:password mapping
  OAUTH_ROLE: 'ventra_oauth_role',
  OAUTH_FLOW: 'ventra_oauth_flow',
  OAUTH_CONFIRMATION_PENDING: 'ventra_oauth_confirmation_pending',
  OAUTH_EMAIL_LINK_PENDING: 'ventra_oauth_email_link_pending',
  ACCOUNT_CREATED_NOTICE: 'ventra_account_created_notice',
  COACH_REGISTRATIONS: 'ventra_coach_registrations',
};

const rawUseSupabaseAuth = String(import.meta.env.VITE_ENABLE_SUPABASE_AUTH || '').trim().toLowerCase();
const USE_SUPABASE_AUTH = rawUseSupabaseAuth === 'true' || rawUseSupabaseAuth === '1' || rawUseSupabaseAuth === 'yes';
const isSupabaseEmailConfirmed = (authUser: any) =>
  Boolean(authUser?.email_confirmed_at || authUser?.confirmed_at);
const getAuthRedirectUrl = () => getAuthCallbackUrl();

const defaultConfig: FacilityConfig = {
  openingTime: '07:00',
  closingTime: '22:00',
  bookingInterval: 60,
  bufferTime: 15,
  maxBookingDuration: 120,
  advanceBookingDays: 7,
  cancellationCutoffHours: 24,
  peakHours: [
    { start: '17:00', end: '21:00' },
    { start: '08:00', end: '12:00' },
  ],
  maintenanceMode: false,
};

export function AppProvider({ children }: { children: ReactNode }) {
  const usingBackendApi = backendApi.isEnabled;
  const oauthEnabled = USE_SUPABASE_AUTH;
  const [bootstrapped, setBootstrapped] = useState(false);
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('currentUser');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (error) {
      console.error('Error parsing saved user from localStorage:', error);
      localStorage.removeItem('currentUser');
      return null;
    }
  });
  const [users, setUsers] = useState<User[]>([]);
  const usersRef = useRef<User[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [config, setConfig] = useState<FacilityConfig>(defaultConfig);
  const [memberships, setMemberships] = useState<MembershipPlan[]>([]);
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null);
  const [subscriptionHistory, setSubscriptionHistory] = useState<UserSubscription[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [backendUnreadNotificationCount, setBackendUnreadNotificationCount] = useState<number | null>(null);
  const localUnreadNotificationCount = notifications.filter((n) => n.userId === currentUser?.id && !n.read).length;
  const unreadNotificationCount = usingBackendApi
    ? (backendUnreadNotificationCount == null
         ? localUnreadNotificationCount
         : Math.max(backendUnreadNotificationCount, localUnreadNotificationCount))
    : localUnreadNotificationCount;
  const backendRequiredMessage = (action: string) =>
    `Backend API is required to ${action}. This deployment no longer supports standalone demo data.`;
  const ensureStandaloneModeEnabled = (action: string) => {
    throw new Error(backendRequiredMessage(action));
  };
  const systemSetup: SystemSetupStatus = (() => {
    if (!usingBackendApi) {
      return {
        checked: true,
        backendEnabled: false,
        storageMode: 'unknown',
        dbEnabled: false,
        dbReachable: false,
        dbError: 'Backend API is disabled for this deployment.',
        missingTables: [],
        needsCourts: false,
        needsPlans: false,
        setupRequired: true,
        ready: false,
      };
    }

    const storageMode =
      backendHealth?.storage?.mode === 'memory' || backendHealth?.storage?.mode === 'supabase'
        ? backendHealth.storage.mode
        : 'unknown';
    const missingTables = Array.isArray(backendHealth?.db?.missingTables)
      ? backendHealth!.db!.missingTables!.map((item) => String(item))
      : [];
    const dbEnabled = Boolean(backendHealth?.db?.enabled);
    const dbReachable = Boolean(backendHealth?.db?.reachable);
    const hasBlockingDbIssue = storageMode === 'supabase' && (!dbEnabled || !dbReachable || missingTables.length > 0);
    const needsCourts = storageMode === 'supabase' && dbReachable && missingTables.length === 0 && courts.length === 0;
    const needsPlans = storageMode === 'supabase' && dbReachable && missingTables.length === 0 && memberships.length === 0;
    const setupRequired = hasBlockingDbIssue || needsCourts || needsPlans;

    return {
      checked: backendHealth != null,
      backendEnabled: true,
      storageMode,
      dbEnabled,
      dbReachable,
      dbError: backendHealth?.db?.error ? String(backendHealth.db.error) : undefined,
      missingTables,
      needsCourts,
      needsPlans,
      setupRequired,
      ready: !setupRequired,
    };
  })();

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const mapBackendSubscription = (subscription: any): UserSubscription => {
    const membershipId = String(subscription?.planId || subscription?.membership_id || '');
    const createdAt = String(subscription?.createdAt || subscription?.created_at || new Date().toISOString());
    const status = String(subscription?.status || 'active');
    const plan = memberships.find((m) => m.id === membershipId);
    const start = new Date(createdAt);
    const end = new Date(start);
    if (plan?.interval === 'year') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    if (status !== 'active' && subscription?.cancelledAt) {
      return {
        id: String(subscription?.id || ''),
        user_id: String(subscription?.userId || subscription?.user_id || currentUser?.id || ''),
        membership_id: membershipId,
        status,
        start_date: start.toISOString(),
        end_date: new Date(subscription.cancelledAt).toISOString(),
        amount_paid: Number(plan?.price || 0),
        created_at: createdAt,
      };
    }
    return {
      id: String(subscription?.id || ''),
      user_id: String(subscription?.userId || subscription?.user_id || currentUser?.id || ''),
      membership_id: membershipId,
      status,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      amount_paid: Number(plan?.price || 0),
      created_at: createdAt,
    };
  };

  const hydrateBackendData = useCallback(
    async (user: User) => {
      if (!usingBackendApi) return;
      try {
        const readPendingPaymentBookingIds = (): string[] => {
          try {
            const raw = sessionStorage.getItem('ventra_payment_pending_booking_ids');
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.map((id) => String(id)) : [];
          } catch {
            return [];
          }
        };
        const isPendingPaymentWindowActive = () => {
          try {
            const startedAt = Number(sessionStorage.getItem('ventra_payment_pending_started_at') || 0);
            const pendingIds = readPendingPaymentBookingIds();
            if (!pendingIds.length) return false;
            // Keep a generous window while checkout is pending.
            if (!startedAt) return true;
            return Date.now() - startedAt < 30 * 60 * 1000;
          } catch {
            return false;
          }
        };

        const preserveDuringRecentPayment = () => {
          try {
            const ts = Number(sessionStorage.getItem('ventra_recent_payment_flow') || 0);
            const recent = Boolean(ts && Date.now() - ts < 15_000);
            return recent || isPendingPaymentWindowActive();
          } catch {
            return isPendingPaymentWindowActive();
          }
        };
        const preferNonEmptyArray = <T,>(prev: T[], next: T[]) => {
          if (next.length > 0) return next;
          if (prev.length > 0 && preserveDuringRecentPayment()) return prev;
          return next;
        };
        const preferPopulatedObject = <T extends Record<string, any>>(prev: T, next: T) => {
          if (next && Object.keys(next).length > 0) return next;
          if (prev && Object.keys(prev).length > 0 && preserveDuringRecentPayment()) return prev;
          return next;
        };
        const mergeWithGrace = <T extends { id: string; createdAt?: Date }>(
          prev: T[],
          next: T[],
          options: { graceMs: number },
        ) => {
          if (!prev.length) return next;
          if (!next.length) {
            return preserveDuringRecentPayment() ? prev : next;
          }
          const nextById = new Map(next.map((item) => [item.id, item]));
          const now = Date.now();
          const keptPrev = prev.filter((item) => {
            if (nextById.has(item.id)) return false;
            const createdAt = item.createdAt instanceof Date ? item.createdAt.getTime() : 0;
            return createdAt > 0 && now - createdAt < options.graceMs;
          });
          return keptPrev.length ? [...next, ...keptPrev] : next;
        };

        const [nextUsers, nextCourts, nextBookings, nextPlans, nextNotifications, nextConfig, health, unreadCount] = await Promise.all([
          backendApi.getUsers(user.role),
          backendApi.getCourts(),
          backendApi.getBookings(),
          backendApi.getPlans(),
          backendApi.getNotifications(),
          backendApi.getConfig(),
          backendApi.getHealth().catch(() => null),
          backendApi.getUnreadNotificationsCount().catch(() => null),
        ]);

        // If the checkout has completed (or the booking is gone), clear the pending window.
        try {
          const pendingIds = readPendingPaymentBookingIds();
          if (pendingIds.length) {
            const byId = new Map(nextBookings.map((b) => [b.id, b]));
            const allResolved = pendingIds.every((id) => {
              const booking = byId.get(id);
              if (!booking) return true;
              const paymentStatus = String((booking as any)?.paymentStatus || '').toLowerCase();
              const status = String((booking as any)?.status || '').toLowerCase();
              if (status === 'cancelled' || status === 'completed' || status === 'no_show') return true;
              return paymentStatus === 'paid';
            });
            if (allResolved) {
              sessionStorage.removeItem('ventra_payment_pending_booking_ids');
              sessionStorage.removeItem('ventra_payment_pending_started_at');
            }
          }
        } catch {
          // Ignore.
        }

        setUsers((prev) => preferNonEmptyArray(prev, nextUsers));
        setCourts((prev) => preferNonEmptyArray(prev, nextCourts));
        setBookings((prev) => mergeWithGrace(prev, nextBookings, { graceMs: 2 * 60 * 1000 }));
        setMemberships((prev) => preferNonEmptyArray(prev, nextPlans));
        setNotifications((prev) => mergeWithGrace(prev, nextNotifications, { graceMs: 2 * 60 * 1000 }));
        setConfig((prev) => preferPopulatedObject(prev, nextConfig));
        if (health) setBackendHealth(health);
        if (typeof unreadCount === 'number') {
          setBackendUnreadNotificationCount((prev) => {
            if (preserveDuringRecentPayment() && unreadCount === 0 && typeof prev === 'number' && prev > 0) {
              return prev;
            }
            return unreadCount;
          });
        } else {
          setBackendUnreadNotificationCount((prev) => {
            const nextUnread = nextNotifications.filter((n) => n.userId === user.id && !n.read).length;
            if (preserveDuringRecentPayment() && nextUnread === 0 && typeof prev === 'number' && prev > 0) {
              return prev;
            }
            return nextUnread;
          });
        }
      } catch (error) {
        console.error('Failed to hydrate backend data:', error);
      }
    },
    [usingBackendApi]
  );

  const upsertAndSetCurrentUser = useCallback(
    (email: string, role: string = 'player', profile: Partial<User> = {}) => {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail) return;

      const snapshot = usersRef.current;
      const existing = snapshot.find((u) => String(u.email || '').trim().toLowerCase() === normalizedEmail);
      if (existing) {
        const updatedExisting: User = {
          ...existing,
          ...profile,
          email: normalizedEmail,
          role: (profile.role || existing.role || role) as User['role'],
          status: (profile.status || existing.status || 'active') as User['status'],
        };
        const updatedUsers = snapshot.map((u) => (u.id === existing.id ? updatedExisting : u));
        usersRef.current = updatedUsers;
        setUsers(updatedUsers);
        persist(STORAGE_KEYS.USERS, updatedUsers);
        setCurrentUser(updatedExisting);
        localStorage.setItem('currentUser', JSON.stringify(updatedExisting));
        return;
      }

      const newUser: User = {
        id: Math.random().toString(36).substr(2, 9),
        email: normalizedEmail,
        name: profile.name || normalizedEmail.split('@')[0],
        role: (profile.role || role) as any,
        status: (profile.status || 'active') as User['status'],
        avatar: profile.avatar || '',
        phone: profile.phone || '',
        skillLevel: profile.skillLevel || 'beginner',
        coachProfile: profile.coachProfile,
        coachExpertise: profile.coachExpertise,
        coachVerificationStatus: profile.coachVerificationStatus || (role === 'coach' ? 'unverified' : undefined),
        coachVerificationMethod: profile.coachVerificationMethod,
        coachVerificationDocumentName: profile.coachVerificationDocumentName,
        coachVerificationId: profile.coachVerificationId,
        coachVerificationNotes: profile.coachVerificationNotes,
        coachVerificationSubmittedAt: profile.coachVerificationSubmittedAt,
        createdAt: new Date(),
      };

      const updatedUsers = [...snapshot, newUser];
      usersRef.current = updatedUsers;
      setUsers(updatedUsers);
      persist(STORAGE_KEYS.USERS, updatedUsers);
      setCurrentUser(newUser);
      localStorage.setItem('currentUser', JSON.stringify(newUser));
    },
    []
  );

  const syncSupabaseUser = useCallback(
    async (authUser: any, fallbackRole?: string) => {
      const email = String(authUser?.email || '').trim().toLowerCase();
      if (!email) return;

      const metadata = authUser?.user_metadata || {};
      const storedFlow = String(localStorage.getItem(STORAGE_KEYS.OAUTH_FLOW) || '').toLowerCase();
      const storedOauthRole = String(localStorage.getItem(STORAGE_KEYS.OAUTH_ROLE) || '').toLowerCase();
      const existingUser = usersRef.current.find((u) => String(u.email || '').trim().toLowerCase() === email) || null;

      const normalizeRole = (value: unknown) => {
        const raw = String(value || '').trim().toLowerCase();
        return raw === 'admin' || raw === 'staff' || raw === 'coach' || raw === 'player' ? raw : '';
      };
      const normalizeStatus = (value: unknown) => {
        const raw = String(value || '').trim().toLowerCase();
        return raw === 'active' || raw === 'pending' ? raw : '';
      };
      const roleMatchesExpected = (actual: string, expected: string) => {
        if (expected === 'admin') return actual === 'admin' || actual === 'staff';
        return actual === expected;
      };

      const metadataRole = normalizeRole(metadata?.role);
      const metadataStatus = normalizeStatus(metadata?.status);
      const fallback = normalizeRole(fallbackRole);
      const existingRole = normalizeRole(existingUser?.role);
      const existingStatus = normalizeStatus(existingUser?.status);
      const expectedPortalRole = storedOauthRole === 'admin' || storedOauthRole === 'coach' || storedOauthRole === 'player' ? storedOauthRole : '';
      const actualKnownRole = metadataRole || existingRole;

      // Enforce that the OAuth portal role must match the actual account role.
      if (storedFlow === 'signin' && expectedPortalRole) {
        if (!actualKnownRole) {
          localStorage.setItem(
            'ventra_oauth_error',
            `No account is registered for this portal yet. Please create an account first.`,
          );
          localStorage.removeItem(STORAGE_KEYS.OAUTH_FLOW);
          localStorage.removeItem(STORAGE_KEYS.OAUTH_ROLE);
          void supabase.auth.signOut();
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
          return;
        }
        if (!roleMatchesExpected(actualKnownRole, expectedPortalRole)) {
          localStorage.setItem(
            'ventra_oauth_error',
            `This account is not ${expectedPortalRole === 'admin' ? 'an' : 'a'} ${expectedPortalRole} account.`,
          );
          localStorage.removeItem(STORAGE_KEYS.OAUTH_FLOW);
          localStorage.removeItem(STORAGE_KEYS.OAUTH_ROLE);
          void supabase.auth.signOut();
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
          return;
        }
      }

      // Prevent role escalation or cross-portal account creation during OAuth signup.
      // If this identity already belongs to a different role, stop and show a clear error
      // instead of silently reusing the old privileged role.
      if (storedFlow === 'signup' && expectedPortalRole) {
        if (actualKnownRole && !roleMatchesExpected(actualKnownRole, expectedPortalRole)) {
          localStorage.setItem(
            'ventra_oauth_error',
            `This email is already registered as ${actualKnownRole}. Please sign in using the correct portal.`,
          );
          localStorage.removeItem(STORAGE_KEYS.OAUTH_FLOW);
          localStorage.removeItem(STORAGE_KEYS.OAUTH_ROLE);
          void supabase.auth.signOut();
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
          return;
        }
      }

      // Pick a role without allowing "portal role" escalation.
      // For OAuth signup we only allow Player role assignment from the chosen portal.
      const resolvedRole =
        (storedFlow === 'signup' ? expectedPortalRole : '') ||
        metadataRole ||
        fallback ||
        existingRole ||
        'player';

      const resolvedStatus = (metadataStatus || existingStatus || (resolvedRole === 'coach' ? 'pending' : 'active')) as User['status'];

      if (resolvedRole === 'coach' && resolvedStatus === 'pending') {
        localStorage.setItem('ventra_oauth_error', 'Your coach account is awaiting approval.');
        localStorage.removeItem(STORAGE_KEYS.OAUTH_FLOW);
        localStorage.removeItem(STORAGE_KEYS.OAUTH_ROLE);
        void supabase.auth.signOut();
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
        return;
      }

      upsertAndSetCurrentUser(email, resolvedRole, {
        name: String(metadata?.name || metadata?.full_name || email.split('@')[0]).trim(),
        phone: String(metadata?.phone || '').trim(),
        avatar: String(metadata?.avatar_url || metadata?.picture || '').trim(),
        role: resolvedRole as User['role'],
        status: resolvedStatus,
      });
      const syncedUser = usersRef.current.find((u) => String(u.email || '').trim().toLowerCase() === email) || null;
      if (usingBackendApi && syncedUser) {
        const accessToken = String(authUser?.session?.access_token || authUser?.access_token || '').trim();
        if (accessToken) {
          backendApi.setSession({
            accessToken,
            refreshToken: String(authUser?.session?.refresh_token || authUser?.refresh_token || '').trim() || undefined,
            user: syncedUser,
          });
          await hydrateBackendData(syncedUser);
        }
      }
      if (localStorage.getItem(STORAGE_KEYS.OAUTH_FLOW) === 'signup') {
        localStorage.setItem(STORAGE_KEYS.OAUTH_CONFIRMATION_PENDING, email);
      }
      localStorage.removeItem(STORAGE_KEYS.OAUTH_FLOW);
      localStorage.removeItem(STORAGE_KEYS.OAUTH_ROLE);
    },
    [hydrateBackendData, upsertAndSetCurrentUser, usingBackendApi]
  );

  useEffect(() => {
    // Initialize backend-backed application state
    const initData = async () => {
      if (usingBackendApi) {
        try {
          const session = backendApi.getSession();
          if (session?.user) {
            setCurrentUser(session.user);
            localStorage.setItem('currentUser', JSON.stringify(session.user));
            const health = await backendApi.getHealth().catch(() => null);
            if (health) setBackendHealth(health);
            await hydrateBackendData(session.user);
          } else {
            const [nextCourts, nextPlans, nextConfig, health] = await Promise.all([
              backendApi.getCourts(),
              backendApi.getPlans(),
              backendApi.getConfig(),
              backendApi.getHealth().catch(() => null),
            ]);
            setCourts(nextCourts);
            setMemberships(nextPlans);
            setConfig(nextConfig);
            if (health) setBackendHealth(health);
          }
        } catch (error) {
          console.error('Backend API init failed:', error);
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
          setUsers([]);
          setCourts([]);
          setBookings([]);
          setMemberships([]);
          setBackendHealth(null);
          setUserSubscription(null);
          setSubscriptionHistory([]);
          setNotifications([]);
          setConfig(defaultConfig);
        }
        return;
      }

      console.error('Backend API is disabled for this deployment.');
      setCurrentUser(null);
      localStorage.removeItem('currentUser');
      setUsers([]);
      setCourts([]);
      setBookings([]);
      setMemberships([]);
      setBackendHealth(null);
      setUserSubscription(null);
      setSubscriptionHistory([]);
      setNotifications([]);
      setConfig(defaultConfig);
    };

    void initData().finally(() => {
      setBootstrapped(true);
    });
  }, [hydrateBackendData, usingBackendApi]);

  useEffect(() => {
    if (!usingBackendApi || !currentUser) return;
    hydrateBackendData(currentUser);
  }, [currentUser, hydrateBackendData, usingBackendApi]);

  useEffect(() => {
    if (!oauthEnabled) return;
    if (!usingBackendApi) return;
    const bootstrapOauthSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return;
      if (!isSupabaseEmailConfirmed(data.session.user)) {
        await supabase.auth.signOut();
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
        return;
      }
      await syncSupabaseUser({
        ...data.session.user,
        session: data.session,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    };

    void bootstrapOauthSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        backendApi.clearSession();
        setBackendUnreadNotificationCount(null);
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
        return;
      }
      if (!session?.user) return;
      if (!isSupabaseEmailConfirmed(session.user)) {
        void supabase.auth.signOut();
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
        return;
      }
      void syncSupabaseUser({
        ...session.user,
        session,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [oauthEnabled, syncSupabaseUser]);

  useEffect(() => {
    if (currentUser) {
      if (usingBackendApi) {
        backendApi
          .getSubscriptionsMe()
          .then((items) => {
            const mapped = items
              .map(mapBackendSubscription)
              .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
            setSubscriptionHistory(mapped);
            const active = mapped.find((s) => s.status === 'active' && new Date(s.end_date) > new Date());
            setUserSubscription(active || null);
          })
          .catch((error) => {
            console.error('Failed to load subscriptions from backend:', error);
            setSubscriptionHistory([]);
            setUserSubscription(null);
          });
        return;
      }
      setUserSubscription(null);
      setSubscriptionHistory([]);
    } else {
      setUserSubscription(null);
      setSubscriptionHistory([]);
    }
  }, [currentUser, memberships, usingBackendApi]);

  // Helper to save data
  const persist = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const login = async (
    email: string,
    password: string,
    expectedRole?: User['role']
  ): Promise<{ success: boolean; message?: string }> => {
    const roleMatchesExpected = (actual: User['role'], expected: User['role']) => {
      if (expected === 'admin') return actual === 'admin' || actual === 'staff';
      return actual === expected;
    };
    const makeRoleMismatchMessage = (role: User['role']) => {
      const article = role === 'admin' ? 'an' : 'a';
      return `This account is not ${article} ${role} account.`;
    };
    if (!usingBackendApi) {
      return { success: false, message: backendRequiredMessage('sign in') };
    }
    try {
      const user = await backendApi.login(email, password, expectedRole);
      if (expectedRole && !roleMatchesExpected(user.role, expectedRole)) {
        backendApi.clearSession();
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
        return { success: false, message: makeRoleMismatchMessage(expectedRole) };
      }
      setCurrentUser(user);
      localStorage.setItem('currentUser', JSON.stringify(user));
      await hydrateBackendData(user);
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Login failed.' };
    }
  };

  const signup = async (
    email: string,
    password: string,
    role: string = 'player',
    payload: SignupPayload = {}
  ): Promise<{ success: boolean; message?: string }> => {
    const requestedCoach = role.toLowerCase() === 'coach';
    if (!usingBackendApi) {
      return { success: false, message: backendRequiredMessage('sign up') };
    }
    try {
      const result = await backendApi.signup(email, password, role as User['role'], {
        name: payload.name,
        phone: payload.phone,
        coachProfile: payload.coachProfile,
        coachExpertise: payload.coachExpertise,
        verificationMethod: payload.verificationMethod,
        verificationDocumentName: payload.verificationDocumentName,
        verificationId: payload.verificationId,
        verificationNotes: payload.verificationNotes,
        adminCode: payload.adminCode,
      });

      const normalizedEmail = normalizeEmail(email);
      if (oauthEnabled && result?.emailConfirmationRequired) {
        const { error } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: getEmailLinkCallbackUrl(),
          },
        });

        if (error) {
          return {
            success: true,
            message:
              error.message ||
              (requestedCoach
                ? 'Coach account created, but we could not send the email link. Please contact the administrator.'
                : 'Account created, but we could not send the email link. Please try signing in again later.'),
          };
        }

        localStorage.setItem(STORAGE_KEYS.OAUTH_EMAIL_LINK_PENDING, normalizedEmail);
      }

      return {
        success: true,
        message: requestedCoach
          ? result?.emailConfirmationRequired
            ? 'Coach account created. We sent an email link to confirm your address. After confirming, an administrator still needs to approve your coach account before you can sign in.'
            : result?.message || 'Coach registration submitted. Wait for admin approval before signing in.'
          : result?.emailConfirmationRequired
            ? 'Account created. We sent an email link to your inbox so you can confirm your address and finish signing in.'
            : result?.message || 'Account created. Check your email to confirm your address before signing in.',
      };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Signup failed.' };
    }
  };

  const signInWithProvider = async (
    provider: 'google' | 'facebook',
    role: string = 'player',
    flow: 'signin' | 'signup' = 'signin'
  ): Promise<{ success: boolean; message?: string }> => {
    if (!usingBackendApi) {
      return { success: false, message: backendRequiredMessage(`continue with ${provider}`) };
    }
    if (!oauthEnabled) {
      return { success: false, message: 'Supabase auth is not enabled.' };
    }

    try {
      localStorage.setItem(STORAGE_KEYS.OAUTH_ROLE, role);
      localStorage.setItem(STORAGE_KEYS.OAUTH_FLOW, flow);
      if (flow === 'signin') {
        localStorage.removeItem(STORAGE_KEYS.OAUTH_CONFIRMATION_PENDING);
        localStorage.removeItem(STORAGE_KEYS.OAUTH_EMAIL_LINK_PENDING);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getAuthRedirectUrl(),
          scopes: provider === 'google' ? 'email profile' : 'email public_profile',
        },
      });

      if (error) {
        localStorage.removeItem(STORAGE_KEYS.OAUTH_FLOW);
        localStorage.removeItem(STORAGE_KEYS.OAUTH_ROLE);
        return { success: false, message: error.message };
      }

      return { success: true };
    } catch (error: any) {
      localStorage.removeItem(STORAGE_KEYS.OAUTH_FLOW);
      localStorage.removeItem(STORAGE_KEYS.OAUTH_ROLE);
      return { success: false, message: error?.message || 'Social sign-in failed' };
    }
  };

  const logout = async () => {
    backendApi.clearSession();
    setBackendUnreadNotificationCount(null);
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem(STORAGE_KEYS.OAUTH_FLOW);
    localStorage.removeItem(STORAGE_KEYS.OAUTH_ROLE);
    localStorage.removeItem(STORAGE_KEYS.OAUTH_CONFIRMATION_PENDING);
    localStorage.removeItem(STORAGE_KEYS.OAUTH_EMAIL_LINK_PENDING);
    localStorage.removeItem(STORAGE_KEYS.ACCOUNT_CREATED_NOTICE);

    const tasks: Promise<unknown>[] = [];
    if (usingBackendApi) {
      tasks.push(backendApi.logout().catch((error) => console.error('Backend logout failed:', error)));
    }
    if (oauthEnabled) {
      tasks.push(supabase.auth.signOut({ scope: 'local' as any }).catch((error) => console.error('Supabase logout failed:', error)));
    }
    if (tasks.length) {
      await Promise.allSettled(tasks);
    }
  };

  const addCourt = async (court: Omit<Court, 'id'>) => {
    if (usingBackendApi) {
      const created = await backendApi.addCourt(court);
      setCourts((prev) => [...prev, created]);
      return;
    }

    ensureStandaloneModeEnabled('add courts');
    const newCourt = { ...court, id: Math.random().toString(36).substr(2, 9) };
    const updatedCourts = [...courts, newCourt];
    setCourts(updatedCourts);
    persist(STORAGE_KEYS.COURTS, updatedCourts);
  };

  const updateCourt = async (id: string, updates: Partial<Court>) => {
    if (usingBackendApi) {
      const updated = await backendApi.updateCourt(id, updates);
      setCourts((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return;
    }

    ensureStandaloneModeEnabled('update courts');
    const updatedCourts = courts.map((c) => (c.id === id ? { ...c, ...updates } : c));
    setCourts(updatedCourts);
    persist(STORAGE_KEYS.COURTS, updatedCourts);
  };

  const deleteCourt = async (id: string) => {
    if (usingBackendApi) {
      await backendApi.deleteCourt(id);
      setCourts((prev) => prev.filter((c) => c.id !== id));
      return;
    }

    ensureStandaloneModeEnabled('delete courts');
    const updatedCourts = courts.filter((c) => c.id !== id);
    setCourts(updatedCourts);
    persist(STORAGE_KEYS.COURTS, updatedCourts);
  };

  const createBooking = async (booking: Omit<Booking, 'id' | 'createdAt'>): Promise<string> => {
    if (usingBackendApi) {
      const created = await backendApi.createBooking(booking);
      setBookings((prev) => [...prev, created]);
      if (currentUser) await hydrateBackendData(currentUser);
      return created.id;
    }

    ensureStandaloneModeEnabled('create bookings');
    await new Promise(resolve => setTimeout(resolve, 500));
    const bookingData = {
      ...booking,
      status: booking.status || 'pending',
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      // Ensure date is stored as ISO string
      date: booking.date instanceof Date ? booking.date.toISOString() : booking.date,
    };

    const newBooking = {
      ...bookingData,
      date: new Date(bookingData.date),
      createdAt: new Date(bookingData.createdAt),
    };
    
    const updatedBookings = [...bookings, newBooking];
    setBookings(updatedBookings);
    persist(STORAGE_KEYS.BOOKINGS, updatedBookings);

    // Generate Notifications based on roles
    const newNotifications: any[] = [];

    // 1. Notify the user who booked (Player)
    newNotifications.push({
      id: Math.random().toString(36).substr(2, 9),
      userId: bookingData.userId,
      title: 'Booking Request Sent',
      message: `Your booking request for ${format(new Date(bookingData.date), 'MMM dd')} at ${bookingData.startTime} is pending approval.`,
      type: 'info',
      read: false,
      createdAt: new Date(),
    });

    // 2. Notify Admins and Staff
    users.forEach((u) => {
      if ((u.role === 'admin' || u.role === 'staff') && u.id !== bookingData.userId) {
        newNotifications.push({
          id: Math.random().toString(36).substr(2, 9),
          userId: u.id,
          title: 'New Booking Request',
          message: `New booking request received for ${format(new Date(bookingData.date), 'MMM dd')} at ${bookingData.startTime}.`,
          type: 'info',
          read: false,
          createdAt: new Date(),
        });
      }
    });

    setNotifications((prev) => [...newNotifications, ...prev]);
    return bookingData.id;
  };

  const cancelBooking = async (id: string, reason?: string) => {
    if (usingBackendApi) {
      const updated = await backendApi.transitionBookingStatus(id, {
        status: 'cancelled',
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      });
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
      if (currentUser) await hydrateBackendData(currentUser);
      return;
    }

    ensureStandaloneModeEnabled('cancel bookings');
    let booking: Booking | undefined;
    setBookings((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (index < 0) return prev;
      booking = prev[index];
      const updatedBookings = [...prev];
      updatedBookings[index] = { ...updatedBookings[index], status: 'cancelled' as const };
      persist(STORAGE_KEYS.BOOKINGS, updatedBookings);
      return updatedBookings;
    });

    if (booking) {
      const newNotifications: any[] = [];

      // 1. Notify the user (Player)
      newNotifications.push({
        id: Math.random().toString(36).substr(2, 9),
        userId: booking.userId,
        title: 'Session Cancelled',
        message: `Your session on ${format(booking.date, 'MMM dd')} at ${booking.startTime} has been cancelled.`,
        type: 'warning',
        read: false,
        createdAt: new Date(),
      });

      // 2. Notify Admins and Staff
      users.forEach((u) => {
        if ((u.role === 'admin' || u.role === 'staff') && u.id !== booking.userId) {
          newNotifications.push({
            id: Math.random().toString(36).substr(2, 9),
            userId: u.id,
            title: 'Booking Cancelled',
            message: `Booking on ${format(booking.date, 'MMM dd')} has been cancelled.`,
            type: 'warning',
            read: false,
            createdAt: new Date(),
          });
        }
      });

      setNotifications((prev) => [...newNotifications, ...prev]);
    }
  };

  const confirmBooking = async (id: string) => {
    if (usingBackendApi) {
      const transitioned = await backendApi.transitionBookingStatus(id, { status: 'confirmed' });
      let finalized = transitioned;
      const paymentStatus = String(transitioned?.paymentStatus || '').toLowerCase();
      if (paymentStatus && paymentStatus !== 'paid') {
        try {
          finalized = await backendApi.setBookingPaymentDeadline(id, { ttlMinutes: 30 });
        } catch (deadlineError) {
          console.warn('Failed to set payment deadline after booking approval:', deadlineError);
        }
      }
      setBookings((prev) => prev.map((b) => (b.id === id ? finalized : b)));
      if (currentUser) await hydrateBackendData(currentUser);
      return;
    }

    ensureStandaloneModeEnabled('confirm bookings');
    let booking: Booking | undefined;
    setBookings((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (index < 0) return prev;
      booking = prev[index];
      const updatedBookings = [...prev];
      updatedBookings[index] = { ...updatedBookings[index], status: 'confirmed' as const };
      persist(STORAGE_KEYS.BOOKINGS, updatedBookings);
      return updatedBookings;
    });
    if (!booking) return;

    // Notify the user
    const notification: any = {
      id: Math.random().toString(36).substr(2, 9),
      userId: booking.userId,
      title: 'Booking Approved',
      message: `Your booking for ${format(booking.date, 'MMM dd')} at ${booking.startTime} has been approved.`,
      type: 'success',
      read: false,
      createdAt: new Date(),
    };
    setNotifications((prev) => [notification, ...prev]);
  };

  const updateBooking = async (id: string, updates: Partial<Booking>) => {
    if (usingBackendApi) {
      const updated = await backendApi.updateBooking(id, updates);
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
      return;
    }

    ensureStandaloneModeEnabled('update bookings');
    const updatedBookings = bookings.map((b) => (b.id === id ? { ...b, ...updates } : b));
    setBookings(updatedBookings);
    persist(STORAGE_KEYS.BOOKINGS, updatedBookings);
  };

  const checkInBooking = async (id: string) => {
    if (usingBackendApi) {
      const updated = await backendApi.checkInBooking(id);
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
      return;
    }

    ensureStandaloneModeEnabled('check in bookings');
    const now = new Date();
    const updatedBookings = bookings.map((b) =>
      b.id === id ? { ...b, checkedIn: true, checkedInAt: now } : b
    );
    setBookings(updatedBookings);
    persist(STORAGE_KEYS.BOOKINGS, updatedBookings);
  };

  const markStudentAttendance = async (bookingId: string, studentId: string, attended: boolean) => {
    if (usingBackendApi) {
      const updated = await backendApi.markStudentAttendance(bookingId, studentId, attended);
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)));
      return;
    }

    ensureStandaloneModeEnabled('mark attendance');
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const newAttendance = { ...(booking.playerAttendance || {}), [studentId]: attended };
    const updatedBookings = bookings.map(b => b.id === bookingId ? { ...b, playerAttendance: newAttendance } : b);
    setBookings(updatedBookings);
    persist(STORAGE_KEYS.BOOKINGS, updatedBookings);
  };

  const getCoachEligibleStudents = async (filters: { sport?: string; courtId?: string } = {}): Promise<User[]> => {
    if (usingBackendApi) {
      const rows = await backendApi.getCoachEligibleStudents(filters);
      return rows.map((item) => item.player);
    }
    ensureStandaloneModeEnabled('load eligible students');
    return [];
  };

  const createCoachSession = async (payload: {
    courtId: string;
    date: Date;
    startTime: string;
    endTime: string;
    duration: number;
    maxPlayers: number;
    notes?: string;
    amount?: number;
    sport?: string;
  }): Promise<string> => {
    if (!currentUser) throw new Error('Must be logged in to create a coach session.');
    if (usingBackendApi) {
      const created = await backendApi.createCoachSession({
        ...payload,
        amount: payload.amount ?? 0,
      });
      setBookings((prev) => {
        const withoutExisting = prev.filter((b) => b.id !== created.id);
        return [created, ...withoutExisting];
      });
      if (currentUser) await hydrateBackendData(currentUser);
      return created.id;
    }

    ensureStandaloneModeEnabled('create coach sessions');
    return await createBooking({
      courtId: payload.courtId,
      userId: currentUser.id,
      type: 'training',
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
      duration: payload.duration,
      status: 'confirmed',
      paymentStatus: 'paid',
      amount: payload.amount ?? 0,
      players: [],
      maxPlayers: payload.maxPlayers,
      coachId: currentUser.id,
      notes: payload.notes,
      checkedIn: false,
    });
  };

  const deleteCoachSession = async (id: string) => {
    if (usingBackendApi) {
      await backendApi.deleteCoachSession(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
      if (currentUser) await hydrateBackendData(currentUser);
      return;
    }

    ensureStandaloneModeEnabled('delete coach sessions');
    await cancelBooking(id);
  };

  const toTimeMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const getAvailableSlots = useCallback(
    async (courtId: string, date: Date, bookingType: BookingType = 'private'): Promise<string[]> => {
      if (usingBackendApi) {
        return await backendApi.getAvailableSlots(courtId, date, bookingType);
      }

      ensureStandaloneModeEnabled('load available slots');
      const court = courts.find((c) => c.id === courtId);
      if (!court) return [];

      const slots: string[] = [];
      const [startHour, startMin] = court.operatingHours.start.split(':').map(Number);
      const [endHour, endMin] = court.operatingHours.end.split(':').map(Number);

      let currentHour = startHour;
      let currentMin = startMin;

      while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
        const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

        // Find all active bookings that overlap this slot
        const slotStartMinutes = toTimeMinutes(timeStr);
        const slotEndMinutes = slotStartMinutes + config.bookingInterval;
        const slotBookings = bookings.filter(
          (b) =>
            b.courtId === courtId &&
            isSameDay(b.date, date) &&
            b.status !== 'cancelled' &&
            toTimeMinutes(b.startTime) < slotEndMinutes &&
            toTimeMinutes(b.endTime) > slotStartMinutes
        );

        let isAvailable = true;

        if (slotBookings.length > 0) {
          // If any private/training booking exists, slot is blocked
          const hasExclusiveBooking = slotBookings.some((b) => b.type === 'private' || b.type === 'training');

          if (hasExclusiveBooking) {
            isAvailable = false;
          } else if (bookingType === 'private' || bookingType === 'training') {
            // Cannot book private if any open play exists
            isAvailable = false;
          } else {
            // Requesting open play, check capacity (default 4 for now)
            const totalPlayers = slotBookings.reduce((acc, b) => acc + 1 + (b.players?.length || 0), 0);
            if (totalPlayers >= 4) isAvailable = false;
          }
        }

        if (isAvailable) {
          slots.push(timeStr);
        }

        currentMin += config.bookingInterval;
        if (currentMin >= 60) {
          currentHour += 1;
          currentMin -= 60;
        }
      }

      return slots;
    },
    [bookings, config.bookingInterval, courts, usingBackendApi]
  );

  const getBookingAnalytics = async (startDate: Date, endDate: Date): Promise<BookingAnalytics> => {
    if (usingBackendApi) {
      return await backendApi.getBookingAnalytics(startDate, endDate);
    }

    ensureStandaloneModeEnabled('load booking analytics');
    const filtered = bookings.filter(
      (b) => b.date >= startDate && b.date <= endDate
    );

    const totalBookings = filtered.length;
    const completedBookings = filtered.filter((b) => b.status === 'completed').length;
    const cancelledBookings = filtered.filter((b) => b.status === 'cancelled').length;
    const noShows = filtered.filter((b) => b.status === 'no_show').length;
    const totalRevenue = filtered.reduce((sum, b) => sum + b.amount, 0);

    return {
      totalBookings,
      completedBookings,
      cancelledBookings,
      noShows,
      noShowRate: totalBookings > 0 ? (noShows / totalBookings) * 100 : 0,
      totalRevenue,
      averageBookingValue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
    };
  };

  const getCourtUtilization = async (
    courtId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CourtUtilization[]> => {
    if (usingBackendApi) {
      return await backendApi.getCourtUtilization(courtId, startDate, endDate);
    }

    ensureStandaloneModeEnabled('load court utilization');
    const results: CourtUtilization[] = [];
    let currentDate = startDate;

    while (currentDate <= endDate) {
      const dayBookings = bookings.filter(
        (b) =>
          b.courtId === courtId &&
          isSameDay(b.date, currentDate) &&
          b.status !== 'cancelled'
      );

      const hoursBooked = dayBookings.reduce((sum, b) => sum + b.duration / 60, 0);
      const revenue = dayBookings.reduce((sum, b) => sum + b.amount, 0);

      const court = courts.find((c) => c.id === courtId);
      const hoursAvailable = court ? 14 : 0; // Assuming 14 hour day

      results.push({
        courtId,
        date: currentDate,
        hoursBooked,
        hoursAvailable,
        utilizationRate: hoursAvailable > 0 ? (hoursBooked / hoursAvailable) * 100 : 0,
        revenue,
      });

      currentDate = addDays(currentDate, 1);
    }

    return results;
  };

  const updateConfig = async (updates: Partial<FacilityConfig>) => {
    if (usingBackendApi) {
      const saved = await backendApi.updateConfig(updates);
      setConfig(saved);
      return;
    }
    ensureStandaloneModeEnabled('update facility settings');
    const nextConfig = { ...config, ...updates };
    setConfig(nextConfig);
    persist(STORAGE_KEYS.CONFIG, nextConfig);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!currentUser) return;

    if (usingBackendApi) {
      const updatedUser = await backendApi.updateMe(updates);
      const updatedUsers = users.map((u) => (u.id === updatedUser.id ? updatedUser : u));
      setCurrentUser(updatedUser);
      setUsers(updatedUsers);
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      return;
    }
    
    ensureStandaloneModeEnabled('update your profile');
    const updatedUser = { ...currentUser, ...updates };
    const updatedUsers = users.map(u => u.id === currentUser.id ? updatedUser : u);
    setCurrentUser(updatedUser);
    setUsers(updatedUsers);
    
    // Persist to local storage so it survives refresh
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    persist(STORAGE_KEYS.USERS, updatedUsers);
  };

  const adminUpdateUser = async (id: string, updates: Partial<User>) => {
    if (usingBackendApi) {
      const updatedUser = await backendApi.adminUpdateUser(id, updates);
      setUsers((prev) => prev.map((u) => (u.id === id ? updatedUser : u)));
      if (currentUser?.id === id) {
        setCurrentUser(updatedUser);
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      }
      return;
    }

    ensureStandaloneModeEnabled('update users');
    const updatedUsers = users.map(u => u.id === id ? { ...u, ...updates } : u);
    setUsers(updatedUsers);
    persist(STORAGE_KEYS.USERS, updatedUsers);
  };

  const updateCoachProfile = async (updates: { avatar?: string; coachProfile?: string; coachExpertise?: string[] }) => {
    if (!currentUser || currentUser.role !== 'coach') return;

    if (usingBackendApi) {
      const updatedCoach = await backendApi.updateCoachProfile(updates);
      setUsers((prev) => prev.map((u) => (u.id === updatedCoach.id ? updatedCoach : u)));
      setCurrentUser(updatedCoach);
      localStorage.setItem('currentUser', JSON.stringify(updatedCoach));
      return;
    }

    ensureStandaloneModeEnabled('update coach profiles');
    await updateUser({
      avatar: updates.avatar,
      coachProfile: updates.coachProfile,
      coachExpertise: updates.coachExpertise,
    });
  };

  const submitCoachVerification = async (payload: {
    method: 'certification' | 'license' | 'experience' | 'other';
    documentName: string;
    verificationId?: string;
    notes?: string;
  }) => {
    if (!currentUser || (currentUser.role !== 'coach' && currentUser.role !== 'player')) return;

    if (usingBackendApi) {
      const updatedCoach = await backendApi.submitCoachVerification(payload);
      setUsers((prev) => prev.map((u) => (u.id === updatedCoach.id ? updatedCoach : u)));
      setCurrentUser(updatedCoach);
      localStorage.setItem('currentUser', JSON.stringify(updatedCoach));
      return;
    }

    ensureStandaloneModeEnabled('submit coach verification');
    await updateUser({
      coachVerificationMethod: payload.method,
      coachVerificationDocumentName: payload.documentName,
      coachVerificationId: payload.verificationId || '',
      coachVerificationNotes: payload.notes || '',
      coachVerificationStatus: 'pending',
      coachVerificationSubmittedAt: new Date().toISOString(),
    });
  };

  const getCoachVerificationQueue = async (
    filters: { status?: 'unverified' | 'pending' | 'verified' | 'rejected' } = {}
  ) => {
    if (usingBackendApi) {
      return await backendApi.getCoachVerificationQueue(filters);
    }
    ensureStandaloneModeEnabled('load the coach verification queue');
    const status = filters.status;
    const registrations: LocalCoachRegistration[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.COACH_REGISTRATIONS) || '[]');
    const registrationUsers: User[] = registrations.map((registration) => ({
      id: `coach-reg-${registration.id}`,
      email: registration.email,
      name: registration.name,
      phone: registration.phone || '',
      role: 'coach',
      status: registration.status === 'pending' ? 'pending' : 'active',
      skillLevel: 'beginner',
      coachProfile: registration.coachProfile,
      coachExpertise: registration.coachExpertise || [],
      coachVerificationStatus: registration.status === 'approved' ? 'verified' : registration.status,
      coachVerificationMethod: registration.verificationMethod,
      coachVerificationDocumentName: registration.verificationDocumentName,
      coachVerificationId: registration.verificationId,
      coachVerificationNotes: registration.reviewNote || registration.verificationNotes,
      coachVerificationSubmittedAt: registration.createdAt,
      createdAt: new Date(registration.createdAt),
    }));

    return [...users, ...registrationUsers]
      .filter(
        (u) =>
          u.role === 'coach' ||
          Boolean(u.coachVerificationStatus) ||
          Boolean(u.coachVerificationSubmittedAt) ||
          Boolean(u.coachVerificationMethod) ||
          Boolean(u.coachVerificationDocumentName)
      )
      .filter((u) => {
        if (!status) return true;
        const effectiveStatus =
          u.coachVerificationStatus || (u.role === 'coach' && u.status === 'pending' ? 'pending' : 'unverified');
        return effectiveStatus === status;
      })
      .sort(
        (a, b) =>
          new Date(b.coachVerificationSubmittedAt || b.createdAt).getTime() -
          new Date(a.coachVerificationSubmittedAt || a.createdAt).getTime()
      );
  };

  const approveCoachVerification = async (coachId: string, notes?: string) => {
    if (usingBackendApi) {
      const updatedCoach = await backendApi.approveCoachVerification(coachId, notes);
      setUsers((prev) => {
        const existsByUpdatedId = prev.some((u) => u.id === updatedCoach.id);
        const withoutSource = prev.filter((u) => u.id !== coachId);
        if (existsByUpdatedId) {
          return withoutSource.map((u) => (u.id === updatedCoach.id ? updatedCoach : u));
        }
        return [...withoutSource, updatedCoach];
      });
      if (currentUser?.id === coachId || currentUser?.id === updatedCoach.id) {
        setCurrentUser(updatedCoach);
        localStorage.setItem('currentUser', JSON.stringify(updatedCoach));
      }
      return;
    }

    ensureStandaloneModeEnabled('approve coach verification');
    if (coachId.startsWith('coach-reg-')) {
      const registrationId = coachId.slice('coach-reg-'.length);
      const registrations: LocalCoachRegistration[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.COACH_REGISTRATIONS) || '[]');
      const registration = registrations.find((item) => item.id === registrationId);
      if (!registration) return;
      const newCoach: User = {
        id: Math.random().toString(36).substr(2, 9),
        email: registration.email,
        name: registration.name,
        role: 'coach',
        status: 'active',
        avatar: '',
        phone: registration.phone || '',
        skillLevel: 'beginner',
        coachProfile: registration.coachProfile,
        coachExpertise: registration.coachExpertise || [],
        coachVerificationStatus: 'verified',
        coachVerificationMethod: registration.verificationMethod,
        coachVerificationDocumentName: registration.verificationDocumentName,
        coachVerificationId: registration.verificationId,
        coachVerificationNotes: notes?.trim() || registration.verificationNotes,
        coachVerificationSubmittedAt: registration.createdAt,
        createdAt: new Date(),
      };
      const updatedUsers = [...users, newCoach];
      setUsers(updatedUsers);
      persist(STORAGE_KEYS.USERS, updatedUsers);

      const auth = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTH) || '{}');
      auth[newCoach.email] = registration.password;
      persist(STORAGE_KEYS.AUTH, auth);

      const remaining = registrations.filter((item) => item.id !== registrationId);
      persist(STORAGE_KEYS.COACH_REGISTRATIONS, remaining);
      return;
    }

    const updatedUsers = users.map((u) =>
      u.id === coachId
        ? {
            ...u,
            role: 'coach' as const,
            status: 'active' as const,
            coachVerificationStatus: 'verified' as const,
            coachVerificationNotes: notes?.trim() || u.coachVerificationNotes,
          }
        : u
    );
    setUsers(updatedUsers);
    persist(STORAGE_KEYS.USERS, updatedUsers);
  };

  const rejectCoachVerification = async (coachId: string, reason?: string) => {
    if (usingBackendApi) {
      const updatedCoach = await backendApi.rejectCoachVerification(coachId, reason);
      setUsers((prev) => {
        if (!coachId.startsWith('coach-reg-')) {
          return prev.map((u) => (u.id === coachId ? updatedCoach : u));
        }
        return prev.filter((u) => u.id !== coachId);
      });
      if (currentUser?.id === coachId || currentUser?.id === updatedCoach.id) {
        setCurrentUser(updatedCoach);
        localStorage.setItem('currentUser', JSON.stringify(updatedCoach));
      }
      return;
    }

    ensureStandaloneModeEnabled('reject coach verification');
    if (coachId.startsWith('coach-reg-')) {
      const registrationId = coachId.slice('coach-reg-'.length);
      const registrations: LocalCoachRegistration[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.COACH_REGISTRATIONS) || '[]');
      const updatedRegistrations = registrations.map((item) =>
        item.id === registrationId
          ? {
              ...item,
              status: 'rejected' as const,
              reviewNote: reason?.trim() || item.reviewNote,
              updatedAt: new Date().toISOString(),
            }
          : item
      );
      persist(STORAGE_KEYS.COACH_REGISTRATIONS, updatedRegistrations);
      return;
    }

    const updatedUsers = users.map((u) =>
      u.id === coachId
        ? {
            ...u,
            role: u.role === 'admin' || u.role === 'staff' ? u.role : ('player' as const),
            status: 'active' as const,
            coachVerificationStatus: 'rejected' as const,
            coachVerificationNotes: reason?.trim() || u.coachVerificationNotes,
          }
        : u
    );
    setUsers(updatedUsers);
    persist(STORAGE_KEYS.USERS, updatedUsers);
  };

  const adminDeleteUser = async (id: string) => {
    if (usingBackendApi) {
      await backendApi.adminDeleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (currentUser?.id === id) {
        logout();
      }
      return;
    }

    ensureStandaloneModeEnabled('delete users');
    const updatedUsers = users.filter(u => u.id !== id);
    setUsers(updatedUsers);
    persist(STORAGE_KEYS.USERS, updatedUsers);
  };

  const addMembership = async (membership: Omit<MembershipPlan, 'id'>) => {
    if (usingBackendApi) {
      const created = await backendApi.addPlan(membership);
      setMemberships((prev) => [...prev, created]);
      return;
    }

    ensureStandaloneModeEnabled('add membership plans');
    const newPlan = { ...membership, id: Math.random().toString(36).substr(2, 9) };
    const updatedMemberships = [...memberships, newPlan];
    setMemberships(updatedMemberships);
    persist(STORAGE_KEYS.MEMBERSHIPS, updatedMemberships);
  };

  const updateMembership = async (id: string, updates: Partial<MembershipPlan>) => {
    if (usingBackendApi) {
      const updated = await backendApi.updatePlan(id, updates);
      setMemberships((prev) => prev.map((m) => (m.id === id ? updated : m)));
      return;
    }

    ensureStandaloneModeEnabled('update membership plans');
    const updatedMemberships = memberships.map((m) => (m.id === id ? { ...m, ...updates } : m));
    setMemberships(updatedMemberships);
    persist(STORAGE_KEYS.MEMBERSHIPS, updatedMemberships);
  };

  const deleteMembership = async (id: string) => {
    if (usingBackendApi) {
      await backendApi.deletePlan(id);
      setMemberships((prev) => prev.filter((m) => m.id !== id));
      return;
    }

    ensureStandaloneModeEnabled('delete membership plans');
    const updatedMemberships = memberships.filter((m) => m.id !== id);
    setMemberships(updatedMemberships);
    persist(STORAGE_KEYS.MEMBERSHIPS, updatedMemberships);
  };

  const subscribe = async (planId: string) => {
    if (!currentUser) throw new Error('You must be logged in to subscribe.');

    if (usingBackendApi) {
      const plan = memberships.find((m) => m.id === planId);
      if (!plan) throw new Error('Invalid plan selected.');
      const raw = await backendApi.subscribe(planId, 'card');
      const mapped = mapBackendSubscription(raw);
      setUserSubscription(mapped.status === 'active' ? mapped : null);
      setSubscriptionHistory((prev) => [mapped, ...prev]);
      return;
    }

    ensureStandaloneModeEnabled('create subscriptions');
    // 1. Simulate Payment Processing Delay (e.g., Stripe/PayPal)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const plan = memberships.find(m => m.id === planId);
    if (!plan) throw new Error('Invalid plan selected.');

    // 2. Calculate Subscription Period
    const startDate = new Date();
    const endDate = new Date();
    if (plan.interval === 'year') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // 3. Record Subscription in Database
    const newSub: UserSubscription = {
      id: Math.random().toString(36).substr(2, 9),
      user_id: currentUser.id,
      membership_id: planId,
      status: 'active',
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      amount_paid: plan.price,
      created_at: new Date().toISOString()
    };

    const allSubs = JSON.parse(localStorage.getItem(STORAGE_KEYS.SUBSCRIPTIONS) || '[]');
    persist(STORAGE_KEYS.SUBSCRIPTIONS, [...allSubs, newSub]);
    
    setUserSubscription(newSub);
    setSubscriptionHistory(prev => [newSub, ...prev]);
  };

  const cancelSubscription = async (subscriptionId: string) => {
    if (!currentUser) throw new Error('You must be logged in to cancel a subscription.');
    if (!subscriptionId) throw new Error('Subscription id is required.');

    if (usingBackendApi) {
      const updated = await backendApi.cancelSubscription(subscriptionId);
      const updatedId = String(updated?.id || subscriptionId);
      const updatedStatus = String(updated?.status || 'cancelled');
      const cancelledAt = String(updated?.cancelledAt || new Date().toISOString());

      setSubscriptionHistory((prev) =>
        prev.map((item) =>
          item.id === updatedId
            ? { ...item, status: updatedStatus, end_date: cancelledAt }
            : item
        )
      );
      setUserSubscription((prev) =>
        prev && prev.id === updatedId
          ? { ...prev, status: updatedStatus, end_date: cancelledAt }
          : prev
      );
      if (updatedStatus !== 'active') {
        setUserSubscription(null);
      }
      return;
    }

    ensureStandaloneModeEnabled('cancel subscriptions');
    const allSubs: UserSubscription[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.SUBSCRIPTIONS) || '[]');
    const cancelledAt = new Date().toISOString();
    const nextSubs = allSubs.map((item) =>
      item.id === subscriptionId ? { ...item, status: 'cancelled', end_date: cancelledAt } : item
    );
    persist(STORAGE_KEYS.SUBSCRIPTIONS, nextSubs);
    setSubscriptionHistory((prev) =>
      prev.map((item) =>
        item.id === subscriptionId ? { ...item, status: 'cancelled', end_date: cancelledAt } : item
      )
    );
    if (userSubscription?.id === subscriptionId) {
      setUserSubscription(null);
    }
  };

  const markAllNotificationsAsRead = async () => {
    if (usingBackendApi) {
      await backendApi.markAllNotificationsAsRead();
      setNotifications((prev) =>
        prev.map((n) => (n.userId === currentUser?.id ? { ...n, read: true } : n))
      );
      setBackendUnreadNotificationCount(0);
      return;
    }

    ensureStandaloneModeEnabled('mark notifications as read');
    if (currentUser) {
      setNotifications((prev) =>
        prev.map((n) => (n.userId === currentUser.id ? { ...n, read: true } : n))
      );
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    if (!notificationId) return;

    if (usingBackendApi) {
      await backendApi.markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      try {
        const unread = await backendApi.getUnreadNotificationsCount();
        setBackendUnreadNotificationCount(unread);
      } catch {
        setBackendUnreadNotificationCount((prev) => (prev == null ? prev : Math.max(0, prev - 1)));
      }
      return;
    }

    ensureStandaloneModeEnabled('mark notifications as read');
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; message?: string }> => {
    if (usingBackendApi) {
      try {
        const result = await backendApi.resetPassword(email);
        return {
          success: Boolean(result?.sent),
          message: result?.message || 'If an account exists, password reset instructions have been sent.',
        };
      } catch (error: any) {
        return { success: false, message: error?.message || 'Password reset request failed.' };
      }
    }
    return { success: false, message: backendRequiredMessage('reset passwords') };
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message?: string }> => {
    if (usingBackendApi) {
      try {
        const result = await backendApi.changePassword(currentPassword, newPassword);
        return {
          success: Boolean(result?.changed),
          message: 'Password changed successfully.',
        };
      } catch (error: any) {
        return { success: false, message: error?.message || 'Failed to change password.' };
      }
    }
    return { success: false, message: backendRequiredMessage('change passwords') };
  };

  const joinSession = async (bookingId: string) => {
    if (usingBackendApi) {
      if (!currentUser) throw new Error('Must be logged in to join a session');
      const updated = await backendApi.joinSession(bookingId);
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)));
      return;
    }

    ensureStandaloneModeEnabled('join sessions');
    if (!currentUser) throw new Error('Must be logged in to join a session');

    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) throw new Error('Session not found');

    const currentPlayers = booking.players || [];
    if (currentPlayers.includes(currentUser.id)) throw new Error('You have already joined this session');
    if (currentPlayers.length >= (booking.maxPlayers || 4)) throw new Error('Session is full');

    const updatedPlayers = [...currentPlayers, currentUser.id];

    const updatedBookings = bookings.map(b => b.id === bookingId ? { ...b, players: updatedPlayers } : b);
    setBookings(updatedBookings);
    persist(STORAGE_KEYS.BOOKINGS, updatedBookings);
      
    // Notify the session owner (e.g. Coach)
    const notification: any = {
      id: Math.random().toString(36).substr(2, 9),
      userId: booking.userId,
      title: 'New Player Joined',
      message: `${currentUser.name} has joined your session on ${format(booking.date, 'MMM dd')} at ${booking.startTime}.`,
      type: 'info',
      read: false,
      createdAt: new Date(),
    };
    setNotifications(prev => [notification, ...prev]);
  };

  const leaveSession = async (bookingId: string) => {
    if (!currentUser) throw new Error('Must be logged in to leave a session');

    if (usingBackendApi) {
      const updated = await backendApi.leaveSession(bookingId);
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)));
      return;
    }

    ensureStandaloneModeEnabled('leave sessions');
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) throw new Error('Session not found');
    if (!(booking.players || []).includes(currentUser.id)) {
      throw new Error('You are not enrolled in this session');
    }

    const updatedPlayers = (booking.players || []).filter((playerId) => playerId !== currentUser.id);
    const updatedBookings = bookings.map((b) => (b.id === bookingId ? { ...b, players: updatedPlayers } : b));
    setBookings(updatedBookings);
    persist(STORAGE_KEYS.BOOKINGS, updatedBookings);
  };

  return (
    <AppContext.Provider
      value={{
        bootstrapped,
        systemSetup,
        currentUser,
        users,
        courts,
        bookings,
        config,
        memberships,
        userSubscription,
        subscriptionHistory,
        notifications,
        unreadNotificationCount,
        login,
        signup,
        signInWithProvider,
        logout,
        addCourt,
        updateCourt,
        deleteCourt,
        createBooking,
        cancelBooking,
        confirmBooking,
        updateBooking,
        checkInBooking,
        getAvailableSlots,
        markStudentAttendance,
        getCoachEligibleStudents,
        createCoachSession,
        deleteCoachSession,
        getBookingAnalytics,
        getCourtUtilization,
        updateConfig,
        updateUser,
        updateCoachProfile,
        submitCoachVerification,
        getCoachVerificationQueue,
        approveCoachVerification,
        rejectCoachVerification,
        adminUpdateUser,
        adminDeleteUser,
        addMembership,
        updateMembership,
        deleteMembership,
        subscribe,
        cancelSubscription,
        markAllNotificationsAsRead,
        markNotificationAsRead,
        resetPassword,
        changePassword,
        joinSession,
        leaveSession,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
