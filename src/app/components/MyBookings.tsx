import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { Booking } from '@/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Clock3, X, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const COURT_META: Record<string, { location: string; sport: string }> = {
  c1: { location: 'Downtown Sports Complex', sport: 'Basketball' },
  c2: { location: 'Riverside Park', sport: 'Tennis' },
  c3: { location: 'Elite Sports Hub', sport: 'Pickleball' },
};

export function MyBookings() {
  const { currentUser, bookings, courts, cancelBooking, leaveSession } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const recentPaymentTimestamp = useMemo(() => {
    try {
      return Number(sessionStorage.getItem('ventra_recent_payment_flow') || 0);
    } catch {
      return 0;
    }
  }, []);
  const recentlyFromPayment = Boolean(recentPaymentTimestamp && Date.now() - recentPaymentTimestamp < 15_000);
  const landedFromPayment = Boolean((location.state as any)?.fromPayment) || recentlyFromPayment;

  const activeBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.userId === currentUser?.id || (b.players || []).includes(currentUser?.id || ''))
        .filter((b) => !(b.date < new Date() || b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show'))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [bookings, currentUser]
  );

  const [visibleBookings, setVisibleBookings] = useState<Booking[]>(() => activeBookings);

  useEffect(() => {
    const emptyDelayMs = landedFromPayment ? 8000 : 600;

    if (activeBookings.length > 0) {
      setVisibleBookings(activeBookings);
      return;
    }

    const timeout = window.setTimeout(() => setVisibleBookings([]), emptyDelayMs);
    return () => window.clearTimeout(timeout);
  }, [activeBookings, landedFromPayment]);

  const handleCancel = (bookingId: string) => {
    if (confirm('Are you sure you want to cancel this booking?')) {
      cancelBooking(bookingId);
      toast.success('Booking cancelled successfully');
    }
  };

  const handleLeaveSession = async (bookingId: string) => {
    if (!confirm('Leave this session?')) return;
    try {
      await leaveSession(bookingId);
      toast.success('You left the session.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to leave session.');
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      confirmed: 'bg-teal-100 text-teal-700',
      pending: 'bg-amber-100 text-amber-700',
      cancelled: 'bg-rose-100 text-rose-700',
      completed: 'bg-emerald-100 text-emerald-700',
      no_show: 'bg-slate-200 text-slate-700',
    };
    return colors[status as keyof typeof colors] || 'bg-slate-200 text-slate-700';
  };

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto space-y-5">
        <header className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-5 flex items-center gap-3 shadow-sm">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-700 dark:text-slate-300"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">My Reservation</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">{visibleBookings.length} active bookings</p>
          </div>
        </header>

        <section className="rounded-3xl border border-[#7ea39f] dark:border-slate-700 bg-[#8eaaa4] dark:bg-slate-900 p-4 md:p-5 shadow-sm">
          <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:p-5">
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Active Reservations</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Your upcoming and pending reservations</p>
            </div>

            <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
              {visibleBookings.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-6 text-center text-slate-500 dark:text-slate-400">
                  No active reservations.
                </div>
              ) : (
                visibleBookings.map((booking) => {
                  const court = courts.find((c) => c.id === booking.courtId);
                  const meta = COURT_META[booking.courtId] || { location: court?.name || 'Court Location', sport: 'General' };
                  const isJoinedSession =
                    booking.userId !== currentUser?.id && (booking.players || []).includes(currentUser?.id || '');
                  const ratePerHour = court?.hourlyRate || 0;

                  return (
                    <article key={booking.id} className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{court?.name || 'Unknown Court'}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold">
                              {isJoinedSession ? 'Joined Session' : 'Upcoming'}
                            </span>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${getStatusColor(booking.status)}`}>
                              {booking.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <span className="inline-flex items-center px-2 py-1 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300">
                          {meta.sport}
                        </span>
                      </div>

                      <div className="mt-3 text-sm text-slate-700 dark:text-slate-300 space-y-1.5">
                        <p className="inline-flex items-center gap-1.5"><MapPin size={13} /> {meta.location}</p>
                        <p className="inline-flex items-center gap-1.5"><Calendar size={13} /> {format(booking.date, 'MMMM dd, yyyy')}</p>
                        <p className="inline-flex items-center gap-1.5"><Clock3 size={13} /> {booking.startTime} - {booking.endTime} ({Math.round(booking.duration / 60)} Hours)</p>
                      </div>

                      {booking.notes && (
                        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                          {booking.notes}
                        </p>
                      )}

                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">P{ratePerHour}/hour</p>
                          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">Total: P{booking.amount.toFixed(0)}</p>
                        </div>

                        {(booking.status === 'confirmed' || booking.status === 'pending') && booking.date >= new Date() && (
                          <div className="flex gap-2">
                            {isJoinedSession ? (
                              <button
                                onClick={() => void handleLeaveSession(booking.id)}
                                className="px-3 py-2 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 transition-colors text-sm font-semibold inline-flex items-center gap-1"
                              >
                                <X className="w-4 h-4" />
                                Leave Session
                              </button>
                            ) : (
                              <button
                                onClick={() => handleCancel(booking.id)}
                                className="px-3 py-2 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 transition-colors text-sm font-semibold inline-flex items-center gap-1"
                              >
                                <X className="w-4 h-4" />
                                Cancel
                              </button>
                            )}
                            {!booking.checkedIn && (
                              <button
                                onClick={() => navigate('/check-in', { state: { from: `${location.pathname}${location.search}` } })}
                                className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-semibold inline-flex items-center gap-1"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Check In
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
