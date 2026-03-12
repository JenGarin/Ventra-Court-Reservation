import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { backendApi } from '@/context/backendApi';
import { format } from 'date-fns';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Calendar, Clock, MapPin, Star, UserRound, Users } from 'lucide-react';
import { toast } from 'sonner';

type CoachApplicationRecord = {
  id: string;
  coachId: string;
  playerId: string;
  sport: string;
  status: 'pending' | 'approved' | 'rejected';
  message?: string;
  preferredSchedule?: string;
  createdAt: string;
  updatedAt: string;
  reviewNote?: string;
};

function addMinutesToTime(time: string, minutesToAdd: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutesToAdd;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function HireCoachView() {
  const { currentUser, users, courts, bookings, createBooking, getAvailableSlots } = useApp();
  const [selectedCourtId, setSelectedCourtId] = useState(courts[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [myCoachApplications, setMyCoachApplications] = useState<CoachApplicationRecord[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  const coaches = useMemo(() => users.filter((u) => u.role === 'coach'), [users]);
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const selectedCoachId = query.get('coachId') || '';
  const isReservationMode = query.get('mode') === 'reserve';
  const selectedCoach = coaches.find((c) => c.id === selectedCoachId);
  const selectedCourt = courts.find((c) => c.id === selectedCourtId);
  const getCoachExpertiseLabel = (coach: (typeof coaches)[number]) =>
    coach.coachExpertise?.length
      ? coach.coachExpertise.join(', ')
      : `${coach.skillLevel || 'General'} level coaching`;
  const getVerificationBadge = (coach: (typeof coaches)[number]) => {
    const status = coach.coachVerificationStatus || 'unverified';
    if (status === 'verified') return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';
    if (status === 'pending') return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
    return 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
  };
  const getCoachInitials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
  const getCoachRating = (coachId: string) => {
    const stats = coachStats[coachId];
    const completed = stats?.completed || 0;
    return Math.min(5, 4 + completed * 0.2);
  };
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, index) => {
      const filled = index + 1 <= Math.round(rating);
      return (
        <Star
          key={index}
          size={14}
          className={filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
        />
      );
    });
  };

  const coachStats = useMemo(() => {
    const stats: Record<string, { completed: number; pending: number }> = {};
    coaches.forEach((coach) => {
      const coachBookings = bookings.filter((b) => b.coachId === coach.id && b.type === 'training');
      stats[coach.id] = {
        completed: coachBookings.filter((b) => b.status === 'completed').length,
        pending: coachBookings.filter((b) => b.status === 'pending').length,
      };
    });
    return stats;
  }, [coaches, bookings]);

  useEffect(() => {
    let active = true;
    if (!selectedCourtId) {
      setAvailableSlots([]);
      return;
    }
    const date = new Date(`${selectedDate}T00:00:00`);
    getAvailableSlots(selectedCourtId, date, 'training')
      .then((slots) => {
        if (!active) return;
        setAvailableSlots(slots);
      })
      .catch(() => {
        if (!active) return;
        setAvailableSlots([]);
      });
    return () => {
      active = false;
    };
  }, [getAvailableSlots, selectedCourtId, selectedDate]);

  useEffect(() => {
    let active = true;
    if (!backendApi.isEnabled || !currentUser) {
      setMyCoachApplications([]);
      return;
    }

    backendApi
      .getMyCoachApplications()
      .then((rows) => {
        if (!active) return;
        const mapped = rows.map((item: any) => ({
          id: String(item?.id || ''),
          coachId: String(item?.coachId || ''),
          playerId: String(item?.playerId || ''),
          sport: String(item?.sport || 'training'),
          status: (String(item?.status || 'pending') as CoachApplicationRecord['status']),
          message: item?.message ? String(item.message) : undefined,
          preferredSchedule: item?.preferredSchedule ? String(item.preferredSchedule) : undefined,
          createdAt: String(item?.createdAt || new Date().toISOString()),
          updatedAt: String(item?.updatedAt || new Date().toISOString()),
          reviewNote: item?.reviewNote ? String(item.reviewNote) : undefined,
        }));
        setMyCoachApplications(mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5));
      })
      .catch(() => {
        if (!active) return;
        setMyCoachApplications([]);
      });

    return () => {
      active = false;
    };
  }, [currentUser]);

  const myCoachReservations = useMemo(
    () =>
      bookings
        .filter((b) => b.userId === currentUser?.id && b.type === 'training')
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 5),
    [bookings, currentUser]
  );

  const recentItems = useMemo(() => {
    if (backendApi.isEnabled) {
      return myCoachApplications.map((app) => {
        const coach = users.find((u) => u.id === app.coachId);
        return {
          id: app.id,
          title: coach?.name || 'Coach',
          line1: app.sport,
          line2: app.preferredSchedule || format(new Date(app.createdAt), 'MMM dd, yyyy'),
          line3: app.message || '',
          status: app.status,
        };
      });
    }

    return myCoachReservations.map((booking) => {
      const court = courts.find((c) => c.id === booking.courtId);
      const coach = users.find((u) => u.id === booking.coachId);
      return {
        id: booking.id,
        title: coach?.name || 'Coach',
        line1: court?.name || 'Court',
        line2: `${format(new Date(booking.date), 'MMM dd, yyyy')} ${booking.startTime}-${booking.endTime}`,
        line3: '',
        status: booking.status,
      };
    });
  }, [courts, myCoachApplications, myCoachReservations, users]);

  const handleReserveCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!selectedCoach) {
      toast.error('Please select a coach.');
      return;
    }
    if (!selectedCourtId) {
      toast.error('Please select a court.');
      return;
    }
    if (!selectedTime) {
      toast.error('Please select an available time.');
      return;
    }

    setSubmitting(true);
    try {
      const endTime = addMinutesToTime(selectedTime, duration);
      const bookingDate = new Date(`${selectedDate}T00:00:00`);
      const amount = selectedCourt ? Number(selectedCourt.hourlyRate) * (duration / 60) : 0;

      if (backendApi.isEnabled) {
        const sport = (selectedCourt?.name || '').toLowerCase().includes('basket')
          ? 'basketball'
          : (selectedCourt?.name || '').toLowerCase().includes('tennis')
            ? 'tennis'
            : (selectedCourt?.name || '').toLowerCase().includes('pickle')
              ? 'pickleball'
              : 'training';
        await backendApi.createCoachApplication({
          coachId: selectedCoach.id,
          sport,
          message: notes || `Coach request: ${selectedCoach?.name || 'Coach'}`,
          preferredSchedule: `${selectedDate} ${selectedTime}-${endTime} @ ${selectedCourt?.name || 'Court'}`,
        });
      } else {
        await createBooking({
          courtId: selectedCourtId,
          userId: currentUser.id,
          type: 'training',
          date: bookingDate,
          startTime: selectedTime,
          endTime,
          duration,
          status: 'pending',
          paymentStatus: 'unpaid',
          amount,
          players: [currentUser.id],
          coachId: selectedCoach.id,
          maxPlayers: 1,
          notes: notes || `Coach request: ${selectedCoach?.name || 'Coach'}`,
          checkedIn: false,
        });
      }

      toast.success('Coach reservation submitted.');
      setNotes('');
      navigate('/hire-coach');
    } catch {
      toast.error('Failed to submit reservation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isReservationMode) {
    if (!selectedCoach) {
      return (
        <div className="min-h-screen bg-transparent space-y-6 animate-in fade-in duration-500">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hire a Coach</h1>
            <p className="text-slate-600 dark:text-slate-300">Coach not found. Please select a coach profile again.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/hire-coach')}
            className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-2 font-semibold"
          >
            <ArrowLeft size={16} />
            Back to Coach Profiles
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-transparent space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reservation Card</h1>
            <p className="text-slate-600 dark:text-slate-300">Finalize your coach session details.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/hire-coach')}
            className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-2 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <ArrowLeft size={16} />
            Back to Profiles
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[0.95fr,1.05fr] gap-6">
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-lg font-bold text-slate-700 dark:text-slate-300">
                {selectedCoach.avatar ? (
                  <img src={selectedCoach.avatar} alt={selectedCoach.name} className="h-full w-full object-cover" />
                ) : (
                  <span>{getCoachInitials(selectedCoach.name)}</span>
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedCoach.name}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{selectedCoach.email}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{selectedCoach.phone || 'Phone not provided'}</p>
                <span className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${getVerificationBadge(selectedCoach)}`}>
                  <BadgeCheck className="w-3.5 h-3.5" />
                  {selectedCoach.coachVerificationStatus || 'unverified'}
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-700 dark:text-slate-300 leading-6">
              {selectedCoach.coachProfile || 'No profile provided yet.'}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Skill Level</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">{selectedCoach.skillLevel || 'General'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Completed Sessions</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{coachStats[selectedCoach.id]?.completed || 0}</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Reviews</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="inline-flex items-center gap-1">{renderStars(getCoachRating(selectedCoach.id))}</div>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{getCoachRating(selectedCoach.id).toFixed(1)}</span>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Expertise</p>
              <p className="text-sm text-slate-800 dark:text-slate-300 mt-1">{getCoachExpertiseLabel(selectedCoach)}</p>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <form onSubmit={handleReserveCoach} className="space-y-3">
              <label className="space-y-1 block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Select Court</span>
                <select
                  value={selectedCourtId}
                  onChange={(e) => {
                    setSelectedCourtId(e.target.value);
                    setSelectedTime('');
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
                  required
                >
                  {courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setSelectedTime('');
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
                    required
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Duration</span>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
                  >
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                  </select>
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Available Time Slots</span>
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
                  required
                >
                  <option value="">Choose a time</option>
                  {availableSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes for Coach (optional)</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 resize-none"
                  placeholder="Training goals, skills to focus on, etc."
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-6 py-2.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Reserve Coach Session'}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hire a Coach</h1>
        <p className="text-slate-600 dark:text-slate-300">Browse professional coach profiles and select one to proceed to reservation.</p>
      </div>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Coach Profiles</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{coaches.length} coach{coaches.length !== 1 ? 'es' : ''} available</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {coaches.map((coach) => {
            const stats = coachStats[coach.id] || { completed: 0, pending: 0 };
            return (
              <article
                key={coach.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-300">
                    {coach.avatar ? (
                      <img src={coach.avatar} alt={coach.name} className="h-full w-full object-cover" />
                    ) : (
                      <span>{getCoachInitials(coach.name)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{coach.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{coach.email}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{coach.phone || 'No phone listed'}</p>
                    <span className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${getVerificationBadge(coach)}`}>
                      <BadgeCheck className="w-3 h-3" />
                      {coach.coachVerificationStatus || 'unverified'}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-6 line-clamp-3">
                  {coach.coachProfile || 'No profile provided yet.'}
                </p>

                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Expertise</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{getCoachExpertiseLabel(coach)}</p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Completed</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{stats.completed}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{stats.pending}</p>
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Reviews</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="inline-flex items-center gap-1">{renderStars(getCoachRating(coach.id))}</div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{getCoachRating(coach.id).toFixed(1)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/hire-coach?mode=reserve&coachId=${coach.id}`)}
                  className="mt-4 w-full rounded-xl px-3 py-2.5 text-sm font-semibold bg-slate-900 dark:bg-teal-700 text-white hover:bg-slate-800 dark:hover:bg-teal-600 transition-colors"
                >
                  Select for Reservation
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
          {backendApi.isEnabled ? 'Recent Coach Applications' : 'Recent Coach Reservations'}
        </h3>
        <div className="space-y-3">
          {recentItems.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {backendApi.isEnabled ? 'No coach applications yet.' : 'No coach reservations yet.'}
            </p>
          )}
          {recentItems.map((item) => {
            return (
              <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 inline-flex items-center gap-1">
                  <MapPin size={12} /> {item.line1}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 inline-flex items-center gap-1 ml-2">
                  <Calendar size={12} /> {item.line2}
                </p>
                {item.line3 && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{item.line3}</p>}
                <p className="text-xs mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <Users size={12} /> {item.status}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
