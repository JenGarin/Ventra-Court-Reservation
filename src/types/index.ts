// User & Authentication Types
export type UserRole = 'admin' | 'staff' | 'coach' | 'player';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  skillLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  coachProfile?: string;
  coachExpertise?: string[];
  coachVerificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
  coachVerificationMethod?: 'certification' | 'license' | 'experience' | 'other';
  coachVerificationDocumentName?: string;
  coachVerificationId?: string;
  coachVerificationNotes?: string;
  coachVerificationSubmittedAt?: string;
  avatar?: string;
  membershipId?: string;
  createdAt: Date;
}

// Court Management Types
export type CourtType = 'indoor' | 'outdoor';
export type SurfaceType = 'hardcourt' | 'clay' | 'grass' | 'synthetic';
export type CourtStatus = 'active' | 'maintenance' | 'disabled';

export interface Court {
  id: string;
  name: string;
  courtNumber: string;
  type: CourtType;
  surfaceType: SurfaceType;
  hourlyRate: number;
  peakHourRate?: number;
  status: CourtStatus;
  operatingHours: {
    start: string;
    end: string;
  };
}

// Booking Types
export type BookingType = 'open_play' | 'private' | 'training';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface Booking {
  id: string;
  courtId: string;
  userId: string;
  type: BookingType;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number; // in minutes
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  players?: string[]; // user IDs for open play
  maxPlayers?: number; // for open play
  coachId?: string; // for training sessions
  discountCode?: string;
  checkedIn: boolean;
  checkedInAt?: Date;
  createdAt: Date;
  notes?: string;
  playerAttendance?: Record<string, boolean>;
}

// Facility Configuration
export interface FacilityConfig {
  openingTime: string;
  closingTime: string;
  bookingInterval: number; // in minutes (30 or 60)
  bufferTime: number; // minutes between bookings
  maxBookingDuration: number; // max minutes per booking
  advanceBookingDays: number; // how many days ahead can book
  cancellationCutoffHours: number; // hours before booking
  peakHours: {
    start: string;
    end: string;
  }[];
}

// Membership Types
export type MembershipTier = 'basic' | 'premium' | 'elite';

export interface MembershipPlan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  description: string;
  features: string[];
  tier: MembershipTier;
}

export interface UserMembership {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'expired';
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
}

// Analytics & Reports
export interface CourtUtilization {
  courtId: string;
  date: Date;
  hoursBooked: number;
  hoursAvailable: number;
  utilizationRate: number;
  revenue: number;
}

export interface BookingAnalytics {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  noShows: number;
  noShowRate: number;
  totalRevenue: number;
  averageBookingValue: number;
}

// Notification Types
export type NotificationType =
  | 'booking_confirmation'
  | 'reminder'
  | 'cancellation'
  | 'admin_alert'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

// Audit Log
export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  changes: Record<string, any>;
  timestamp: Date;
}
