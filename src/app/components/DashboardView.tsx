import React from 'react';
import {
  TrendingUp,
  Users,
  Calendar,
  PhilippinePeso,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ClipboardList,
  ScanLine,
  Building2,
  CalendarDays,
  ShieldUser,
  Sparkles,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isSameDay } from 'date-fns';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getChangeTag(value: number) {
  if (value >= 0) return { text: `+${value}%`, positive: true };
  return { text: `${value}%`, positive: false };
}

type ScheduleTab = 'daily' | 'active' | 'upcoming';

const SPORT_BY_COURT_ID: Record<string, string> = {
  c1: 'Basketball',
  c2: 'Tennis',
  c3: 'Pickle Ball',
};

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export function DashboardView() {
  const { bookings, courts, users, config, systemSetup } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [scheduleTab, setScheduleTab] = React.useState<ScheduleTab>('daily');
  const [selectedDate, setSelectedDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));

  const totalRevenue = bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const activeBookingsCount = bookings.filter((b) => b.status === 'confirmed' && new Date(b.date) >= new Date()).length;
  const totalPlayers = users.filter((u) => u.role === 'player').length;

  const [openH, openM] = config.openingTime.split(':').map(Number);
  const [closeH, closeM] = config.closingTime.split(':').map(Number);
  const minutesPerDay = closeH * 60 + closeM - (openH * 60 + openM);
  const totalBookedMinutes = bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + (b.duration || 0), 0);
  const maxBookableMinutes = Math.max(1, minutesPerDay * courts.length);
  const avgUtilization = Math.min(100, Math.round((totalBookedMinutes / maxBookableMinutes) * 100));

  const stats = [
    {
      title: 'Total Revenue',
      value: `₱${totalRevenue.toLocaleString()}`,
      change: getChangeTag(12.5),
      icon: PhilippinePeso,
    },
    {
      title: 'Active Bookings',
      value: activeBookingsCount.toString(),
      change: getChangeTag(8.2),
      icon: Calendar,
    },
    {
      title: 'Court Utilization',
      value: `${avgUtilization}%`,
      change: getChangeTag(-2.4),
      icon: TrendingUp,
    },
    {
      title: 'Total Players',
      value: totalPlayers.toString(),
      change: getChangeTag(15.3),
      icon: Users,
    },
  ];

  const today = new Date();
  const pendingRequests = bookings
    .filter((b) => b.status === 'pending')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const todayBookings = bookings.filter((b) => isSameDay(new Date(b.date), today) && b.status !== 'cancelled');
  const checkedInToday = todayBookings.filter((b) => b.checkedIn).length;
  const maintenanceCourts = courts.filter((c) => c.status === 'maintenance').length;
  const openCourts = courts.filter((c) => c.status === 'active').length;

  const upcomingBookings = bookings
    .filter((b) => new Date(b.date) >= new Date() && b.status !== 'cancelled')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5)
    .map((b) => {
      const court = courts.find((c) => c.id === b.courtId);
      const user = users.find((u) => u.id === b.userId);
      return {
        id: b.id,
        player: user?.name || 'Unknown',
        court: court ? `${court.name} (${court.type})` : 'Unknown Court',
        time: `${b.startTime} - ${b.endTime}`,
        date: format(new Date(b.date), 'MMM dd'),
        type: b.type.charAt(0).toUpperCase() + b.type.slice(1).replace('_', ' '),
      };
    });

  const selectedDateObj = new Date(`${selectedDate}T00:00:00`);
  const now = new Date();
  const nowMinutes = toMinutes(format(now, 'HH:mm'));

  const activeGamesCount = bookings.filter((b) => {
    if (b.status !== 'confirmed' || !isSameDay(new Date(b.date), now)) return false;
    const start = toMinutes(b.startTime);
    const end = toMinutes(b.endTime);
    return nowMinutes >= start && nowMinutes < end;
  }).length;

  const upcomingCount = bookings.filter((b) => {
    if (b.status === 'cancelled') return false;
    const date = new Date(b.date);
    return date > now || (isSameDay(date, now) && toMinutes(b.startTime) > nowMinutes);
  }).length;

  const scheduleBookings = bookings.filter((b) => {
    if (b.status === 'cancelled') return false;
    if (scheduleTab === 'daily') return isSameDay(new Date(b.date), selectedDateObj);
    if (scheduleTab === 'active') {
      if (!isSameDay(new Date(b.date), now)) return false;
      const start = toMinutes(b.startTime);
      const end = toMinutes(b.endTime);
      return b.status === 'confirmed' && nowMinutes >= start && nowMinutes < end;
    }
    return new Date(b.date) >= selectedDateObj;
  });

  const slotTimes = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00'];

  const bookingAtSlot = (courtId: string, time: string) => {
    const slotStart = toMinutes(time);
    const slotEnd = slotStart + 60;
    return scheduleBookings.find((b) => {
      if (b.courtId !== courtId) return false;
      if (!isSameDay(new Date(b.date), selectedDateObj)) return false;
      const start = toMinutes(b.startTime);
      const end = toMinutes(b.endTime);
      return slotStart < end && slotEnd > start;
    });
  };

  return (
    <div className="min-h-screen bg-transparent p-6 space-y-8">
      {systemSetup.setupRequired ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-6 py-5 text-amber-950 shadow-sm">
          <h2 className="text-lg font-bold">System Setup Required</h2>
          <p className="mt-2 text-sm">
            {systemSetup.missingTables.length > 0
              ? `The backend database is not fully initialized yet. Missing tables: ${systemSetup.missingTables.join(', ')}.`
              : systemSetup.needsCourts
                ? 'No courts are configured yet. Add at least one active court before opening reservations.'
                : systemSetup.needsPlans
                  ? 'No membership plans are configured yet. Add plans before enabling subscriptions.'
                  : 'Complete the remaining deployment setup before opening the system to users.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate(systemSetup.missingTables.length > 0 ? '/settings' : '/court-mgmt')}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              {systemSetup.missingTables.length > 0 ? 'Open Settings' : 'Open Court Management'}
            </button>
            {systemSetup.needsPlans ? (
              <button
                type="button"
                onClick={() => navigate('/pricing')}
                className="rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Review Plans
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Great to have you, Admin</h1>
          <p className="text-slate-600 dark:text-slate-200">Lead today with confidence. Keep bookings smooth, courts ready, and players happy.</p>
        </div>
        <div className="relative">
          <span className="absolute -inset-1 rounded-2xl bg-teal-300/30 dark:bg-teal-300/30 blur-md" />
          <div className="relative inline-flex items-center gap-2 rounded-2xl border border-teal-200 bg-white/85 dark:border-teal-200/40 dark:bg-white/10 px-4 py-2 text-slate-900 dark:text-white backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 dark:bg-white/20">
              <ShieldUser className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-teal-700 dark:text-teal-100">Admin Mode</p>
              <p className="flex items-center gap-1 text-sm font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                Keep it running
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <StatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            change={stat.change.text}
            isPositive={stat.change.positive}
            icon={stat.icon}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm min-w-0">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Operations Board</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">Updated {format(new Date(), 'MMM dd, yyyy')}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Pending Requests</p>
                <ClipboardList size={18} className="text-teal-700" />
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">{pendingRequests.length}</p>
              <button
                onClick={() => navigate('/requests')}
                className="mt-3 text-sm text-teal-700 font-medium hover:text-teal-800"
              >
                Review Requests
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Today Check-Ins</p>
                <ScanLine size={18} className="text-teal-700" />
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">
                {checkedInToday}/{todayBookings.length || 0}
              </p>
              <button
                onClick={() => navigate('/check-in', { state: { from: `${location.pathname}${location.search}` } })}
                className="mt-3 text-sm text-teal-700 font-medium hover:text-teal-800"
              >
                Open Check-In
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Court Status</p>
                <Building2 size={18} className="text-teal-700" />
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">{openCourts} Open</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{maintenanceCourts} in maintenance</p>
              <button
                onClick={() => navigate('/court-mgmt')}
                className="mt-3 text-sm text-teal-700 font-medium hover:text-teal-800"
              >
                Manage Courts
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Queue Snapshot</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-between">
                  <span>New requests (24h)</span>
                  <span className="font-semibold">
                    {
                      pendingRequests.filter((b) => {
                        const createdAt = new Date(b.createdAt);
                        return Date.now() - createdAt.getTime() <= 24 * 60 * 60 * 1000;
                      }).length
                    }
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Confirmed today</span>
                  <span className="font-semibold">{todayBookings.filter((b) => b.status === 'confirmed').length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Cancelled today</span>
                  <span className="font-semibold">{todayBookings.filter((b) => b.status === 'cancelled').length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-6">Upcoming Sessions</h3>
          <div className="space-y-4">
            {upcomingBookings.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming sessions scheduled.</p>
            )}
            {upcomingBookings.map((booking) => (
              <div key={booking.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                  <Clock size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{booking.player}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{booking.court}</p>
                  <p className="text-xs font-medium text-teal-600 mt-1">
                    {booking.date} | {booking.time} | {booking.type}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/court-mgmt')}
            className="w-full mt-6 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          >
            View All Schedule
          </button>
        </div>
      </div>

      <section className="space-y-4">
        <div className="inline-flex rounded-full border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setScheduleTab('daily')}
            className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
              scheduleTab === 'daily' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
            }`}
          >
            Daily Schedule
          </button>
          <button
            type="button"
            onClick={() => setScheduleTab('active')}
            className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
              scheduleTab === 'active' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
            }`}
          >
            Active Games ({activeGamesCount})
          </button>
          <button
            type="button"
            onClick={() => setScheduleTab('upcoming')}
            className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
              scheduleTab === 'upcoming' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
            }`}
          >
            Upcoming ({upcomingCount})
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Court Schedule</h3>
              <p className="text-slate-600 dark:text-slate-400">View and manage all booking for the selected date</p>
            </div>
            <label className="inline-flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300">
              <CalendarDays className="h-4 w-4" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[980px] space-y-3">
              <div className="grid grid-cols-[260px_repeat(8,minmax(90px,1fr))] gap-2">
                <div />
                {slotTimes.map((time) => (
                  <div key={time} className="text-center text-lg font-bold text-slate-900 dark:text-slate-100">
                    {time}
                  </div>
                ))}
              </div>

              {courts
                .filter((court) => court.status !== 'disabled')
                .map((court) => (
                  <div key={court.id} className="grid grid-cols-[260px_repeat(8,minmax(90px,1fr))] gap-2">
                    <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-3 shadow-sm">
                      <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{court.name}</p>
                      <p className="text-slate-700 dark:text-slate-300">{SPORT_BY_COURT_ID[court.id] || 'General'}</p>
                    </div>

                    {slotTimes.map((time) => {
                      const slotBooking = bookingAtSlot(court.id, time);
                      const blocked = court.status === 'maintenance';
                      const slotClass = slotBooking
                        ? 'bg-cyan-400/70 border-cyan-400 dark:bg-cyan-500/30 dark:border-cyan-500/40'
                        : blocked
                          ? 'bg-teal-800 border-teal-800 dark:bg-teal-900/80 dark:border-teal-700'
                          : 'bg-teal-50 border-cyan-200 dark:bg-slate-800 dark:border-slate-700';

                      return (
                        <div key={`${court.id}-${time}`} className={`h-14 rounded-xl border ${slotClass}`}>
                          {slotBooking && (
                            <div className="flex h-full items-center justify-center px-1 text-center text-[10px] font-semibold text-slate-900 dark:text-slate-100">
                              {slotBooking.startTime}-{slotBooking.endTime}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-6 text-slate-700 dark:text-slate-300">
            <div className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-full bg-cyan-400/80" />
              <span>Booked</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-full bg-teal-800 dark:bg-teal-900" />
              <span>Blocked</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-full bg-teal-300 dark:bg-slate-700" />
              <span>Available</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value, change, isPositive, icon: Icon }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300">
          <Icon size={24} />
        </div>
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
            isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          )}
        >
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {change}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{value}</p>
      </div>
    </div>
  );
}
