import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Clock3, X, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { backendApi } from '@/context/backendApi';

const COURT_META: Record<string, { location: string; sport: string }> = {
  c1: { location: 'Downtown Sports Complex', sport: 'Basketball' },
  c2: { location: 'Riverside Park', sport: 'Tennis' },
  c3: { location: 'Elite Sports Hub', sport: 'Pickleball' },
};

export function BookingHistoryView() {
  const { currentUser, bookings, courts, cancelBooking, leaveSession } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('past');
  const usingBackendApi = backendApi.isEnabled;
  const [backendUpcomingBookings, setBackendUpcomingBookings] = useState<typeof bookings>([]);
  const [backendPastBookings, setBackendPastBookings] = useState<typeof bookings>([]);
  const [isBackendHistoryLoading, setIsBackendHistoryLoading] = useState(false);
  const [selectedTimelineBookingId, setSelectedTimelineBookingId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);

  const allUserBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.userId === currentUser?.id || (b.players || []).includes(currentUser?.id || ''))
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [bookings, currentUser]
  );

  const upcomingBookings = useMemo(
    () =>
      allUserBookings.filter(
        (b) =>
          b.date >= new Date() &&
          b.status !== 'cancelled' &&
          b.status !== 'completed' &&
          b.status !== 'no_show'
      ),
    [allUserBookings]
  );

  const pastBookings = useMemo(
    () =>
      allUserBookings.filter(
        (b) =>
          b.status === 'completed'
      ),
    [allUserBookings]
  );

  const upcomingCount = upcomingBookings.length;
  const pastCount = pastBookings.length;

  const loadBackendHistory = useCallback(async () => {
    if (!usingBackendApi || !currentUser) return;
    setIsBackendHistoryLoading(true);
    try {
      const [activeRows, pastRows] = await Promise.all([
        backendApi.getBookingHistory({ view: 'active', page: 1, limit: 200 }),
        backendApi.getBookingHistory({
          view: 'past',
          includeNoShow: true,
          includeCancelled: true,
          page: 1,
          limit: 200,
        }),
      ]);
      setBackendUpcomingBookings(activeRows);
      setBackendPastBookings(pastRows);
    } catch (error) {
      console.error('Failed to load backend booking history:', error);
      toast.error('Failed to load booking history from backend.');
    } finally {
      setIsBackendHistoryLoading(false);
    }
  }, [usingBackendApi, currentUser]);

  useEffect(() => {
    if (!usingBackendApi || !currentUser) return;
    void loadBackendHistory();
  }, [usingBackendApi, currentUser, loadBackendHistory]);

  const sourceUpcoming = usingBackendApi ? backendUpcomingBookings : upcomingBookings;
  const sourcePast = usingBackendApi ? backendPastBookings : pastBookings;
  const displayedBookings = activeTab === 'upcoming' ? sourceUpcoming : sourcePast;
  const totalRecords = sourceUpcoming.length + sourcePast.length;

  const handleCancel = async (bookingId: string) => {
    if (confirm('Are you sure you want to cancel this booking?')) {
      await cancelBooking(bookingId);
      if (usingBackendApi) {
        await loadBackendHistory();
      }
      toast.success('Booking cancelled successfully');
    }
  };

  const handleLeaveSession = async (bookingId: string) => {
    if (!confirm('Leave this session?')) return;
    try {
      await leaveSession(bookingId);
      if (usingBackendApi) {
        await loadBackendHistory();
      }
      toast.success('You left the session.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to leave session.');
    }
  };

  const openTimeline = async (bookingId: string) => {
    const booking = displayedBookings.find((row) => row.id === bookingId);
    if (!booking) return;
    setSelectedTimelineBookingId(bookingId);
    setIsTimelineLoading(true);
    try {
      if (usingBackendApi) {
        const payload = await backendApi.getBookingTimeline(bookingId, 'desc');
        setTimelineEvents(Array.isArray(payload?.events) ? payload.events : []);
      } else {
        setTimelineEvents([
          {
            id: `local-created-${booking.id}`,
            action: 'booking_created',
            label: 'Booking Created',
            createdAt: booking.createdAt.toISOString(),
            details: {
              status: booking.status,
              date: format(booking.date, 'yyyy-MM-dd'),
              startTime: booking.startTime,
              endTime: booking.endTime,
            },
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to load booking timeline:', error);
      toast.error('Failed to load booking timeline.');
      setSelectedTimelineBookingId(null);
    } finally {
      setIsTimelineLoading(false);
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">History</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">{totalRecords} total records</p>
          </div>
        </header>

        <section className="rounded-3xl border border-[#7ea39f] dark:border-slate-700 bg-[#8eaaa4] dark:bg-slate-900 p-4 md:p-5 shadow-sm">
          <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:p-5">
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Booking History</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Past and completed reservations</p>
            </div>

            <div className="w-full rounded-full bg-slate-200 dark:bg-slate-800 p-1 mb-4 grid grid-cols-2 gap-1 text-xs font-semibold text-center">
              <button
                type="button"
                onClick={() => setActiveTab('upcoming')}
                className={`rounded-full py-1.5 transition-colors ${
                  activeTab === 'upcoming' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'
                }`}
              >
                Upcoming ({sourceUpcoming.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('past')}
                className={`rounded-full py-1.5 transition-colors ${
                  activeTab === 'past' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'
                }`}
              >
                Past ({sourcePast.length})
              </button>
            </div>

            <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
              {usingBackendApi && isBackendHistoryLoading && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-6 text-center text-slate-500 dark:text-slate-400">
                  Syncing booking history from backend...
                </div>
              )}
              {displayedBookings.length === 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-6 text-center text-slate-500 dark:text-slate-400">
                  {activeTab === 'upcoming' ? 'No upcoming records.' : 'No past records yet.'}
                </div>
              )}

              {displayedBookings.map((booking) => {
                const court = courts.find((c) => c.id === booking.courtId);
                const meta = COURT_META[booking.courtId] || { location: court?.name || 'Court Location', sport: 'General' };
                const isUpcoming = booking.date >= new Date() && booking.status !== 'cancelled';
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
                            {isUpcoming ? (isJoinedSession ? 'Joined Session' : 'Upcoming') : 'Past'}
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

                      {booking.status === 'confirmed' && booking.date >= new Date() && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => void openTimeline(booking.id)}
                            className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-semibold inline-flex items-center gap-1"
                          >
                            Timeline
                          </button>
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
                              onClick={() => void handleCancel(booking.id)}
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
                      {!(booking.status === 'confirmed' && booking.date >= new Date()) && (
                        <button
                          onClick={() => void openTimeline(booking.id)}
                          className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-semibold inline-flex items-center gap-1"
                        >
                          Timeline
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {selectedTimelineBookingId && (
          <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Booking Timeline</h3>
                <button
                  onClick={() => setSelectedTimelineBookingId(null)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 max-h-[65vh] overflow-y-auto">
                {isTimelineLoading && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Loading timeline...</p>
                )}
                {!isTimelineLoading && timelineEvents.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No timeline events found.</p>
                )}
                {!isTimelineLoading && timelineEvents.length > 0 && (
                  <div className="space-y-3">
                    {timelineEvents.map((event) => (
                      <div
                        key={String(event?.id || Math.random())}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {String(event?.label || event?.action || 'Timeline Event')}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {event?.createdAt ? format(new Date(event.createdAt), 'MMM dd, yyyy HH:mm') : '-'}
                          </p>
                        </div>
                        {event?.actorName && (
                          <p className="text-xs mt-1 text-slate-600 dark:text-slate-300">By: {String(event.actorName)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
